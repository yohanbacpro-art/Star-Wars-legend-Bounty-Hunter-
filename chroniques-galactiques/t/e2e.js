const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../chroniques.html','utf8');
const page='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>';
const fake=()=>new Proxy(function(){},{get:(t,k)=>k==='measureText'?()=>({width:50}):k==='canvas'?{width:100,height:100}:fake(),set:()=>true,apply:()=>fake()});
const prompts=[];
const R=(narr,data)=>narr+'\n@@DONNEES\n'+JSON.stringify(data);
const answers=[
  R('— Bienvenue, Moff. La station tremble.\nLes sirènes hurlent.',{choices:[],test:{skill:'perception',mod:-2,why:'Repérer le saboteur'},combat:null,updates:null,chronicle:'Ouverture sur la station.',chapter:{title:'L’ombre sur Kessaria'},secret:{arc:'Trahison',actes:['I','II','III'],antagonistes:[{nom:'Varek',but:'pouvoir',methode:'complot'}],factions:[],fils:[],prochaine_etape:'duel'}}),
  R('Tu repères une silhouette. Elle dégaine.',{choices:[],test:null,combat:{type:'duel',title:'Le saboteur',briefing:'Un assassin et un garde.',allies:['Capitaine Rhal'],enemies:[{name:'Vessk',preset:'assassin'},{name:'Garde rouge',preset:'guard',pv:18}]},updates:null,chronicle:'Le saboteur attaque.',chapter:null,secret:null}),
  R('Après le combat, la flotte ennemie surgit.',{choices:[],combat:{type:'space',title:'Raid sur l’orbite',briefing:'Deux frégates.',enemies:[{type:'frigate',name:'Brise-Lame'},{type:'fighters',name:'Escadron Vipère'}]},updates:{credits:-500,notes:['Varek a payé le saboteur'],xp:1},chronicle:'Raid spatial.',chapter:null,secret:null}),
  R('Les troupes débarquent.',{choices:[],combat:{type:'ground',title:'Prise du relais',briefing:'Le relais est tenu.',enemies:[{type:'einf',name:'Rebelles'},{type:'eat',name:'Antichar'},{type:'eturret',name:'Tourelle'}]},updates:null,chronicle:'Assaut au sol.',chapter:{title:'Chapitre deux'},secret:null}),
  R('Le calme revient.',{choices:['Interroger le prisonnier','Rentrer au QG','Faire rapport'],test:null,combat:null,updates:{addCompanions:[{name:'Lyra',preset:'smuggler',note:'pilote'}],xp:3},chronicle:'Calme.',chapter:null,secret:null})
];
const dom=new JSDOM(page,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/',
  beforeParse(w){
    w.HTMLCanvasElement.prototype.getContext=()=>fake();
    w.ResizeObserver=class{observe(){}};
    w.scrollTo=()=>{};
    w.claude={use:async n=>{
      if(n==='sample'){const f=async(input,opts)=>{prompts.push(input);const a=answers.shift()||R('Fin.',{choices:['Continuer']});if(opts&&opts.onText)opts.onText({text:a.slice(0,20),delta:''});await new Promise(r=>setTimeout(r,20));return{text:a,truncated:false};};return f;}
      if(n==='user')return{id:async()=>'u1'};
      if(n==='db'){const store={};return{doc:p=>({get:async()=>({exists:!!store[p],data:()=>store[p]}),set:async d=>{store[p]=d;}})};}
      return null;}};
    w.addEventListener('error',e=>{console.log('PAGE ERROR',e.message);});
  }});
const w=dom.window,d=w.document;
const $=id=>d.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>{if(!el)throw new Error('missing element');el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
async function waitFor(fn,ms=60000,label=''){const t=Date.now();while(Date.now()-t<ms){try{if(fn())return;}catch(e){}await sleep(50);}throw new Error('timeout '+label);}
async function finishEngine(name){
  const pre={space:'sp',ground:'gr',duel:'ar'}[name];
  await waitFor(()=>!$('eng-'+name).hidden,5000,'engine shown '+name);
  let n=0;
  while($(pre+'-over').hidden&&n++<400){if(n%25===0)console.log(name,'turn',($(pre+'-turnNo')||$(pre+'-roundNo')).textContent,($(pre+'-fleet')||{}).textContent?.slice(0,80));
    if(name==='duel'){
      // donner un ordre à chaque combattant du joueur
      for(let k=0;k<5;k++){const b=d.querySelector('#ar-acts [data-a="recover"]');if(b&&!b.disabled)click(b);else break;await sleep(10);}
      const go=$('ar-goBtn');if(go&&!go.disabled)click(go);
    }else{const e=$(pre+'-endBtn');if(e&&!e.disabled)click(e);}
    await sleep(400);
  }
  await waitFor(()=>!$(pre+'-over').hidden,90000,'engine over '+name);
  console.log(name,'report:',$(pre+'-rBox').value.split('\n')[0]);
  click(d.querySelector('#eng-'+name+' [data-return]'));
  await waitFor(()=>!$('shell').hidden,3000,'back to shell');
}
(async()=>{
  await sleep(300);
  click($('btnNew'));
  click(d.querySelector('[data-era="dark"]'));click($('stepNext'));
  click(d.querySelector('[data-path="moff"]'));click($('stepNext'));
  $('cName').value='Moff Tarkis';click($('stepNext'));
  click(d.querySelector('[data-sk="tir"][data-d="1"]'));click($('stepNext'));
  await sleep(100);click($('stepNext'));
  click(d.querySelector('[data-addres="companions"]'));click($('stepNext'));
  click(d.querySelector('[data-theme="Guerre et rébellion"]'));
  click($('stepNext'));
  await waitFor(()=>$('rollBtn'),5000,'roll button');
  console.log('chapter:',$('chapTitle').textContent);
  click($('rollBtn'));
  await waitFor(()=>$('fightBtn'),5000,'fight duel');
  click($('fightBtn'));await finishEngine('duel');
  await waitFor(()=>$('fightBtn'),8000,'fight space');
  click($('fightBtn'));await finishEngine('space');
  await waitFor(()=>$('fightBtn'),8000,'fight ground');
  click($('fightBtn'));await finishEngine('ground');
  await waitFor(()=>d.querySelector('[data-choice]'),8000,'choices');
  console.log('choices:',[...d.querySelectorAll('[data-choice]')].map(b=>b.textContent).join(' | '));
  console.log('sheet has Lyra:',$('sheet').textContent.includes('Lyra'),'fleet:',JSON.stringify(w.eval('1')));
  console.log('feed entries:',$('feed').children.length,'prompts:',prompts.length,'last prompt has report:',prompts[3].includes('RAPPORT DE COMBAT'));
  console.log('chapter now:',$('chapNo').textContent,$('chapTitle').textContent);
  // Étape 1 : blessures et dégâts transmis au MJ
  const ok=(c,m)=>{if(!c)throw new Error('ÉCHEC : '+m);console.log('ok -',m);};
  ok(/PV 1\/\d+ \(gravement blessé\)/.test(prompts[2]),'héros vaincu en duel : 1 PV dans le prompt suivant');
  ok(/coque \d+ %/.test(prompts[3]),'état de coque de la flotte transmis');
  ok(/effectifs \d+ %/.test(prompts[4]),'effectifs des troupes transmis');
  ok(/PV (\d+)\/\1 \(en forme\)/.test(prompts[4]),'repos de nouveau chapitre : héros soigné');
  // Progression
  click(d.querySelector('[data-tab="prog"]'));
  const xpBtn=d.querySelector('[data-xp="sk"][data-k="perception"]');ok(xpBtn&&!xpBtn.disabled,'bouton +1 Perception actif avec 4 XP');
  click(xpBtn);
  ok($('sheet').textContent.includes('2 XP'),'XP déduite');
  // Intendance
  click(d.querySelector('[data-tab="inten"]'));
  $('bTroopN').value='Escouade Cresh';click(d.querySelector('[data-mg="buytroop"]'));
  click(d.querySelector('[data-tab="fiche"]'));
  ok($('sheet').textContent.includes('Escouade Cresh'),'troupe recrutée visible');
  click(d.querySelector('[data-choice="0"]'));
  await waitFor(()=>prompts.length===6,5000,'free act');
  ok(prompts[5].includes('PROGRESSION : Perception passe à 12'),'progression signalée au MJ');
  ok(prompts[5].includes('INTENDANCE : Recrutement'),'intendance signalée au MJ');
  console.log('prompt bytes',Buffer.byteLength(prompts[4]));fs.writeFileSync('p4.txt',prompts[4]);console.log('E2E OK');process.exit(0);
})().catch(e=>{console.log('FAIL',e.message);process.exit(1);});
