// Simulation d'équilibrage des combats rapprochés : joue des combats complets avec le vrai moteur,
// sans animation, les deux camps dirigés par l'IA. Usage : node sim.js [combats par cas]
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
let page=fs.readFileSync(path.join(__dirname,'..','chroniques.html'),'utf8');
const must=(a,b)=>{if(!page.includes(a))throw new Error('introuvable : '+a.slice(0,60));page=page.split(a).join(b);};
must('const wait=ms=>new Promise(r=>setTimeout(r,ms));','const wait=ms=>Promise.resolve();');
must('function presetFiche(','window.__pf=(...a)=>presetFiche(...a);window.__prep=(...a)=>prepDuel(...a);\nfunction presetFiche(');
must('window.ENGINES.duel={start(){','window.__duel={state:()=>({fighters,over,round,reserve}),resolveRound,aiChoose,players,startCombat,set:(R,w,d)=>{roster=R;waveFrom=w||2;DSC=d||"toits";}};\nwindow.ENGINES.duel={start(){');
const fake=()=>new Proxy(function(){},{get:(t,k)=>k==='measureText'?()=>({width:50}):k==='canvas'?{width:100,height:100}:fake(),set:()=>true,apply:()=>fake()});
const dom=new JSDOM(page,{runScripts:'dangerously',url:'https://example.org/',beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=()=>fake();w.requestAnimationFrame=()=>0;w.ResizeObserver=class{observe(){}};w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});}});
const w=dom.window;
const N=+process.argv[2]||30;
const tick=()=>new Promise(r=>setTimeout(r,0));

const H=(key,name,ov)=>({...w.__pf(key,name,'p'),...(ov||{})});
const TEAMS={
  'tireur seul':()=>[H('bountyHunter','Héros',{tir:15,pv:32,tech:['grenades']})],
  'tireur + wookiee':()=>[H('bountyHunter','Héros',{tir:15,pv:32,tech:['grenades']}),H('wookieeWarrior','Krrasantan')],
  'jedi seul':()=>[H('jediKnight','Héros')],
  'mandalorien seul':()=>[H('mandoWarrior','Héros')],
  'trio':()=>[H('smuggler','Héros'),H('cloneTrooper','Rex'),H('twilekRogue','Lyss')],
  'tireur blessé (20 %)':()=>[H('bountyHunter','Héros',{tir:15,pv:16,pvMax:32,malus:-2})],
};
const FOES={
  'Gorrk + 2 sbires':{enemies:[{name:'Gorrk',preset:'thug',chef:true,pv:24},{name:'Gamorréen',preset:'thug'},{name:'Gamorréen',preset:'thug'}]},
  '4 mercenaires':{enemies:[{name:'L’homme poli',preset:'assassin',chef:true},{name:'Mercenaire',preset:'rodianHunter'},{name:'Tireur',preset:'rodianHunter'},{name:'Tireur',preset:'trandoshanHunter'}]},
  '10 stormtroopers':{enemies:Array.from({length:4},()=>({name:'Stormtrooper',preset:'trooper'})),renforts:Array.from({length:6},()=>({name:'Stormtrooper',preset:'trooper'})),arrivee:2},
  'seigneur sith':{enemies:[{name:'Darth Vex',preset:'sithLord'}]},
  '2 mandaloriens':{enemies:[{name:'Mando',preset:'mandoWarrior'},{name:'Mando',preset:'mandoWarrior'}]},
};
async function fight(team,foes,diff){
  const p=TEAMS[team](),c=JSON.parse(JSON.stringify(FOES[foes]));
  const prep=w.__prep(c,p,diff);
  const D=w.__duel;
  D.set({p:prep.p.map(f=>({...f,side:'p'})),e:prep.e.map(f=>({...f,side:'e'})),r:prep.r.map(f=>({...f,side:'e'}))},c.arrivee||2,'toits');
  D.startCombat();
  for(let n=0;n<60&&!D.state().over;n++){
    D.players().forEach(f=>D.aiChoose(f));
    await D.resolveRound();
    for(let k=0;k<20&&!D.state().over&&D.state().round===n+1;k++)await tick();
  }
  const st=D.state(),win=st.over&&st.fighters.some(f=>f.side==='p'&&f.alive);
  return{win,R:prep.R,pred:prep.win,rounds:st.round,np:prep.np,sb:prep.sb,t:team,f:foes};
}
(async()=>{
  await new Promise(r=>setTimeout(r,300));
  const rows=[],all=[];
  for(const diff of (process.env.DIFFS||'facile,normal,difficile,brutal').split(','))
    for(const t of Object.keys(TEAMS).filter(k=>!process.env.TEAMS||process.env.TEAMS.split(',').includes(k)))for(const f of Object.keys(FOES).filter(k=>!process.env.FOES||process.env.FOES.split(',').includes(k))){
      let wins=0,R=0,pred=0,rd=0;
      for(let i=0;i<N;i++){const o=await fight(t,f,diff);wins+=o.win;R+=o.R;pred+=o.pred;rd+=o.rounds;all.push({...o,diff});}
      rows.push({diff,t,f,win:wins/N,R:R/N,pred:pred/N,rd:rd/N});
      console.log(`${diff.padEnd(9)} ${t.padEnd(22)} ${f.padEnd(18)} victoire ${(wins/N*100).toFixed(0).padStart(3)} %  prévu ${(pred/N*100).toFixed(0).padStart(3)} %  R ${(R/N).toFixed(2)}  ${(rd/N).toFixed(1)} échanges`);
    }
  const by={};rows.forEach(r=>{(by[r.diff]=by[r.diff]||[]).push(r.win);});
  for(const [d,l] of Object.entries(by))console.log(`MOYENNE ${d} : ${(l.reduce((a,b)=>a+b,0)/l.length*100).toFixed(0)} % (min ${(Math.min(...l)*100).toFixed(0)} %, max ${(Math.max(...l)*100).toFixed(0)} %)`);
  fs.writeFileSync(path.join(__dirname,'sim-out.json'),JSON.stringify(all));
  process.exit(0);
})();
