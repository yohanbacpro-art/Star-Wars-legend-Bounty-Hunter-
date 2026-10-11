const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../chroniques.html','utf8');
const page='<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>';
const fake=()=>new Proxy(function(){},{get:(t,k)=>k==='measureText'?()=>({width:50}):k==='canvas'?{width:100,height:100}:fake(),set:()=>true,apply:()=>fake()});
const prompts=[],saved=[];
const R=(narr,data)=>narr+'\n@@DONNEES\n'+JSON.stringify(data);
const answers=[
  R('— Bienvenue, Moff. La station tremble.\nLes sirènes hurlent.',{choices:[],test:{skill:'perception',mod:-2,why:'Repérer le saboteur'},combat:null,updates:null,chronicle:'Ouverture sur la station.',chapter:{title:'L’ombre sur Kessaria'},codex:{pnj:[{nom:'Varek',role:'gouverneur',relation:'méfiant',note:'Sourit trop'}],quetes:[{titre:'Démasquer le saboteur',etat:'en cours'}],lieux:[{nom:'Station Kessaria',note:'Orbite basse'}]},secret:{arc:'Trahison',actes:['I','II','III'],antagonistes:[{nom:'Varek',but:'pouvoir',methode:'complot'}],factions:[],fils:[],prochaine_etape:'duel'}}),
  R('Tu repères une silhouette. Elle dégaine.',{choices:[],test:null,combat:{type:'duel',title:'Le saboteur',briefing:'Un assassin et un garde.',allies:['Capitaine Rhal'],enemies:[{name:'Vessk',preset:'assassin'},{name:'Garde rouge',preset:'guard',pv:18}]},updates:null,chronicle:'Le saboteur attaque.',chapter:null,secret:null}),
  R('Après le combat, la flotte ennemie surgit.',{choices:[],combat:{type:'space',title:'Raid sur l’orbite',briefing:'Deux frégates.',enemies:[{type:'frigate',name:'Brise-Lame'},{type:'fighters',name:'Escadron Vipère'}]},updates:{credits:-500,notes:['Varek a payé le saboteur'],xp:1},chronicle:'Raid spatial.',chapter:null,secret:null}),
  R('Les troupes débarquent.',{choices:[],combat:{type:'ground',title:'Prise du relais',briefing:'Le relais est tenu.',enemies:[{type:'einf',name:'Rebelles'},{type:'eat',name:'Antichar'},{type:'eturret',name:'Tourelle'}]},updates:null,chronicle:'Assaut au sol.',chapter:{title:'Chapitre deux',resume:'Le saboteur Vessk a frappé la station ; la flotte a été repoussée.'},codex:{pnj:[{nom:'varek',relation:'hostile',note:'A payé le saboteur'}],quetes:[{titre:'Démasquer le saboteur',etat:'réussie'}]},secret:null}),
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
      if(n==='db'){const store=w.__store||(w.__store={});return{doc:p=>({get:async()=>({exists:!!store[p],data:()=>store[p]}),set:async d=>{store[p]=d;},delete:async()=>{delete store[p];}})};}
      if(n==='downloads')return{save:async r=>{saved.push(r);return{};}};
      return null;}};
    const sk={sabre:9,tir:15,pilotage:10,commandement:8,discretion:12,persuasion:8,intimidation:11,technique:8,perception:13,athletisme:12,force:8};
    const old={v:1,era:'gcw',year:'',path:'hunter',hero:{name:'Ancienne Kira',species:'Humaine',age:'',origin:'',trait:'',flaw:'',secret:'',force:false,side:'sith',skills:sk,weapon:'rifle',blade1:'#f00',blade2:'#f00',bolt:'#f80',form:'none',tech:['grenades'],look:{}},
      res:{credits:900,ship:'Intercepteur',fleet:[],troops:[],companions:[],notes:[]},zero:{themes:['Survie'],ambition:'',tone:'sombre',dosage:50,canon:'discret',free:''},secret:null,chronicle:[{ch:3,t:'Kira a fui.'}],chapter:{n:3,title:'Vieux contrat'},feed:[{k:'mj',text:'Ancien récit.'}],pending:null,choices:['Partir'],xp:2,created:1};
    w.__store={'data/users/u1/campaign':{json:JSON.stringify(old)}};
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
  const ok=(c,m)=>{if(!c)throw new Error('ÉCHEC : '+m);console.log('ok -',m);};
  await waitFor(()=>$('campZone').textContent.includes('Ancienne Kira'),3000,'old save');
  ok($('campZone').textContent.includes('Chapitre 3 — Vieux contrat'),'ancienne sauvegarde unique reprise dans la liste des campagnes');
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
  const rnd=w.Math.random;w.Math.random=()=>0.99;   // 6+6+6 : échec critique
  click($('rollBtn'));
  await waitFor(()=>$('rerollBtn'),5000,'destiny offer');
  ok($('rerollBtn').textContent.includes('(3)'),'jet raté : relance proposée avec 3 points de Destin');
  w.Math.random=()=>0;click($('rerollBtn'));        // 1+1+1 : réussite critique
  await waitFor(()=>prompts.length===2,5000,'after reroll');w.Math.random=rnd;
  ok(prompts[1].includes('Réussite critique (après relance grâce à un point de Destin)'),'relance transmise au MJ');
  await waitFor(()=>$('fightBtn'),5000,'fight duel');
  ok(d.querySelector('.destiny').textContent.includes('●●○○○'),'un point de Destin dépensé');
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
  ok(/PV 1\/\d+ \(gravement blessé\)/.test(prompts[2]),'héros vaincu en duel : 1 PV dans le prompt suivant');
  ok(/coque \d+ %/.test(prompts[3]),'état de coque de la flotte transmis');
  ok(/effectifs \d+ %/.test(prompts[4]),'effectifs des troupes transmis');
  ok(/PV (\d+)\/\1 \(en forme\)/.test(prompts[4]),'repos de nouveau chapitre : héros soigné');
  // Étape 2 : mémoire longue
  ok(prompts[4].includes('Ch. 1 — L’ombre sur Kessaria : Le saboteur Vessk'),'résumé du chapitre 1 dans le prompt');
  ok(/Varek \(gouverneur\) \[hostile\][^;]*A payé le saboteur/.test(prompts[4]),'PNJ fusionné par nom (casse ignorée)');
  ok(prompts[4].includes('Démasquer le saboteur [réussie]'),'quête mise à jour');
  ok(!prompts[4].includes('Ouverture sur la station.'),'chronique limitée au chapitre en cours');
  click(d.querySelector('[data-tab="carnet"]'));
  ok($('sheet').textContent.includes('Station Kessaria'),'onglet Carnet affiche les lieux');
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
  // Étape 3 : confort solo
  const nFeed=$('feed').children.length;
  click(d.querySelector('[data-tool="regen"]'));
  await waitFor(()=>prompts.length===7,5000,'regen');await sleep(100);
  ok(prompts[6]===prompts[5],'régénérer renvoie exactement la même demande');
  ok($('feed').children.length===nFeed,'régénérer remplace la réponse sans dupliquer le fil');
  click(d.querySelector('[data-tool="undo"]'));
  ok($('sayBox').value==='Interroger le prisonnier','annuler remet l’action dans la zone de saisie');
  ok(!$('feed').textContent.includes('Interroger le prisonnier'),'annuler retire l’action du fil');
  click(d.querySelector('[data-tool="ooc"]'));$('oocBox').value='Qui est Varek ?';click($('oocBtn'));
  await waitFor(()=>prompts.length===8&&!d.querySelector('#stopMJ'),5000,'ooc');
  ok(prompts[7].includes('Question hors-jeu du joueur\nQui est Varek ?')&&!prompts[7].includes('Trahison'),'question hors-jeu sans le carnet secret');
  ok(d.querySelector('.e-ooc'),'réponse hors-jeu affichée');
  click(d.querySelector('[data-tab="fiche"]'));click($('bookBtn'));
  await waitFor(()=>saved.length,3000,'book');
  ok(/livre\.html$/.test(saved[0].filename)&&saved[0].data.includes('Chapitre 2 — Chapitre deux')&&saved[0].data.includes('Tu repères une silhouette'),'livre de campagne exporté avec tout le récit');
  await sleep(600);
  click($('menuNew'));
  ok($('campZone').textContent.includes('Moff Tarkis'),'campagne listée sur l’écran titre');
  click(d.querySelector('[data-open]'));
  await waitFor(()=>!$('scr-story').hidden,3000,'reopen');
  ok($('sheet').textContent.includes('Moff Tarkis'),'campagne rouverte');
  click($('menuNew'));
  [...d.querySelectorAll('[data-open]')].find(b=>b.closest('.camp').textContent.includes('Ancienne Kira')).click();
  await waitFor(()=>$('sheet').textContent.includes('Ancienne Kira'),3000,'old open');
  ok($('feed').textContent.includes('Ancien récit.')&&$('sheet').textContent.includes('Kira a fui.'),'ancienne campagne jouable');
  console.log('prompt bytes',Buffer.byteLength(prompts[4]));fs.writeFileSync('p4.txt',prompts[4]);console.log('E2E OK');process.exit(0);
})().catch(e=>{console.log('FAIL',e.message);process.exit(1);});
