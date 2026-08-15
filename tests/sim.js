// Simule des parties complètes de Ranch Dynasty hors navigateur,
// avec un stub minimal du DOM, comme décrit dans le README.
const fs = require("fs");
const vm = require("vm");

const HTML = fs.readFileSync(process.argv[2] || "index.html", "utf8");
const BLOCKS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ALL_IDS = [...HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

function makeEl(id){
  const el = {
    id,
    textContent:"", value:"", disabled:false, _html:"",
    style:{}, dataset:{}, children:[], onclick:null,
    _classes:new Set(["__none"]),
    classList:{
      add:(...c)=>c.forEach(x=>el._classes.add(x)),
      remove:(...c)=>c.forEach(x=>el._classes.delete(x)),
      contains:(c)=>el._classes.has(c),
      toggle:(c,on)=>{ on ? el._classes.add(c) : el._classes.delete(c); }
    },
    addEventListener:(ev,fn)=>{ (el._h = el._h || {})[ev] = fn; },
    appendChild:(c)=>{ el.children.push(c); return c; },
    removeChild:(c)=>{ el.children = el.children.filter(x=>x!==c); },
    click:()=>{ if(el._h && el._h.click) el._h.click(); else if(el.onclick) el.onclick(); },
    querySelectorAll:()=>[],
    focus:()=>{}
  };
  Object.defineProperty(el, "innerHTML", {
    get:()=>el._html,
    set:(v)=>{ el._html = String(v); if(el._html === "") el.children = []; }
  });
  Object.defineProperty(el, "className", {
    get:()=>[...el._classes].join(" "),
    set:(v)=>{ el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  return el;
}

const els = new Map();
const $el = (id) => {
  if(!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
};

// Les éléments du DOM initial existent d'emblée, `hidden` compris.
ALL_IDS.forEach(id => $el(id));
["setupScreen","gameScreen","eventModal","toast","familyModal","cowboyModal",
 "chronicleModal","lineageModal","diplomacyModal","goalsModal"].forEach(id => {
  $el(id)._classes.add("hidden");
});
$el("gameScreen")._classes.add("hidden");

const actionTypes = [...HTML.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);
const actionBtns = actionTypes.map(t => {
  const b = makeEl("action-"+t);
  b.dataset.action = t;
  return b;
});

const document = {
  getElementById:(id)=>els.has(id) ? els.get(id) : null,
  createElement:()=>makeEl("created"),
  querySelectorAll:(sel)=> sel === ".action" ? actionBtns : [],
  addEventListener:(ev,fn)=>{ if(ev==="DOMContentLoaded") document._ready = fn; },
  body:makeEl("body")
};

const store = {};
let reloaded = false;
const sandbox = {
  document,
  window:{},
  console,
  Intl, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat,
  setTimeout:()=>0, clearTimeout:()=>{},
  confirm:()=>true, alert:()=>{},
  location:{ reload:()=>{ reloaded = true; } },
  localStorage:{
    getItem:(k)=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{ store[k]=String(v); },
    removeItem:(k)=>{ delete store[k]; }
  },
  Blob:function(){}, FileReader:function(){},
  URL:{ createObjectURL:()=>"blob:x", revokeObjectURL:()=>{} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
// Les identifiants nus de type `cowboyContent` s'appuient sur les globales nommées du navigateur.
ALL_IDS.forEach(id => { if(!(id in sandbox)) sandbox[id] = $el(id); });

vm.createContext(sandbox);

// Valeurs de l'écran de création
$el("difficulty").value = "normal";
$el("origin").value = "settler";
$el("familyName").value = "Duflot";
$el("ranchName").value = "Ranch de l'Aigle Noir";
$el("founderName").value = "Yohan";
$el("spouseName").value = "Élise";
$el("startMode").value = process.env.START || "founder";

BLOCKS.forEach((src,i) => {
  try{ vm.runInContext(src, sandbox, {filename:"bloc"+i+".js"}); }
  catch(e){ console.error("Échec au chargement du bloc "+i+" :", e.message); process.exit(1); }
});
if(document._ready) document._ready();

const G = sandbox;
// `let state` / `const ACHIEVEMENTS` restent dans la portée du script, pas sur la globale.
const ev = (code) => vm.runInContext(code, sandbox);
const ST = () => ev("state");

function modalOpen(){ return !$el("eventModal")._classes.has("hidden"); }

function resolveModal(rng){
  let guard = 0;
  while(modalOpen() && guard++ < 40){
    if(ST().gameOver){ $el("eventModal").classList.add("hidden"); return; }
    const choices = $el("eventChoices").children;
    if(!choices.length){
      throw new Error("Modale ouverte sans aucun choix disponible : « "+$el("eventTitle").textContent+" »");
    }
    const btn = choices[Math.floor(rng()*choices.length)];
    btn.onclick();
  }
  if(guard >= 40) throw new Error("Boucle de modales infinie");
}

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const RUNS = Number(process.argv[3] || 40);
const POLICY = process.argv[4] || "random";
const summary = { ends:{}, achievements:{}, maxYear:0, contested:0, planned:0, designations:0, gens:0, years:[], wealth:[], rep:[], sus:[] };
let uiCalls = 0;

for(let run = 0; run < RUNS; run++){
  const rng = mulberry32(run * 7919 + 13);
  Math.random = rng;
  reloaded = false;
  $el("eventChoices").children = [];
  $el("eventModal")._classes.add("hidden");

  G.startGame();
  resolveModal(rng);

  let turns = 0;
  if(process.env.ACTLOG){ const od=G.doAction; G.doAction=function(t){ const b=ST().actions; od(t); if(ST().actions<b) (globalThis.__ACTLOG=globalThis.__ACTLOG||[]).push(ST().year+":"+t); }; }
  while(!ST().gameOver && turns++ < 700){
    if(POLICY === "passive"){
      // Ne fait rien : vérifie que l'inaction reste sanctionnée.
    } else if(POLICY === "cheat"){
      // Renfloue le ranch pour neutraliser le déficit passif et observer les 141 années.
      const s2 = ST();
      s2.money = Math.max(s2.money, 30000 * s2.costModifier);
      s2.feed = Math.max(s2.feed, 300);
      s2.cattle = Math.max(s2.cattle, 40);
      s2.suspicion = Math.min(s2.suspicion, 60);
      if(s2.land < 900) G.doAction("buyLand");
      G.doAction("competition");
      G.doAction("family");
    } else if(POLICY === "outlaw" || POLICY === "honest"){
      // Deux pilotes strictement identiques : seule diffère l'action centrale
      // du trimestre — concours équestre contre opération clandestine.
      const N = G.actionsPerTurn ? G.actionsPerTurn() : 3;
      for(let a = 0; a < N; a++){
        const s2 = ST();
        const sc = n => Math.round(n * s2.costModifier);
        const L = G.lot ? G.lot() : 1;
        const cap = Math.max(20, Math.floor(s2.land/3));
        // Une seule action « de métier » par année, comme un joueur qui garde
        // le reste de ses points pour le troupeau.
        const metier = a === Math.floor(N/2);
        if(metier && POLICY === "outlaw"){
          // Un contrebandier avisé laisse retomber les soupçons avant de replonger.
          if(s2.suspicion > 45 && s2.money > sc(150)) { G.doAction("bribe"); continue; }
          if(s2.suspicion > 45) { G.doAction("family"); continue; }
          if(rng() < .35){
            const rops = ev("rivalOps()").filter(o => !o.cost || s2.money > s2.costModifier*o.cost*3);
            if(rops.length){
              const op = rops[Math.floor(rng()*rops.length)];
              const men = (s2.cowboys||[]).map((c,i)=>i).slice(0, Math.max(op.min||0, 2));
              ev("rivalTarget = " + (rng() < .5 ? 0 : 1));
              G.ensureSecondHouse();
              if(G.needsSquad(op)) G.runRivalOp(op.id, men); else G.runRivalOp(op.id);
              continue;
            }
          }
          const ops = ev("illegalOps()").filter(o => o.gain[1] && (!o.cost || s2.money > s2.costModifier*o.cost*3));
          if(ops.length){ G.runIllegalOp(ops[Math.floor(rng()*ops.length)].id); continue; }
        }
        if(metier && POLICY === "honest"){
          if(s2.horses < 3 && s2.money > sc(400)) { G.doAction("buyHorse"); continue; }
          if(s2.horses >= 1 && s2.money > sc(250)) { G.doAction("competition"); continue; }
        }
        if(s2.feed < 60*L && s2.money > sc(60)*2) G.doAction("buyFeed");
        else if(s2.cattle > cap) G.doAction("sellCattle");
        // On ne mange jamais son capital de production : seul le surplus
        // au-dessus des deux tiers de la capacité part au marché.
        else if(s2.money < sc(200) && s2.cattle > cap*0.8) G.doAction("sellCattle");
        else if(s2.money > sc(1500*L) && s2.cattle >= cap-6*L) G.doAction("buyLand");
        else if(s2.cattle < cap-4 && s2.money > (s2.cattlePrice+6)*5*3) G.doAction("buyCattle");
        else if(s2.unity < 55) G.doAction("family");
        else if(s2.horses < 1 && s2.money > sc(400)) G.doAction("buyHorse");
        else if(s2.horses >= 1 && s2.money > sc(60)) G.doAction("competition");
        else if(s2.cattle >= 10) G.doAction("sellCattle");
        else G.doAction("rivalNegotiate");
      }
      // Un cow-boy coûte plus en salaire qu'il ne rapporte : on n'en embauche
      // que le minimum utile aux coups de main, et seulement si la caisse suit.
      if((ST().cowboys||[]).length < 4 && ST().money > G.getHireCost()*12) G.hireCowboy();
    } else if(POLICY === "mixed"){
      // Joueur compétent qui recourt au crime seulement quand la caisse est
      // basse et les soupçons retombés : l'usage réaliste, pas le dogme.
      for(let a = 0; a < (G.actionsPerTurn?G.actionsPerTurn():3); a++){
        const s2 = ST();
        const sc = n => Math.round(n * s2.costModifier);
        const L = G.lot ? G.lot() : 1;
        const cap = Math.max(20, Math.floor(s2.land/3));
        // Placer l'argent dans l'affaire de l'époque, comme le ferait un
        // joueur attentif : c'est le seul emploi utile d'une grosse caisse.
        const ven = G.ventureOfEra ? G.ventureOfEra() : null;
        const venCost = ven ? G.ventureNextCost(ven) : 0;
        // Bâtir : le joueur attentif monte l'ouvrage suivant dès qu'il peut le
        // payer trois fois — c'est le principal emploi d'une grosse caisse.
        const chantier = (G.availableBuildings ? G.availableBuildings() : [])
          .filter(b => !G.hasBuilding(b.id))
          .find(b => s2.money > G.buildingCost(b) * 3);
        if(chantier) G.raiseBuilding(chantier.id);
        else if(ven && G.ventureLevel(ven.id) < ven.max && s2.money > venCost * 2.5) G.doAction("venture");
        else if(s2.feed < 60*L && s2.money > sc(60)*2) G.doAction("buyFeed");
        else if(s2.cattle > cap) G.doAction("sellCattle");
        else if(s2.money < sc(300) && s2.suspicion < 35){
          const ops = ev("illegalOps()").filter(o => o.gain[1] && (!o.cost || s2.money > s2.costModifier*o.cost*3));
          if(ops.length) G.runIllegalOp(ops[0].id); else G.doAction("sellCattle");
        }
        else if(s2.suspicion > 60 && s2.money > sc(150*L)) G.doAction("bribe");
        else if(s2.money > sc(1200*L) && s2.cattle >= cap-6*L) G.doAction("buyLand");
        else if(s2.cattle < cap-4 && s2.money > (s2.cattlePrice+6)*5*3) G.doAction("buyCattle");
        else if(s2.champion && s2.champion.training < 60 && s2.money > sc(400*L)) G.doAction("trainHorse");
        else if(s2.horses < 1 && s2.money > sc(400)) G.doAction("buyHorse");
        else if(s2.horses >= 1 && s2.money > sc(60)) G.doAction("competition");
        else if(s2.cattle >= 10) G.doAction("sellCattle");
        else G.doAction("family");
      }
    } else if(POLICY === "random"){
      const n = Math.floor(rng()*4);
      for(let a = 0; a < n; a++){
        G.doAction(actionTypes[Math.floor(rng()*actionTypes.length)]);
      }
    } else {
      // Joueur compétent : protège son troupeau, agrandit ses pâturages avant
      // son cheptel, et ne vend jamais sa capacité de production.
      for(let a = 0; a < (G.actionsPerTurn?G.actionsPerTurn():3); a++){
        const s2 = ST();
        const sc = n => Math.round(n * s2.costModifier);
        const L = G.lot ? G.lot() : 1;
        const cap = Math.max(20, Math.floor(s2.land/3));
        // Placer l'argent dans l'affaire de l'époque, comme le ferait un
        // joueur attentif : c'est le seul emploi utile d'une grosse caisse.
        const ven = G.ventureOfEra ? G.ventureOfEra() : null;
        const venCost = ven ? G.ventureNextCost(ven) : 0;
        if(ven && G.ventureLevel(ven.id) < ven.max && s2.money > venCost * 2.5) G.doAction("venture");
        else if(s2.feed < 60*L && s2.money > sc(60)*2) G.doAction("buyFeed");
        else if(s2.cattle > cap) G.doAction("sellCattle");
        else if(s2.money < sc(200) && s2.cattle > cap*0.8) G.doAction("sellCattle");
        else if(s2.money > sc(1200*L) && s2.cattle >= cap-6*L) G.doAction("buyLand");
        else if(s2.cattle < cap-4 && s2.money > (s2.cattlePrice+6)*5*3) G.doAction("buyCattle");
        else if(s2.unity < 55) G.doAction("family");
        else if(s2.suspicion > 60 && s2.money > sc(150*L)) G.doAction("bribe");
        else if(s2.champion && s2.champion.training < 60 && s2.money > sc(400*L)) G.doAction("trainHorse");
        else if(s2.horses < 1 && s2.money > sc(400)) G.doAction("buyHorse");
        else if(s2.horses >= 1 && s2.money > sc(60)) G.doAction("competition");
        else if(s2.cattle >= 10) G.doAction("sellCattle");
        else G.doAction("family");
      }
    }

    // Le joueur passif ne fait strictement rien : ni actions, ni diplomatie,
    // ni succession préparée. C'est le témoin de l'inaction.
    if(POLICY === "passive"){ G.endTurn(); resolveModal(rng); continue; }

    // Désignation d'héritier
    const adults = G.adultHeirs ? G.adultHeirs() : [];
    if(adults.length && (POLICY === "random" ? rng() < 0.06 : !(G.heirChild ? G.heirChild() : null))){
      const pick = adults[Math.floor(rng()*adults.length)];
      G.designateHeir(pick.cid);
      summary.designations++;
    }
    if(POLICY === "random" && rng() < 0.01 && (G.heirChild ? G.heirChild() : null)) G.clearHeir();

    // Diplomatie
    if(ST().factions && ST().factions.length && rng() < 0.15){
      const i = Math.floor(rng()*ST().factions.length);
      (POLICY === "random" && rng() < 0.3) ? G.harmFaction(i) : G.allyFaction(i);
    }
    // Un homme pour vingt-cinq bêtes : on embauche à mesure que le troupeau grandit.
    { const t = ST();
      const utiles = Math.max(1, Math.ceil(Math.min(t.cattle, Math.floor(t.land/3))/25));
      if(POLICY !== "random" && (t.cowboys||[]).length < Math.min(utiles, 12)
         && t.money > G.getHireCost()*6) G.hireCowboy();
      else if(rng() < (POLICY === "random" ? 0.04 : 0)) G.hireCowboy(); }

    // Toutes les vues, régulièrement : elles doivent survivre à n'importe quel état
    if(rng() < 0.2){
      [G.renderFamily,G.renderGoals,G.renderDiplomacy,G.renderLineage,G.renderCowboys].forEach(f=>f&&f());
      G.chronicleContent.innerHTML = ST().chronicles.join("<hr>");
      uiCalls++;
    }

    G.endTurn();
    resolveModal(rng);

    if(process.env.TRACE && (process.env.TRACE === "all" || turns % 16 === 1)){
      const t = ST();
      const sal = (t.cowboys||[]).reduce((x,c)=>x+c.salary,0);
      const upk = Math.round((t.cattle*1.7 + t.horses*5 + t.land*.15) * t.costModifier + sal);
      const cap = Math.max(20, Math.floor(t.land/3));
      console.log(`${t.year} | argent ${String(Math.round(t.money)).padStart(9)}`
        + ` | bétail ${String(t.cattle).padStart(4)}/${String(cap).padStart(4)}`
        + ` | terres ${String(t.land).padStart(4)} | fourrage ${String(t.feed).padStart(5)}`
        + ` | entretien ${String(upk).padStart(8)} (salaires ${String(sal).padStart(7)}, ${(t.cowboys||[]).length} h.)`
        + ` | cm ${t.costModifier.toFixed(1)}`);
    }
  }

  // Sauvegarde / rechargement en fin de partie
  G.saveGame();
  const before = JSON.stringify(ST());
  G.loadGame();
  if(JSON.stringify(ST()) === before.slice(0,0)) throw new Error("état perdu");
  [G.renderFamily,G.renderGoals,G.renderDiplomacy,G.renderLineage].forEach(f=>f&&f());

  const title = $el("eventTitle").textContent;
  summary.ends[title] = (summary.ends[title]||0)+1;
  if(ST().year < 2026) (summary.failYears = summary.failYears || []).push(ST().year + " " + title);
  if(process.env.DIAG && title === "Fin de la lignée"){
    const t = ST();
    console.log(`  éteinte en ${t.year} | chef ${t.founder.name} ${t.founder.age} ans (vivant:${t.founder.alive})`
      + ` | conjoint ${t.spouse.alive?t.spouse.age+" ans":"décédé"}`
      + ` | enfants vivants ${t.children.filter(c=>c.alive!==false).length}/${t.children.length}`
      + ` | générations ${(t.lineage||[]).length}`);
  }
  if(ST().year >= 2026) summary.ends["__2026__"] = (summary.ends["__2026__"]||0)+1;
  summary.maxYear = Math.max(summary.maxYear, ST().year);
  summary.years.push(ST().year);
  (summary.turnsEnd=summary.turnsEnd||[]).push(turns);
  (summary.landEnd=summary.landEnd||[]).push(ST().land);
  (summary.cattleEnd=summary.cattleEnd||[]).push(ST().cattle);
  summary.gens += (ST().lineage||[]).length;
  {
    const t = ST();
    // Richesse convertie en dollars de 1885, pour comparer d'une époque à l'autre.
    summary.wealth.push(Math.round((t.money + t.cattle*t.cattlePrice + t.land*2) / t.costModifier));
    summary.rep.push(t.reputation); summary.sus.push(t.suspicion);
  }
  summary.planned += (ST().stats||{}).plannedSuccessions||0;
  summary.contested += (ST().stats||{}).contestedSuccessions||0;
  summary.duties = (summary.duties||0) + ((ST().stats||{}).dutiesPaid||0);
  summary.finalMoney = (summary.finalMoney||0) + ST().money/( (ST().year>=2010)?16:((ST().year>=1990)?9:1) );
  (ST().achievements||[]).forEach(a => {
    summary.achievements[a.id] = (summary.achievements[a.id]||0)+1;
  });
}

if(process.env.ACTLOG){ const m={}; (globalThis.__ACTLOG||[]).forEach(x=>{const i=x.indexOf(':');(m[x.slice(0,i)]=m[x.slice(0,i)]||[]).push(x.slice(i+1))}); Object.keys(m).slice(0,26).forEach(y=>console.log(y, m[y].join(' ')));}
console.log("Politique :", POLICY, "— départ :", $el("startMode").value,
            "— parties simulées :", RUNS, "— rendus d'interface :", uiCalls);
const ys=summary.years.slice().sort((a,b)=>a-b);
console.log("Année de fin — médiane :", ys[Math.floor(ys.length/2)], "max :", summary.maxYear);
console.log("Successions préparées :", summary.planned, "— contestées :", summary.contested,
            "— désignations :", summary.designations);
console.log("Droits de succession cumulés (moyenne) :", Math.round((summary.duties||0)/RUNS));
console.log("Trésorerie finale en $ de 1885 (moyenne) :", Math.round((summary.finalMoney||0)/RUNS));
const medOf=a=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)];};
console.log("Tours joués (médiane) :", medOf(summary.turnsEnd||[0]));
console.log("Terres finales (médiane) :", medOf(summary.landEnd||[0]), "— bétail final (médiane) :", medOf(summary.cattleEnd||[0]));
if(summary.failYears && summary.failYears.length){
  const late = summary.failYears.filter(f => Number(f.split(" ")[0]) >= 1950);
  console.log("Chutes après 1950 :", late.length + "/" + summary.failYears.length,
              late.length ? "— " + late.slice(0,6).join(", ") : "");
}
console.log("\nFins de partie :");
Object.entries(summary.ends).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+v+"×  "+k));
console.log("Générations (lignée) moyenne :", (summary.gens/RUNS).toFixed(2));
const med = a => { const b=a.slice().sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
console.log("Patrimoine final médian (dollars de 1885) :", med(summary.wealth));
console.log("Réputation médiane :", med(summary.rep), "— soupçons médians :", med(summary.sus));
console.log("\nObjectifs débloqués (sur "+RUNS+" parties) :");
(ev("typeof ACHIEVEMENTS !== \"undefined\" ? ACHIEVEMENTS : []")).forEach(a=>{
  const n = summary.achievements[a.id]||0;
  console.log("  "+String(n).padStart(3)+"×  "+a.id.padEnd(14)+" "+a.title);
});
