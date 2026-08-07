// Tests ciblés des trois nouveautés : objectifs, succession, factions.
// Charge le jeu dans le même stub de DOM que sim.js, puis force des situations
// que la partie normale met des décennies à produire.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const FILE = process.argv[2] || "index.html";
const HTML = fs.readFileSync(FILE, "utf8");
const BLOCKS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ALL_IDS = [...HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

function makeEl(id){
  const el = {
    id, textContent:"", value:"", disabled:false, _html:"",
    style:{}, dataset:{}, children:[], onclick:null, _classes:new Set(),
    classList:{
      add:(...c)=>c.forEach(x=>el._classes.add(x)),
      remove:(...c)=>c.forEach(x=>el._classes.delete(x)),
      contains:(c)=>el._classes.has(c),
      toggle:(c,on)=>{ on ? el._classes.add(c) : el._classes.delete(c); }
    },
    addEventListener:(ev,fn)=>{ (el._h=el._h||{})[ev]=fn; },
    appendChild:(c)=>{ el.children.push(c); return c; },
    removeChild:(c)=>{ el.children = el.children.filter(x=>x!==c); },
    querySelectorAll:()=>[]
  };
  Object.defineProperty(el,"innerHTML",{get:()=>el._html,set:v=>{el._html=String(v);if(el._html==="")el.children=[];}});
  Object.defineProperty(el,"className",{get:()=>[...el._classes].join(" "),set:v=>{el._classes=new Set(String(v).split(/\s+/).filter(Boolean));}});
  return el;
}
const els = new Map();
const $el = id => { if(!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
ALL_IDS.forEach($el);

const actionTypes = [...HTML.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]);
const actionBtns = actionTypes.map(t=>{ const b=makeEl("a-"+t); b.dataset.action=t; return b; });
const store = {};
const document = {
  getElementById:id=>els.has(id)?els.get(id):null,
  createElement:()=>makeEl("created"),
  querySelectorAll:sel=>sel===".action"?actionBtns:[],
  addEventListener:(ev,fn)=>{ if(ev==="DOMContentLoaded") document._ready=fn; },
  body:makeEl("body")
};
const sandbox = {
  document, console, Intl, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat, setTimeout:()=>0, clearTimeout:()=>{}, confirm:()=>true,
  location:{reload:()=>{}},
  localStorage:{getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];}},
  Blob:function(){}, FileReader:function(){}, URL:{createObjectURL:()=>"b", revokeObjectURL:()=>{}}
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
ALL_IDS.forEach(id => { if(!(id in sandbox)) sandbox[id] = $el(id); });
vm.createContext(sandbox);
$el("difficulty").value="normal"; $el("origin").value="settler";
$el("familyName").value="Duflot"; $el("ranchName").value="Ranch test";
$el("founderName").value="Yohan"; $el("spouseName").value="Élise";
BLOCKS.forEach((src,i)=>vm.runInContext(src, sandbox, {filename:"bloc"+i+".js"}));
if(document._ready) document._ready();

const G = sandbox;
const ev = code => vm.runInContext(code, sandbox);
const ST = () => ev("state");

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log("  ok   " + name); }
  else{ fail++; console.log("  FAIL " + name + (detail !== undefined ? "  → " + detail : "")); }
}
function section(t){ console.log("\n" + t); }

function freshGame(){
  G.startGame();
  const s = ST();
  s.money = 5000;
  return s;
}
function addAdult(s, name, props){
  const c = G.addChild(name, Object.assign({age:24, ambition:50, resentment:0, bond:50, health:100}, props||{}));
  return c;
}

// ---------------------------------------------------------------- Objectifs
section("Objectifs");
{
  const s = freshGame();
  check("état neuf : aucun objectif", s.achievements.length === 0, s.achievements.length);

  s.cattle = 120;
  G.checkAchievements();
  check("herd100 se débloque à 100 bovins", s.achievements.some(a=>a.id==="herd100"));

  const n = s.achievements.length;
  G.checkAchievements();
  check("pas de double déblocage", s.achievements.length === n, s.achievements.length);

  s.achievements.forEach(a => {
    check("l'objectif " + a.id + " garde son horodatage",
      typeof a.year === "number" && typeof a.season === "number");
  });

  // fortune dépend de sc() : elle doit suivre l'inflation de l'époque
  s.money = 9999 * s.costModifier;
  G.checkAchievements();
  check("fortune ne se débloque pas sous le seuil", !s.achievements.some(a=>a.id==="fortune"));
  s.money = 10000 * s.costModifier + 5;
  G.checkAchievements();
  check("fortune se débloque à l'échelle de l'époque", s.achievements.some(a=>a.id==="fortune"));

  // aucun check ne doit lancer, quel que soit l'état
  const before = ST().achievements.length;
  ["cowboys","factions","legacy","secret","rival","lineage","stats"].forEach(k => { delete ST()[k]; });
  let threw = false;
  try{ G.checkAchievements(); }catch(e){ threw = true; }
  check("checkAchievements survit à un état amputé", !threw);
  ST().achievements.length = before;
}

// -------------------------------------------------------------- Succession
section("Succession : désignation");
{
  const s = freshGame();
  const anna = addAdult(s, "Anna", {ambition:80});
  const bruno = addAdult(s, "Bruno", {ambition:70});
  const chloe = addAdult(s, "Chloé", {age:12});

  check("adultHeirs ne retient que les majeurs vivants",
    G.adultHeirs().length === 2, G.adultHeirs().map(c=>c.name).join(","));

  G.designateHeir(chloe.cid);
  check("un mineur ne peut pas être désigné", s.heirId === null, s.heirId);

  G.designateHeir(anna.cid);
  check("désignation enregistrée", G.heirChild() && G.heirChild().name === "Anna");
  check("l'héritier gagne en attachement", anna.bond > 50, anna.bond);
  check("l'écarté accumule de la rancune", bruno.resentment > 0, bruno.resentment);

  const brunoBefore = bruno.resentment;
  G.designateHeir(bruno.cid);
  check("changer d'héritier remplace bien", G.heirChild().name === "Bruno");
  check("l'ancien héritier est blessé", anna.resentment > 0, anna.resentment);
  check("le nouvel héritier s'apaise", bruno.resentment < brunoBefore, bruno.resentment);

  G.clearHeir();
  check("retrait de la désignation", s.heirId === null);
  check("le retrait ajoute de la rancune", bruno.resentment > 0, bruno.resentment);

  // identifiants : deux enfants homonymes restent distincts
  const d1 = addAdult(s, "Jean");
  const d2 = addAdult(s, "Jean");
  check("les homonymes ont des cid distincts", d1.cid !== d2.cid, d1.cid + "/" + d2.cid);
  G.designateHeir(d2.cid);
  check("la désignation vise le bon homonyme", G.heirChild() === d2);
}

section("Succession : reprise du ranch");
{
  // Héritier désigné, fratrie apaisée → passation propre
  const s = freshGame();
  const a = addAdult(s, "Anna", {age:30, ambition:60});
  const b = addAdult(s, "Bruno", {age:34, ambition:20, resentment:0});
  G.designateHeir(a.cid);
  b.resentment = 0;
  s.unity = 90;
  s.founder.alive = false;
  const lineageBefore = s.lineage.length;
  G.resolveSuccession();
  check("l'héritier désigné prime sur l'aîné", ST().founder.name === "Anna", ST().founder.name);
  check("l'héritier quitte la liste des enfants",
    !ST().children.some(c=>c.cid===a.cid));
  check("la lignée s'allonge", ST().lineage.length === lineageBefore+1);
  check("l'époque de fin est notée sur le prédécesseur",
    ST().lineage[lineageBefore-1].endYear === ST().year);
  check("succession préparée comptabilisée", ST().stats.plannedSuccessions === 1);
  check("la désignation est remise à zéro", ST().heirId === null);
}
{
  // Sans désignation → l'aîné reprend
  const s = freshGame();
  addAdult(s, "Cadet", {age:22});
  const aine = addAdult(s, "Aîné", {age:41});
  s.founder.alive = false;
  G.resolveSuccession();
  check("sans désignation, l'aîné reprend", ST().founder.name === "Aîné", ST().founder.name);
  check("succession non préparée non comptabilisée", ST().stats.plannedSuccessions === 0);
}
{
  // Rival exaspéré → contestation garantie
  let contested = 0, split = 0;
  for(let i = 0; i < 200; i++){
    const s = freshGame();
    const heir = addAdult(s, "Héritier", {age:30, ambition:30});
    const rival = addAdult(s, "Rival", {age:28, ambition:99, resentment:100});
    G.designateHeir(heir.cid);
    rival.resentment = 100;
    s.unity = 20;
    s.founder.alive = false;
    const landBefore = ST().land, moneyBefore = ST().money;
    G.resolveSuccession();
    if(ST().stats.contestedSuccessions > 0){
      contested++;
      if(ST().land < landBefore && ST().money < moneyBefore) split++;
    }
  }
  check("un rival à 100 de rancune conteste souvent", contested > 100, contested + "/200");
  check("la contestation peut coûter terres et argent", split > 0, split);
}
{
  // Aucun enfant majeur → pas de reprise, l'état reste cohérent
  const s = freshGame();
  s.founder.alive = false;
  const before = JSON.stringify(ST().lineage);
  G.resolveSuccession();
  check("sans majeur, la lignée est inchangée", JSON.stringify(ST().lineage) === before);
}

section("Succession : montée des tensions");
{
  const s = freshGame();
  const a = addAdult(s, "Anna", {ambition:90});
  const b = addAdult(s, "Bruno", {ambition:85});
  s.unity = 30;
  for(let i = 0; i < 20; i++) G.heirTensionPhase();
  check("sans héritier désigné, la rancune monte",
    a.resentment > 20 || b.resentment > 20, a.resentment + "/" + b.resentment);

  const s2 = freshGame();
  const c = addAdult(s2, "Claire", {ambition:60});
  addAdult(s2, "Denis", {ambition:60});
  G.designateHeir(c.cid);
  s2.unity = 90;
  for(let i = 0; i < 20; i++) G.heirTensionPhase();
  check("l'héritier désigné reste apaisé", c.resentment <= 5, c.resentment);

  // Pas d'enfant : aucune erreur
  const s3 = freshGame();
  let threw = false;
  try{ G.heirTensionPhase(); }catch(e){ threw = true; }
  check("heirTensionPhase sans enfants ne lance pas", !threw);
}

// ---------------------------------------------------------------- Factions
section("Factions : structure et effets");
{
  const s = freshGame();
  check("quatre pouvoirs par époque", s.factions.length === 4, s.factions.length);
  const types = s.factions.map(f=>f.type).sort().join(",");
  check("les quatre types sont présents", types === "community,law,media,trade", types);

  ev("ERAS").forEach(era => {
    check("l'époque " + era.id + " définit ses quatre factions",
      era.factionDefs && era.factionDefs.length === 4);
    const t = era.factionDefs.map(d=>d.type).sort().join(",");
    check("l'époque " + era.id + " couvre les quatre types", t === "community,law,media,trade", t);
  });

  s.factions.forEach(f => f.relation = 0);
  check("neutre = aucun effet", ev("factionStance('law')") === 0);
  G.factionOfType("law").relation = 50;
  check("au-delà de 40 : alliée", ev("factionStance('law')") === 1);
  G.factionOfType("law").relation = -50;
  check("en dessous de -30 : hostile", ev("factionStance('law')") === -1);
}
{
  // Négoce allié → revenus supérieurs, à état par ailleurs identique
  function runQuarter(tradeRelation){
    const s = freshGame();
    s.factions.forEach(f => f.relation = 0);
    G.factionOfType("trade").relation = tradeRelation;
    s.cattle = 60; s.land = 300; s.money = 3000; s.feed = 500;
    s.rival.relation = 0;
    const before = s.money;
    // on neutralise l'aléa des revenus
    const realRandom = Math.random;
    Math.random = () => 0.5;
    G.endTurn();
    Math.random = realRandom;
    return ST().money - before;
  }
  const neutral = runQuarter(0);
  const allied  = runQuarter(80);
  const hostile = runQuarter(-80);
  check("négoce allié : meilleur résultat trimestriel", allied > neutral, allied + " > " + neutral);
  check("négoce hostile : pire résultat trimestriel", hostile < neutral, hostile + " < " + neutral);
}
{
  // Autorité, opinion, voisinage
  function quarter(type, relation, read){
    const s = freshGame();
    s.factions.forEach(f => f.relation = 0);
    G.factionOfType(type).relation = relation;
    s.suspicion = 50; s.reputation = 50; s.unity = 50;
    s.cattle = 60; s.land = 300; s.money = 5000; s.feed = 500; s.rival.relation = 0;
    const before = read(s);
    const realRandom = Math.random;
    Math.random = () => 0.5;
    G.endTurn();
    Math.random = realRandom;
    return read(ST()) - before;
  }
  const sus = s => s.suspicion, rep = s => s.reputation, uni = s => s.unity;
  check("autorité alliée : les soupçons tombent plus vite",
    quarter("law", 80, sus) < quarter("law", 0, sus));
  check("autorité hostile : les soupçons montent",
    quarter("law", -80, sus) > quarter("law", 0, sus));
  check("opinion alliée : la réputation monte", quarter("media", 80, rep) > 0);
  check("opinion hostile : la réputation baisse", quarter("media", -80, rep) < 0);
  check("voisinage allié : l'unité monte", quarter("community", 80, uni) > quarter("community", 0, uni));
  check("voisinage hostile : l'unité baisse", quarter("community", -80, uni) < quarter("community", 0, uni));
}
{
  // Transmission des relations d'une époque à l'autre
  const s = freshGame();
  s.factions.forEach(f => f.relation = 90);
  const next = G.generateFactions(ev("ERAS")[1], s.factions);
  check("les relations se transmettent en partie",
    next.every(f => f.relation > 30), next.map(f=>f.type+":"+f.relation).join(" "));
  check("les noms changent d'époque",
    next.every(f => !s.factions.some(o => o.name === f.name)));
  const fresh = G.generateFactions(ev("ERAS")[1]);
  check("sans passé, les relations sont modestes",
    fresh.every(f => f.relation >= -10 && f.relation <= 30));
  const hostileCarry = G.generateFactions(ev("ERAS")[1], s.factions.map(f=>({...f, relation:-100})));
  check("l'hostilité se transmet aussi", hostileCarry.every(f => f.relation < 0),
    hostileCarry.map(f=>f.relation).join(","));
  check("les relations transmises restent bornées",
    hostileCarry.every(f => f.relation >= -100 && f.relation <= 100));
}

// -------------------------------------------- Compatibilité des sauvegardes
section("Sauvegardes antérieures");
{
  const s = freshGame();
  addAdult(s, "Ancien");
  // On fabrique une sauvegarde « V1.3 » : ni objectifs, ni cid, ni factions typées
  const old = JSON.parse(JSON.stringify(s));
  delete old.achievements; delete old.stats; delete old.heirId; delete old.nextCid;
  old.children.forEach(c => { delete c.cid; delete c.ambition; delete c.resentment; });
  old.factions = [
    {name:"la Coopérative des Éleveurs", relation:20},
    {name:"le fort militaire voisin", relation:-5},
    {name:"la ville de Redemption", relation:10}
  ];
  sandbox.localStorage.setItem("ranchDynastySave_1", JSON.stringify(old));
  $el("saveSlot").value = "1";
  G.loadGame();
  const l = ST();
  check("objectifs recréés", Array.isArray(l.achievements));
  check("compteurs recréés", l.stats && l.stats.plannedSuccessions === 0);
  check("cid attribués aux enfants existants", l.children.every(c => typeof c.cid === "number"));
  check("cid uniques", new Set(l.children.map(c=>c.cid)).size === l.children.length);
  check("nextCid au-delà des cid existants",
    l.children.every(c => c.cid < l.nextCid), l.nextCid);
  check("factions retypées", l.factions.every(f => !!f.type));
  check("quatrième faction ajoutée", l.factions.length === 4, l.factions.length);
  check("types complets après migration",
    new Set(l.factions.map(f=>f.type)).size === 4);
  check("les relations d'origine sont préservées",
    l.factions.find(f=>f.name==="la Coopérative des Éleveurs").relation === 20);

  let threw = false;
  try{ G.renderFamily(); G.renderGoals(); G.renderDiplomacy(); G.renderLineage(); }
  catch(e){ threw = e.message; }
  check("les vues affichent une sauvegarde migrée", threw === false, threw);

  // Une désignation reste possible sur une partie migrée
  const adult = G.adultHeirs()[0];
  if(adult) G.designateHeir(adult.cid);
  check("désignation possible après migration", !!G.heirChild());
}

// ------------------------------------------------- Événements conditionnels
section("Événements conditionnels");
{
  const s = freshGame();
  const withCond = ev("events.filter(e=>e.condition)");
  check("des événements portent une condition", withCond.length >= 3, withCond.length);
  // Sans enfant majeur, l'événement de succession ne doit pas être tirable
  const poolEmpty = ev("events.filter(e=>(!e.eraId||e.eraId===state.eraId)&&(!e.condition||e.condition()))");
  check("l'événement de succession est écarté sans prétendants",
    !poolEmpty.some(e => e.title === "La question de la succession"));
  addAdult(s, "A"); addAdult(s, "B");
  const poolFull = ev("events.filter(e=>(!e.eraId||e.eraId===state.eraId)&&(!e.condition||e.condition()))");
  check("il apparaît dès qu'il y a deux prétendants",
    poolFull.some(e => e.title === "La question de la succession"));
  G.designateHeir(ST().children[0].cid);
  const poolNamed = ev("events.filter(e=>(!e.eraId||e.eraId===state.eraId)&&(!e.condition||e.condition()))");
  check("il disparaît une fois l'héritier désigné",
    !poolNamed.some(e => e.title === "La question de la succession"));

  // Toutes les branches de tous les événements doivent s'exécuter sans lancer
  const total = ev("events.length");
  let branches = 0, errors = [];
  for(let i = 0; i < total; i++){
    for(let j = 0; j < 6; j++){
      const s2 = freshGame();
      s2.money = 4000; s2.cattle = 80; s2.land = 400; s2.horses = 5; s2.weapons = 3;
      addAdult(s2, "Aîné", {age:35, resentment:80, ambition:70});
      addAdult(s2, "Cadet", {age:25, resentment:60, ambition:90});
      s2.factions.forEach(f => f.relation = 60);
      try{
        const applied = ev(`(function(){
          const e = events[${i}];
          if(e.condition && !e.condition()) return 0;
          let n = 0;
          e.choices.forEach(c => {
            if(c.condition && !c.condition()) return;
            c.apply(); n++;
          });
          return n;
        })()`);
        branches += applied;
      }catch(err){
        errors.push(ev("events["+i+"].title") + " : " + err.message);
      }
    }
  }
  check("toutes les branches d'événements s'appliquent sans erreur",
    errors.length === 0, errors.slice(0,3).join(" | "));
  check("des branches ont bien été exécutées", branches > 100, branches);
}

// ------------------------------------------------------------- Équilibrage
section("Équilibrage");
{
  // La reproduction ne doit jamais dépasser la capacité des pâturages :
  // les revenus sont plafonnés à `min(bétail, capacité)` mais l'entretien
  // porte sur toutes les bêtes — un troupeau qui s'emballe ruine le ranch.
  const s = freshGame();
  s.land = 300; s.money = 50000; s.feed = 100000; s.rival.relation = 0;
  s.cattle = 100;
  const capacity = Math.floor(s.land/3);
  for(let y = 0; y < 60; y++) G.endTurn();
  check("le troupeau se stabilise sous la capacité",
    ST().cattle <= Math.floor(capacity*1.05)+2, ST().cattle + " pour " + capacity + " places");
  check("le troupeau croît quand même jusqu'à la capacité",
    ST().cattle >= capacity*0.7, ST().cattle);
}
{
  // Un cheptel raisonnable pour ses terres ne doit plus mourir de faim.
  const s = freshGame();
  s.land = 300; s.cattle = 90; s.horses = 4; s.feed = 60;
  s.money = 100000; s.rival.relation = 0;
  const feedStart = s.feed;
  for(let y = 0; y < 40; y++) G.endTurn();
  check("le fourrage tient sur dix ans à cheptel adapté",
    ST().feed >= feedStart, ST().feed + " (départ " + feedStart + ")");

  // ... mais un cheptel démesuré pour ses terres doit manquer.
  const s2 = freshGame();
  s2.land = 120; s2.cattle = 200; s2.horses = 8; s2.feed = 80;
  s2.money = 100000; s2.rival.relation = 0;
  for(let y = 0; y < 40; y++) G.endTurn();
  check("un troupeau surdimensionné épuise les réserves", ST().feed < 80, ST().feed);
}
{
  // Les salaires sont stockés à l'échelle de l'époque : les remultiplier par
  // costModifier les ferait croître au carré et ruinerait toute fin de partie.
  const s = freshGame();
  s.cowboys = [{name:"Test",loyalty:80,shoot:60,ride:60,salary:12,years:0,trait:"Fidèle"}];
  s.cattle = 0; s.horses = 0; s.land = 0; s.money = 100000;
  s.feed = 10000; s.rival.relation = 0; s.children = [];
  s.factions.forEach(f => f.relation = 0);
  const realRandom = Math.random;
  Math.random = () => 0.5;
  let before = ST().money;
  G.endTurn();
  const costEra1 = before - ST().money;
  Math.random = realRandom;

  // Même situation, mais à une époque cinq fois plus chère
  const s2 = freshGame();
  s2.cowboys = [{name:"Test",loyalty:80,shoot:60,ride:60,salary:60,years:0,trait:"Fidèle"}];
  s2.cattle = 0; s2.horses = 0; s2.land = 0; s2.money = 100000;
  s2.feed = 10000; s2.rival.relation = 0; s2.children = [];
  s2.costModifier = 5;
  s2.factions.forEach(f => f.relation = 0);
  Math.random = () => 0.5;
  before = ST().money;
  G.endTurn();
  const costEra5 = before - ST().money;
  Math.random = realRandom;
  check("le salaire coûte son montant nominal, pas son carré",
    Math.abs(costEra5 - costEra1*5) <= 2, costEra1 + " puis " + costEra5 + " (attendu ~" + costEra1*5 + ")");
}
{
  // Les enfants doivent vieillir et mourir comme leurs parents, sinon ils
  // héritaient du ranch à plus de cent ans.
  const s = freshGame();
  const vieux = G.addChild("Doyen", {age:88, health:20, bond:50, ambition:50, resentment:0});
  let died = 0;
  for(let i = 0; i < 200; i++){
    const s2 = freshGame();
    const c = G.addChild("Doyen", {age:88, health:20});
    G.ageFamily();
    if(c.alive === false) died++;
  }
  check("un enfant très âgé et malade finit par mourir", died > 100, died + "/200");

  const jeune = freshGame();
  let diedYoung = 0;
  for(let i = 0; i < 200; i++){
    freshGame();
    const c = G.addChild("Jeune", {age:8, health:100});
    G.ageFamily();
    if(c.alive === false) diedYoung++;
  }
  check("un enfant jeune et sain ne meurt pas", diedYoung === 0, diedYoung + "/200");

  // La santé décline avec l'âge
  const s3 = freshGame();
  const c3 = G.addChild("Adulte", {age:70, health:100});
  for(let y = 0; y < 10; y++){ c3.alive = true; G.ageFamily(); }
  check("la santé d'un enfant âgé décline", c3.health < 100, c3.health);
}
{
  // La reprise ne doit pas échoir à un aîné trop vieux quand un cadet valide existe.
  const s = freshGame();
  G.addChild("Doyen", {age:82, health:90, ambition:50, resentment:0});
  G.addChild("Cadette", {age:34, health:100, ambition:50, resentment:0});
  s.founder.alive = false;
  G.resolveSuccession();
  check("l'aîné hors d'âge est écarté au profit d'un cadet",
    ST().founder.name === "Cadette", ST().founder.name + " (" + ST().founder.age + " ans)");

  // Mais s'il n'y a que des vieillards, la reprise a tout de même lieu.
  const s2 = freshGame();
  G.addChild("Doyen", {age:82, health:90, ambition:50, resentment:0});
  s2.founder.alive = false;
  G.resolveSuccession();
  check("faute de mieux, le doyen reprend quand même", ST().founder.name === "Doyen");
}
{
  // L'action d'achat de fourrage : le seul levier du joueur sur la ressource
  // qui tuait toutes les parties.
  const s = freshGame();
  s.money = 10000; s.feed = 10; s.actions = 3;
  G.doAction("buyFeed");
  check("acheter du fourrage remplit la grange", ST().feed === 50, ST().feed);
  check("acheter du fourrage consomme une action", ST().actions === 2, ST().actions);
  check("acheter du fourrage coûte de l'argent", ST().money < 10000);

  const s2 = freshGame();
  s2.money = 0; s2.feed = 10; s2.actions = 3;
  G.doAction("buyFeed");
  check("sans argent, aucun fourrage et aucune action perdue",
    ST().feed === 10 && ST().actions === 3, ST().feed + "/" + ST().actions);
}
{
  // Le mariage ne doit plus être un tirage unique : la lignée s'éteignait.
  let married = 0;
  for(let i = 0; i < 200; i++){
    freshGame();
    const c = G.addChild("Prétendant", {age:18, health:100});
    for(let y = 0; y < 20 && c.alive !== false; y++){ c.age = 18 + y; G.ageFamily(); }
    if(c.married) married++;
  }
  check("presque tous les enfants finissent par se marier", married > 180, married + "/200");
}

// ------------------------------------------------- Atteignabilité des objectifs
section("Atteignabilité des objectifs");
{
  // « Les mains propres » exige greed === 0 : chaque événement doit donc offrir
  // au moins une branche qui n'entache pas l'honneur de la famille.
  const total = ev("events.length");
  const forced = [];
  for(let i = 0; i < total; i++){
    let hasCleanBranch = false;
    const nb = ev("events["+i+"].choices.length");
    for(let j = 0; j < nb; j++){
      let cleanOnce = false;
      for(let k = 0; k < 8 && !cleanOnce; k++){
        const s = freshGame();
        s.money = 4000; s.cattle = 80; s.land = 400; s.horses = 5; s.weapons = 3;
        addAdult(s, "A", {resentment:80}); addAdult(s, "B", {resentment:70});
        s.factions.forEach(f => f.relation = 60);
        s.legacy.greed = 0;
        const applied = ev(`(function(){
          const e = events[${i}], c = e.choices[${j}];
          if(e.condition && !e.condition()) return null;
          if(c.condition && !c.condition()) return null;
          c.apply();
          return state.legacy.greed;
        })()`);
        if(applied === 0) cleanOnce = true;
      }
      if(cleanOnce) hasCleanBranch = true;
    }
    if(!hasCleanBranch) forced.push(ev("events["+i+"].title"));
  }
  check("chaque événement offre une issue sans compromission",
    forced.length === 0, forced.join(" | "));

  // Les chapitres du secret aussi
  const secretForced = [];
  ev("SECRET_TYPES").forEach(type => {
    [1,2,3].forEach(stage => {
      const nb = ev(`SECRETS["${type}"].stage${stage}.choices.length`);
      let clean = false;
      for(let j = 0; j < nb; j++){
        for(let k = 0; k < 6 && !clean; k++){
          const s = freshGame();
          s.money = 4000; s.land = 400; s.legacy.greed = 0;
          const g = ev(`(function(){
            const c = SECRETS["${type}"].stage${stage}.choices[${j}];
            if(c.condition && !c.condition()) return null;
            c.apply();
            return state.legacy.greed;
          })()`);
          if(g === 0) clean = true;
        }
      }
      if(!clean) secretForced.push(type + " ch." + stage);
    });
  });
  check("chaque chapitre du secret offre une issue sans compromission",
    secretForced.length === 0, secretForced.join(", "));
}

// ------------------------------------------------------- Partie longue durée
section("Partie menée jusqu'en 2026");
{
  // Le déficit passif de V1.3 tue toute partie vers 1892 ; on renfloue le ranch
  // à chaque trimestre pour exercer les 141 années, les 7 époques et les successions.
  let reached = 0, successions = 0, contested = 0, unlocked = new Set(), errors = [], endReasons = {};
  for(let run = 0; run < 30; run++){
    let seed = run * 104729 + 7;
    Math.random = function(){
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    try{
      G.startGame();
      let guard = 0;
      while(!ST().gameOver && guard++ < 800){
        const s = ST();
        s.money = Math.max(s.money, 30000 * s.costModifier);
        s.feed = Math.max(s.feed, 200);
        s.cattle = Math.max(s.cattle, 40);
        if(!G.heirChild()){
          const adults = G.adultHeirs();
          if(adults.length) G.designateHeir(adults[0].cid);
        }
        // Un joueur actif : il investit, concourt, s'allie et fraude.
        if(s.land < 900) G.doAction("buyLand");
        G.doAction("competition");
        if(Math.random() < .5) G.doAction("illegal");
        else G.doAction("family");
        s.factions.forEach((f,i) => { if(f.relation < 60) G.allyFaction(i); });
        if((s.cowboys||[]).length < 7 && Math.random() < .2) G.hireCowboy();
        s.suspicion = Math.min(s.suspicion, 60);
        G.endTurn();
        let modalGuard = 0;
        while(!$el("eventModal")._classes.has("hidden") && modalGuard++ < 30){
          if(ST().gameOver){ $el("eventModal").classList.add("hidden"); break; }
          const ch = $el("eventChoices").children;
          if(!ch.length) throw new Error("modale sans choix : " + $el("eventTitle").textContent);
          ch[Math.floor(Math.random()*ch.length)].onclick();
        }
        G.renderFamily(); G.renderGoals(); G.renderDiplomacy(); G.renderLineage(); G.renderCowboys();
      }
      if(ST().year >= 2026) reached++;
      else endReasons[$el("eventTitle").textContent] = (endReasons[$el("eventTitle").textContent]||0)+1;
      successions += ST().stats.plannedSuccessions;
      contested += ST().stats.contestedSuccessions;
      (ST().achievements||[]).forEach(a => unlocked.add(a.id));
    }catch(e){
      errors.push("partie " + run + " : " + e.message);
    }
  }
  if(Object.keys(endReasons).length) console.log("       fins prématurées : " + JSON.stringify(endReasons));
  check("aucune erreur sur 30 parties complètes", errors.length === 0, errors.slice(0,2).join(" | "));
  // ~27 % des parties atteignent 2026, taux identique à la V1.3 : la lignée
  // s'éteint souvent, indépendamment des nouveautés (voir le rapport).
  check("des parties atteignent 2026", reached >= 3, reached + "/30");
  check("des successions préparées ont lieu", successions > 0, successions);
  check("des successions sont contestées", contested > 0, contested);
  const all = ev("ACHIEVEMENTS").map(a=>a.id);
  const never = all.filter(id => !unlocked.has(id));
  console.log("       objectifs vus au moins une fois : " + unlocked.size + "/" + all.length);
  if(never.length) console.log("       jamais débloqués ici : " + never.join(", "));
  check("la quasi-totalité des objectifs sont atteignables", unlocked.size >= all.length - 2, unlocked.size + "/" + all.length);
}

console.log("\n" + pass + " vérifications passées, " + fail + " échec(s).");
process.exit(fail ? 1 : 0);
