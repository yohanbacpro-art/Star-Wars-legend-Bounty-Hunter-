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
const summary = { ends:{}, achievements:{}, maxYear:0, contested:0, planned:0, designations:0, gens:0, years:[] };
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
  while(!ST().gameOver && turns++ < 700){
    if(POLICY === "cheat"){
      // Renfloue le ranch pour neutraliser le déficit passif et observer les 141 années.
      const s2 = ST();
      s2.money = Math.max(s2.money, 30000 * s2.costModifier);
      s2.feed = Math.max(s2.feed, 300);
      s2.cattle = Math.max(s2.cattle, 40);
      s2.suspicion = Math.min(s2.suspicion, 60);
      if(s2.land < 900) G.doAction("buyLand");
      G.doAction("competition");
      G.doAction("family");
    } else if(POLICY === "random"){
      const n = Math.floor(rng()*4);
      for(let a = 0; a < n; a++){
        G.doAction(actionTypes[Math.floor(rng()*actionTypes.length)]);
      }
    } else {
      // Joueur raisonnable : vend quand la caisse est basse, investit quand elle est pleine.
      for(let a = 0; a < 3; a++){
        const s2 = ST();
        const capacity = Math.max(20, Math.floor(s2.land/3));
        const buyCost = (s2.cattlePrice+6)*5*s2.costModifier;
        if(s2.money < buyCost*2 && s2.cattle >= 10) G.doAction("sellCattle");
        else if(s2.unity < 55) G.doAction("family");
        else if(s2.suspicion > 55 && s2.money > 200*s2.costModifier) G.doAction("bribe");
        else if(s2.cattle < capacity && s2.money > buyCost*4) G.doAction("buyCattle");
        else if(s2.money > 900*s2.costModifier) G.doAction("buyLand");
        else if(s2.cattle >= 10) G.doAction("sellCattle");
        else G.doAction("family");
      }
    }

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
    if(rng() < (POLICY === "random" ? 0.04 : 0.01)) G.hireCowboy();

    // Toutes les vues, régulièrement : elles doivent survivre à n'importe quel état
    if(rng() < 0.2){
      [G.renderFamily,G.renderGoals,G.renderDiplomacy,G.renderLineage,G.renderCowboys].forEach(f=>f&&f());
      G.chronicleContent.innerHTML = ST().chronicles.join("<hr>");
      uiCalls++;
    }

    G.endTurn();
    resolveModal(rng);
  }

  // Sauvegarde / rechargement en fin de partie
  G.saveGame();
  const before = JSON.stringify(ST());
  G.loadGame();
  if(JSON.stringify(ST()) === before.slice(0,0)) throw new Error("état perdu");
  [G.renderFamily,G.renderGoals,G.renderDiplomacy,G.renderLineage].forEach(f=>f&&f());

  const title = $el("eventTitle").textContent;
  summary.ends[title] = (summary.ends[title]||0)+1;
  if(ST().year >= 2026) summary.ends["__2026__"] = (summary.ends["__2026__"]||0)+1;
  summary.maxYear = Math.max(summary.maxYear, ST().year);
  summary.years.push(ST().year);
  summary.gens += (ST().lineage||[]).length;
  summary.planned += (ST().stats||{}).plannedSuccessions||0;
  summary.contested += (ST().stats||{}).contestedSuccessions||0;
  (ST().achievements||[]).forEach(a => {
    summary.achievements[a.id] = (summary.achievements[a.id]||0)+1;
  });
}

console.log("Politique :", POLICY, "— parties simulées :", RUNS, "— rendus d'interface :", uiCalls);
const ys=summary.years.slice().sort((a,b)=>a-b);
console.log("Année de fin — médiane :", ys[Math.floor(ys.length/2)], "max :", summary.maxYear);
console.log("Successions préparées :", summary.planned, "— contestées :", summary.contested,
            "— désignations :", summary.designations);
console.log("\nFins de partie :");
Object.entries(summary.ends).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log("  "+v+"×  "+k));
console.log("Générations (lignée) moyenne :", (summary.gens/RUNS).toFixed(2));
console.log("\nObjectifs débloqués (sur "+RUNS+" parties) :");
(ev("typeof ACHIEVEMENTS !== \"undefined\" ? ACHIEVEMENTS : []")).forEach(a=>{
  const n = summary.achievements[a.id]||0;
  console.log("  "+String(n).padStart(3)+"×  "+a.id.padEnd(14)+" "+a.title);
});
