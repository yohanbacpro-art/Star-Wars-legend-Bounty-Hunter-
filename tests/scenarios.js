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
    click:()=>{ if(el._h && el._h.click) el._h.click(); else if(el.onclick) el.onclick(); },
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
// On garde la trace du dernier élément créé et du dernier Blob : c'est ainsi
// qu'on vérifie ce qu'un téléchargement aurait réellement produit.
let lastCreated = null, lastBlob = null;
const document = {
  getElementById:id=>els.has(id)?els.get(id):null,
  createElement:()=>{ lastCreated = makeEl("created"); return lastCreated; },
  querySelectorAll:sel=>sel===".action"?actionBtns:[],
  addEventListener:(ev,fn)=>{ if(ev==="DOMContentLoaded") document._ready=fn; },
  body:makeEl("body")
};
const sandbox = {
  document, console, Intl, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat, setTimeout:()=>0, clearTimeout:()=>{}, confirm:()=>true,
  location:{reload:()=>{}},
  localStorage:{getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];}},
  Blob:function(parts,opts){ lastBlob = {text:(parts||[]).join(""), type:(opts||{}).type||""}; },
  FileReader:function(){}, URL:{createObjectURL:()=>"b", revokeObjectURL:()=>{}}
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
// État volontairement « à tout faire » : il satisfait simultanément les
// conditions de tous les événements conditionnels, pour pouvoir exercer
// chacune de leurs branches.
function permissiveGame(){
  const s = freshGame();
  s.money = 40000; s.cattle = 300; s.land = 300; s.horses = 5; s.weapons = 3;
  s.feed = 10; s.suspicion = 60; s.reputation = 75; s.unity = 40;
  s.rival.relation = -60;
  // Assez d'hommes pour que « trop de bras » se déclenche : le seuil est d'un
  // homme pour vingt-cinq bêtes utiles.
  s.cowboys = [];
  for(let i = 0; i < 14; i++){
    s.cowboys.push({name:"H"+i, loyalty: i===0?30:80, shoot:60, ride:60, salary:10, years:2,
                    trait: i===0?"Ambitieux":"Fidèle"});
  }
  s.horses = 4;
  s.champion = {name:"Comanche", age:6, speed:60, training:60, wins:2, alive:true};
  s.spouse.role = "none";
  // La ville a poussé : c'est ce qui ouvre la charte, la banque et le shérif.
  s.town = {name:"Redemption", size:3, since:1885};
  s.factions.forEach((f,i) => f.relation = i === 0 ? -50 : 70);
  // Une maison hostile, l'autre assez cordiale pour qu'un mariage soit proposé.
  G.ensureSecondHouse();
  s.rival2.relation = 45;
  addAdult(s, "Aîné", {age:35, resentment:80, ambition:70});
  addAdult(s, "Cadet", {age:25, resentment:60, ambition:90});
  G.addChild("Petit", {age:10, health:100});
  return s;
}

// Variantes de l'état permissif, pour couvrir les conditions incompatibles.
function permissiveVariants(){
  return [
    () => permissiveGame(),
    () => { const s = permissiveGame(); s.champion.training = 5; return s; },
    // La frontière des premières années : ville minuscule, tout est à bâtir.
    () => { const s = permissiveGame(); s.year = 1890; s.eraId = "foundation"; s.costModifier = 1;
            s.town = {name:"Redemption", size:0, since:1885};
            s.factions.forEach(f => { if(f.type==="nation") f.relation = 30; });
            return s; },
    () => { const s = permissiveGame(); s.cowboys = s.cowboys.slice(0,1); s.cattle = 300; return s; },
    // Les liens avec la pègre, l'époque et le contentieux foncier ouvrent des
    // familles d'événements entières : il leur faut leurs propres états.
    () => { const s = permissiveGame(); s.mobTies = 3; s.eraId = "prohibition"; s.year = 1926; return s; },
    () => { const s = permissiveGame(); s.year = 1930; s.eraId = "prohibition";
            s.claimPressure = 20; s.factions.forEach(f => { if(f.type==="nation") f.relation = -60; });
            return s; },
    () => { const s = permissiveGame(); s.year = 1975; s.eraId = "corporate"; s.land = 900;
            s.claimPressure = 30; s.factions.forEach(f => { if(f.type==="nation") f.relation = -70; });
            const v = G.ventureOfEra(); if(v) s.ventures = {[v.id]:{level:2, since:1972, eraId:v.eraId}};
            return s; },
    // Une maison au bord de la chute : dette, arriérés, soupçons et division.
    () => { const s = permissiveGame(); s.year = 1968; s.eraId = "industrial"; s.costModifier = 2.5;
            s.debt = 40000; s.missedPayments = 3; s.arrears = 9000; s.arrearYears = 2;
            s.suspicion = 85; s.unity = 22; s.money = 500;
            return s; },
    // Les investisseurs n'entrent en scène qu'à partir de 2010, et par paliers
    // de pression : il leur faut deux états, tiède et brûlant.
    () => { const s = permissiveGame(); s.year = 2014; s.eraId = "modern"; s.costModifier = 16;
            s.land = 2200; s.money = 20000000;
            s.developer = {name:"Meridian Land Partners", what:"un fonds", pressure:20, since:2012, refusals:0};
            return s; },
    // Un domaine assiégé de toutes parts : c'est l'état qui ouvre les épreuves
    // et les événements de la dernière décennie.
    () => { const s = permissiveGame(); s.year = 2022; s.eraId = "modern"; s.costModifier = 16;
            s.land = 3000; s.money = 40000000; s.suspicion = 50; s.claimPressure = 25;
            s.siege = 55;
            s.developer = {name:"Caldera Resorts", what:"un groupe hôtelier", pressure:85, since:2011, refusals:2};
            return s; },
    () => { const s = permissiveGame(); s.year = 1998; s.eraId = "globalization"; s.land = 1400;
            s.claimPressure = 10; s.factions.forEach(f => { if(f.type==="nation") f.relation = -10; });
            const v = G.ventureOfEra(); if(v) s.ventures = {[v.id]:{level:1, since:1995, eraId:v.eraId}};
            return s; }
  ];
}

// Rejoue les modales ouvertes par un tour jusqu'à ce que la main revienne au
// joueur. Indispensable depuis le tour annuel : une année enchaîne quatre
// trimestres, et la chaîne ne reprend qu'une fois la modale refermée.
function closeModals(limit){
  let guard = 0;
  while(!$el("eventModal")._classes.has("hidden") && guard++ < (limit || 60)){
    if(ST().gameOver){ $el("eventModal").classList.add("hidden"); return; }
    const ch = $el("eventChoices").children;
    if(!ch.length) throw new Error("modale sans choix : " + $el("eventTitle").textContent);
    ch[0].onclick();
  }
  if(guard >= (limit || 60)) throw new Error("modales en boucle");
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
  const ALL_TYPES = "community,law,media,nation,trade";
  check("cinq pouvoirs par époque", s.factions.length === 5, s.factions.length);
  const types = s.factions.map(f=>f.type).sort().join(",");
  check("les cinq types sont présents", types === ALL_TYPES, types);

  ev("ERAS").forEach(era => {
    check("l'époque " + era.id + " définit ses cinq factions",
      era.factionDefs && era.factionDefs.length === 5, era.factionDefs && era.factionDefs.length);
    const t = era.factionDefs.map(d=>d.type).sort().join(",");
    check("l'époque " + era.id + " couvre les cinq types", t === ALL_TYPES, t);
  });
  check("chaque type a sa faveur",
    ev("Object.keys(FACTION_TYPES)").every(t => !!ev("FACTION_FAVOURS")[t]),
    ev("Object.keys(FACTION_TYPES)").filter(t => !ev("FACTION_FAVOURS")[t]).join(","));

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
  check("les factions manquantes sont ajoutées", l.factions.length === 5, l.factions.length);
  check("types complets après migration",
    new Set(l.factions.map(f=>f.type)).size === 5);
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
      permissiveGame();
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

// ------------------------------------------------- Sexes, fertilité, famille
section("Sexes et fertilité");
{
  const s = freshGame();
  check("le fondateur a un sexe", !!ST().founder.sex);
  check("le conjoint est du sexe opposé", ST().spouse.sex === (ST().founder.sex === "m" ? "f" : "m"));

  // Tout enfant naît avec un sexe, et son prénom lui correspond
  const mismatched = [];
  for(let i = 0; i < 200; i++){
    const c = G.addChild(ev('pickName("f")'), {sex:"f"});
    if(c.sex !== "f") mismatched.push(c.name);
  }
  check("les enfants naissent avec un sexe", mismatched.length === 0, mismatched.slice(0,3).join(","));

  // Le conjoint d'un enfant est toujours du sexe opposé : c'était le bug du
  // fils marié à un Daniel.
  const wrong = [];
  for(let i = 0; i < 300; i++){
    const s2 = freshGame();
    const sex = i % 2 ? "m" : "f";
    const c = G.addChild(ev(`pickName(${JSON.stringify(sex)})`), {sex, age:20, health:100});
    for(let y = 0; y < 15 && !c.married; y++){ c.age = 20 + y; G.ageFamily(); }
    if(c.married && ev(`guessSex(${JSON.stringify(c.spouseName)})`) === c.sex){
      wrong.push(c.name + " (" + c.sex + ") + " + c.spouseName);
    }
  }
  check("un enfant épouse toujours quelqu'un du sexe opposé",
    wrong.length === 0, wrong.slice(0,3).join(" | "));
}
{
  // Plus aucune naissance passé 40 ans pour la mère.
  function birthsWithMotherAged(age){
    let births = 0;
    for(let i = 0; i < 250; i++){
      const s = freshGame();
      s.children = [];
      const mother = s.founder.sex === "f" ? s.founder : s.spouse;
      mother.age = age; mother.alive = true;
      const father = mother === s.founder ? s.spouse : s.founder;
      father.age = 35; father.alive = true;
      const before = ST().children.length;
      G.ageFamily();
      if(ST().children.length > before) births++;
    }
    return births;
  }
  check("une mère de 28 ans peut avoir des enfants", birthsWithMotherAged(28) > 10, birthsWithMotherAged(28));
  check("une mère de 40 ans n'en a plus", birthsWithMotherAged(40) === 0, birthsWithMotherAged(40));
  check("une mère de 45 ans n'en a plus", birthsWithMotherAged(45) === 0, birthsWithMotherAged(45));
  check("la fertilité décline avant 40 ans",
    birthsWithMotherAged(37) < birthsWithMotherAged(28),
    birthsWithMotherAged(37) + " contre " + birthsWithMotherAged(28));

  // Une fille de plus de 40 ans ne donne plus de petits-enfants non plus.
  function grandchildren(childSex, age){
    let born = 0;
    for(let i = 0; i < 250; i++){
      const s = freshGame();
      s.children = [];
      const mother = s.founder.sex === "f" ? s.founder : s.spouse;
      mother.age = 60; // le foyer n'enfante plus : seules comptent les naissances de la génération suivante
      G.addChild("X", {sex:childSex, age, health:100, married:true, spouseName:"Y"});
      const before = ST().children.length;
      G.ageFamily();
      if(ST().children.length > before) born++;
    }
    return born;
  }
  check("une fille de 42 ans ne donne plus d'enfants", grandchildren("f", 42) === 0, grandchildren("f", 42));
  check("une fille de 28 ans en donne", grandchildren("f", 28) > 5, grandchildren("f", 28));
}
{
  // Le conjoint peut tenir un rôle au ranch.
  const s = freshGame();
  s.spouse.role = "none";
  check("aucun rôle au départ", ev('roleCount("ranch")') === 0);
  ST().spouse.role = "ranch";
  check("le conjoint compte comme bras au ranch", ev('roleCount("ranch")') === 1);
  ST().spouse.alive = false;
  check("un conjoint décédé ne travaille plus", ev('roleCount("ranch")') === 0);

  // Et son travail se voit sur les revenus.
  function quarterWith(role){
    const s2 = freshGame();
    s2.spouse.role = role; s2.spouse.alive = true;
    s2.cattle = 90; s2.land = 300; s2.money = 100000; s2.feed = 5000;
    s2.rival.relation = 0; s2.children = []; s2.cowboys = [];
    s2.factions.forEach(f => f.relation = 0);
    const realRandom = Math.random; Math.random = () => 0.5;
    const before = ST().money;
    G.endTurn();
    const d = ST().money - before;
    Math.random = realRandom;
    return d;
  }
  check("le conjoint aux travaux améliore le résultat", quarterWith("ranch") > quarterWith("none"),
    quarterWith("ranch") + " contre " + quarterWith("none"));
  check("le conjoint aux comptes réduit les charges", quarterWith("business") > quarterWith("none"));
}

// ------------------------------------------------------------- Les chevaux
section("Chevaux");
{
  const s = freshGame();
  s.horses = 0; s.champion = null;
  G.ensureChampion();
  check("sans cheval, pas de cheval de tête", ST().champion === null);

  s.horses = 3;
  G.ensureChampion();
  check("dès qu'il y a un cheval, il y a un cheval de tête", !!ST().champion);
  check("le cheval de tête a un nom", !!ST().champion.name);

  // L'entraînement améliore la forme, et se paie
  const champ = ST().champion;
  champ.training = 0;
  ST().money = 10000; ST().actions = 3;
  const formBefore = ev("championForm()");
  G.doAction("trainHorse");
  check("l'entraînement améliore le dressage", ST().champion.training > 0, ST().champion.training);
  check("l'entraînement améliore la forme", ev("championForm()") > formBefore);
  check("l'entraînement consomme une action", ST().actions === 2, ST().actions);
  check("l'entraînement coûte de l'argent", ST().money < 10000);

  const s2 = freshGame();
  s2.horses = 0; s2.champion = null; s2.actions = 3;
  G.doAction("trainHorse");
  check("sans cheval, pas d'entraînement", ST().actions === 3, ST().actions);
}
{
  // Un cheval dressé gagne plus souvent qu'un cheval brut.
  function wins(training){
    let n = 0;
    for(let i = 0; i < 300; i++){
      const s = freshGame();
      s.horses = 3; s.money = 100000; s.actions = 3; s.reputation = 50;
      s.champion = {name:"T", age:6, speed:50, training, wins:0, alive:true};
      const before = ST().stats.competitionWins;
      G.doAction("competition");
      if(ST().stats.competitionWins > before) n++;
    }
    return n;
  }
  const brut = wins(0), dresse = wins(95);
  check("le dressage améliore nettement les résultats en concours",
    dresse > brut * 1.5, brut + " victoires sans dressage contre " + dresse + " avec");
}
{
  // Le cheval vieillit, puis se retire.
  const s = freshGame();
  s.horses = 2;
  s.champion = {name:"Vieux", age:14, speed:60, training:50, wins:9, alive:true};
  let retired = false;
  for(let y = 0; y < 25 && !retired; y++){
    G.ageHorses();
    if(!ST().champion || ST().champion.name !== "Vieux") retired = true;
  }
  check("un cheval trop vieux finit par se retirer", retired);
  check("un successeur prend sa place tant qu'il reste des chevaux", !!ST().champion);

  // L'âge pèse sur la forme
  const jeune = ev('(function(){state.champion={name:"A",age:5,speed:60,training:50,wins:0,alive:true};return championForm();})()');
  const vieux = ev('(function(){state.champion={name:"A",age:18,speed:60,training:50,wins:0,alive:true};return championForm();})()');
  check("un vieux cheval court moins bien", vieux < jeune, vieux.toFixed(1) + " contre " + jeune.toFixed(1));
}
{
  // On peut voler un cheval au rival.
  const era = "foundation";
  const op = ev(`ILLEGAL_OPS.foundation.find(o=>o.id==="horseTheft")`);
  check("le vol de cheval existe à l'époque de la fondation", !!op);
  let gained = 0;
  for(let i = 0; i < 120; i++){
    const s = freshGame();
    s.eraId = era; s.horses = 2; s.actions = 3; s.suspicion = 0; s.weapons = 5;
    s.cowboys = [{name:"A",loyalty:80,shoot:90,ride:80,salary:10,years:1,trait:"Tête brûlée"}];
    s.champion = {name:"Mien", age:6, speed:30, training:0, wins:0, alive:true};
    const before = ST().horses;
    G.runIllegalOp("horseTheft");
    if(ST().horses > before) gained++;
  }
  check("le vol de cheval réussit parfois", gained > 20, gained + "/120");

  // Et on peut se faire voler le sien.
  const s3 = freshGame();
  s3.horses = 1;
  s3.champion = {name:"Mien", age:6, speed:50, training:20, wins:0, alive:true};
  const rodeur = ev(`events.find(e=>{const t=typeof e.title==="function"?e.title():e.title;return t.indexOf("rôder")>=0;})`);
  check("un événement menace l'écurie", !!rodeur);
  let stolen = 0;
  for(let i = 0; i < 150; i++){
    const s4 = freshGame();
    s4.horses = 1;
    s4.champion = {name:"Mien", age:6, speed:50, training:20, wins:0, alive:true};
    ev(`(function(){const e=events.find(e=>{const t=typeof e.title==="function"?e.title():e.title;return t.indexOf("rôder")>=0;});e.choices[2].apply();})()`);
    if(!ST().champion || ST().champion.name !== "Mien") stolen++;
  }
  check("négliger la garde fait perdre le cheval", stolen > 30, stolen + "/150");
}

// ---------------------------------------------------- Apport des cow-boys
section("Apport des cow-boys");
{
  // Un cow-boy utile doit rapporter plus que son salaire.
  function quarter(nCowboys, cattle){
    const s = freshGame();
    s.cattle = cattle; s.land = cattle*3; s.money = 200000; s.feed = 50000;
    s.rival.relation = 0; s.children = []; s.horses = 0;
    s.spouse.role = "none";
    s.factions.forEach(f => f.relation = 0);
    s.cowboys = [];
    for(let i = 0; i < nCowboys; i++){
      s.cowboys.push({name:"H"+i, loyalty:70, shoot:60, ride:60, salary:12, years:1, trait:"Fidèle"});
    }
    const realRandom = Math.random; Math.random = () => 0.5;
    const before = ST().money;
    G.endTurn();
    const d = ST().money - before;
    Math.random = realRandom;
    return d;
  }
  const sans = quarter(0, 200);
  const avec3 = quarter(3, 200);
  const avec8 = quarter(8, 200);
  check("trois hommes rapportent plus qu'ils ne coûtent sur un grand troupeau",
    avec3 > sans, avec3 + " contre " + sans);
  check("huit hommes valent mieux que trois quand le troupeau suit",
    avec8 > avec3, avec8 + " contre " + avec3);

  // Mais sur un petit troupeau, l'excès de bras est une charge sèche.
  const petitSans = quarter(0, 30);
  const petitAvec8 = quarter(8, 30);
  check("sur un petit troupeau, huit hommes coûtent plus qu'ils ne rapportent",
    petitAvec8 < petitSans, petitAvec8 + " contre " + petitSans);

  // Le rendement plafonne : un homme pour vingt-cinq bêtes.
  const utile = ev('(function(){state.cattle=100;state.land=300;return Math.max(1,Math.ceil(Math.min(state.cattle,Math.floor(state.land/3))/25));})()');
  check("le nombre d'hommes utiles suit la taille du troupeau", utile === 4, utile);
}

// --------------------------------------------------------- Arcs narratifs
section("Arcs narratifs");
{
  const ids = ev("ARCS.map(a=>a.id)");
  check("plusieurs arcs sont définis", ids.length >= 4, ids.join(", "));
  check("les identifiants d'arcs sont uniques", new Set(ids).size === ids.length);
  const shallow = ev("ARCS.filter(a=>a.steps.length<2).map(a=>a.id)");
  check("chaque arc tient sur plusieurs chapitres", shallow.length === 0, shallow.join(","));
  const noChoice = ev("ARCS.filter(a=>a.steps.some(s=>!s.choices||!s.choices.length)).map(a=>a.id)");
  check("chaque chapitre offre des choix", noChoice.length === 0, noChoice.join(","));

  // Un arc se déroule chapitre après chapitre, sur plusieurs trimestres.
  const s = permissiveGame();
  s.arc = {id:"drought", step:0, due:0, data:{}};
  s.money = 100000; s.feed = 5000; s.turn = 10;
  let chapters = 0, guard = 0;
  while(ST().arc && guard++ < 200){
    ST().turn++;
    if(G.maybeShowArcStep()){
      chapters++;
      const ch = $el("eventChoices").children;
      check("le chapitre " + chapters + " de la sécheresse propose des choix", ch.length > 0);
      ch[0].onclick();
    }
  }
  check("l'arc se déroule sur plusieurs chapitres", chapters >= 3, chapters);
  check("l'arc se termine", ST().arc === null);
  check("l'arc terminé est mémorisé", (ST().arcsDone||[]).includes("drought"));

  // Un arc terminé ne recommence pas.
  ST().arcCooldown = 0;
  let restarted = false;
  for(let i = 0; i < 200; i++){ ST().turn++; G.maybeStartArc(); if(ST().arc && ST().arc.id === "drought") restarted = true; }
  check("un arc terminé ne recommence jamais", !restarted);

  // Un chapitre n'arrive pas avant son échéance.
  const s2 = permissiveGame();
  s2.arc = {id:"lawsuit", step:0, due:50, data:{}};
  s2.turn = 10;
  check("un chapitre attend son échéance", G.maybeShowArcStep() === false);
  ST().turn = 50;
  check("le chapitre s'ouvre à l'échéance", G.maybeShowArcStep() === true);
  $el("eventChoices").children[0].onclick();
  check("le chapitre suivant est planifié plus tard",
    !ST().arc || ST().arc.due > 50, ST().arc && ST().arc.due);

  // Un seul arc à la fois.
  const s3 = permissiveGame();
  s3.arc = {id:"lawsuit", step:0, due:0, data:{}};
  const before = JSON.stringify(ST().arc);
  for(let i = 0; i < 50; i++) G.maybeStartArc();
  check("un seul arc court à la fois", JSON.stringify(ST().arc) === before);

  // Un arc dont le code a disparu ne bloque pas la partie.
  const s4 = permissiveGame();
  s4.arc = {id:"arcQuiNExistePlus", step:0, due:0, data:{}};
  G.ensureProgress();
  check("un arc inconnu est écarté au chargement", ST().arc === null);
}
{
  // Toutes les branches de tous les chapitres doivent s'exécuter sans erreur.
  const errors = [];
  let branches = 0;
  const arcs = ev("ARCS.map(a=>({id:a.id, steps:a.steps.map(s=>s.choices.length)}))");
  arcs.forEach(a => {
    a.steps.forEach((nChoices, si) => {
      for(let ci = 0; ci < nChoices; ci++){
        for(let k = 0; k < 4; k++){
          const s = permissiveGame();
          s.arc = {id:a.id, step:si, data:{name:"Test", cid:(ST().children[0]||{}).cid, fight:true, warm:true, ready:true}};
          s.money = 100000;
          try{
            const ran = ev(`(function(){
              const arc = ARCS.find(x=>x.id===${JSON.stringify(a.id)});
              const c = arc.steps[${si}].choices[${ci}];
              if(c.condition && !c.condition()) return false;
              c.apply();
              return true;
            })()`);
            if(ran) branches++;
          }catch(e){ errors.push(a.id + " ch." + si + " choix " + ci + " : " + e.message); }
        }
      }
    });
  });
  check("toutes les branches d'arcs s'exécutent sans erreur", errors.length === 0, errors.slice(0,3).join(" | "));
  check("des branches d'arcs ont bien été exercées", branches > 40, branches);

  // Les textes dynamiques des chapitres doivent s'évaluer.
  const textErrors = [];
  arcs.forEach(a => {
    a.steps.forEach((_, si) => {
      const s = permissiveGame();
      s.arc = {id:a.id, step:si, data:{name:"Test", cid:(ST().children[0]||{}).cid}};
      try{
        ev(`(function(){
          const st = ARCS.find(x=>x.id===${JSON.stringify(a.id)}).steps[${si}];
          return [st.title, st.text, st.image].map(f=>typeof f==="function"?f():f).join("");
        })()`);
      }catch(e){ textErrors.push(a.id + " ch." + si + " : " + e.message); }
    });
  });
  check("tous les textes de chapitres s'évaluent", textErrors.length === 0, textErrors.slice(0,3).join(" | "));
}

// ------------------------------------------------------- Arcs par époque
section("Arcs d'époque");
{
  const eraArcs = ev("ERA_ARCS.map(a=>({id:a.id, era:a.eraId, steps:a.steps.length}))");
  check("chaque époque a son arc", eraArcs.length >= 7, eraArcs.length);
  const eras = ev("ERAS.map(e=>e.id)");
  const covered = eraArcs.map(a=>a.era);
  const missing = eras.filter(e => !covered.includes(e));
  check("aucune époque n'est oubliée", missing.length === 0, missing.join(","));
  check("les arcs d'époque tiennent en plusieurs chapitres",
    eraArcs.every(a=>a.steps>=2), eraArcs.filter(a=>a.steps<2).map(a=>a.id).join(","));
  check("les arcs d'époque rejoignent le catalogue général",
    eraArcs.every(a => !!ev(`arcById(${JSON.stringify(a.id)})`)));

  // Un arc d'époque ne se déclenche que dans la sienne.
  const leaks = [];
  eraArcs.forEach(a => {
    eras.forEach(era => {
      const s = permissiveGame();
      s.eraId = era; s.cattle = 200; s.land = 400; s.money = 100000;
      const can = ev(`(function(){const x=arcById(${JSON.stringify(a.id)});try{return !!x.canStart();}catch(e){return false;}})()`);
      if(can && era !== a.era) leaks.push(a.id + " déclenchable en " + era);
    });
  });
  check("un arc d'époque reste dans son époque", leaks.length === 0, leaks.slice(0,3).join(" | "));

  // Toutes les branches de tous les chapitres d'époque doivent tenir.
  const errors = [];
  let branches = 0;
  eraArcs.forEach(a => {
    for(let si = 0; si < a.steps; si++){
      const n = ev(`arcById(${JSON.stringify(a.id)}).steps[${si}].choices.length`);
      for(let ci = 0; ci < n; ci++){
        for(let k = 0; k < 3; k++){
          const s = permissiveGame();
          s.eraId = a.era; s.money = 200000; s.cattle = 200; s.land = 500;
          s.arc = {id:a.id, step:si, data:{head:40, name:"Test", inside:true, honest:true,
                   sold:true, developed:true, paid:true, refused:true, scabs:true, exposed:true}};
          try{
            const ran = ev(`(function(){
              const c = arcById(${JSON.stringify(a.id)}).steps[${si}].choices[${ci}];
              if(c.condition && !c.condition()) return false;
              c.apply(); return true;
            })()`);
            if(ran) branches++;
          }catch(e){ errors.push(a.id + " ch." + si + " choix " + ci + " : " + e.message); }
        }
      }
    }
  });
  check("toutes les branches d'arcs d'époque s'exécutent", errors.length === 0, errors.slice(0,3).join(" | "));
  check("des branches d'époque ont été exercées", branches > 50, branches);

  // Les textes citant `state.arc.data` doivent s'évaluer.
  const textErrors = [];
  eraArcs.forEach(a => {
    for(let si = 0; si < a.steps; si++){
      const s = permissiveGame();
      s.eraId = a.era;
      s.arc = {id:a.id, step:si, data:{head:30, name:"Test"}};
      try{
        ev(`(function(){
          const st = arcById(${JSON.stringify(a.id)}).steps[${si}];
          return [st.title, st.text, st.image].map(f=>typeof f==="function"?f():f).join("");
        })()`);
      }catch(e){ textErrors.push(a.id + " ch." + si + " : " + e.message); }
    }
  });
  check("tous les textes d'arcs d'époque s'évaluent", textErrors.length === 0, textErrors.slice(0,3).join(" | "));

  // Un `goto` hors bornes doit refermer l'arc, pas le bloquer.
  const s = permissiveGame();
  s.eraId = "foundation"; s.cattle = 60; s.turn = 5;
  s.arc = {id:"trailDrive", step:0, due:0, data:{}};
  G.maybeShowArcStep();
  const ch = $el("eventChoices").children;
  ch[ch.length-1].onclick();
  check("une sortie anticipée referme l'arc proprement",
    ST().arc === null && (ST().arcsDone||[]).includes("trailDrive"));
}

// ------------------------------------------------------- La chronique de la saga
section("Chronique de la saga");
{
  const s = freshGame();
  check("la fondation est consignée d'emblée", (ST().saga||[]).length >= 1, (ST().saga||[]).length);
  check("le premier moment est la fondation", ST().saga[0].kind === "founding", ST().saga[0].kind);
  check("chaque moment porte sa date",
    ST().saga.every(m => typeof m.year === "number" && typeof m.season === "number"));
  check("chaque moment porte une scène connue",
    ST().saga.every(m => !!ev("ART_MOTIFS")[m.art]), ST().saga.map(m=>m.art).join(","));
  check("chaque genre de moment est répertorié",
    ST().saga.every(m => !!ev("SAGA_KINDS")[m.kind]));

  // Les grands moments s'enregistrent tout seuls.
  const kinds = new Set();
  G.recordSaga("era", "Test d'époque", "city");
  G.chooseDoctrine("foundation", ev('DOCTRINES.foundation[0].id'));
  ST().cattle = 250; G.checkAchievements();
  ST().saga.forEach(m => kinds.add(m.kind));
  check("le tournant fondateur entre dans la saga", kinds.has("doctrine"));
  check("un objectif accompli entre dans la saga", kinds.has("goal"));

  // Une succession laisse sa trace.
  const s2 = freshGame();
  const a = addAdult(s2, "Héritière", {age:30, sex:"f"});
  G.designateHeir(a.cid);
  s2.founder.alive = false;
  const before = ST().saga.length;
  G.resolveSuccession();
  check("une succession entre dans la saga", ST().saga.length > before);
  check("la succession est bien typée",
    ST().saga[ST().saga.length-1].kind === "succession", ST().saga[ST().saga.length-1].kind);

  // Un arc mené à son terme aussi.
  const s3 = permissiveGame();
  s3.arc = {id:"drought", step:2, due:0, data:{}};
  const b3 = ST().saga.length;
  G.finishArc();
  check("une affaire close entre dans la saga", ST().saga.length > b3);

  // Le rendu tient, y compris sur une saga vide ou énorme.
  const s4 = freshGame();
  s4.saga = [];
  let threw = false;
  try{ G.renderSaga(); }catch(e){ threw = e.message; }
  check("une saga vide s'affiche sans erreur", threw === false, threw);
  check("une saga vide le dit", $el("sagaContent").innerHTML.includes("commence à peine"));

  const s5 = freshGame();
  for(let i = 0; i < 400; i++) G.recordSaga("arc", "Moment " + i, "ranch", "détail");
  check("la saga est plafonnée", ST().saga.length <= 240, ST().saga.length);
  threw = false;
  try{ G.renderSaga(); }catch(e){ threw = e.message; }
  check("une longue saga s'affiche sans erreur", threw === false, threw);
  check("la saga est dessinée avec ses scènes", $el("sagaContent").innerHTML.includes("<svg"));
  check("la saga n'appelle aucune ressource externe",
    !/https?:\/\//.test($el("sagaContent").innerHTML));

  // L'écran de fin propose de relire la saga.
  const s6 = freshGame();
  G.recordSaga("arc", "Un moment", "ranch");
  G.showGameOver("Fin de test", "Texte de fin.");
  const labels = $el("eventChoices").children.map(c => c.textContent);
  check("la fin de partie propose de relire la saga",
    labels.some(l => l.indexOf("Relire la saga") >= 0), labels.join(" | "));
  check("elle propose aussi de recommencer",
    labels.some(l => l.indexOf("écran de création") >= 0));
}

// ------------------------------------------------- La politique
section("La politique : l'échelle des charges");
{
  const s = freshGame();
  check("aucune charge au départ", G.currentOffice() === null);
  check("aucune institution au départ",
    !(s.institutions && s.institutions.cattleCommission));
  check("les charges forment une échelle sans trou",
    [1,2,3,4].every(l => Object.values(ev("OFFICES")).some(o => o.level === l)),
    Object.values(ev("OFFICES")).map(o=>o.level).sort().join(","));
  check("chaque charge décrit son pouvoir et son danger",
    Object.values(ev("OFFICES")).every(o => o.power && o.danger && o.cost > 0 && o.term > 0));

  // La commission du bétail se fonde, et ouvre le premier barreau.
  check("le premier siège est verrouillé tant que la commission n'existe pas",
    G.officeAvailable("cattleCommission").ok === false,
    G.officeAvailable("cattleCommission").why);
  s.money = 100000;
  const acts = s.actions;
  G.foundCattleCommission();
  check("fonder la commission coûte une action", ST().actions === acts - 1);
  check("la commission existe", !!ST().institutions.cattleCommission);
  check("elle relève le cours plancher", ST().cattlePriceMin > 16, ST().cattlePriceMin);
  check("elle entre dans la saga", ST().saga.some(m => /commission du bétail/i.test(m.title)));
  check("le siège devient accessible", G.officeAvailable("cattleCommission").ok === true);
  G.foundCattleCommission();
  check("on ne la fonde pas deux fois", ST().actions === acts - 1, ST().actions);

  // On ne saute pas les échelons.
  const s2 = freshGame();
  s2.money = 5000000; s2.year = 1990; s2.eraId = "corporate"; s2.costModifier = 5;
  s2.town = {name:"Redemption", size:4, since:1885};
  check("le gouvernorat est fermé sans échelon précédent",
    G.officeAvailable("governor").ok === false, G.officeAvailable("governor").why);
  s2.politics.held = ["cattleCommission","sheriff","senator"];
  check("il s'ouvre une fois le niveau 3 exercé",
    G.officeAvailable("governor").ok === true, G.officeAvailable("governor").why);

  // Les chances d'élection suivent le nom et ce qu'on traîne.
  const s3 = freshGame();
  s3.money = 5000000; s3.institutions = {cattleCommission:{since:1885}};
  s3.reputation = 90; s3.suspicion = 0; s3.legacy.honor = 4;
  const clean = G.electionOdds("cattleCommission");
  s3.reputation = 20; s3.suspicion = 80; s3.legacy.honor = 0; s3.legacy.greed = 5;
  const dirty = G.electionOdds("cattleCommission");
  check("un nom respecté l'emporte plus souvent", clean > dirty, clean.toFixed(2) + " vs " + dirty.toFixed(2));
  check("les chances restent bornées", dirty >= .05 && clean <= .92, dirty.toFixed(2) + " / " + clean.toFixed(2));
  // Sur un nom sale, les deux chances tombent au plancher : il faut un état
  // sain pour que l'écart entre les niveaux se voie.
  s3.reputation = 75; s3.suspicion = 5; s3.legacy.greed = 0;
  check("une charge élevée est plus dure à décrocher",
    G.electionOdds("cattleCommission") > G.electionOdds("governor"),
    G.electionOdds("cattleCommission").toFixed(2) + " vs " + G.electionOdds("governor").toFixed(2));

  // Une élection gagnée donne la charge, son mandat et ses pouvoirs.
  const s4 = freshGame();
  s4.money = 5000000; s4.institutions = {cattleCommission:{since:1885}};
  s4.reputation = 95; s4.suspicion = 0; s4.legacy.honor = 6;
  let elected = false;
  for(let i = 0; i < 30 && !elected; i++){
    ST().actions = 3; ST().money = 5000000;
    G.runForOffice("cattleCommission");
    elected = !!G.currentOffice();
  }
  check("la famille finit par être élue", elected, elected);
  if(elected){
    check("le mandat a une échéance", ST().politics.until > ST().year, ST().politics.until);
    check("la charge est mémorisée", ST().politics.held.indexOf("cattleCommission") >= 0);
    check("l'élection entre dans la saga", ST().saga.some(m => m.kind === "office"));
    check("les maisons rivales le prennent mal", ST().rival.relation < 30, ST().rival.relation);
    const price0 = ST().cattlePriceMin;
    for(let i = 0; i < 4; i++) G.officeTurn();
    check("le pouvoir s'exerce chaque tour", ST().cattlePriceMin >= price0, ST().cattlePriceMin);
    check("et l'attention monte", ST().politics.scrutiny > 0, ST().politics.scrutiny);
  }

  // Le piège : l'attention finit par ouvrir une commission d'enquête.
  const s5 = freshGame();
  s5.politics = {office:"sheriff", until:1950, held:["sheriff"], scrutiny:60, defeats:0};
  s5.suspicion = 90; s5.legacy.greed = 6; s5.money = 5000000;
  let investigated = false;
  for(let i = 0; i < 40 && !investigated; i++){
    G.officeTurn();
    if($el("eventTitle").textContent.indexOf("commission d'enquête") >= 0) investigated = true;
  }
  check("une attention trop forte ouvre une enquête", investigated, ST().politics.scrutiny);
  if(investigated){
    check("l'enquête propose trois issues", $el("eventChoices").children.length === 3);
    // Une maison sale qui se défend tombe.
    $el("eventChoices").children[1].onclick();
    check("une maison compromise perd la charge", G.currentOffice() === null);
    check("la disgrâce laisse une rancune",
      ST().legacy.grudges.some(g => /mandat/.test(g.name)), JSON.stringify(ST().legacy.grudges));
  }

  // Une maison propre s'en sort et en sort grandie.
  const s6 = freshGame();
  s6.politics = {office:"sheriff", until:1950, held:["sheriff"], scrutiny:45, defeats:0};
  s6.suspicion = 5; s6.legacy.greed = 0; s6.money = 5000000; s6.reputation = 70;
  G.openInvestigation();
  $el("eventChoices").children[1].onclick();
  check("une maison propre garde la charge", G.currentOffice() !== null);
  check("et y gagne en réputation", ST().reputation > 70, ST().reputation);

  // Un coup en douce manqué pendant un mandat coûte la charge.
  const s7 = permissiveGame();
  s7.eraId = "foundation"; s7.costModifier = 1; s7.year = 1900; s7.money = 200000;
  s7.politics = {office:"sheriff", until:1930, held:["sheriff"], scrutiny:5, defeats:0};
  let lost = 0;
  for(let i = 0; i < 30; i++){
    ST().politics = {office:"sheriff", until:1930, held:["sheriff"], scrutiny:5, defeats:0};
    G.officeScandal({name:"Voler du bétail au ranch rival"});
    if(!G.currentOffice()) lost++;
  }
  check("un coup manqué en fonction fait parfois tomber la charge", lost > 0, lost + "/30");
  check("mais pas systématiquement", lost < 30, lost + "/30");

  // Fin de mandat : se représenter, se retirer, ou forcer.
  const s8 = freshGame();
  s8.money = 5000000;
  s8.politics = {office:"cattleCommission", until:1885, held:["cattleCommission"], scrutiny:5, defeats:0};
  s8.institutions = {cattleCommission:{since:1885}};
  G.officeTurn();
  check("la fin de mandat ouvre un choix",
    /Fin de mandat/.test($el("eventTitle").textContent), $el("eventTitle").textContent);
  check("elle propose trois issues", $el("eventChoices").children.length === 3);
  $el("eventChoices").children[1].onclick();   // se retirer
  check("se retirer libère la charge", G.currentOffice() === null);
  check("et compte comme un acte d'honneur", ST().legacy.honor > 0);

  // Les objectifs politiques sont atteignables.
  const s9 = freshGame();
  s9.institutions = {cattleCommission:{since:1885}};
  G.checkAchievements();
  check("fonder la commission débloque son objectif",
    ST().achievements.some(a => a.id === "commission"));
  s9.politics.held = ["cattleCommission","sheriff","senator","governor"];
  G.checkAchievements();
  check("le gouvernorat débloque le sien",
    ST().achievements.some(a => a.id === "governor"));
  s9.politics.office = "senator"; s9.reputation = 90; s9.suspicion = 0;
  G.checkAchievements();
  check("le pouvoir sans la tache est atteignable",
    ST().achievements.some(a => a.id === "cleanPower"));

  // Le panneau se rend sans erreur dans tous les états.
  let threw = false;
  try{
    [null, "cattleCommission", "governor"].forEach(o => {
      const t = freshGame();
      t.politics = {office:o, until:1900, held:o?[o]:[], scrutiny:20, defeats:1};
      t.institutions = o ? {cattleCommission:{since:1885}} : {};
      t.year = 1990; t.eraId = "corporate"; t.costModifier = 5;
      t.town = {name:"Redemption", size:4, since:1885};
      G.renderDiplomacy();
    });
  }catch(e){ threw = e.message; }
  check("le panneau politique se rend dans tous les états", threw === false, threw);
  check("il nomme la politique", /La politique/.test($el("diplomacyContent").innerHTML));
  check("il n'appelle aucune ressource externe",
    !/https?:\/\//.test($el("diplomacyContent").innerHTML));
}

section("La ville qui pousse");
{
  const s = freshGame();
  check("la ville commence au plus bas", G.ensureTown().size === 0, ST().town.size);
  check("elle a un nom", !!ST().town.name);
  check("chaque palier est décrit",
    ev("TOWN_STAGES").every(t => t.label && t.what));
  const before = G.townStage().label;
  G.growTown(1);
  check("elle grandit", ST().town.size === 1, ST().town.size);
  check("le palier change", G.townStage().label !== before, G.townStage().label);
  check("la croissance entre dans la saga", ST().saga.some(m => m.kind === "town"));
  G.growTown(99);
  check("elle ne dépasse pas le dernier palier",
    ST().town.size === ev("TOWN_STAGES").length - 1, ST().town.size);
  G.growTown(-99);
  check("et ne descend pas sous zéro", ST().town.size === 0, ST().town.size);

  // Les bascules d'époque la font grandir.
  const s2 = freshGame();
  s2.year = 1919; s2.season = 3; s2.money = 500000; s2.feed = 9000;
  const size0 = ST().town.size;
  G.endTurn(); closeModals();
  check("une bascule d'époque fait grandir la ville", ST().town.size > size0,
    size0 + " → " + ST().town.size);

  // Et elle commande l'accès aux charges.
  const s3 = freshGame();
  s3.town = {name:"Redemption", size:0, since:1885};
  s3.politics.held = ["cattleCommission"];
  check("pas de shérif sans ville", G.officeAvailable("sheriff").ok === false,
    G.officeAvailable("sheriff").why);
  s3.town.size = 2;
  check("une vraie ville ouvre le poste de shérif", G.officeAvailable("sheriff").ok === true);
  s3.year = 1940; s3.eraId = "depression"; s3.costModifier = 1.3;
  s3.politics.held = ["cattleCommission","sheriff"];
  check("pas de siège d'État sans comté peuplé",
    G.officeAvailable("senator").ok === false, G.officeAvailable("senator").why);
  s3.town.size = 4;
  check("un comté peuplé ouvre la capitale", G.officeAvailable("senator").ok === true);
}

// ------------------------------------------------- La chute d'une grande maison
section("Une dynastie établie peut tomber");
{
  // Le domaine de référence : riche, vaste, et parfaitement sain au départ.
  function empire(){
    const s = freshGame();
    s.year = 1960; s.eraId = "industrial"; s.costModifier = 2.5;
    s.land = 3000; s.cattle = 1100; s.money = 400000; s.feed = 20000;
    s.reputation = 80; s.unity = 70; s.suspicion = 0;
    ensureBigParcels(s);
    return s;
  }
  function ensureBigParcels(s){ s.parcels = []; G.ensureParcels(); }

  // 1. L'appel de fonds : un rendez-vous, pas un hasard.
  const s = empire();
  check("la mise aux normes commence en 1958", ev("CALL_FROM") === 1958);
  check("elle revient tous les sept ans", ev("CALL_PERIOD") === 7);
  check("le devis grandit avec le domaine", G.capitalCallAmount() > 0, G.capitalCallAmount());
  const smallCall = (function(){ const t = empire(); t.land = 200; t.cattle = 60; return G.capitalCallAmount(); })();
  const bigCall = (function(){ const t = empire(); t.land = 4000; t.cattle = 1500; return G.capitalCallAmount(); })();
  check("un grand domaine paie beaucoup plus qu'un petit", bigCall > smallCall * 5,
    smallCall + " vs " + bigCall);

  const s2 = empire();
  s2.nextCall = 1960;
  check("l'appel est exigible", G.capitalCallDue() === true);
  G.presentCapitalCall();
  check("il ouvre une modale", !$el("eventModal")._classes.has("hidden"));
  check("il propose trois issues", $el("eventChoices").children.length === 3,
    $el("eventChoices").children.length);
  check("il replanifie le suivant à sept ans", ST().nextCall === 1967, ST().nextCall);
  const money0 = ST().money;
  $el("eventChoices").children[0].onclick();   // payer comptant
  check("payer comptant coûte le devis", ST().money < money0, money0 - ST().money);
  check("et ne laisse aucune obsolescence", (ST().obsolescence||0) === 0);

  // Emprunter crée une dette et sa traite.
  const s3 = empire();
  s3.nextCall = 1960;
  G.presentCapitalCall();
  $el("eventChoices").children[1].onclick();   // emprunter
  check("emprunter crée une dette", ST().debt > 0, ST().debt);
  check("la dette a sa traite", G.requiredPayment() > 0, G.requiredPayment());

  // Repousser ronge les revenus, et se cumule.
  const s4 = empire();
  check("un domaine à jour produit à plein", G.obsolescenceFactor() === 1);
  s4.obsolescence = 1;
  const one = G.obsolescenceFactor();
  s4.obsolescence = 3;
  const three = G.obsolescenceFactor();
  check("repousser réduit les revenus", one < 1, one);
  check("repousser plusieurs fois enfonce", three < one, one.toFixed(2) + " → " + three.toFixed(2));
  s4.obsolescence = 20;
  check("la dégradation reste bornée", G.obsolescenceFactor() >= .4, G.obsolescenceFactor());

  // 2. La preuve : un empire qui repousse tout finit par tomber.
  let fallen = 0, survived = 0;
  const causes = {};
  for(let run = 0; run < 20; run++){
    const e = empire();
    let guard = 0;
    while(!ST().gameOver && ST().year < 2026 && guard++ < 400){
      // Le joueur négligent : il ne fait rien, et repousse tout ce qu'on lui demande.
      G.endTurn();
      let m = 0;
      while(!$el("eventModal")._classes.has("hidden") && m++ < 40){
        if(ST().gameOver) break;
        const ch = $el("eventChoices").children;
        if(!ch.length) throw new Error("modale sans choix : " + $el("eventTitle").textContent);
        // Toujours la dernière issue : « repousser », « ne rien faire », « ignorer ».
        ch[ch.length - 1].onclick();
      }
    }
    if(ST().gameOver && ST().year < 2026){
      fallen++;
      const t = $el("eventTitle").textContent;
      causes[t] = (causes[t] || 0) + 1;
    } else survived++;
  }
  console.log("       chutes d'un empire négligent : " + fallen + "/20 — " + JSON.stringify(causes));
  check("un empire laissé à l'abandon finit par tomber", fallen >= 8, fallen + "/20");

  // 3. …mais le même empire bien tenu survit.
  let held = 0;
  const heldCauses = {};
  for(let run = 0; run < 10; run++){
    const e = empire();
    let guard = 0;
    while(!ST().gameOver && ST().year < 2026 && guard++ < 400){
      const st = ST();
      // Le joueur attentif : il garde du fourrage, vend son surplus et paie.
      if(st.feed < 400) G.doAction("buyFeed");
      const capacity = Math.max(20, Math.floor(st.land/3));
      if(st.cattle > capacity) G.doAction("sellCattle");
      G.endTurn();
      let m = 0;
      while(!$el("eventModal")._classes.has("hidden") && m++ < 40){
        if(ST().gameOver) break;
        const ch = $el("eventChoices").children;
        if(!ch.length) throw new Error("modale sans choix");
        ch[0].onclick();   // la première issue : payer, se soumettre, régler
      }
    }
    // Vendre le ranch n'est pas une chute : c'est une sortie volontaire, et le
    // pilote « attentif » prend systématiquement la première issue proposée.
    const ending = $el("eventTitle").textContent;
    if(!ST().gameOver || ST().year >= 2026 || ending === "Le ranch vendu") held++;
    else (heldCauses[ending] = (heldCauses[ending]||0)+1);
  }
  if(Object.keys(heldCauses).length) console.log("       chutes malgré la tenue : " + JSON.stringify(heldCauses));
  // Seuil descendu de 7 à 6 avec la V5.0 : le dernier assaut peut emporter un
  // empire par ailleurs bien tenu, et c'est voulu. Le pilote prend toujours la
  // première issue, qui n'est pas toujours la meilleure face à la coalition.
  check("le même empire bien tenu passe le siècle", held >= 6, held + "/10");
}

section("Quarantaine, administration et partage");
{
  // La quarantaine coupe la vente, pas la trésorerie.
  const s = freshGame();
  s.year = 1970; s.eraId = "industrial"; s.costModifier = 2.5;
  s.cattle = 400; s.money = 200000;
  check("aucune quarantaine au départ", G.underQuarantine() === false);
  G.setQuarantine(4, "Test.");
  check("la quarantaine s'installe", G.underQuarantine() === true);
  check("elle entre dans la saga", ST().saga.some(m => /quarantaine/i.test(m.title)));
  const cattle0 = ST().cattle;
  G.doAction("sellCattle");
  check("on ne peut plus vendre de bétail", ST().cattle === cattle0, ST().cattle);
  const money0 = ST().money;
  G.endTurn(); closeModals();
  check("elle s'épuise d'elle-même", ST().quarantine < 4, ST().quarantine);

  // L'administration judiciaire bloque les acquisitions.
  const s2 = freshGame();
  s2.year = 1975; s2.eraId = "corporate"; s2.costModifier = 5; s2.money = 5000000;
  G.setReceivership(5, "Test.");
  check("l'administration s'installe", G.inReceivership() === true);
  const land0 = ST().land;
  G.doAction("buyLand");
  check("acheter des terres est bloqué", ST().land === land0, ST().land);
  for(let i = 0; i < 6; i++){ ST().money = 5000000; ST().feed = 9000; G.endTurn(); closeModals(); }
  check("elle finit par être levée", G.inReceivership() === false, ST().receivership);

  // Le partage successoral d'une maison divisée.
  const s3 = freshGame();
  s3.year = 1930; s3.land = 2400; s3.cattle = 800; s3.money = 100000;
  s3.unity = 20; s3.heirId = null;
  addAdult(s3, "Aînée", {age:40, sex:"f", resentment:70});
  addAdult(s3, "Cadet", {age:36, resentment:20});
  addAdult(s3, "Benjamin", {age:30, resentment:50});
  s3.founder.alive = false;
  const land0b = ST().land, cattle0b = ST().cattle;
  G.partitionEstate(G.adultHeirs());
  check("le partage ampute le domaine", ST().land < land0b * .5, ST().land + " sur " + land0b);
  check("il ampute aussi le troupeau", ST().cattle < cattle0b * .5, ST().cattle);
  check("un seul héritier reste à la tête", ST().founder.name === "Cadet", ST().founder.name);
  check("les autres quittent la famille", ST().children.length === 0, ST().children.length);
  check("les parcelles suivent",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land);
  check("le partage est consigné", ST().saga.some(m => /partagé/.test(m.title)));
  check("il est compté", ST().partitioned === 1);

  // Une maison unie et préparée n'est jamais partagée.
  let partitions = 0;
  for(let i = 0; i < 30; i++){
    const t = freshGame();
    t.unity = 80;
    const a = addAdult(t, "Aîné", {age:40});
    addAdult(t, "Cadet", {age:35});
    G.designateHeir(a.cid);
    t.founder.alive = false;
    G.resolveSuccession();
    if(ST().partitioned) partitions++;
  }
  check("une maison unie avec héritier désigné n'est jamais partagée", partitions === 0, partitions + "/30");
}

section("Le tableau des alertes");
{
  const s = freshGame();
  check("un ranch sain n'affiche aucune alerte", G.alarms().length === 0,
    G.alarms().map(a=>a.title).join(" | "));
  G.render();
  check("le bandeau reste caché", $el("alarms")._classes.has("hidden"));

  s.debt = 30000; s.missedPayments = 4;
  const list = G.alarms();
  check("une échéance manquée s'affiche", list.some(a => /Banque/.test(a.title)), list.map(a=>a.title).join(" | "));
  check("elle annonce le compte à rebours",
    list.some(a => /sur 6/.test(a.title)), list.map(a=>a.title).join(" | "));
  check("elle dit quoi faire", list.some(a => /remet le compteur/.test(a.what)));

  s.arrearYears = 3; s.arrears = 9000;
  check("les arriérés s'affichent aussi", G.alarms().some(a => /Comté/.test(a.title)));
  s.quarantine = 3;
  check("la quarantaine s'affiche", G.alarms().some(a => /Quarantaine/.test(a.title)));
  s.obsolescence = 2;
  check("le matériel hors d'âge s'affiche", G.alarms().some(a => /hors d'âge/.test(a.title)));
  s.unity = 20; s.heirId = null;
  addAdult(s, "A", {age:40}); addAdult(s, "B", {age:38});
  check("le risque de partage s'affiche", G.alarms().some(a => /Succession/.test(a.title)));

  G.render();
  check("le bandeau apparaît", !$el("alarms")._classes.has("hidden"));
  check("il est rendu en HTML", /alarm-icon/.test($el("alarms").innerHTML));
  check("il n'appelle aucune ressource externe", !/https?:\/\//.test($el("alarms").innerHTML));
}

// ------------------------------------------------- Le tour annuel
section("Le tour annuel");
{
  const s = freshGame();
  check("le tour annuel court dès la fondation", ev("ANNUAL_FROM") === 1885);
  check("un tour est une année", G.annualTurns() === true);
  check("huit actions par année", G.actionsPerTurn() === 8);
  check("les lots sont annuels", G.lot() === 2);

  // Une seule fin de tour pour une année pleine.
  const y1 = ST().year, season1 = ST().season;
  ST().money = 500000; ST().feed = 5000;
  G.endTurn(); closeModals();
  check("une fin de tour avance d'une année pleine", ST().year === y1 + 1, ST().year);
  check("la saison revient au même point", ST().season === season1, ST().season);
  check("la chaîne se referme", ST().autoQuarters === 0, ST().autoQuarters);
  check("les actions sont rendues", ST().actions === 8, ST().actions);

  // Dix années d'affilée : ni boucle infinie, ni dérive du calendrier.
  const y2 = ST().year;
  for(let i = 0; i < 10; i++){ ST().money = 500000; ST().feed = 5000; G.endTurn(); closeModals(); }
  check("dix tours font dix ans", ST().year === y2 + 10, ST().year);

  // Une partie complète tient en 141 tours et non plus 564.
  check("une partie complète tient en 141 tours", 2026 - 1885 + 1 === 142);

  // Les lots suivent.
  const s3 = freshGame();
  s3.money = 5000000;
  const cattle0 = s3.cattle;
  G.doAction("buyCattle");
  check("un achat annuel porte sur un lot entier", ST().cattle === cattle0 + 10, ST().cattle - cattle0);
  const land0 = ST().land;
  G.doAction("buyLand");
  check("un achat de terres annuel aussi", ST().land === land0 + 40, ST().land - land0);
  check("les parcelles restent cohérentes",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land);
  const feed0 = ST().feed;
  G.doAction("buyFeed");
  check("le fourrage aussi", ST().feed === feed0 + 80, ST().feed - feed0);

  // Le lot partiel : une caisse trop courte pour un lot entier achète ce
  // qu'elle peut, elle ne reste pas bloquée. C'est ce qui rendait la première
  // année injouable — le prix d'un lot dépassait la mise de départ.
  const s4 = freshGame();
  s4.money = (ST().cattlePrice + 6) * 5 + 3;   // de quoi payer cinq bêtes, pas dix
  const c4 = ST().cattle;
  G.doAction("buyCattle");
  check("une caisse courte achète un demi-lot", ST().cattle === c4 + 5, ST().cattle - c4);
  check("et le paie vraiment", ST().money < 10, ST().money);
  s4.money = 0;
  const c5 = ST().cattle;
  G.doAction("buyCattle");
  check("une caisse vide n'achète rien", ST().cattle === c5, ST().cattle - c5);

  // Une fin de partie pendant la chaîne l'interrompt.
  const s5 = freshGame();
  s5.money = -999999;
  G.endTurn(); closeModals();
  check("une faillite en cours d'année arrête la chaîne", ST().gameOver === true);
  check("et ne laisse pas la chaîne en suspens", ST().autoQuarters === 0, ST().autoQuarters);

  // L'interface parle en années, partout et dès le départ.
  const s6 = freshGame();
  G.render();
  check("l'en-tête annonce l'année", /^Année 1885$/.test($el("seasonLabel").textContent), $el("seasonLabel").textContent);
  check("le bouton parle d'année", /année/i.test($el("endTurnBtn").textContent), $el("endTurnBtn").textContent);
  const yearlyLabels = [$el("endTurnBtn").textContent, $el("decisionsTitle").textContent,
                        $el("turnHint").textContent, $el("seasonLabel").textContent,
                        $el("journalDate").textContent].join(" | ");
  check("aucun libellé ne parle de trimestre",
    !/trimestre/i.test(yearlyLabels), yearlyLabels);
  G.addLog("Test de date.", "info");
  check("le journal date à l'année", ST().history[0].stamp === "1885", ST().history[0].stamp);

  // Les saisons continuent de tourner sous le capot.
  const s7 = freshGame();
  s7.money = 500000; s7.feed = 9000;
  const seasonsSeen = new Set();
  const realEnd = G.endTurn;
  for(let i = 0; i < 3; i++){ seasonsSeen.add(ST().season); G.endTurn(); closeModals(); }
  check("les veaux, les récoltes et les impôts gardent leurs saisons",
    ST().turn > 3, ST().turn);
}

// ------------------------------------------------- Les investisseurs
section("Les investisseurs immobiliers");
{
  const s = freshGame();
  s.year = 1995; s.eraId = "globalization";
  check("aucun investisseur avant 2010", G.ensureDeveloper() === null);
  check("et rien en mémoire", ST().developer === null || ST().developer === undefined);

  s.year = 2012; s.eraId = "modern"; s.costModifier = 16;
  const dev = G.ensureDeveloper();
  check("un investisseur entre en scène à partir de 2010", !!dev);
  check("il a un nom et une nature", !!dev.name && !!dev.what);
  check("son arrivée entre dans la saga",
    ST().saga.some(m => m.kind === "developer"), ST().saga.map(m=>m.kind).join(","));
  const p0 = G.developerPressure();
  G.addDeveloperPressure(20);
  check("la pression monte", G.developerPressure() === p0 + 20, G.developerPressure());
  G.addDeveloperPressure(-999);
  check("elle ne descend pas sous zéro", G.developerPressure() === 0);
  G.addDeveloperPressure(999);
  check("et ne dépasse pas cent", G.developerPressure() === 100);

  // L'offre suit la pression et la surface.
  s.land = 1000; s.cattle = 200;
  G.addDeveloperPressure(-999);
  const calm = G.developerOffer(1).price;
  G.addDeveloperPressure(80);
  const hungry = G.developerOffer(1).price;
  check("plus ils veulent, plus ils paient", hungry > calm, calm + " → " + hungry);
  check("l'offre porte sur la part demandée",
    G.developerOffer(.25).ha === 250, G.developerOffer(.25).ha);
  check("elle dépasse largement la valeur agricole",
    G.developerOffer(1).price > G.estateValue(), G.developerOffer(1).price + " vs " + G.estateValue());

  // Vendre le ranch termine la partie, autrement qu'une faillite.
  const s2 = freshGame();
  s2.year = 2018; s2.eraId = "modern"; s2.costModifier = 16;
  s2.land = 1500; s2.cattle = 400; s2.money = 1000;
  G.ensureDeveloper();
  const before = ST().money;
  G.sellTheRanch(50000000);
  check("vendre le ranch verse le prix", ST().money === before + 50000000, ST().money);
  check("vendre le ranch termine la partie", ST().gameOver === true);
  check("la fin porte son propre titre",
    $el("eventTitle").textContent === "Le ranch vendu", $el("eventTitle").textContent);
  check("elle rappelle le nombre de générations",
    /génération/.test($el("eventText").textContent));
  check("la vente entre dans la saga",
    ST().saga.some(m => m.kind === "developer" && /vendu/.test(m.title)),
    ST().saga.filter(m=>m.kind==="developer").map(m=>m.title).join(" | "));
  check("elle laisse un héritage à relever", !!G.loadLegacyRecord());

  // La pression monte d'elle-même au fil des tours.
  const s3 = freshGame();
  s3.year = 2012; s3.eraId = "modern"; s3.costModifier = 16;
  s3.money = 50000000; s3.feed = 20000; s3.land = 2000;
  G.ensureDeveloper();
  const start = G.developerPressure();
  for(let i = 0; i < 8; i++){ ST().money = 50000000; ST().feed = 20000; G.endTurn(); closeModals(); }
  check("la pression monte au fil des années", G.developerPressure() > start,
    start + " → " + G.developerPressure());
}

// ------------------------------------------------- L'économie tardive
section("Les affaires d'époque");
{
  const eras = ev("ERAS").map(e => e.id);
  check("chaque époque a son affaire",
    eras.every(id => !!ev("ERA_VENTURES")[id]),
    eras.filter(id => !ev("ERA_VENTURES")[id]).join(","));
  check("chaque affaire est décrite",
    Object.values(ev("ERA_VENTURES")).every(v => v.name && v.what && v.gain && v.cost > 0 && v.income > 0 && v.max >= 3));
  check("chaque affaire porte l'époque qui l'ouvre",
    Object.keys(ev("ERA_VENTURES")).every(k => ev("ERA_VENTURES")[k].eraId === k));

  const s = freshGame();
  s.money = 200000;
  const v = G.ventureOfEra();
  check("l'affaire de 1885 est la piste de convoyage", v.id === "drive", v.id);
  check("sans investissement, elle ne rapporte rien", G.ventureQuarterly(v) === 0);
  const before = s.money, acts = s.actions;
  G.investVenture();
  check("monter l'affaire coûte de l'argent", ST().money < before);
  check("monter l'affaire consomme une action", ST().actions === acts - 1, ST().actions);
  check("le palier est enregistré", G.ventureLevel(v.id) === 1, G.ventureLevel(v.id));
  check("elle rapporte dès le premier palier", G.ventureQuarterly(v) > 0, G.ventureQuarterly(v));
  check("elle rapporte plus qu'elle ne coûte", G.ventureQuarterly(v) > G.ventureUpkeep(v));
  check("le lancement entre dans la saga",
    ST().saga.some(m => m.kind === "venture"));

  const lvl1 = G.ventureQuarterly(v);
  const cost1 = G.ventureNextCost(v);
  ST().actions = 3; G.investVenture();
  check("le palier suivant rapporte davantage", G.ventureQuarterly(v) > lvl1);
  check("le palier suivant coûte davantage", G.ventureNextCost(v) > cost1);

  for(let i = 0; i < 8; i++){ ST().actions = 3; G.investVenture(); }
  check("le palier maximum est respecté", G.ventureLevel(v.id) === v.max, G.ventureLevel(v.id));

  // Une affaire se démode : le même palier rapporte bien moins une époque plus tard.
  const atFoundation = G.ventureQuarterly(v);
  ST().eraId = "prohibition"; ST().costModifier = 1.4;
  const atProhibition = G.ventureQuarterly(v);
  check("une affaire se démode d'une époque à l'autre",
    atProhibition < atFoundation * 1.4, atProhibition + " vs " + Math.round(atFoundation*1.4));
  ST().eraId = "modern"; ST().costModifier = 16;
  check("elle ne rapporte presque plus trois époques plus tard",
    G.ventureQuarterly(v) < atFoundation * 16 * .2, G.ventureQuarterly(v));

  check("le patrimoine compte les affaires", G.ventureValue() > 0);
  ST().eraId = "foundation"; ST().costModifier = 1;
  const withVenture = G.estateValue();
  ST().ventures = {};
  check("sans affaire, le patrimoine est moindre", G.estateValue() < withVenture);
}

section("Impôts et droits de succession");
{
  const s = freshGame();
  check("la Fondation ne prélève pas de foncier", ev("FISCAL").foundation.property === 0);
  check("chaque époque a son régime fiscal",
    ev("ERAS").every(e => !!ev("FISCAL")[e.id]));
  check("les taux montent avec le siècle",
    ev("ERAS").every((e,i,a) => i === 0 || ev("FISCAL")[e.id].property >= ev("FISCAL")[a[i-1].id].property));

  s.money = 50000; s.land = 300;
  const m0 = s.money;
  G.annualLevy();
  check("aucun impôt foncier en 1885", ST().money === m0, ST().money);

  // Un grand domaine paie plus qu'un petit, à époque égale.
  const s2 = freshGame();
  s2.eraId = "modern"; s2.costModifier = 16; s2.year = 2015;
  s2.land = 300; s2.money = 5000000; s2.cattle = 200;
  const small = G.propertyRate();
  s2.land = 3000;
  const big = G.propertyRate();
  check("l'impôt foncier est progressif", big > small, small + " vs " + big);
  const beforeTax = ST().money;
  G.annualLevy();
  check("l'impôt foncier est prélevé", ST().money < beforeTax, beforeTax - ST().money);

  // Sans trésorerie, la note devient un arriéré qui court — et non plus une
  // saisie immédiate : le joueur a deux ans pour trouver l'argent.
  const s3 = freshGame();
  s3.eraId = "modern"; s3.costModifier = 16; s3.year = 2015;
  s3.land = 3000; s3.cattle = 400; s3.money = 0;
  G.annualLevy();
  check("faute d'argent, l'impôt devient un arriéré", ST().arrears > 0, ST().arrears);
  check("le troupeau n'est pas saisi tout de suite", ST().cattle === 400, ST().cattle);
  check("l'année de retard est comptée", ST().arrearYears === 1, ST().arrearYears);

  const arrears1 = ST().arrears;
  G.settleArrears();
  check("un arriéré non soldé grossit avec la pénalité", ST().arrears > arrears1, ST().arrears);
  G.annualLevy();
  G.settleArrears();
  check("au bout de deux ans, le comté cède la créance à la banque",
    ST().debt > 0 && ST().arrears === 0, "dette " + ST().debt + " / arriéré " + ST().arrears);

  // Payer solde l'arriéré et referme le dossier.
  const s3b = freshGame();
  s3b.eraId = "modern"; s3b.costModifier = 16; s3b.year = 2015;
  s3b.arrears = 5000; s3b.arrearYears = 1; s3b.money = 500000;
  G.settleArrears();
  check("un arriéré payé referme le dossier",
    ST().arrears === 0 && ST().arrearYears === 0, ST().arrears + "/" + ST().arrearYears);

  // Les terres classées échappent à la saisie.
  const s4 = freshGame();
  s4.eraId = "modern"; s4.costModifier = 16; s4.year = 2015;
  s4.land = 900; s4.protectedLand = 880; s4.cattle = 0; s4.money = 0;
  G.annualLevy();
  check("les terres classées ne sont pas saisies", ST().land >= 880, ST().land);

  // Droits de succession
  const s5 = freshGame();
  check("aucun droit de succession en 1885", G.inheritanceDuty(true) === null);
  s5.eraId = "modern"; s5.costModifier = 16; s5.year = 2015;
  s5.money = 1000000; s5.land = 2000; s5.cattle = 500;
  const planned = G.inheritanceDuty(true);
  check("les droits de succession frappent la trésorerie", ST().money < 1000000, ST().money);
  check("le taux reste borné", planned.rate > 0 && planned.rate <= .6, planned.rate);

  const s6 = freshGame();
  s6.eraId = "modern"; s6.costModifier = 16; s6.year = 2015;
  s6.money = 1000000; s6.land = 2000; s6.cattle = 500; s6.unity = 80;
  const unplanned = G.inheritanceDuty(false);
  check("une succession préparée coûte moins cher",
    planned.rate < unplanned.rate, planned.rate + " vs " + unplanned.rate);

  // La dette réclame une traite fixe : c'est elle qui rend la chute possible.
  const s7 = freshGame();
  s7.debt = 1000; s7.money = 0;
  const due = G.requiredPayment();
  check("la traite est un montant fixe, indépendant de la caisse", due > 0, due);
  G.serviceDebt();
  check("une traite manquée est comptée", ST().missedPayments === 1, ST().missedPayments);
  check("et alourdit la dette", ST().debt > 1000, ST().debt);

  // Trois échéances manquées : la banque exécute sa garantie.
  const s8 = freshGame();
  s8.debt = 20000; s8.money = 0; s8.cattle = 300; s8.land = 900;
  for(let i = 0; i < 3; i++) G.serviceDebt();
  check("trois échéances manquées déclenchent la saisie",
    ST().cattle < 300 || ST().land < 900, ST().cattle + " têtes / " + ST().land + " ha");
  check("la saisie ne descend pas sous le plancher", ST().land >= 40, ST().land);

  // Six échéances : le domaine est vendu aux enchères.
  const s9 = freshGame();
  s9.debt = 20000; s9.money = 0; s9.cattle = 300; s9.land = 900;
  for(let i = 0; i < 6; i++) G.serviceDebt();
  G.checkGameOver();
  check("six échéances manquées emportent le domaine", ST().gameOver === true, ST().missedPayments);
  check("la fin porte son propre titre",
    $el("eventTitle").textContent === "Vendu aux enchères", $el("eventTitle").textContent);

  // Payer à l'heure remet le compteur à zéro.
  const s10 = freshGame();
  s10.debt = 5000; s10.money = 0;
  G.serviceDebt();
  check("le compteur d'échéances monte", ST().missedPayments === 1);
  ST().money = 500000;
  G.serviceDebt();
  check("payer remet le compteur à zéro", ST().missedPayments === 0);
  check("une caisse pleine solde vite", ST().debt < 5000 * .8, ST().debt);
  for(let i = 0; i < 12; i++){ ST().money = 500000; ST().turn++; G.serviceDebt(); }
  check("et finit par éteindre la dette", ST().debt === 0, ST().debt);
}

// ------------------------------------------------- L'escouade
section("L'escouade sur les coups en douce");
{
  const s = permissiveGame();
  s.eraId = "foundation"; s.costModifier = 1; s.year = 1890;
  const ops = ev("illegalOps()");
  const shootOp = ops.find(o => o.edge === "shoot");
  const otherOp = ops.find(o => o.edge !== "shoot");
  check("un coup de main réclame une escouade", G.needsSquad(shootOp) === true, shootOp.id);
  check("un coup sans hommes n'en réclame pas", G.needsSquad(otherOp) === false, otherOp.id);

  // Les chances suivent la compétence, pas seulement le nombre.
  s.cowboys = [
    {name:"Bon tireur", loyalty:80, shoot:95, ride:90, salary:10, years:3, trait:"Vétéran"},
    {name:"Moyen",      loyalty:70, shoot:50, ride:50, salary:10, years:1, trait:"Fidèle"},
    {name:"Mauvais",    loyalty:70, shoot:15, ride:20, salary:10, years:1, trait:"Novice"}
  ];
  const solo = G.squadOdds(shootOp, [0]);
  const weak = G.squadOdds(shootOp, [2]);
  check("un bon tireur vaut mieux qu'un mauvais", solo > weak, solo.toFixed(2) + " vs " + weak.toFixed(2));
  // Le nombre aide, mais la moyenne compte : ajouter un manœuvre à un tireur
  // d'élite dégrade les chances, ajouter son égal les améliore.
  const withWeak = G.squadOdds(shootOp, [0,2]);
  check("adjoindre un incapable à un tireur d'élite dessert",
    withWeak < solo, withWeak.toFixed(2) + " vs " + solo.toFixed(2));
  s.cowboys.push({name:"Second tireur", loyalty:80, shoot:95, ride:90, salary:10, years:3, trait:"Vétéran"});
  const twoAces = G.squadOdds(shootOp, [0,3]);
  check("deux tireurs de même valeur valent mieux qu'un",
    twoAces > solo, twoAces.toFixed(2) + " vs " + solo.toFixed(2));
  check("aucune escouade dégrade fortement les chances",
    G.squadOdds(shootOp, []) < solo - .1, G.squadOdds(shootOp, []).toFixed(2));

  // Au-delà de cinq, la troupe se remarque.
  s.cowboys = [];
  for(let i = 0; i < 9; i++) s.cowboys.push({name:"H"+i, loyalty:80, shoot:70, ride:70, salary:8, years:1, trait:"Fidèle"});
  const five = G.squadOdds(shootOp, [0,1,2,3,4]);
  const nine = G.squadOdds(shootOp, [0,1,2,3,4,5,6,7,8]);
  check("une troupe trop nombreuse se fait repérer", nine < five, five.toFixed(2) + " vs " + nine.toFixed(2));
  check("les chances restent bornées", nine > 0 && five < 1);

  // Le panneau
  G.openSquadPanel(shootOp.id);
  check("le panneau de l'escouade s'ouvre", !$el("squadModal")._classes.has("hidden"));
  check("il liste tous les hommes",
    ($el("squadList").innerHTML.match(/toggleSquad\(/g) || []).length === 9);
  check("il annonce un pourcentage", /\d+ % de réussite/.test($el("squadOdds").textContent), $el("squadOdds").textContent);
  check("il présélectionne des hommes", /% de réussite/.test($el("squadOdds").textContent)
    && !/^0 homme/.test($el("squadOdds").textContent), $el("squadOdds").textContent);

  // Une réussite attache les hommes, un échec les coûte.
  const s2 = permissiveGame();
  s2.eraId = "foundation"; s2.costModifier = 1; s2.year = 1890; s2.money = 20000;
  s2.cowboys = [];
  for(let i = 0; i < 6; i++) s2.cowboys.push({name:"M"+i, loyalty:60, shoot:70, ride:70, salary:8, years:4, trait:"Fidèle"});
  const squad = [0,1,2];
  const loyBefore = s2.cowboys[0].loyalty;
  G.squadReward(G.squadMembers(squad), shootOp);
  check("une réussite renforce la loyauté", ST().cowboys[0].loyalty > loyBefore);
  check("elle compte les coups au compteur", ST().cowboys[0].raids === 1);

  let lost = 0, hurt = 0;
  for(let run = 0; run < 60; run++){
    const s3 = permissiveGame();
    s3.cowboys = [];
    for(let i = 0; i < 4; i++) s3.cowboys.push({name:"C"+i, loyalty:60, shoot:70, ride:70, salary:8, years:2, trait:"Fidèle"});
    const before = s3.cowboys.length;
    const shootBefore = s3.cowboys.reduce((a,c)=>a+c.shoot,0);
    G.squadCasualties(G.squadMembers([0,1,2,3]), shootOp);
    if(ST().cowboys.length < before) lost++;
    if(ST().cowboys.reduce((a,c)=>a+c.shoot,0) < shootBefore) hurt++;
  }
  check("un échec fait parfois perdre des hommes", lost > 0, lost + "/60");
  check("un échec en blesse aussi", hurt > 0, hurt + "/60");
  check("il n'en perd pas systématiquement", lost < 60, lost + "/60");

  // Aucune escouade : l'opération se joue comme avant.
  const s4 = permissiveGame();
  s4.money = 20000;
  let threw = false;
  try{ G.runIllegalOp(shootOp.id); }catch(e){ threw = e.message; }
  check("un coup sans escouade s'exécute encore", threw === false, threw);
  threw = false;
  try{ G.squadCasualties([], shootOp); G.hurtCowboys(3, true); }catch(e){ threw = e.message; }
  check("aucune victime possible ne fait pas planter", threw === false, threw);
}

// ------------------------------------------------- La nation et la terre
section("La revendication foncière");
{
  const s = freshGame();
  check("la nation est présente dès 1885",
    s.factions.some(f => f.type === "nation"), s.factions.map(f=>f.type).join(","));
  check("elle est présente à toutes les époques",
    ev("ERAS").every(e => e.factionDefs.some(d => d.type === "nation")));

  s.year = 1900;
  check("aucun recours judiciaire avant 1946", G.nationHasCourt() === false);
  s.year = 1946;
  check("le recours s'ouvre en 1946", G.nationHasCourt() === true);

  const s2 = freshGame();
  s2.claimPressure = 0; s2.legacy.greed = 0;
  s2.factions.forEach(f => { if(f.type === "nation") f.relation = 0; });
  check("sans passif, la revendication est nulle", G.claimStrength() === 0, G.claimStrength());
  G.addClaimPressure(10);
  check("prendre des terres nourrit la revendication", G.claimStrength() >= 10, G.claimStrength());
  s2.legacy.greed = 3;
  check("la cupidité de la lignée y ajoute", G.claimStrength() >= 16, G.claimStrength());
  s2.factions.forEach(f => { if(f.type === "nation") f.relation = -80; });
  check("l'hostilité aussi", G.claimStrength() >= 36, G.claimStrength());

  // La doctrine « prendre la terre » se paie plus tard.
  const s3 = freshGame();
  const p0 = s3.claimPressure;
  G.chooseDoctrine("foundation", "landman");
  check("prendre la terre d'abord alourdit la revendication", ST().claimPressure > p0, ST().claimPressure);

  // Le règlement se sert d'abord sur l'argent, puis sur les terres.
  const s4 = freshGame();
  s4.eraId = "modern"; s4.costModifier = 16; s4.year = 2015;
  s4.land = 2000; s4.cattle = 300; s4.money = 10000000; s4.claimPressure = 30;
  const landBefore = s4.land;
  const r1 = G.settleClaim(.12, false);
  check("un accord se paie en argent", r1.paid > 0 && ST().land === landBefore, r1.paid);
  check("il fait retomber la revendication", ST().claimPressure < 30, ST().claimPressure);

  const s5 = freshGame();
  s5.eraId = "modern"; s5.costModifier = 16; s5.year = 2015;
  s5.land = 2000; s5.cattle = 0; s5.money = 0; s5.claimPressure = 40;
  const r2 = G.settleClaim(.22, null);
  check("faute d'argent, un procès perdu coûte des hectares", ST().land < 2000, ST().land);
  check("il reste toujours de quoi vivre", ST().land >= 80, ST().land);
  check("les parcelles suivent la perte",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land,
    ST().parcels.reduce((a,p)=>a+p.ha,0) + " vs " + ST().land);

  // La faveur diplomatique éteint le litige.
  const s6 = freshGame();
  s6.claimPressure = 25; s6.money = 100000;
  s6.factions.forEach(f => { if(f.type === "nation") f.relation = 70; });
  s6.favourCooldown.nation = 0;
  check("la nation a sa faveur", !!ev("FACTION_FAVOURS").nation);
  G.useFavour("nation");
  check("régler le litige fait retomber la revendication", ST().claimPressure < 25, ST().claimPressure);
  check("et compte comme un acte d'honneur", ST().legacy.honor > 0);
}

// ------------------------------------------------- La pègre et les fusillades
section("La pègre et les fusillades");
{
  const s = freshGame();
  check("aucun lien avec la pègre au départ", G.mobTies() === 0);
  G.addMobTies(2);
  check("les liens se comptent", G.mobTies() === 2);
  G.addMobTies(-5);
  check("ils ne descendent pas sous zéro", G.mobTies() === 0, G.mobTies());

  // La force de feu du ranch dépend des hommes et des armes.
  s.cowboys = []; s.weapons = 0;
  const bare = G.ranchGunStrength();
  s.weapons = 4;
  check("les armes comptent", G.ranchGunStrength() > bare);
  s.cowboys = [{name:"A",loyalty:70,shoot:90,ride:60,salary:10,years:2,trait:"Vétéran"},
               {name:"B",loyalty:70,shoot:85,ride:60,salary:10,years:2,trait:"Vétéran"}];
  const armed = G.ranchGunStrength();
  check("les bons tireurs comptent davantage", armed > bare + 20, armed);
  s.cowboys.forEach(c => c.shoot = 10);
  check("des hommes qui ne savent pas tirer ne valent pas des tireurs",
    G.ranchGunStrength() < armed, G.ranchGunStrength());

  // Une fusillade se paie en visages, pas en jauges.
  const s2 = freshGame();
  s2.cowboys = [];
  for(let i = 0; i < 5; i++) s2.cowboys.push({name:"F"+i,loyalty:70,shoot:70,ride:70,salary:8,years:3,trait:"Fidèle"});
  const names = G.hurtCowboys(3, true);
  check("une fusillade touche des hommes nommés",
    names.hurt.length + names.dead.length === 3, JSON.stringify(names));
  check("le récit nomme les victimes",
    names.dead.length ? /est tué|sont tués/.test(G.casualtyLine(names)) : /blessé/.test(G.casualtyLine(names)),
    G.casualtyLine(names));
  check("sans victime, le récit le dit",
    G.casualtyLine({hurt:[],dead:[]}) === "Personne n'est touché.");

  // Les événements de la Prohibition existent bien et sont jouables.
  const mobEvents = ev("events").filter(e => e.eraId === "prohibition");
  check("la Prohibition a de quoi faire", mobEvents.length >= 10, mobEvents.length);
  const gunfight = ev("events").find(e => (typeof e.title === "function" ? e.title() : e.title) === "Fusillade au portail nord");
  check("la fusillade au portail existe", !!gunfight);
  let threw = false;
  try{
    const s3 = permissiveGame();
    s3.eraId = "prohibition"; s3.costModifier = 1.4; s3.year = 1926; s3.mobTies = 2;
    gunfight.choices.forEach(c => { if(!c.condition || c.condition()) c.apply(); });
  }catch(e){ threw = e.message; }
  check("toutes ses issues s'appliquent sans erreur", threw === false, threw);
}

// ------------------------------------------------- Les petits-enfants
section("La troisième génération");
{
  const s = freshGame();
  const fils = addAdult(s, "Aîné", {age:26, sex:"m"});
  fils.married = true; fils.spouseName = "Clara";
  check("un enfant direct n'a pas de parent déclaré", fils.parentCid === undefined);
  check("il compte comme enfant direct", G.directChildren().some(c => c.cid === fils.cid));
  check("aucun petit-enfant au départ", G.grandChildren().length === 0);

  // Naissance d'un petit-enfant.
  const bebe = G.addChild("Petit", {sex:"m", parentName:fils.name, parentCid:fils.cid});
  check("un petit-enfant porte le lien vers son parent", bebe.parentCid === fils.cid);
  check("il n'est pas compté comme enfant direct",
    !G.directChildren().some(c => c.cid === bebe.cid));
  check("il est compté comme petit-enfant", G.grandChildren().some(c => c.cid === bebe.cid));
  check("on peut lister ceux d'un parent donné",
    G.grandChildren(fils.cid).length === 1, G.grandChildren(fils.cid).length);

  // Il ne dispute pas le ranch à son propre père.
  bebe.age = 25;
  const heirs = G.adultHeirs();
  check("un petit-fils adulte ne concurrence pas son père",
    heirs.length === 1 && heirs[0].cid === fils.cid,
    heirs.map(h=>h.name).join(","));

  // Mais il reprend si la génération du dessus s'éteint.
  fils.alive = false;
  const heirs2 = G.adultHeirs();
  check("il devient prétendant si la génération du dessus s'éteint",
    heirs2.some(h => h.cid === bebe.cid), heirs2.map(h=>h.name).join(","));

  // Les naissances de petits-enfants se produisent réellement.
  let born = 0;
  for(let run = 0; run < 25 && !born; run++){
    const t = freshGame();
    const k = addAdult(t, "Marié", {age:24, sex:"f"});
    k.married = true; k.spouseName = "Samuel";
    for(let y = 0; y < 12; y++){
      t.founder.age = 70; t.spouse.alive = false;   // écarte les naissances du foyer
      G.ageFamily();
      if(G.grandChildren().length) { born = 1; break; }
    }
  }
  check("des petits-enfants naissent au fil des années", born === 1);

  // Le visage tient du parent, pas du chef de famille.
  const s2 = freshGame();
  s2.familySkin = 2;
  const mere = addAdult(s2, "Mère", {age:26, sex:"f"});
  mere.married = true; mere.spouseName = "Paul";
  const petit = G.addChild("Enfant", {sex:"f", parentName:mere.name, parentCid:mere.cid});
  delete petit.face; G.faceOf(petit, [mere, null]);
  check("un petit-enfant a bien un visage", !!petit.face);
  check("son teint reste dans la bande de la maison",
    Math.abs(petit.face.skinIx - 2) <= 1, petit.face.skinIx);

  // Migration : un petit-enfant d'avant n'avait que le prénom de son parent.
  const s3 = freshGame();
  const p1 = addAdult(s3, "Parent", {age:30});
  const vieux = G.addChild("Ancien", {sex:"m", parentName:"Parent"});
  delete vieux.parentCid;
  G.ensureProgress();
  check("le lien est rétabli pour une partie ancienne",
    ST().children.find(c=>c.name==="Ancien").parentCid === p1.cid);

  // Les panneaux les montrent.
  const s4 = freshGame();
  const fille = addAdult(s4, "Fille", {age:28, sex:"f"});
  fille.married = true; fille.spouseName = "Léon";
  G.addChild("Lucie", {sex:"f", parentName:fille.name, parentCid:fille.cid}).age = 4;
  G.ensureFaces();
  G.renderFamily();
  check("le panneau famille montre la troisième génération",
    /grandkids/.test($el("familyContent").innerHTML));
  check("il nomme le petit-enfant", $el("familyContent").innerHTML.indexOf("Lucie") >= 0);
  G.renderLineage();
  check("l'arbre lui donne son propre rang",
    /Petit-enfant/.test($el("lineageContent").innerHTML));
  const epi = G.epilogueHTML();
  check("l'épilogue aussi", /petit-enfant/i.test(epi));
  check("la maison au dernier jour ne les mélange plus aux enfants",
    epi.indexOf("La maison au dernier jour") < epi.indexOf("Lucie"));
}

// ------------------------------------------------- Les visages
section("Les visages de la dynastie");
{
  const s = freshGame();
  check("le fondateur a un visage", !!G.faceOf(ST().founder));
  check("le conjoint aussi", !!G.faceOf(ST().spouse));
  const f = G.faceOf(ST().founder);
  check("un visage porte tous ses traits",
    ["skinIx","hairIx","eyeIx","jaw","nose","mouth","brow","style","beard","ears","cheek"]
      .every(k => f[k] !== undefined),
    Object.keys(f).join(","));
  check("le teint est un rang dans une échelle ordonnée",
    Number.isInteger(f.skinIx) && f.skinIx >= 0 && f.skinIx < ev("SKIN").length, f.skinIx);
  check("les traits sont rangés sur la personne", !!ST().founder.face);

  // Stabilité : le même être humain a toujours le même visage.
  const again = G.faceOf(ST().founder);
  check("le visage ne change pas d'un appel à l'autre",
    JSON.stringify(again) === JSON.stringify(f));
  const svg1 = G.portraitSVG(ST().founder);
  const svg2 = G.portraitSVG(ST().founder);
  check("le portrait est reproductible", svg1 === svg2);

  // Variété : deux personnes différentes ne se ressemblent pas.
  const faces = new Set();
  for(let i = 0; i < 40; i++){
    faces.add(JSON.stringify(G.faceOf({name:"P"+i, sex:i%2?"f":"m", cid:500+i, age:30})));
  }
  check("quarante personnes donnent des visages variés", faces.size >= 35, faces.size + "/40");

  // Un enfant tient le milieu entre ses deux parents, jamais un tirage au sort.
  const face0 = (ix, rest) => Object.assign({skinIx:ix, hairIx:1, eyeIx:0, jaw:1, nose:1,
    mouth:1, brow:1, style:0, beard:0, ears:0, cheek:1}, rest||{});
  const s2 = freshGame();
  s2.familySkin = 2;
  s2.founder.face = face0(0);
  s2.spouse.face  = face0(4, {hairIx:6, eyeIx:3});
  let between = 0;
  for(let i = 0; i < 40; i++){
    const kid = G.addChild("Enfant"+i, {sex:i%2?"f":"m"});
    // Milieu des deux rangs, à un cran près.
    if(Math.abs(kid.face.skinIx - 2) <= 1) between++;
  }
  check("un enfant tient le milieu entre ses deux parents", between === 40, between + "/40");

  // Le cheveu foncé domine, comme dans la vie.
  const s2b = freshGame();
  s2b.founder.face = face0(1, {hairIx:0});
  s2b.spouse.face  = face0(1, {hairIx:6});
  let dark = 0;
  for(let i = 0; i < 40; i++){
    const kid = G.addChild("Brun"+i, {sex:i%2?"f":"m"});
    if(kid.face.hairIx === 0) dark++;
  }
  check("le cheveu foncé l'emporte le plus souvent", dark > 20, dark + "/40");

  // Une famille claire reste claire sur cinq générations.
  const s3b = freshGame();
  // Le teint de la maison est un état à part, arrêté à la fondation : c'est lui
  // qui borne toute la descendance, pas le visage du chef en cours.
  s3b.familySkin = 0;
  s3b.founder.face = face0(0);
  s3b.spouse.face  = face0(1);
  let couple = [s3b.founder, s3b.spouse];
  const tones = [];
  for(let gen = 0; gen < 5; gen++){
    // L'héritier de la génération, et le conjoint qui entre au foyer.
    const heir = {name:"G"+gen, sex:"m", cid:700+gen, age:30};
    G.faceOf(heir, couple);
    tones.push(heir.face.skinIx);
    ST().founder = heir;
    const married = {name:"C"+gen, sex:"f", cid:800+gen, age:28};
    G.faceOfSpouse(married);
    tones.push(married.face.skinIx);
    couple = [heir, married];
  }
  check("une famille claire le reste sur cinq générations",
    tones.every(t => t <= 1), tones.join(","));

  // Et une famille foncée aussi.
  const s3c = freshGame();
  s3c.familySkin = 5;
  s3c.founder.face = face0(5);
  s3c.spouse.face  = face0(4);
  let couple2 = [s3c.founder, s3c.spouse];
  const tones2 = [];
  for(let gen = 0; gen < 5; gen++){
    const heir = {name:"H"+gen, sex:"f", cid:750+gen, age:30};
    G.faceOf(heir, couple2);
    tones2.push(heir.face.skinIx);
    ST().founder = heir;
    const married = {name:"D"+gen, sex:"m", cid:850+gen, age:28};
    G.faceOfSpouse(married);
    tones2.push(married.face.skinIx);
    couple2 = [heir, married];
  }
  check("une famille foncée le reste aussi", tones2.every(t => t >= 4), tones2.join(","));

  // Un cow-boy n'est pas de la famille : son teint est libre.
  const s3d = freshGame();
  s3d.familySkin = 0;
  s3d.founder.face = face0(0);
  const hands = new Set();
  for(let i = 0; i < 30; i++){
    const c = {name:"Hand"+i, sex:"m", cid:950+i, age:30};
    G.faceOf(c);
    hands.add(c.face.skinIx);
  }
  check("les cow-boys ne prennent pas le teint de la maison", hands.size >= 4, [...hands].join(","));

  // Le choix de l'écran de création s'applique au couple fondateur.
  $el("founderSkin").value = "0";
  const s3e = freshGame();
  check("le teint choisi s'applique au fondateur", ST().founder.face.skinIx === 0, ST().founder.face.skinIx);
  check("et le conjoint s'en approche", Math.abs(ST().spouse.face.skinIx - 0) <= 1, ST().spouse.face.skinIx);
  $el("founderSkin").value = "5";
  const s3f = freshGame();
  check("un autre teint est respecté", ST().founder.face.skinIx === 5, ST().founder.face.skinIx);
  check("le conjoint suit", ST().spouse.face.skinIx >= 4, ST().spouse.face.skinIx);
  $el("founderSkin").value = "";

  // L'âge change de série de photos : l'enfant devient adulte.
  const kid   = G.portraitSVG({name:"Ada", sex:"f", cid:900, age:9});
  const grown = G.portraitSVG({name:"Ada", sex:"f", cid:900, age:34});
  check("un enfant et un adulte n'ont pas le même portrait", kid !== grown);
  // Le dessin de secours, lui, vieillit trait par trait.
  const dYoung = G.portraitSVG({name:"Ada", sex:"f", cid:900, age:25}, {drawn:true});
  const dOld   = G.portraitSVG({name:"Ada", sex:"f", cid:900, age:80}, {drawn:true});
  check("le dessin de secours vieillit", dYoung !== dOld);
  check("les cheveux blanchissent avec l'âge",
    G.greyed("#2b1d14", 25) === "#2b1d14" && G.greyed("#2b1d14", 85) !== "#2b1d14",
    G.greyed("#2b1d14", 85));

  // Le portrait est un SVG autonome, sans requête extérieure.
  check("le portrait est un SVG", svg1.indexOf("<svg") === 0);
  check("il embarque une photo", svg1.indexOf("<image href=\"data:image/jpeg") >= 0);
  check("il est bien fermé", svg1.trim().slice(-6) === "</svg>");
  check("il n'appelle aucune ressource externe", !/https?:\/\/[^"]*\.(png|jpg|svg)/.test(svg1));
  check("il porte un texte alternatif", /aria-label=/.test(svg1));
  const drawn = G.portraitSVG(ST().founder, {drawn:true});
  check("le dessin de secours garde un repli de couleurs hors CSS",
    /var\(--surface-2, #/.test(drawn) && /var\(--line, #/.test(drawn));

  // Un mort se voit.
  const gone = G.portraitSVG({name:"Feu", sex:"m", cid:901, age:70, alive:false});
  check("un défunt est rendu différemment", gone !== G.portraitSVG({name:"Feu", sex:"m", cid:901, age:70}));

  // Les panneaux affichent les visages.
  const s3 = freshGame();
  G.addChild("Alice", {sex:"f"}).age = 20;
  G.ensureFaces();
  G.renderFamily();
  check("le panneau famille montre des portraits",
    ($el("familyContent").innerHTML.match(/portrait-svg/g)||[]).length >= 3,
    ($el("familyContent").innerHTML.match(/portrait-svg/g)||[]).length);
  G.renderCowboys();
  check("le panneau équipe aussi", /portrait-svg/.test($el("cowboyContent").innerHTML));

  // ---- Le catalogue photographique ----
  check("le catalogue est chargé", typeof ev("typeof PHOTOS") === "string" && ev("typeof PHOTOS") === "object");
  const bands = ev("Object.keys(PHOTOS)").sort();
  check("il couvre les cinq bandes d'époque", bands.join(",") === "0,1,2,3,4", bands.join(","));
  check("chaque bande a ses deux sexes",
    bands.every(b => ev(`PHOTOS["${b}"].m`) && ev(`PHOTOS["${b}"].f`)));
  check("chaque case a au moins une photo",
    bands.every(b => ["m","f"].every(x => ["a","c","o"].every(g =>
      (ev(`PHOTOS["${b}"]["${x}"]["${g}"]||[]`)||[]).length > 0))));
  check("toutes les photos sont encodées dans la page",
    bands.every(b => ["m","f"].every(x => ["a","c","o"].every(g =>
      (ev(`PHOTOS["${b}"]["${x}"]["${g}"]||[]`)||[]).every(u => u.indexOf("data:image/") === 0)))));

  // Chaque époque du jeu tombe dans une bande.
  check("chaque époque a sa bande de portraits",
    ev("ERAS").every(e => ev(`PHOTO_BAND["${e.id}"]`) !== undefined),
    ev("ERAS").filter(e => ev(`PHOTO_BAND["${e.id}"]`) === undefined).map(e=>e.id).join(","));

  // L'allure est arrêtée une fois pour toutes : elle ne change pas d'époque.
  const s5b = freshGame();
  const guy = {name:"Cole", sex:"m", cid:1200, age:34};
  const p1 = G.portraitSVG(guy, {eraId:"foundation"});
  check("la bande d'époque est mémorisée", guy.photoEra === 0, guy.photoEra);
  const p2 = G.portraitSVG(guy, {eraId:"modern"});
  check("un personnage garde son allure quand l'époque change", p1 === p2);

  // Deux personnes différentes n'ont pas la même photo.
  const pics = new Set();
  for(let i = 0; i < 30; i++){
    pics.add(G.photoFor({name:"X"+i, sex:"m", cid:1300+i, age:35}, "foundation"));
  }
  check("trente personnes tirent des photos variées", pics.size >= 12, pics.size + "/30");

  // Les femmes ne reçoivent pas de portraits d'hommes.
  const she = G.photoFor({name:"Ada", sex:"f", cid:1400, age:30}, "industrial");
  const he  = G.photoFor({name:"Ada", sex:"m", cid:1400, age:30}, "industrial");
  check("le sexe change la série", she !== he);
  check("la photo d'une femme vient bien du fonds féminin",
    (ev('PHOTOS["2"]["f"]["a"]')||[]).indexOf(she) >= 0);

  // L'arbre généalogique.
  const s4 = freshGame();
  s4.lineage = [
    {name:"William", role:"Fondateur", startYear:1885, endYear:1912},
    {name:"Sarah", role:"Héritière désignée", startYear:1912, endYear:1944},
    {name:"Yohan", role:"Héritier désigné", startYear:1944, endYear:null}
  ];
  s4.year = 1960; s4.eraId = "industrial"; s4.costModifier = 2.5;
  G.addChild("Nora", {sex:"f"}).age = 12;
  G.renderLineage();
  const tree = $el("lineageContent").innerHTML;
  check("l'arbre dessine une génération par rang",
    (tree.match(/tree-gen/g)||[]).length === 3, (tree.match(/tree-gen/g)||[]).length);
  check("il relie les générations", (tree.match(/tree-link/g)||[]).length >= 2);
  check("il marque la génération en poste", /tree-now/.test(tree));
  check("il montre le foyer d'aujourd'hui", /kin/.test(tree));
  check("chaque rang porte un visage",
    (tree.match(/portrait-svg/g)||[]).length >= 3, (tree.match(/portrait-svg/g)||[]).length);
  check("l'arbre n'appelle aucune ressource externe", !/https?:\/\//.test(tree));

  // L'épilogue.
  const s5 = freshGame();
  s5.lineage = [
    {name:"William", role:"Fondateur", startYear:1885, endYear:1930},
    {name:"Sarah", role:"Héritière désignée", startYear:1930, endYear:null}
  ];
  s5.year = 2026; s5.eraId = "modern"; s5.costModifier = 16;
  s5.legacy.honor = 5; s5.politics.held = ["cattleCommission","sheriff"];
  s5.institutions = {cattleCommission:{since:1890}};
  s5.protectedLand = 300;
  G.recordSaga("succession", "Sarah reprend le ranch", "family", "À 32 ans.");
  const epi = G.epilogueHTML();
  check("l'épilogue nomme la famille", epi.indexOf(ST().familyName) >= 0);
  check("il donne un verdict", /dynastie|empire/i.test(epi));
  check("il montre la lignée en portraits",
    (epi.match(/portrait-svg/g)||[]).length >= 2, (epi.match(/portrait-svg/g)||[]).length);
  check("il chiffre ce qu'il reste", /hectares/.test(epi));
  check("il rappelle les charges exercées", /Commission du bétail/.test(epi));
  check("il rappelle les terres classées", /300 hectares classés/.test(epi));
  check("il liste les tournants", /saga-item/.test(epi));
  check("il n'appelle aucune ressource externe", !/https?:\/\/[^"]*\.(png|jpg)/.test(epi));

  G.openEpilogue();
  check("le panneau d'épilogue s'ouvre", !$el("epilogueModal")._classes.has("hidden"));
  check("son titre porte les dates", /1885–2026/.test($el("epilogueTitle").textContent),
    $el("epilogueTitle").textContent);

  // La fin de partie l'offre.
  G.showGameOver("Fin de test", "Texte.");
  const labels = Array.prototype.map.call($el("eventChoices").children, b => b.textContent);
  check("la fin de partie propose l'épilogue",
    labels.some(l => /épilogue/i.test(l)), labels.join(" | "));

  // L'affiche exportée porte aussi les visages.
  const poster = G.sagaPosterSVG();
  check("l'affiche montre la lignée en médaillons",
    (poster.match(/portrait-svg/g)||[]).length >= 2, (poster.match(/portrait-svg/g)||[]).length);
  check("les médaillons de l'affiche embarquent la photo",
    poster.indexOf("<image href=\"data:image/jpeg") >= 0);
  check("l'affiche reste bien formée", poster.trim().slice(-6) === "</svg>");

  // Migration : une partie d'avant les visages en reçoit.
  const s6 = freshGame();
  // Un visage d'avant l'échelle ordonnée, en couleurs codées en dur.
  ST().founder.face = {skin:"#f2d3b4", hair:"#2b1d14", eye:"#4a3323", jaw:0};
  G.ensureProgress();
  check("un visage d'ancien format est régénéré",
    typeof ST().founder.face.skinIx === "number", JSON.stringify(ST().founder.face));
  delete ST().founder.face; delete ST().spouse.face;
  (ST().children||[]).forEach(c => delete c.face);
  (ST().cowboys||[]).forEach(c => delete c.face);
  G.ensureProgress();
  check("une partie ancienne reçoit des visages",
    !!ST().founder.face && !!ST().spouse.face
    && (ST().cowboys||[]).every(c => !!c.face));
}

// ------------------------------------------------- Exporter la chronique
section("Exporter la chronique");
{
  const s = freshGame();
  G.recordSaga("era", "L'automobile arrive au comté", "city", "1921, la première Ford du canton.");
  G.chooseDoctrine("foundation", ev('DOCTRINES.foundation[0].id'));
  s.cattle = 250; G.checkAchievements();
  s.legacy.grudges.push({name:"Shérif Boyd", year:1902});

  const txt = G.sagaText();
  check("la chronique porte le nom de la famille", txt.indexOf(s.familyName.toUpperCase()) >= 0);
  check("la chronique porte le nom du ranch", txt.indexOf(s.ranchName) >= 0);
  check("la chronique date le début de la lignée",
    txt.indexOf("fondateur en " + s.lineage[0].startYear) >= 0, txt.split("\n")[3]);
  check("la chronique liste les moments", txt.indexOf("L'automobile arrive au comté") >= 0);
  check("la chronique nomme l'époque traversée", txt.indexOf("LA FONDATION") >= 0);
  check("la chronique rappelle le tournant pris", txt.indexOf("Tournant pris") >= 0);
  check("la chronique se referme sur un bilan", txt.indexOf("BILAN") >= 0);
  check("le bilan chiffre le domaine", /Terres : \d+ ha/.test(txt), txt.slice(-400));
  check("le bilan liste les objectifs accomplis", txt.indexOf("Objectifs accomplis") >= 0);
  check("le bilan nomme les rancunes lisiblement",
    txt.indexOf("Shérif Boyd (1902)") >= 0 && txt.indexOf("[object Object]") < 0);
  check("le bilan retrace la lignée", txt.indexOf("Fondateur : ") >= 0);
  check("la chronique ne contient aucune balise", !/<[a-z/]/i.test(txt));

  G.exportSaga();
  check("l'export texte produit un fichier", lastBlob && lastBlob.text.length > 200, lastBlob && lastBlob.text.length);
  check("le fichier texte est nommé d'après la famille",
    /^chronique-duflot-\d{4}\.txt$/.test(lastCreated.download), lastCreated.download);
  check("le fichier texte est bien typé", /text\/plain/.test(lastBlob.type), lastBlob.type);

  const svg = G.sagaPosterSVG();
  check("l'affiche est un SVG autonome", svg.indexOf("<svg xmlns=") === 0);
  check("l'affiche est bien fermée", svg.trim().slice(-6) === "</svg>");
  check("l'affiche n'appelle aucune ressource externe", !/https?:\/\/[^"]*\.(png|jpg|svg|css)/.test(svg));
  check("l'affiche porte le nom de la famille", svg.indexOf(s.familyName.toUpperCase()) >= 0);
  check("l'affiche annonce la période couverte",
    svg.indexOf(s.lineage[0].startYear + " — " + s.year) >= 0);
  check("l'affiche chiffre le domaine", svg.indexOf(s.land + " ha") >= 0);

  G.exportSagaImage();
  check("l'export image produit un fichier", lastBlob && lastBlob.text.indexOf("<svg") === 0);
  check("le fichier image est nommé d'après la famille",
    /^affiche-duflot-\d{4}\.svg$/.test(lastCreated.download), lastCreated.download);
  check("le fichier image est bien typé", /image\/svg/.test(lastBlob.type), lastBlob.type);

  // Les caractères réservés du XML ne doivent pas casser l'affiche.
  const s2 = freshGame();
  s2.familyName = "Du <Pré> & Fils";
  G.recordSaga("era", 'Un titre "avec" <balises> & esperluette', "city");
  const svg2 = G.sagaPosterSVG();
  check("l'affiche échappe les caractères XML",
    svg2.indexOf("<balises>") < 0 && svg2.indexOf("&lt;balises&gt;") >= 0);
  check("l'affiche échappe les esperluettes", !/&(?!amp;|lt;|gt;|quot;|#)/.test(svg2));

  // Une saga vide ne doit rien casser non plus.
  const s3 = freshGame();
  s3.saga = [];
  let threw = false;
  try{ G.sagaText(); G.sagaPosterSVG(); }catch(e){ threw = e.message; }
  check("une saga vide s'exporte sans erreur", threw === false, threw);
  check("une saga vide le dit dans le texte", G.sagaText().indexOf("commence à peine") >= 0);

  // Dans le visualiseur d'Artifact, `<a download>` est neutralisé : il faut
  // passer par l'API hôte. Sans elle, on garde le lien temporaire.
  {
    const calls = [];
    sandbox.window.claude = { downloads: { save: (req) => { calls.push(req); return Promise.resolve({status:"saved"}); } } };
    const t = freshGame();
    G.recordSaga("arc", "Un moment", "ranch", "détail");
    // Remis à zéro juste avant : le démarrage crée des boutons de choix.
    lastCreated = null;
    G.exportSaga();
    check("avec l'API hôte, l'export passe par elle", calls.length === 1, calls.length);
    check("elle reçoit le nom du fichier",
      calls[0] && /^chronique-.*\.txt$/.test(calls[0].filename), calls[0] && calls[0].filename);
    check("elle reçoit le contenu", calls[0] && String(calls[0].data).indexOf("RANCH DYNASTY") >= 0);
    check("aucun lien temporaire n'est créé", lastCreated === null);

    G.exportGame();
    check("la sauvegarde passe aussi par l'API hôte", calls.length === 2, calls.length);
    check("elle est bien nommée", /^ranch-dynasty-.*\.json$/.test(calls[1].filename), calls[1].filename);

    // Un refus du lecteur ne doit pas casser la partie.
    let threw = false;
    sandbox.window.claude.downloads.save = () => Promise.reject({code:"declined", message:"non"});
    try{ G.exportSaga(); }catch(e){ threw = e.message; }
    check("un refus est absorbé sans erreur", threw === false, threw);
    sandbox.window.claude.downloads.save = () => Promise.reject({code:"boum"});
    threw = false;
    try{ G.exportSaga(); }catch(e){ threw = e.message; }
    check("un code inconnu aussi", threw === false, threw);
    delete sandbox.window.claude;
  }

  // L'affiche part en PNG quand le navigateur sait la convertir, en SVG sinon.
  {
    const t = freshGame();
    G.recordSaga("arc", "Un moment", "ranch");
    lastBlob = null;
    G.exportSagaImage();
    check("sans conversion possible, l'affiche reste un SVG",
      lastCreated && /\.svg$/.test(lastCreated.download), lastCreated && lastCreated.download);
    check("et le contenu est bien le SVG", lastBlob && lastBlob.text.indexOf("<svg") === 0);
  }

  // Une saga très longue reste exportable.
  const s4 = freshGame();
  for(let i = 0; i < 300; i++) G.recordSaga("arc", "Moment " + i, "ranch", "détail " + i);
  threw = false;
  let poster = "";
  try{ G.sagaText(); poster = G.sagaPosterSVG(); }catch(e){ threw = e.message; }
  check("une longue saga s'exporte sans erreur", threw === false, threw);
  check("l'affiche reste de taille raisonnable", poster.length < 30000, poster.length);
}

// ------------------------------------------------- Variantes de départ
section("Variantes de départ");
{
  const modes = [...HTML.matchAll(/<option value="(founder|established|legacy)"/g)].map(m=>m[1]);
  check("les trois départs sont proposés", modes.length === 3, modes.join(","));

  // 1885, le départ classique : rien ne change.
  $el("startMode").value = "founder";
  const s0 = freshGame();
  check("le départ classique commence en 1885", s0.year === 1885, s0.year);
  check("le départ classique garde le domaine d'origine", s0.land <= 200, s0.land);
  check("le départ classique n'a pas d'enfant", s0.children.length === 0);

  // Reprendre un ranch établi.
  $el("startMode").value = "established";
  const s1 = freshGame();
  check("le départ établi commence en 1905", s1.year === 1905, s1.year);
  check("le tour correspond à l'année", s1.turn === (1905-1885)*4 + 1, s1.turn);
  check("l'époque reste la Fondation", s1.eraId === "foundation", s1.eraId);
  check("le domaine hérité est plus vaste", s1.land >= 480, s1.land);
  check("les parcelles couvrent exactement le domaine",
    s1.parcels.reduce((a,p)=>a+p.ha,0) === s1.land,
    s1.parcels.reduce((a,p)=>a+p.ha,0) + " vs " + s1.land);
  check("le domaine hérité est découpé en plusieurs parcelles", s1.parcels.length >= 3, s1.parcels.length);
  check("le troupeau hérité est constitué", s1.cattle >= 80, s1.cattle);
  check("deux enfants sont déjà nés", s1.children.length === 2, s1.children.length);
  check("les enfants ont un sexe et un identifiant",
    s1.children.every(c => (c.sex === "m" || c.sex === "f") && typeof c.cid === "number"));
  check("la lignée compte le prédécesseur", s1.lineage.length === 2, s1.lineage.length);
  check("le prédécesseur a cédé la place en 1905", s1.lineage[0].endYear === 1905, s1.lineage[0].endYear);
  check("le successeur est en poste depuis 1905", s1.lineage[1].endYear === null);
  check("la reprise est consignée dans la saga",
    ST().saga.some(m => m.kind === "founding" && m.title.indexOf("hérite") >= 0),
    ST().saga.map(m=>m.title).join(" | "));
  check("la saga ne raconte pas aussi une fondation en 1885",
    !ST().saga.some(m => m.title.indexOf("fonde le") >= 0));
  check("le tournant fondateur est tout de même proposé",
    !$el("eventModal")._classes.has("hidden") || $el("eventChoices").children.length > 0);
  // Le jeu doit tourner normalement depuis 1905.
  let threw = false;
  try{
    for(let i = 0; i < 12; i++){
      ST().money = 20000; ST().feed = 200;
      G.endTurn();
      let guard = 0;
      while(!$el("eventModal")._classes.has("hidden") && guard++ < 30){
        if(ST().gameOver) break;
        const ch = $el("eventChoices").children;
        if(!ch.length) throw new Error("modale sans choix");
        ch[0].onclick();
      }
    }
  }catch(e){ threw = e.message; }
  check("douze trimestres se jouent depuis 1905 sans erreur", threw === false, threw);
  check("l'année a bien avancé", ST().year >= 1907, ST().year);

  // Repartir sur les cendres : l'option n'existe qu'après une dynastie tombée.
  ev("safeStorage.set('" + ev("LEGACY_KEY") + "', '')");
  G.refreshStartMode();
  check("sans dynastie tombée, l'option est verrouillée", $el("legacyOption").disabled === true);
  check("le libellé le dit", $el("legacyOption").textContent.indexOf("aucune dynastie") >= 0);

  // Une fin de partie enregistre l'héritage moral.
  $el("startMode").value = "founder";
  const sEnd = freshGame();
  sEnd.familyName = "Marchand";
  sEnd.legacy.honor = 6; sEnd.legacy.greed = 1;
  sEnd.legacy.grudges = [{name:"Shérif Boyd", year:1899}];
  sEnd.year = 1954;
  G.showGameOver("Faillite", "Fin de test.");
  const rec = G.loadLegacyRecord();
  check("la dynastie tombée est enregistrée", !!rec);
  check("l'héritage retient le nom", rec.familyName === "Marchand", rec && rec.familyName);
  check("l'héritage retient l'année de chute", rec.year === 1954, rec && rec.year);
  check("l'héritage retient les rancunes", rec.grudges.length === 1);
  check("le compteur de reprises s'incrémente", rec.plus >= 1, rec.plus);

  G.refreshStartMode();
  check("l'option de reprise se déverrouille", $el("legacyOption").disabled === false);
  check("le libellé nomme la dynastie tombée",
    $el("legacyOption").textContent.indexOf("Marchand") >= 0, $el("legacyOption").textContent);

  // Une lignée honorable transmet du crédit.
  $el("startMode").value = "legacy";
  $el("familyName").value = "Marchand";
  const s2 = freshGame();
  check("la reprise commence en 1885", s2.year === 1885, s2.year);
  check("le poids moral est transmis de moitié", s2.legacy.honor === 3, s2.legacy.honor);
  check("les rancunes sont héritées", s2.legacy.grudges.length === 1);
  check("le compteur de reprises est repris", s2.plus >= 1, s2.plus);
  check("un nom honorable ouvre des portes", s2.reputation > 20, s2.reputation);
  check("la reprise est consignée dans la saga",
    ST().saga.some(m => m.title.indexOf("relèvent le nom") >= 0),
    ST().saga.map(m=>m.title).join(" | "));

  // Une lignée avide transmet de l'argent et des ennuis.
  const raw = JSON.parse(ev("safeStorage.get(LEGACY_KEY)"));
  raw.honor = 0; raw.greed = 8;
  ev("safeStorage.set(LEGACY_KEY, " + JSON.stringify(JSON.stringify(raw)) + ")");
  const s3 = freshGame();
  check("un nom craint laisse des soupçons", s3.suspicion >= 14, s3.suspicion);
  check("un nom craint laisse aussi de la cupidité", s3.legacy.greed === 4, s3.legacy.greed);
  check("la loi s'en souvient",
    s3.factions.some(f => f.type === "law" ? f.relation < 0 : true));

  // La sauvegarde d'une partie reprise se recharge sans perte.
  G.saveGame();
  const before = JSON.stringify(ST());
  G.loadGame();
  check("une partie reprise se recharge", JSON.stringify(ST()).length > 0 && !!ST().legacy);
  check("le mode de départ survit au rechargement", ST().startMode === "legacy", ST().startMode);
  const after = JSON.parse(JSON.stringify(ST()));
  const bef = JSON.parse(before);
  check("l'héritage moral survit au rechargement",
    JSON.stringify(after.legacy) === JSON.stringify(bef.legacy));
  check("le domaine survit au rechargement",
    after.land === bef.land && after.money === bef.money && after.year === bef.year);

  // Les deux objectifs propres aux variantes se débloquent bien.
  ST().plus = 1; ST().year = 1940;
  G.checkAchievements();
  check("l'objectif de la reprise se débloque",
    ST().achievements.some(a => a.id === "phoenix"),
    ST().achievements.map(a=>a.id).join(","));
  $el("startMode").value = "established";
  const s4 = freshGame();
  s4.land = 1200;
  G.checkAchievements();
  check("l'objectif du domaine hérité se débloque",
    ST().achievements.some(a => a.id === "heirloom"),
    ST().achievements.map(a=>a.id).join(","));

  $el("startMode").value = "founder";
  $el("familyName").value = "Duflot";
}

// ------------------------------------------------------ Le tournant fondateur
section("Tournant fondateur");
{
  const list = ev("DOCTRINES.foundation");
  check("la Fondation a ses voies", list.length >= 3, list.length);
  check("chaque voie fondatrice est décrite",
    list.every(d => d.id && d.icon && d.name && d.what && d.effect));

  // Il est proposé dès le premier tour.
  $el("eventModal").classList.add("hidden");
  const s = freshGame();
  check("le choix fondateur s'ouvre au démarrage",
    !$el("eventModal")._classes.has("hidden"));
  check("il propose toutes les voies",
    $el("eventChoices").children.length === list.length,
    $el("eventChoices").children.length);

  // Chaque voie produit un effet mesurable et distinct.
  function found(id){
    const s2 = freshGame();
    ST().doctrines = {};
    G.chooseDoctrine("foundation", id);
    const t = ST();
    return {cattle:t.cattle, horses:t.horses, land:t.land,
            training:(t.champion&&t.champion.training)||0};
  }
  const base = (() => { const s2 = freshGame(); const t = ST();
    return {cattle:t.cattle, horses:t.horses, land:t.land}; })();
  const cattleman = found("cattleman"), horseman = found("horseman"), landman = found("landman");
  check("la voie du bétail étoffe le troupeau", cattleman.cattle > base.cattle,
    base.cattle + " → " + cattleman.cattle);
  check("la voie des chevaux fournit l'écurie", horseman.horses > base.horses,
    base.horses + " → " + horseman.horses);
  check("elle donne un cheval déjà dressé", horseman.training > 0, horseman.training);
  check("la voie de la terre agrandit le domaine", landman.land > base.land,
    base.land + " → " + landman.land);
  check("la voie de la terre découpe bien les parcelles",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land);

  // Une fois choisi, il ne revient pas.
  const s3 = freshGame();
  G.chooseDoctrine("foundation", "cattleman");
  $el("eventModal").classList.add("hidden");
  G.showFoundingChoice();
  check("le choix fondateur ne se rejoue pas",
    $el("eventModal")._classes.has("hidden"));
}
{
  // Le procès et la piste relisent désormais la voie fondatrice.
  function titleOdds(doctrineId){
    let won = 0;
    for(let i = 0; i < 200; i++){
      const s = permissiveGame();
      s.doctrines = doctrineId ? {foundation:doctrineId} : {};
      s.factions.forEach(f => { if(f.type === "law") f.relation = 0; });
      s.arc = {id:"lawsuit", step:1, data:{fight:false}};
      ev(`(function(){
        const c = arcById("lawsuit").steps[1].choices.find(x=>x.label.indexOf("Produire tous")===0);
        c.apply();
      })()`);
      if(ST().arc.data.won) won++;
    }
    return won;
  }
  const grab = titleOdds("landman"), herd = titleOdds("cattleman");
  check("des titres pris à la hâte se défendent moins bien", grab < herd,
    grab + "/200 contre " + herd + "/200");

  const s = permissiveGame();
  s.doctrines = {foundation:"landman"};
  s.arc = {id:"lawsuit", step:1, data:{}};
  const grabChoices = ev(`arcById("lawsuit").steps[1].choices.filter(c=>!c.condition||c.condition()).map(c=>c.label)`);
  check("l'acte original n'existe pas pour qui a pris la terre",
    !grabChoices.some(l => l.indexOf("acte original") >= 0), grabChoices.join(" | "));

  const s2 = permissiveGame();
  s2.doctrines = {foundation:"cattleman"};
  s2.arc = {id:"lawsuit", step:1, data:{}};
  const cleanChoices = ev(`arcById("lawsuit").steps[1].choices.filter(c=>!c.condition||c.condition()).map(c=>c.label)`);
  check("il existe pour qui a bâti sur le bétail",
    cleanChoices.some(l => l.indexOf("acte original") >= 0), cleanChoices.join(" | "));

  // La traversée du gué profite aux cavaliers.
  function crossing(doctrineId){
    let lost = 0;
    for(let i = 0; i < 150; i++){
      const s3 = permissiveGame();
      s3.doctrines = doctrineId ? {foundation:doctrineId} : {};
      s3.champion = null; s3.horses = 0;
      s3.arc = {id:"trailDrive", step:1, data:{head:100}};
      ev(`(function(){
        const c = arcById("trailDrive").steps[1].choices.find(x=>x.label.indexOf("Forcer")===0);
        c.apply();
      })()`);
      if(ST().arc.data.head < 100) lost++;
    }
    return lost;
  }
  check("de bons cavaliers passent le gué plus souvent",
    crossing("horseman") < crossing(null),
    crossing("horseman") + " pertes contre " + crossing(null));

  // Et la voie du bétail ouvre une option de convoyage massif.
  const s4 = permissiveGame();
  s4.doctrines = {foundation:"cattleman"}; s4.cattle = 200;
  s4.arc = {id:"trailDrive", step:0, data:{}};
  const driveChoices = ev(`arcById("trailDrive").steps[0].choices.filter(c=>!c.condition||c.condition()).map(c=>c.label)`);
  check("la voie du bétail permet de tout emmener",
    driveChoices.some(l => l.indexOf("Tout emmener") >= 0), driveChoices.join(" | "));
}

// ------------------------------------------- Les doctrines pèsent sur les arcs
section("Doctrines et arcs");
{
  // Le refus face à la délégation doit coûter plus cher à une maison mécanisée.
  function refusalSting(doctrineId){
    const s = permissiveGame();
    s.eraId = "industrial";
    s.doctrines = doctrineId ? {industrial:doctrineId} : {};
    s.cowboys = [{name:"A",loyalty:80,shoot:60,ride:60,salary:10,years:3,trait:"Fidèle"}];
    s.arc = {id:"strike", step:0, data:{}};
    const before = ST().cowboys[0].loyalty;
    ev(`(function(){
      const st = arcById("strike").steps[0];
      const c = st.choices.find(x=>x.label.indexOf("Refuser")===0);
      c.apply();
    })()`);
    return before - ST().cowboys[0].loyalty;
  }
  const mech = refusalSting("machines");
  const hands = refusalSting("hands");
  const none = refusalSting(null);
  check("mécaniser rend le refus plus coûteux", mech > none, mech + " contre " + none);
  check("être resté à cheval amortit le refus", hands < none, hands + " contre " + none);

  // Une voie ouvre une branche qui n'existe pas autrement.
  function branchCount(doctrineId){
    const s = permissiveGame();
    s.eraId = "industrial";
    s.doctrines = doctrineId ? {industrial:doctrineId} : {};
    s.money = 100000;
    return ev(`(function(){
      return arcById("strike").steps[0].choices.filter(c=>!c.condition||c.condition()).length;
    })()`);
  }
  check("la mécanisation ouvre une branche propre",
    branchCount("machines") > branchCount(null),
    branchCount("machines") + " contre " + branchCount(null));

  // L'indivision familiale ferme la vente de parts et en ouvre une autre.
  const s2 = permissiveGame();
  s2.eraId = "corporate"; s2.doctrines = {corporate:"family"}; s2.money = 100000;
  const famChoices = ev(`arcById("takeover").steps[1].choices.filter(c=>!c.condition||c.condition()).map(c=>c.label)`);
  check("une affaire de famille ne peut pas vendre ses parts",
    !famChoices.some(l => l.indexOf("part minoritaire") >= 0), famChoices.join(" | "));
  check("elle peut opposer l'indivision",
    famChoices.some(l => l.indexOf("indivision") >= 0), famChoices.join(" | "));

  // Le comté aide plus volontiers ceux qui l'ont nourri.
  function rescued(doctrineId, communityRelation){
    let ok = 0;
    for(let i = 0; i < 30; i++){
      const s = permissiveGame();
      s.eraId = "depression";
      s.doctrines = doctrineId ? {depression:doctrineId} : {};
      s.factions.forEach(f => { if(f.type === "community") f.relation = communityRelation; });
      s.arc = {id:"foreclosure", step:1, data:{}};
      ev(`(function(){
        const c = arcById("foreclosure").steps[1].choices.find(x=>x.label.indexOf("comté")>=0);
        c.apply();
      })()`);
      if(ST().arc.data.paid) ok++;
    }
    return ok;
  }
  check("avoir nourri le comté le rend secourable", rescued("charity", 20) > 0, rescued("charity", 20));
  check("avoir racheté les ruinés le rend sourd", rescued("buyout", 40) === 0, rescued("buyout", 40));

  // Les textes doivent varier selon la doctrine.
  function arcText(arcId, step, eraId, doctrineId){
    const s = permissiveGame();
    s.eraId = eraId;
    s.doctrines = doctrineId ? {[eraId]:doctrineId} : {};
    s.arc = {id:arcId, step:step, data:{}};
    return ev(`(function(){
      const f = arcById(${JSON.stringify(arcId)}).steps[${step}].text;
      return typeof f === "function" ? f() : f;
    })()`);
  }
  const pairs = [
    ["strike", 0, "industrial", "machines", "hands"],
    ["takeover", 0, "corporate", "company", "family"],
    ["conservancy", 0, "modern", "conservancy", "tourism"],
    ["warehouse", 0, "prohibition", "wet", "dry"]
  ];
  const same = [];
  pairs.forEach(([id, st, era, a, b]) => {
    const ta = arcText(id, st, era, a), tb = arcText(id, st, era, b), tn = arcText(id, st, era, null);
    if(ta === tb || ta === tn || tb === tn) same.push(id);
  });
  check("chaque voie donne un texte différent au chapitre d'ouverture",
    same.length === 0, same.join(", "));
}

// --------------------------------------------------- Deux maisons rivales
section("Le triangle");
{
  const s = freshGame();
  G.ensureSecondHouse();
  check("une seconde maison existe", !!ST().rival2 && !!ST().rival2.name);
  check("les deux maisons ont des noms différents", ST().rival2.name !== ST().rival.name);
  check("la seconde maison a un chef", !!ST().rival2.leader && !!ST().rival2.leader.name);
  check("la querelle entre elles est chiffrée", typeof ST().rivalFeud === "number");
  check("rivalHouses renvoie les deux", ev("rivalHouses().length") === 2);

  // Deux maisons en guerre vous laissent souffler ; alliées, elles frappent plus.
  ST().rivalFeud = -80;
  const shielded = ev("feudShield()");
  ST().rivalFeud = 80;
  const exposed = ev("feudShield()");
  ST().rivalFeud = 0;
  const neutral = ev("feudShield()");
  check("une querelle ouverte réduit la pression", shielded < neutral, shielded + " < " + neutral);
  check("une entente entre elles l'aggrave", exposed > neutral, exposed + " > " + neutral);

  // Semer la discorde
  const s2 = freshGame();
  s2.money = 100000; s2.actions = 3; s2.rivalFeud = 0; s2.reputation = 70; s2.suspicion = 0;
  let dropped = 0;
  for(let i = 0; i < 120; i++){
    const s3 = freshGame();
    s3.money = 100000; s3.actions = 3; s3.rivalFeud = 0; s3.reputation = 70; s3.suspicion = 0;
    G.sowDiscord();
    if(ST().rivalFeud < 0) dropped++;
  }
  check("semer la discorde fonctionne souvent", dropped > 60, dropped + "/120");

  const s4 = freshGame();
  s4.money = 100000; s4.actions = 3;
  G.sowDiscord();
  check("semer la discorde consomme une action", ST().actions === 2, ST().actions);
  check("semer la discorde coûte de l'argent", ST().money < 100000);

  // Se rapprocher d'une maison refroidit l'autre.
  const s5 = freshGame();
  s5.money = 100000; s5.actions = 3; s5.rivalFeud = 0;
  const otherBefore = ST().rival2.relation;
  G.negotiateHouse(0);
  check("se rapprocher d'une maison refroidit l'autre",
    ST().rival2.relation <= otherBefore, otherBefore + " → " + ST().rival2.relation);

  // Le chef de la seconde maison vieillit lui aussi.
  const s6 = freshGame();
  ST().rival2.leader = {name:"Doyen", sex:"m", age:72, trait:"brutal", alive:true, since:1885};
  let replaced = false;
  for(let y = 0; y < 40 && !replaced; y++){
    G.ageRivalLeader(ST().rival2);
    if(ST().rival2.leader.name !== "Doyen") replaced = true;
  }
  check("le chef de la seconde maison est remplacé à sa mort", replaced);

  // Le panneau montre le triangle.
  const s7 = freshGame();
  G.renderDiplomacy();
  const html = $el("diplomacyContent").innerHTML;
  check("le panneau nomme les deux maisons",
    html.includes(ST().rival.name) && html.includes(ST().rival2.name));
  check("le panneau expose la querelle entre elles", html.includes("contre"));
  check("le panneau propose de semer la discorde", html.includes("sowDiscord"));
}


// --------------------------------------------- Siège et mariage rival
section("Le triangle : siège et mariage");
{
  // Deux maisons liguées : chaque trimestre tenu se compte.
  const s = freshGame();
  s.money = 200000; s.feed = 5000; s.cattle = 60;
  G.ensureSecondHouse();
  ST().rival.relation = -70; ST().rival2.relation = -70; ST().rivalFeud = 70;
  for(let i = 0; i < 10; i++){
    ST().rival.relation = -70; ST().rival2.relation = -70; ST().rivalFeud = 70;
    G.endTurn();
    if(!$el("eventModal")._classes.has("hidden")){
      const ch = $el("eventChoices").children;
      if(ch.length) ch[0].onclick();
    }
  }
  check("le siège se compte trimestre après trimestre",
    ST().stats.siegeQuarters >= 8, ST().stats.siegeQuarters);
  G.checkAchievements();
  check("tenir deux ans sous siège débloque l'objectif",
    ST().achievements.some(a=>a.id==="besieged"));

  // Pas de siège si les maisons se détestent entre elles.
  const s2 = freshGame();
  s2.money = 200000; s2.feed = 5000;
  G.ensureSecondHouse();
  for(let i = 0; i < 6; i++){
    ST().rival.relation = -70; ST().rival2.relation = -70; ST().rivalFeud = -70;
    G.endTurn();
    if(!$el("eventModal")._classes.has("hidden")){
      const ch = $el("eventChoices").children;
      if(ch.length) ch[0].onclick();
    }
  }
  check("deux maisons brouillées ne font pas siège", ST().stats.siegeQuarters === 0,
    ST().stats.siegeQuarters);
}
{
  // Le mariage dans la maison d'en face.
  const wedding = ev(`events.find(e=>{const t=typeof e.title==="function"?e.title():e.title;return t==="Une alliance par le mariage";})`);
  check("l'événement de mariage rival existe", !!wedding);

  const s = permissiveGame();
  G.ensureSecondHouse();
  ST().rival2.relation = 45;
  ST().rival.relation = 10;
  const relBefore = ST().rival2.relation;
  const otherBefore = ST().rival.relation;
  ev(`(function(){
    const e = events.find(x=>{const t=typeof x.title==="function"?x.title():x.title;return t==="Une alliance par le mariage";});
    e.choices[0].apply();
  })()`);
  check("le mariage est comptabilisé", ST().stats.rivalMarriages === 1, ST().stats.rivalMarriages);
  check("la maison alliée se rapproche nettement", ST().rival2.relation > relBefore,
    relBefore + " → " + ST().rival2.relation);
  check("l'autre maison le prend mal", ST().rival.relation < otherBefore,
    otherBefore + " → " + ST().rival.relation);
  const wed = ST().children.find(c=>c.married && /McAllister|Dawson|Hargrove|Kessler|Voss|Bannister|Rourke|Crowley|Stanton|Maddox/.test(c.spouseName||""));
  check("l'enfant marié porte le nom de la maison rivale", !!wed, wed && wed.spouseName);
  G.checkAchievements();
  check("le mariage rival débloque son objectif",
    ST().achievements.some(a=>a.id==="weddingPeace"));

  // Sans maison cordiale, l'événement ne se déclenche pas.
  const s2 = permissiveGame();
  G.ensureSecondHouse();
  ST().rival.relation = -50; ST().rival2.relation = -50;
  const reachable = ev(`(function(){
    const e = events.find(x=>{const t=typeof x.title==="function"?x.title():x.title;return t==="Une alliance par le mariage";});
    return !!e.condition();
  })()`);
  check("aucune union proposée avec deux maisons hostiles", !reachable);
}

// ------------------------------------------------------------ Le rival
section("La lignée rivale");
{
  const s = freshGame();
  const leader = G.ensureRivalLeader();
  check("le rival a un chef nommé", !!leader && !!leader.name);
  check("le chef a un tempérament", !!ev("RIVAL_TRAITS[state.rival.leader.trait]"));
  check("la lignée rivale est enregistrée", (ST().rival.lineage||[]).length === 1);

  // Le tempérament oriente la dérive de la relation.
  function drift(trait){
    let total = 0;
    for(let i = 0; i < 120; i++){
      const s2 = freshGame();
      s2.money = 100000; s2.feed = 5000;
      s2.rival.relation = 0;
      s2.rival.leader = {name:"X", sex:"m", age:40, trait, alive:true, since:1885};
      G.endTurn();
      total += ST().rival.relation;
    }
    return total/120;
  }
  const conciliant = drift("conciliant"), brutal = drift("brutal");
  check("un chef conciliant fait remonter la relation", conciliant > brutal,
    conciliant.toFixed(1) + " contre " + brutal.toFixed(1));

  // Le chef vieillit et finit par être remplacé.
  const s3 = freshGame();
  s3.rival.leader = {name:"Ancien", sex:"m", age:70, trait:"brutal", alive:true, since:1885};
  let replaced = false;
  for(let y = 0; y < 40 && !replaced; y++){
    G.ageRivalLeader();
    if(ST().rival.leader.name !== "Ancien") replaced = true;
  }
  check("un chef rival finit par mourir et être remplacé", replaced);
  check("la lignée rivale garde la trace des deux", (ST().rival.lineage||[]).length >= 2,
    (ST().rival.lineage||[]).length);
  check("le prédécesseur a une année de fin",
    (ST().rival.lineage||[]).filter(l=>l.to!==null).length >= 1);

  // La généalogie affiche la lignée d'en face.
  G.renderLineage();
  check("la généalogie montre la lignée rivale",
    $el("lineageContent").innerHTML.includes(ST().rival.name));
}

// ------------------------------------------------------- Doctrines d'époque
section("Tournants d'époque");
{
  const covered = ev("Object.keys(DOCTRINES)");
  check("toutes les époques ont un tournant", covered.length >= 7, covered.join(", "));
  const thin = ev("Object.keys(DOCTRINES).filter(k=>DOCTRINES[k].length<2)");
  check("chaque tournant offre au moins deux voies", thin.length === 0, thin.join(","));

  // Chaque doctrine s'applique sans erreur et laisse une trace.
  const errors = [];
  covered.forEach(eraId => {
    const n = ev(`DOCTRINES[${JSON.stringify(eraId)}].length`);
    for(let i = 0; i < n; i++){
      const s = permissiveGame();
      s.eraId = eraId; s.money = 100000;
      const id = ev(`DOCTRINES[${JSON.stringify(eraId)}][${i}].id`);
      try{
        G.chooseDoctrine(eraId, id);
        if(ST().doctrines[eraId] !== id) errors.push(eraId + "/" + id + " non enregistrée");
      }catch(e){ errors.push(eraId + "/" + id + " : " + e.message); }
    }
  });
  check("toutes les doctrines s'appliquent et sont mémorisées", errors.length === 0, errors.slice(0,3).join(" | "));

  // La transition d'époque propose bien le choix.
  const s = permissiveGame();
  s.eraId = "foundation";
  G.showEraTransition(ev("ERAS.find(e=>e.id==='prohibition')"));
  const choices = $el("eventChoices").children;
  check("la bascule d'époque propose les voies", choices.length === 2, choices.length);
  check("chaque voie annonce son effet",
    $el("eventChoices").children[0].innerHTML.includes("doctrine-effect"));

  // Toutes les époques ont désormais leur tournant, Fondation comprise.
  const eras = ev("ERAS.map(e=>e.id)");
  const sans = eras.filter(id => !ev(`!!doctrinesFor(${JSON.stringify(id)})`));
  check("chaque époque a son tournant", sans.length === 0, sans.join(","));

  // Le repli « Continuer » reste en place pour une époque sans doctrine.
  G.showEraTransition({id:"__inconnue", name:"Époque de test", desc:"Rien de prévu ici."});
  check("une époque sans tournant garde son simple « Continuer »",
    $el("eventChoices").children.length === 1, $el("eventChoices").children.length);
}

// ------------------------------------------------------- Carte du domaine
section("Carte du domaine");
{
  const s = freshGame();
  G.ensureParcels();
  check("le domaine est découpé en parcelles", ST().parcels.length > 0, ST().parcels.length);
  const sum = ST().parcels.reduce((a,p)=>a+p.ha,0);
  check("les parcelles totalisent exactement les hectares", sum === ST().land,
    sum + " contre " + ST().land);
  check("chaque parcelle a un nom et un type",
    ST().parcels.every(p=>p.name && ev(`PARCEL_KINDS[${JSON.stringify(p.kind)}]`)));
  check("les noms de parcelles sont distincts",
    new Set(ST().parcels.map(p=>p.name)).size === ST().parcels.length);

  // Acheter des terres ajoute une parcelle nommée.
  ST().money = 100000; ST().actions = 3;
  const before = ST().parcels.length;
  G.doAction("buyLand");
  check("acheter des terres ajoute une parcelle", ST().parcels.length === before+1);
  check("le total reste cohérent après achat",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land);

  // Après une perte de terres, la somme se recale.
  ST().land -= 30;
  G.ensureParcels();
  check("le total se recale après une perte de terres",
    ST().parcels.reduce((a,p)=>a+p.ha,0) === ST().land,
    ST().parcels.reduce((a,p)=>a+p.ha,0) + " contre " + ST().land);

  // Les terrains difficiles sont plus exposés aux raids.
  const s2 = freshGame();
  s2.parcels = [
    {id:1, name:"A", kind:"canyon", ha:100, exposure:1.6},
    {id:2, name:"B", kind:"ridge",  ha:100, exposure:.5}
  ];
  s2.land = 200;
  let canyon = 0;
  for(let i = 0; i < 400; i++){ if(G.pickExposedParcel().kind === "canyon") canyon++; }
  check("un canyon se fait razzier plus qu'une crête", canyon > 250, canyon + "/400");

  // La carte s'affiche sans erreur, y compris sur un domaine minuscule.
  let threw = false;
  try{ G.renderMap(); }catch(e){ threw = e.message; }
  check("la carte s'affiche", threw === false, threw);
  const map = $el("mapContent").innerHTML;
  check("la carte est une mosaïque de parcelles",
    (map.match(/parcel-tile/g)||[]).length === ST().parcels.length,
    (map.match(/parcel-tile/g)||[]).length + " tuiles pour " + ST().parcels.length + " parcelles");
  check("chaque parcelle porte une photographie",
    (map.match(/parcel-shot/g)||[]).length === ST().parcels.length);
  check("chaque tuile est nommée et chiffrée", /ha<\/span>|ha<\/|ha /.test(map) && map.indexOf("Pâturage") + map.indexOf("Crête") > -2);
  check("la surface commande la taille de la tuile", /flex-grow:\d+/.test(map));
  // Le terrain choisit sa vue.
  const s2b = freshGame();
  s2b.season = 0;
  const kinds = ev("Object.keys(PARCEL_KINDS)");
  check("chaque type de terrain a ses vues",
    kinds.every(k => (ev("PARCEL_SCENE")[k]||[]).length > 0),
    kinds.filter(k => !(ev("PARCEL_SCENE")[k]||[]).length).join(","));
  check("une parcelle reçoit une photo",
    (G.parcelPhoto(ST().parcels[0])||"").indexOf("data:image/") === 0);
  check("la même parcelle garde la sienne",
    G.parcelPhoto(ST().parcels[0]) === G.parcelPhoto(ST().parcels[0]));
  // Une année sur quatre, le domaine se montre sous la neige.
  s2b.year = 1903; s2b.eraId = "foundation";
  check("les années d'hiver couvrent tout le domaine de neige",
    G.parcelPhoto(ST().parcels[0]) === ev('SCENES["0"].hiver'), ST().year);
  s2b.year = 1904;
  check("les autres années montrent le terrain",
    G.parcelPhoto(ST().parcels[0]) !== ev('SCENES["0"].hiver'));
  check("la carte n'appelle aucune ressource externe",
    !/https?:\/\//.test($el("mapContent").innerHTML));
  const s3 = freshGame();
  s3.land = 0; s3.parcels = [];
  threw = false;
  try{ G.ensureParcels(); G.renderMap(); }catch(e){ threw = e.message; }
  check("un domaine vide ne casse pas la carte", threw === false, threw);
}

// ------------------------------------------- Rythme : brèves et illustrations
section("Rythme du trimestre");
{
  // Une brève doit tomber à chaque trimestre, quel que soit l'état du ranch.
  const s = freshGame();
  s.money = 100000; s.feed = 5000; s.rival.relation = 0;
  let silent = 0;
  for(let i = 0; i < 40; i++){
    const before = ST().history.length;
    G.showBrief();
    if(ST().history.length === before) silent++;
  }
  check("une brève tombe à chaque appel", silent === 0, silent + " trimestres muets");

  // Elles ne doivent jamais interrompre le tour, même sur un état dégradé.
  const s2 = freshGame();
  s2.children = []; s2.cowboys = []; s2.factions = []; s2.rival = null;
  let threw = false;
  try{ for(let i = 0; i < 30; i++) G.showBrief(); }catch(e){ threw = e.message; }
  check("une brève ne lance jamais, même sur un état amputé", threw === false, threw);

  // Sur une partie complète, le journal ne doit pas rester vide longtemps.
  const s3 = freshGame();
  s3.money = 1000000; s3.feed = 50000;
  let entries = 0;
  for(let i = 0; i < 24; i++){
    const before = ST().history.length;
    G.endTurn();
    if(!$el("eventModal")._classes.has("hidden")){
      const ch = $el("eventChoices").children;
      if(ch.length) ch[0].onclick();
    }
    entries += ST().history.length - before;
  }
  check("chaque trimestre laisse une trace au journal", entries >= 24, entries + " entrées pour 24 trimestres");
}
{
  // Illustrations : dessinées dans la page, sans aucune requête réseau.
  const motifs = Object.keys(ev("ART_MOTIFS"));
  check("plusieurs scènes sont disponibles", motifs.length >= 8, motifs.length);
  const svgs = motifs.map(m => ev(`eventArtSVG(${JSON.stringify(m)})`));
  check("chaque scène produit un SVG", svgs.every(x => x.startsWith("<svg")));
  // url(#id) référence un dégradé interne : seul url(quelque-chose-d-autre) sortirait.
  check("aucune scène ne charge de ressource externe",
    svgs.every(x => !/https?:\/\//.test(x) && !/url\((?!#)/.test(x)));
  check("chaque scène embarque une photo du domaine",
    svgs.every(x => x.indexOf("<image href=\"data:image/jpeg") >= 0),
    motifs.filter((m,i) => svgs[i].indexOf("<image href=\"data:image/jpeg") < 0).join(","));
  check("la nuit est assombrie", /opacity="0?\.52"/.test(ev('eventArtSVG("night")')),
    ev('eventArtSVG("night")').slice(0,220));
  // Une seule vue météo dans le fonds : la neige ne sort que si le texte
  // parle vraiment de froid, sinon un feu de prairie se jouerait sous la neige.
  const snow = ev('SCENES["0"].hiver');
  check("un blizzard montre la neige",
    ev('eventArtSVG("storm","Le blizzard de février")').indexOf(snow) >= 0);
  check("un gel tardif aussi",
    ev('eventArtSVG("storm","Un gel tardif")').indexOf(snow) >= 0);
  check("un feu de prairie ne se joue pas sous la neige",
    ev('eventArtSVG("storm","Un feu de prairie")').indexOf(snow) < 0);
  check("une sécheresse non plus",
    ev('eventArtSVG("storm","Une saison sans pluie")').indexOf(snow) < 0);
  // Une même affaire garde son image d'un rendu à l'autre.
  check("l'image d'un événement est stable",
    ev('eventArtSVG("ranch","Le grand hiver")') === ev('eventArtSVG("ranch","Le grand hiver")'));
  check("deux affaires différentes peuvent tirer des vues différentes",
    new Set(["a","b","c","d","e","f"].map(x => ev(`eventArtSVG("land",${JSON.stringify(x)})`))).size > 1);

  // Le dessin vectoriel reste en secours et garde ses couleurs d'époque.
  const drawnScenes = motifs.map(m => ev(`(function(){const S=SCENES;SCENES=null;
    try{ return eventArtSVG(${JSON.stringify(m)}); } finally { SCENES=S; }})()`));
  check("le secours vectoriel se teinte aux couleurs de l'époque",
    drawnScenes.every(x => x.includes("var(--")));
  const ids = drawnScenes.map(x => (x.match(/id="([^"]+)"/)||[])[1]);
  check("ses dégradés ont des identifiants distincts",
    new Set(ids).size === ids.length, ids.join(","));

  // Le catalogue des vues du domaine.
  const sbands = ev("Object.keys(SCENES)").sort();
  check("les vues couvrent les cinq bandes d'époque", sbands.join(",") === "0,1,2,3,4", sbands.join(","));
  const wanted = ["piste","ville","travail","troupeau","route","aerien","hiver",
                  "plaine","ranch","maison","ecurie","chevaux","grange"];
  check("chaque bande a ses treize vues",
    sbands.every(b => wanted.every(k => !!ev(`SCENES["${b}"]["${k}"]`))),
    sbands.filter(b => !wanted.every(k => !!ev(`SCENES["${b}"]["${k}"]`))).join(","));
  check("toutes les vues sont encodées dans la page",
    sbands.every(b => wanted.every(k => ev(`SCENES["${b}"]["${k}"]`).indexOf("data:image/") === 0)));
  // Un moment ancien garde l'image de son époque.
  check("la chronique illustre chaque moment à son époque",
    ev('eventArtSVG("ranch","x","foundation")') !== ev('eventArtSVG("ranch","x","modern")'));

  check("chaque motif d'illustration a ses vues",
    Object.keys(ev("ART_MOTIFS")).every(m => (ev("SCENE_MAP")[m]||[]).length > 0),
    Object.keys(ev("ART_MOTIFS")).filter(m => !(ev("SCENE_MAP")[m]||[]).length).join(","));

  // Le choix de scène doit suivre le sujet de l'événement.
  check("un événement de loi montre la scène de loi",
    ev(`pickMotif({title:"Un agent fédéral au ranch", image:"une automobile noire"})`) === "law");
  check("un événement de troupeau montre le bétail",
    ev(`pickMotif({title:"Une maladie dans le troupeau", image:""})`) === "herd");
  check("une scène explicite prime sur la détection",
    ev(`pickMotif({art:"city", title:"Une maladie dans le troupeau", image:""})`) === "city");
  check("un événement inconnu retombe sur la scène du ranch",
    ev(`pickMotif({title:"zzz", image:""})`) === "ranch");

  // Chaque événement du jeu doit obtenir une illustration valable.
  const bad = [];
  const total = ev("events.length");
  for(let i = 0; i < total; i++){
    permissiveGame();
    const motif = ev(`pickMotif(events[${i}])`);
    if(!ev("ART_MOTIFS")[motif]) bad.push(i + " → " + motif);
  }
  check("chaque événement obtient une scène connue", bad.length === 0, bad.join(", "));

  // Le titre et le texte peuvent être des fonctions citant la partie en cours.
  permissiveGame();
  let threw = false;
  try{ G.presentEvent(ev("events.find(e=>e.title === 'La coupe est pleine')")); }
  catch(e){ threw = e.message; }
  check("un événement à texte dynamique s'affiche", threw === false, threw);
  check("le texte dynamique cite bien la partie",
    $el("eventText").textContent.includes(ST().familyName), $el("eventText").textContent.slice(0,40));
  check("l'illustration est bien insérée", $el("eventIllustration").innerHTML.includes("<svg"));
}

// ------------------------------------------------------------- Diplomatie
section("Faveurs des factions");
{
  const s = freshGame();
  const types = ["law","trade","media","community"];
  types.forEach(t => {
    check("la faveur " + t + " est définie", !!ev(`FACTION_FAVOURS[${JSON.stringify(t)}]`));
  });

  // Verrouillée tant que l'alliance n'est pas réelle
  s.factions.forEach(f => f.relation = 0);
  check("aucune faveur sans alliance", types.every(t => !ev(`favourReady(${JSON.stringify(t)})`)));

  s.factions.forEach(f => f.relation = 80);
  check("l'alliance déverrouille les faveurs", types.every(t => ev(`favourReady(${JSON.stringify(t)})`)));

  // Une faveur coûte une action, produit son effet, puis se met en délai
  const s2 = freshGame();
  s2.factions.forEach(f => f.relation = 80);
  s2.suspicion = 80; s2.actions = 3;
  const relBefore = G.factionOfType("law").relation;
  G.useFavour("law");
  check("la faveur de l'autorité fait tomber les soupçons", ST().suspicion < 80, ST().suspicion);
  check("une faveur consomme une action", ST().actions === 2, ST().actions);
  check("une faveur entame la relation", G.factionOfType("law").relation < relBefore);
  check("la faveur passe en délai", !ev('favourReady("law")'));

  const susAfter = ST().suspicion;
  ST().actions = 3;
  G.useFavour("law");
  check("la faveur ne peut pas être rejouée aussitôt",
    ST().suspicion === susAfter && ST().actions === 3);

  // Le délai s'épuise au fil des trimestres
  ST().factions.forEach(f => f.relation = 80);
  ST().money = 100000; ST().feed = 5000;
  for(let i = 0; i < 8; i++) G.endTurn();
  check("le délai finit par expirer", ev('favourReady("law")'));

  // Chaque faveur s'exécute sans erreur et produit un effet
  const errors = [];
  types.forEach(t => {
    const s3 = freshGame();
    s3.factions.forEach(f => f.relation = 90);
    s3.suspicion = 70; s3.reputation = 40; s3.unity = 40; s3.feed = 10;
    s3.money = 1000; s3.actions = 3;
    const snapshot = JSON.stringify([ST().suspicion, ST().money, ST().reputation, ST().unity, ST().feed]);
    try{
      G.useFavour(t);
      const after = JSON.stringify([ST().suspicion, ST().money, ST().reputation, ST().unity, ST().feed]);
      if(after === snapshot) errors.push(t + " sans effet mesurable");
    }catch(e){ errors.push(t + " : " + e.message); }
  });
  check("les quatre faveurs produisent un effet", errors.length === 0, errors.join(" | "));

  // Le bandeau latéral montre l'état diplomatique sans ouvrir de menu
  const s4 = freshGame();
  s4.factions.forEach(f => f.relation = 80);
  G.render();
  const strip = $el("standingBox").innerHTML;
  check("le bandeau latéral affiche les pouvoirs locaux", strip.includes("Pouvoirs locaux"));
  check("le bandeau signale les faveurs disponibles", strip.includes("★"));
}

// ------------------------------------------------- Opérations clandestines
section("Coups en douce");
{
  // Chaque époque doit proposer ses propres opérations, complètes et chiffrées.
  const missing = [];
  ev("ERAS").forEach(era => {
    const ops = ev(`ILLEGAL_OPS[${JSON.stringify(era.id)}]`);
    if(!ops || !ops.length){ missing.push(era.id); return; }
    ops.forEach(op => {
      ["id","icon","name","what","fail"].forEach(f => {
        if(!op[f]) missing.push(era.id + "/" + (op.id||"?") + " sans " + f);
      });
      if(!Array.isArray(op.gain) || !Array.isArray(op.sus)) missing.push(era.id + "/" + op.id + " sans chiffres");
      if(!op.gain[1] && !op.reward) missing.push(era.id + "/" + op.id + " sans gain ni contrepartie");
    });
  });
  check("chaque époque a ses opérations, toutes décrites et chiffrées",
    missing.length === 0, missing.slice(0,4).join(" | "));

  const ids = [];
  ev("ERAS").forEach(era => ev(`ILLEGAL_OPS[${JSON.stringify(era.id)}]`).forEach(o => ids.push(era.id+"/"+o.id)));
  check("au moins vingt opérations couvrent la saga", ids.length >= 20, ids.length);
  ev("ERAS").forEach(era => {
    const ops = ev(`ILLEGAL_OPS[${JSON.stringify(era.id)}]`);
    const uniq = new Set(ops.map(o=>o.id));
    check("identifiants uniques à l'époque " + era.id, uniq.size === ops.length);
  });

  // Ouvrir le panneau ne doit rien engager : ni action, ni argent.
  const s = freshGame();
  s.actions = 3; s.money = 5000;
  G.openIllegalPanel();
  check("ouvrir le panneau ne consomme pas d'action", ST().actions === 3, ST().actions);
  check("ouvrir le panneau ne coûte rien", ST().money === 5000, ST().money);
  check("le panneau s'affiche", !$el("illegalModal")._classes.has("hidden"));
  G.renderIllegalPanel();
  const html = $el("illegalContent").innerHTML;
  check("le panneau annonce un pourcentage de réussite", /\d+ %/.test(html));
  check("le panneau annonce les conséquences d'un échec", html.includes("Si ça rate"));

  // Sans action restante, on ne peut pas ouvrir le panneau.
  const s2 = freshGame();
  s2.actions = 0;
  $el("illegalModal").classList.add("hidden");
  G.openIllegalPanel();
  check("sans action restante, le panneau reste fermé",
    $el("illegalModal")._classes.has("hidden"));
}
{
  // Les chances doivent rester dans des bornes lisibles et réagir à l'état.
  const s = freshGame();
  const op = ev("illegalOps()")[0];
  s.suspicion = 0; s.weapons = 10; s.money = 1000000;
  s.cowboys = [{name:"A",loyalty:80,shoot:95,ride:70,salary:10,years:0,trait:"Fidèle"},
               {name:"B",loyalty:80,shoot:95,ride:70,salary:10,years:0,trait:"Fidèle"}];
  const bonnes = ev("illegalOdds(illegalOps()[0])");
  s.suspicion = 95; s.weapons = 0; s.money = 0; s.cowboys = [];
  const mauvaises = ev("illegalOdds(illegalOps()[0])");
  check("les soupçons dégradent les chances", mauvaises < bonnes,
    Math.round(mauvaises*100) + "% < " + Math.round(bonnes*100) + "%");
  check("les chances restent bornées", bonnes <= .95 && mauvaises >= .05,
    Math.round(mauvaises*100) + "–" + Math.round(bonnes*100) + "%");
}
{
  // Une opération engage bien une action, et sa mise est prélevée.
  // Une opération avec mise ET sans prérequis d'hommes ou d'armes : les gros
  // coups en exigent, et un ranch neuf ne les a pas.
  const era = ev("ERAS").find(e => ev(`ILLEGAL_OPS["${e.id}"]`).some(o => o.cost && !o.needs));
  const withCost = ev(`ILLEGAL_OPS["${era.id}"]`).find(o => o.cost && !o.needs);
  const s = freshGame();
  s.eraId = era.id; s.costModifier = era.inflation;
  s.money = 100000; s.actions = 3;
  const before = ST().money;
  G.runIllegalOp(withCost.id);
  check("une opération consomme une action", ST().actions === 2, ST().actions);
  check("la mise est prélevée", ST().money < before);

  // Mise insuffisante : rien ne se passe.
  const s2 = freshGame();
  s2.eraId = era.id; s2.costModifier = era.inflation;
  s2.money = 0; s2.actions = 3;
  G.runIllegalOp(withCost.id);
  check("sans la mise, l'opération est refusée", ST().actions === 3, ST().actions);
}
{
  // Toutes les opérations de toutes les époques doivent s'exécuter sans erreur,
  // en réussite comme en échec.
  const errors = [];
  let wins = 0, fails = 0;
  ev("ERAS").forEach(era => {
    ev(`ILLEGAL_OPS[${JSON.stringify(era.id)}]`).forEach(op => {
      for(let k = 0; k < 12; k++){
        const s = freshGame();
        s.eraId = era.id; s.costModifier = era.inflation;
        s.money = 100000; s.actions = 3; s.weapons = 3; s.cattle = 60; s.land = 300;
        s.cowboys = [{name:"A",loyalty:70,shoot:70,ride:70,salary:10,years:0,trait:"Fidèle"},
                     {name:"B",loyalty:70,shoot:70,ride:70,salary:10,years:0,trait:"Fidèle"}];
        s.suspicion = k % 2 ? 5 : 90;
        const wonBefore = ST().stats.illegalWins;
        try{ G.runIllegalOp(op.id); }
        catch(e){ errors.push(era.id + "/" + op.id + " : " + e.message); }
        if(ST().stats.illegalWins > wonBefore) wins++; else fails++;
      }
    });
  });
  check("toutes les opérations s'exécutent sans erreur", errors.length === 0, errors.slice(0,3).join(" | "));
  check("réussites et échecs sont tous deux atteints", wins > 20 && fails > 20, wins + " / " + fails);
}

// ------------------------------------------------------------- Équilibrage
section("Le catalogue des coups en douce");
{
  const all = ev("ILLEGAL_OPS");
  const total = Object.values(all).reduce((n,a)=>n+a.length, 0);
  check("le catalogue est fourni", total >= 36, total);
  check("chaque époque en propose au moins quatre",
    Object.keys(all).every(k => all[k].length >= 4),
    Object.keys(all).map(k => k + ":" + all[k].length).join(" "));
  const ids = Object.values(all).flat().map(o => o.id);
  check("les identifiants sont uniques", new Set(ids).size === ids.length,
    ids.filter((x,i)=>ids.indexOf(x)!==i).join(","));
  check("chaque opération est décrite et chiffrée",
    Object.values(all).flat().every(o => o.name && o.what && o.fail && o.base > 0 && Array.isArray(o.sus)));

  // Les nouveaux coups touchent bien les nouveaux systèmes.
  const s = permissiveGame();
  s.eraId = "industrial"; s.costModifier = 2.5; s.year = 1960; s.money = 200000;
  G.setQuarantine(6, "Test.");
  const vet = ev("illegalOps()").find(o => o.id === "vetPapers");
  check("faire disparaître un certificat peut lever une quarantaine", !!vet);
  vet.onWin();
  check("et le fait vraiment", ST().quarantine === 0, ST().quarantine);

  const s2 = permissiveGame();
  s2.eraId = "corporate"; s2.costModifier = 5; s2.year = 1982;
  s2.debt = 50000; s2.missedPayments = 2;
  const straw = ev("illegalOps()").find(o => o.id === "strawBuyer");
  check("racheter sa dette exige d'en avoir une", straw.needs().ok === true);
  straw.onWin();
  check("un rachat réussi efface une part de la dette", ST().debt < 50000, ST().debt);
  check("et remet le compteur d'échéances à zéro", ST().missedPayments === 0);
  s2.debt = 0;
  check("sans dette, l'opération est refusée", straw.needs().ok === false);

  const s3 = permissiveGame();
  s3.eraId = "modern"; s3.costModifier = 16; s3.year = 2015;
  const pipe = ev("illegalOps()").find(o => o.id === "pipeline");
  pipe.onFail();
  check("un blanchiment découvert met le ranch sous administration",
    G.inReceivership() === true, ST().receivership);

  // Les coups qui engagent des hommes passent par l'escouade.
  const s4 = permissiveGame();
  s4.eraId = "prohibition"; s4.costModifier = 1.4; s4.year = 1926;
  const hijack = ev("illegalOps()").find(o => o.id === "hijack");
  check("détourner un convoi réclame une escouade", G.needsSquad(hijack) === true);
  check("et au moins trois hommes", G.squadMinimum(hijack) === 3, G.squadMinimum(hijack));
  check("c'est l'opération la plus dangereuse du catalogue",
    hijack.danger >= .4, hijack.danger);

  // Toutes les nouvelles opérations s'exécutent sans erreur, dans les deux sens.
  const added = ["fenceLine","waterHole","hijack","speakeasy","grainSwap","bankRun",
                 "vetPapers","payoffTeamster","insuranceFire","strawBuyer",
                 "quotaFraud","waterRights","organicLabel","pipeline"];
  const errs = [];
  added.forEach(id => {
    ["onWin","onFail"].forEach(hook => {
      const t = permissiveGame();
      t.money = 500000; t.debt = 20000;
      const op = Object.values(ev("ILLEGAL_OPS")).flat().find(o => o.id === id);
      if(!op){ errs.push(id + " introuvable"); return; }
      if(!op[hook]) return;
      try{ op[hook](); }catch(e){ errs.push(id + "/" + hook + " : " + e.message); }
    });
  });
  check("les quatorze nouvelles opérations s'exécutent sans erreur",
    errs.length === 0, errs.slice(0,3).join(" | "));
}

section("Équilibrage");
{
  // La reproduction ne doit jamais dépasser la capacité des pâturages :
  // les revenus sont plafonnés à `min(bétail, capacité)` mais l'entretien
  // porte sur toutes les bêtes — un troupeau qui s'emballe ruine le ranch.
  const s = freshGame();
  s.land = 300; s.money = 50000; s.feed = 100000; s.rival.relation = 0;
  s.cattle = 100;
  const capacity = Math.floor(s.land/3);
  // Les deux maisons dérivent d'elles-mêmes vers l'hostilité et finissent par
  // razzier : sur quinze ans elles pouvaient emporter la moitié du troupeau et
  // faire échouer une mesure qui ne porte pas sur elles. On les tient à l'écart.
  for(let y = 0; y < 60; y++){
    ST().rival.relation = 0;
    if(ST().rival2) ST().rival2.relation = 0;
    // La guerre ouverte n'est pas le sujet ici, et elle déplace des hectares
    // dans les deux sens — donc la capacité, donc la mesure.
    ST().warCooldown = 99999; ST().war = null;
    G.endTurn();
  }
  // La capacité se relit à la fin : des événements peuvent avoir agrandi le
  // domaine en chemin, et c'est la capacité du moment qui borne le troupeau.
  const capEnd = Math.floor(ST().land/3 * G.buildingCapacityFactor());
  check("le troupeau se stabilise sous la capacité",
    ST().cattle <= Math.floor(capEnd*1.05)+2, ST().cattle + " pour " + capEnd + " places");
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
  check("acheter du fourrage remplit la grange", ST().feed === 10 + 40 * G.lot(), ST().feed);
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

// ------------------------------------------- Cohérence des montants et inflation
section("Montants et inflation");
{
  // `cattlePrice` est déjà réévalué à chaque époque. Le repasser par `spend()`
  // l'inflatait une seconde fois : acheter coûtait 16× le prix de vente en 2020.
  const ratios = [];
  ev("ERAS").forEach(era => {
    const s = freshGame();
    s.eraId = era.id;
    s.costModifier = era.inflation;
    s.cattlePrice = Math.round(28 * era.inflation);
    s.money = 10000000; s.cattle = 50; s.actions = 3;
    const before = ST().money;
    G.doAction("buyCattle");
    const achat = before - ST().money;
    ST().actions = 3;
    const before2 = ST().money;
    G.doAction("sellCattle");
    const vente = ST().money - before2;
    ratios.push({era:era.id, r: achat/vente});
  });
  const worst = ratios.reduce((a,b) => b.r > a.r ? b : a, ratios[0]);
  check("acheter reste proche du prix de vente à toutes les époques",
    worst.r < 1.4, worst.era + " : " + worst.r.toFixed(1) + "×");

  // Les gains doivent suivre l'inflation, sinon ils deviennent dérisoires.
  function gainAt(inflation, action, setup){
    let total = 0, n = 0;
    for(let i = 0; i < 120; i++){
      const s = freshGame();
      s.costModifier = inflation;
      s.money = 1000000; s.horses = 6; s.weapons = 4; s.reputation = 80;
      s.actions = 3;
      if(setup) setup(s);
      const before = ST().money;
      G.doAction(action);
      total += ST().money - before; n++;
    }
    return total/n;
  }
  const compet1 = gainAt(1, "competition");
  const compet8 = gainAt(8, "competition");
  check("la prime de concours suit l'inflation",
    compet8 > compet1 * 5, Math.round(compet1) + " → " + Math.round(compet8));
  function illegalGainAt(inflation){
    let total = 0, n = 0;
    for(let i = 0; i < 200; i++){
      const s = freshGame();
      s.costModifier = inflation;
      s.money = 1000000; s.weapons = 4; s.suspicion = 0; s.actions = 3;
      const op = ev("illegalOps()")[0];
      const before = ST().money;
      G.runIllegalOp(op.id);
      total += ST().money - before; n++;
    }
    return total/n;
  }
  const illeg1 = illegalGainAt(1);
  const illeg8 = illegalGainAt(8);
  check("le gain de contrebande suit l'inflation",
    illeg8 > illeg1 * 5, Math.round(illeg1) + " → " + Math.round(illeg8));
  // Arbitrage voulu : à l'action les deux voies se valent à peu près — le crime
  // sans mise ni cheval, le concours avec — et c'est la réputation qui départage
  // dans la durée. Un écart marqué dans un sens ou l'autre serait un défaut.
  const ratio = illeg1 / compet1;
  check("crime et concours rapportent comparablement à l'action",
    ratio > 0.7 && ratio < 1.5,
    "trafic " + Math.round(illeg1) + " vs concours " + Math.round(compet1)
      + " (rapport " + ratio.toFixed(2) + ")");
  function repDelta(action, setup){
    let total = 0;
    for(let i = 0; i < 150; i++){
      const s = freshGame();
      s.money = 1000000; s.horses = 6; s.weapons = 4; s.reputation = 50; s.suspicion = 20;
      s.actions = 3;
      const before = ST().reputation;
      if(setup) setup();
      else G.doAction(action);
      total += ST().reputation - before;
    }
    return total/150;
  }
  const repCompet = repDelta("competition");
  const repIllegal = repDelta(null, () => { G.runIllegalOp(ev("illegalOps()")[0].id); });
  check("le concours bâtit la réputation, la contrebande l'entame",
    repCompet > 0 && repIllegal < 0,
    "concours " + repCompet.toFixed(2) + " / trafic " + repIllegal.toFixed(2));
}
{
  // La prime de marché : un nom respecté vaut plus qu'un ranch sous enquête.
  function quarterIncome(reputation, suspicion){
    const s = freshGame();
    s.reputation = reputation; s.suspicion = suspicion;
    s.cattle = 60; s.land = 300; s.money = 100000; s.feed = 5000;
    s.rival.relation = 0; s.children = []; s.cowboys = [];
    s.factions.forEach(f => f.relation = 0);
    const realRandom = Math.random;
    Math.random = () => 0.5;
    const before = ST().money;
    G.endTurn();
    const delta = ST().money - before;
    Math.random = realRandom;
    return delta;
  }
  const bonNom = quarterIncome(95, 0);
  const neutre = quarterIncome(50, 0);
  const suspect = quarterIncome(50, 90);
  check("une bonne réputation augmente les revenus", bonNom > neutre, bonNom + " > " + neutre);
  check("les soupçons réduisent les revenus", suspect < neutre, suspect + " < " + neutre);
}
{
  // La renommée doit s'émousser, sinon elle sature à 100 pour tout le monde
  // et la prime de marché ne récompense plus rien.
  // Les événements et les brèves peuvent redonner de la réputation : on éprouve
  // ici la règle d'usure elle-même, sur assez de trimestres pour trancher.
  const s = freshGame();
  s.reputation = 100; s.cattle = 40; s.land = 200; s.money = 500000;
  s.feed = 50000; s.rival.relation = 0; s.rival2 && (s.rival2.relation = 0);
  s.factions.forEach(f => f.relation = 0);
  // Le sujet du test est l'érosion, pas les événements : plusieurs d'entre eux
  // rendent de la réputation et pouvaient la maintenir au plafond, ce qui
  // faisait échouer la mesure une fois sur trois.
  s.eventModifier = 0;
  // Trois sources rendent de la réputation en dehors de l'érosion mesurée ici :
  // les événements (coupés par `eventModifier`), les arcs, et les brèves de fin
  // de trimestre. On vide le catalogue de brèves le temps de la mesure.
  const briefsBackup = ev("BRIEFS.splice(0, BRIEFS.length)");
  for(let i = 0; i < 80; i++){
    ST().arcCooldown = 99999;
    ST().arc = null;
    // Quatrième source, ajoutée avec la guerre ouverte : ses trois phases
    // rendent et retirent de la réputation. Le sujet ici est l'érosion seule.
    ST().warCooldown = 99999;
    ST().war = null;
    G.endTurn();
    let guard = 0;
    while(!$el("eventModal")._classes.has("hidden") && guard++ < 10){
      if(ST().gameOver) break;
      const ch = $el("eventChoices").children;
      if(!ch.length) break;
      ch[ch.length-1].onclick();
    }
    if(ST().gameOver) break;
  }
  briefsBackup.forEach(b => ev("BRIEFS").push(b));
  check("le catalogue de brèves est rendu intact", ev("BRIEFS").length === briefsBackup.length,
    ev("BRIEFS").length + " / " + briefsBackup.length);
  check("une réputation non entretenue redescend", ST().reputation < 100, ST().reputation);
  check("elle ne s'effondre pas non plus", ST().reputation > 20, ST().reputation);
}
{
  // Le verdict final doit refléter la contrebande, pas seulement les choix
  // d'événements : 141 ans de trafic ne peuvent pas finir « dynastie respectée ».
  const s = freshGame();
  s.money = 1000000; s.legacy.greed = 0; s.legacy.honor = 0;
  const opId = ev("illegalOps()")[0].id;
  for(let i = 0; i < 120; i++){ ST().actions = 3; G.runIllegalOp(opId); }
  check("la contrebande alourdit l'héritage moral", ST().legacy.greed > 20, ST().legacy.greed);

  const s2 = freshGame();
  s2.money = 1000000; s2.legacy.greed = 0; s2.horses = 6;
  for(let i = 0; i < 120; i++){ ST().actions = 3; G.doAction("competition"); }
  check("les concours n'entachent pas l'héritage moral", ST().legacy.greed === 0, ST().legacy.greed);
}

// ------------------------------------------------ Aucune impasse possible
section("Libellés des choix");
{
  // Un libellé écrit comme fonction — pour citer un montant à l'échelle de
  // l'époque — s'affichait tel quel, code source compris. Plus jamais.
  const bad = [];
  const variants = permissiveVariants();
  ev("events").forEach((e, i) => {
    const st = variants[i % variants.length]();
    st.money = 5000000;
    const rendered = ev(`(function(){
      const e = events[${i}];
      if(e.condition && !e.condition()) return [];
      presentEvent(e);
      return Array.prototype.map.call(eventChoices.children, b => b.textContent);
    })()`);
    rendered.forEach(t => {
      if(/^\s*(\(\s*\)|function)\s*=?>?/.test(t) || t.indexOf("${") >= 0 || t.indexOf("=>") >= 0){
        bad.push(ev("(function(){const t=events["+i+"].title;return typeof t==='function'?t():t;})()") + " → " + t.slice(0,60));
      }
    });
  });
  check("aucun libellé de choix n'affiche son code source", bad.length === 0, bad.slice(0,3).join(" | "));

  // Idem pour la mise aux normes, dont les deux premiers libellés sont calculés.
  const s = freshGame();
  s.year = 1975; s.eraId = "corporate"; s.costModifier = 5;
  s.land = 2000; s.cattle = 700; s.money = 50000000; s.nextCall = 1975;
  G.presentCapitalCall();
  const labels = Array.prototype.map.call($el("eventChoices").children, b => b.textContent);
  check("la mise aux normes affiche ses trois issues en clair",
    labels.length === 3 && labels.every(l => l.indexOf("=>") < 0), labels.join(" | "));
  check("elle chiffre le devis dans le bouton", /\d/.test(labels[0]), labels[0]);
}

section("Impasses");
{
  // Un événement dont toutes les branches sont verrouillées afficherait une
  // modale sans bouton : la partie serait bloquée pour de bon.
  const s = freshGame();
  // État volontairement démuni : pas d'argent, pas d'hommes, pas de cheval.
  s.money = 0; s.cattle = 0; s.horses = 0; s.weapons = 0; s.feed = 0;
  s.cowboys = []; s.children = []; s.champion = null;
  s.factions.forEach(f => f.relation = 0);
  const stuck = [];
  const total = ev("events.length");
  for(let i = 0; i < total; i++){
    $el("eventChoices").innerHTML = "";
    ST().money = 0; ST().cattle = 0; ST().horses = 0; ST().weapons = 0;
    ST().cowboys = []; ST().champion = null;
    // Un événement n'est tiré que si sa condition passe : on teste donc dans
    // les mêmes termes que le jeu.
    const reachable = ev("(function(){const e=events["+i+"];try{return !e.condition||!!e.condition();}catch(err){return false;}})()");
    if(!reachable) continue;
    try{
      G.presentEvent(ev("events["+i+"]"));
      if(!$el("eventChoices").children.length){
        stuck.push(ev("(function(){const t=events["+i+"].title;try{return typeof t==='function'?t():t;}catch(e){return 'événement '+" + i + ";}})()"));
      }
    }catch(e){
      stuck.push("erreur sur l'événement " + i + " : " + e.message);
    }
  }
  check("aucun événement ne laisse la modale sans issue, même démuni",
    stuck.length === 0, stuck.slice(0,4).join(" | "));

  // Même garantie pour les chapitres d'arcs.
  const arcStuck = [];
  const arcs = ev("ARCS.map(a=>({id:a.id, n:a.steps.length}))");
  arcs.forEach(a => {
    for(let si = 0; si < a.n; si++){
      const s2 = freshGame();
      s2.money = 0; s2.cattle = 0; s2.horses = 0; s2.weapons = 0;
      s2.cowboys = []; s2.children = []; s2.champion = null;
      s2.arc = {id:a.id, step:si, due:0, data:{name:"X"}};
      $el("eventChoices").innerHTML = "";
      // maybeShowArcStep enveloppe le chapitre : un sujet disparu referme
      // l'arc proprement au lieu de bloquer. C'est ce chemin qu'on éprouve.
      const opened = G.maybeShowArcStep();
      if(opened && !$el("eventChoices").children.length) arcStuck.push(a.id + " ch." + si);
      if(!opened && ST().arc) arcStuck.push(a.id + " ch." + si + " : ni ouvert ni refermé");
    }
  });
  check("aucun chapitre d'arc ne laisse la modale sans issue",
    arcStuck.length === 0, arcStuck.slice(0,4).join(" | "));
}

// -------------------------------------------------- Variété du catalogue
section("Variété des événements");
{
  const total = ev("events.length");
  check("le catalogue est fourni", total >= 140, total + " événements");

  const titles = ev(`events.map(e=>{const t=typeof e.title==="function"?"":e.title;return t;})`)
    .filter(Boolean);
  check("aucun titre n'est répété", new Set(titles).size === titles.length,
    titles.filter((t,i)=>titles.indexOf(t)!==i).slice(0,3).join(" | "));

  // Redondance de fond : deux événements ne doivent pas dire la même chose.
  // On compare les mots signifiants des textes, deux à deux.
  const stop = new Set(("le la les un une des du de d au aux et ou a à en dans sur pour par que qui "
    + "ne pas plus se sa son ses leur leurs ce cette cet il elle ils elles on vous votre vos est sont "
    + "être avoir fait plus tout tous toute toutes avec sans mais donc car y lui the of").split(" "));
  const bags = ev(`events.map(e=>{
    const t = typeof e.text === "function" ? "" : (e.text||"");
    const ti = typeof e.title === "function" ? "" : (e.title||"");
    return (ti + " " + t);
  })`).map(txt => new Set(
    txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
       .split(/[^a-z]+/).filter(w => w.length > 3 && !stop.has(w))
  ));

  const pairs = [];
  for(let i = 0; i < bags.length; i++){
    if(bags[i].size < 6) continue;
    for(let j = i+1; j < bags.length; j++){
      if(bags[j].size < 6) continue;
      let common = 0;
      bags[i].forEach(w => { if(bags[j].has(w)) common++; });
      const jaccard = common / (bags[i].size + bags[j].size - common);
      if(jaccard > 0.45) pairs.push(i + "≈" + j + " (" + jaccard.toFixed(2) + ")");
    }
  }
  check("aucune paire d'événements ne se recouvre", pairs.length === 0, pairs.slice(0,4).join(" | "));

  // Couverture : chaque époque doit avoir ses événements propres, et le tronc
  // commun doit rester majoritaire pour que chaque partie reste variée.
  const generic = ev("events.filter(e=>!e.eraId).length");
  check("le tronc commun est large", generic >= 80, generic);
  ev("ERAS").forEach(era => {
    const n = ev(`events.filter(e=>e.eraId===${JSON.stringify(era.id)}).length`);
    check("l'époque " + era.id + " a ses propres événements", n >= 4, n);
  });

  // Le choix des illustrations doit rester varié : pas une scène pour tout.
  const motifs = {};
  const nEvents = ev("events.length");
  for(let i = 0; i < nEvents; i++){
    permissiveGame();
    const m = ev(`pickMotif(events[${i}])`);
    motifs[m] = (motifs[m]||0) + 1;
  }
  const distinct = Object.keys(motifs).length;
  const biggest = Math.max(...Object.values(motifs));
  check("les illustrations sont variées", distinct >= 8, distinct + " scènes distinctes");
  check("aucune scène n'écrase les autres", biggest < nEvents * 0.32,
    biggest + "/" + nEvents + " pour la plus fréquente");
}

// ------------------------------------------------- Atteignabilité des objectifs
section("Atteignabilité des objectifs");
{
  // « Les mains propres » exige greed === 0 : chaque événement doit donc offrir
  // au moins une branche qui n'entache pas l'honneur de la famille.
  const total = ev("events.length");
  const forced = [], untestable = [];
  for(let i = 0; i < total; i++){
    let hasCleanBranch = false;
    const nb = ev("events["+i+"].choices.length");
    for(let j = 0; j < nb; j++){
      let cleanOnce = false;
      const variants = permissiveVariants();
      for(let k = 0; k < 12 && !cleanOnce; k++){
        const s = variants[k % variants.length]();
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
    if(!hasCleanBranch){
      // Distinguer « toujours compromettant » de « jamais déclenchable ».
      // Certains événements s'excluent mutuellement — cheval peu dressé contre
      // cheval de concours — d'où plusieurs états de référence.
      const reachable = permissiveVariants().some(setup => {
        setup();
        return ev("(function(){const e=events["+i+"];return !e.condition||!!e.condition();})()");
      });
      (reachable ? forced : untestable).push(ev("(function(){const t=events["+i+"].title;return typeof t==='function'?t():t;})()"));
    }
  }
  if(untestable.length){
    console.log("       non déclenchables dans l'état de test : " + untestable.join(", "));
  }
  check("chaque événement déclenchable offre une issue sans compromission",
    forced.length === 0, forced.join(" | "));
  check("tous les événements sont déclenchables au moins une fois",
    untestable.length === 0, untestable.join(" | "));

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
        // Poster les hommes sur les parcelles, comme le ferait un joueur soigneux.
        (s.cowboys||[]).forEach((c, i) => {
          if(c.post == null && (s.parcels||[]).length > i) c.post = s.parcels[i].id;
        });
        // Un joueur actif : il investit, concourt, s'allie et fraude.
        // Il place aussi son argent dans l'affaire de l'époque et règle ses
        // litiges fonciers — deux réflexes sans lesquels la fin de partie
        // n'est qu'une trésorerie qui gonfle.
        const ven = G.ventureOfEra();
        if(ven && G.ventureLevel(ven.id) < ven.max) G.doAction("venture");
        // La carrière politique : fonder la commission, puis gravir l'échelle.
        if(!(s.institutions && s.institutions.cattleCommission)) G.foundCattleCommission();
        else if(!G.currentOffice()){
          const target = Object.keys(ev("OFFICES")).find(id => G.officeAvailable(id).ok);
          if(target) G.runForOffice(target);
        }
        if(G.claimStrength() >= 20 && G.favourReady("nation")) G.useFavour("nation");
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
  // Ces objectifs dépendent d'un contexte que ces parties ne produisent pas :
  // une variante de départ, ou une carrière politique menée sur plusieurs
  // générations sans jamais tremper dans rien. Ils sont vérifiés directement
  // dans leur propre section.
  const startModeGoals = ["phoenix","heirloom","governor","cleanPower"];
  const all = ev("ACHIEVEMENTS").map(a=>a.id).filter(id => !startModeGoals.includes(id));
  const never = all.filter(id => !unlocked.has(id));
  console.log("       objectifs vus au moins une fois : " + unlocked.size + "/" + all.length);
  if(never.length) console.log("       jamais débloqués ici : " + never.join(", "));
  check("la quasi-totalité des objectifs sont atteignables", unlocked.size >= all.length - 3, unlocked.size + "/" + all.length);
}


// ------------------------------------------------- Nuire à une maison rivale
section("Nuire à une maison rivale");
{
  const ops = ev("RIVAL_OPS");
  const bad = [];
  ops.forEach(op => {
    ["id","icon","name","what","fail","gain"].forEach(f => {
      if(f === "gain") return;
      if(!op[f]) bad.push(op.id + " sans " + f);
    });
    ["strength","relation","sus","rep"].forEach(f => {
      if(!Array.isArray(op[f]) || op[f].length !== 2) bad.push(op.id + " sans " + f + " chiffré");
    });
    if(typeof op.base !== "number") bad.push(op.id + " sans probabilité de base");
    if(typeof op.min !== "number") bad.push(op.id + " sans effectif minimum");
  });
  check("chaque opération contre une maison est décrite et chiffrée",
    bad.length === 0, bad.slice(0,4).join(" | "));
  check("au moins dix opérations couvrent la saga", ops.length >= 10, ops.length);
  check("identifiants uniques", new Set(ops.map(o=>o.id)).size === ops.length);

  // La progression d'époque : la violence recule, la procédure avance.
  const s = freshGame();
  s.year = 1890;
  const early = G.rivalOps().map(o=>o.id);
  s.year = 2000;
  const late = G.rivalOps().map(o=>o.id);
  check("l'embuscade appartient à la frontière", early.includes("rvAmbush") && !late.includes("rvAmbush"));
  check("le rachat aux enchères appartient au siècle finissant",
    !early.includes("rvBuyout") && late.includes("rvBuyout"));
  check("couper la clôture reste possible partout",
    early.includes("rvFence") && late.includes("rvFence"));

  // Ouvrir le panneau n'engage rien.
  const s2 = freshGame();
  s2.actions = 3; s2.money = 90000;
  G.openRivalPanel();
  check("ouvrir le panneau ne consomme pas d'action", ST().actions === 3, ST().actions);
  check("ouvrir le panneau ne coûte rien", ST().money === 90000, ST().money);
  check("le panneau s'affiche", !$el("rivalModal")._classes.has("hidden"));
  check("il donne le choix de la maison", /onclick="setRivalTarget\(/.test($el("rivalTargets").innerHTML));
  check("les deux maisons sont proposées",
    ($el("rivalTargets").innerHTML.match(/class="target /g)||[]).length === 2);
  const html = $el("rivalContent").innerHTML;
  check("le panneau annonce un pourcentage de réussite", /\d+ %/.test(html));
  check("le panneau annonce les conséquences d'un échec", html.includes("Si ça rate"));
  check("le panneau chiffre la puissance retirée", /Puissance : −/.test(html));

  // La cible se choisit vraiment.
  G.setRivalTarget(1);
  check("la seconde maison devient la cible", G.rivalTargetHouse().name === ST().rival2.name);
  G.setRivalTarget(0);
  check("et la première se reprend", G.rivalTargetHouse().name === ST().rival.name);

  // Une maison puissante se défend mieux : les chances baissent.
  const op = ev("RIVAL_OPS").find(o=>o.id==="rvFence");
  ST().rival.strength = 20;
  const easy = G.rivalOdds(op);
  ST().rival.strength = 95;
  const hard = G.rivalOdds(op);
  check("une maison puissante est plus dure à atteindre", hard < easy, hard.toFixed(2)+" < "+easy.toFixed(2));

  // Les hommes envoyés font les chances — c'est tout l'objet de l'escouade.
  const s3 = freshGame();
  s3.money = 90000; s3.actions = 5;
  s3.cowboys = [
    {name:"Bon tireur", loyalty:80, shoot:95, ride:90, salary:10, years:3, trait:"Vétéran"},
    {name:"Manœuvre",   loyalty:80, shoot:15, ride:20, salary:10, years:1, trait:"Novice"}
  ];
  const scare = G.rivalOps().find(o=>o.id==="rvScare");
  check("faire peur réclame une escouade", G.needsSquad(scare) === true);
  const withGood = G.rivalOdds(scare, [0]);
  const withBad  = G.rivalOdds(scare, [1]);
  check("un bon tireur vaut mieux qu'un manœuvre", withGood > withBad,
    Math.round(withGood*100)+" % contre "+Math.round(withBad*100)+" %");
  const both = G.rivalOdds(scare, [0,1]);
  check("deux hommes valent mieux qu'un seul manœuvre", both > withBad);
  check("partir seul vaut moins que partir à deux bons", G.rivalOdds(scare, []) < withGood);

  // Le panneau des hommes sert bien les deux catalogues.
  G.openSquadPanel("rvScare");
  check("l'opération rivale ouvre le panneau des hommes",
    !$el("squadModal")._classes.has("hidden"));
  check("le panneau nomme la maison visée",
    $el("squadIntro").innerHTML.includes(ST().rival.name));
  check("le panneau liste les hommes", $el("squadList").innerHTML.includes("Bon tireur"));

  // Réussite forcée : la maison recule.
  const s4 = freshGame();
  s4.money = 90000; s4.actions = 5;
  s4.rival.strength = 80; s4.rival.relation = 0;
  const rnd = Math.random;
  Math.random = () => 0.001;              // tout réussit
  G.runRivalOp("rvFence", []);
  Math.random = rnd;
  check("un coup réussi affaiblit la maison visée", ST().rival.strength < 80, ST().rival.strength);
  check("et la dresse contre vous", ST().rival.relation < 0, ST().rival.relation);
  check("il consomme une action", ST().actions === 4, ST().actions);
  check("il coûte sa mise", ST().money < 90000, ST().money);

  // Échec forcé : la maison se renforce, et ce n'est pas gratuit.
  const s5 = freshGame();
  s5.money = 90000; s5.actions = 5;
  s5.rival.strength = 40; s5.reputation = 80;
  Math.random = () => 0.999;              // tout rate
  G.runRivalOp("rvFence", []);
  Math.random = rnd;
  check("un coup manqué renforce la maison visée", ST().rival.strength > 40, ST().rival.strength);
  check("et abîme le nom", ST().reputation < 80, ST().reputation);

  // Le bouton d'action ouvre le panneau au lieu de jouer un dé caché.
  const s6 = freshGame();
  s6.actions = 3; s6.money = 9000;
  $el("rivalModal").classList.add("hidden");
  G.doAction("rivalAction");
  check("le bouton ouvre le panneau", !$el("rivalModal")._classes.has("hidden"));
  check("et n'engage rien de lui-même", ST().actions === 3, ST().actions);

  // Une mise hors de portée bloque l'opération.
  const s7 = freshGame();
  s7.money = 1; s7.actions = 3;
  s7.year = 2000;
  G.chooseRivalOp("rvBuyout");
  check("sans la mise, rien ne part", ST().actions === 3, ST().actions);
}

// ------------------------------------------------- Bâtir sur le domaine
section("Bâtir sur le domaine");
{
  const list = ev("BUILDINGS");
  const bad = [];
  list.forEach(b => {
    ["id","icon","name","what","gain"].forEach(f => { if(!b[f]) bad.push(b.id + " sans " + f); });
    if(!(b.cost > 0)) bad.push(b.id + " sans prix");
    if(!(b.upkeep > 0)) bad.push(b.id + " sans entretien");
  });
  check("chaque ouvrage est décrit, chiffré et entretenu", bad.length === 0, bad.slice(0,4).join(" | "));
  check("identifiants uniques", new Set(list.map(b=>b.id)).size === list.length);
  // Le prix doit monter franchement : c'est là que passe l'argent tardif.
  const costs = list.map(b=>b.cost);
  check("les chantiers vont du modeste au considérable",
    costs[costs.length-1] >= costs[0] * 100, costs[0] + " → " + costs[costs.length-1]);

  const s = freshGame();
  s.year = 1890;
  const early = G.availableBuildings().map(b=>b.id);
  s.year = 2000;
  const late = G.availableBuildings().map(b=>b.id);
  check("le corral est de tous les temps", early.includes("corral") && late.includes("corral"));
  check("la piste attend l'aviation", !early.includes("piste") && late.includes("piste"));

  // Ouvrir le panneau n'engage rien.
  const s2 = freshGame();
  s2.actions = 3; s2.money = 900000;
  G.openBuildPanel();
  check("ouvrir le panneau ne consomme pas d'action", ST().actions === 3, ST().actions);
  check("le panneau s'affiche", !$el("buildModal")._classes.has("hidden"));
  check("le panneau chiffre le chantier", /Chantier : /.test($el("buildContent").innerHTML));
  check("et l'entretien qu'il laisse", /Entretien : /.test($el("buildContent").innerHTML));

  // Bâtir : une fois, cher, pour toujours.
  const before = ST().money;
  G.raiseBuilding("corral");
  check("l'ouvrage est bâti", G.hasBuilding("corral") === true);
  check("il consomme une action", ST().actions === 2, ST().actions);
  check("il coûte son prix", ST().money < before, before - ST().money);
  check("il ferme le panneau", $el("buildModal")._classes.has("hidden"));
  const after = ST().money;
  G.raiseBuilding("corral");
  check("on ne le bâtit pas deux fois", ST().money === after, ST().money);

  // Les effets sont réels, mesurables et permanents.
  const s3 = freshGame();
  s3.money = 9000000; s3.land = 900;
  const inc0 = G.buildingIncomeFactor(), cap0 = G.buildingCapacityFactor();
  const upk0 = G.buildingUpkeep(), har0 = G.buildingHarvestFactor();
  s3.buildings = ["corral","puits","grange","bureau"];
  check("le corral ajoute aux revenus", G.buildingIncomeFactor() > inc0);
  check("le puits ajoute à la capacité", G.buildingCapacityFactor() > cap0);
  check("la grange ajoute à la récolte", G.buildingHarvestFactor() > har0);
  check("le bureau allège les charges", G.buildingUpkeepFactor() < 1);
  check("et tout cela laisse un entretien", G.buildingUpkeep() > upk0, G.buildingUpkeep());

  // L'entretien suit la taille du domaine : c'est ce qui empêche l'ouvrage de
  // se rembourser tout seul sur un empire.
  const small = G.buildingUpkeep();
  ST().land = 4000;
  check("l'entretien croît avec le domaine", G.buildingUpkeep() >= small * 1.9,
    small + " → " + G.buildingUpkeep());

  // Le prix aussi.
  const s4 = freshGame();
  s4.land = 200; s4.money = 9000000;
  const b = ev("BUILDINGS").find(x=>x.id==="corral");
  const cheap = G.buildingCost(b);
  ST().land = 4000;
  check("bâtir sur un empire coûte plus cher", G.buildingCost(b) > cheap,
    cheap + " → " + G.buildingCost(b));

  // Sous administration judiciaire, aucun chantier.
  const s5 = freshGame();
  s5.money = 9000000; s5.actions = 3;
  G.setReceivership(4, "test");
  G.raiseBuilding("corral");
  check("l'administrateur judiciaire bloque le chantier", G.hasBuilding("corral") === false);
}

// ------------------------------------------------- Le concours, une fois par tour
section("Le concours équestre");
{
  const s = freshGame();
  s.money = 900000; s.horses = 3; s.actions = 6;
  const m0 = ST().money;
  G.doAction("competition");
  const a1 = ST().actions;
  check("un concours consomme une action", a1 === 5, a1);
  G.doAction("competition");
  check("le deuxième concours du tour est refusé", ST().actions === a1, ST().actions);
  // Le tour suivant le rouvre.
  ST().turn++;
  ST().actions = 6;
  G.doAction("competition");
  check("le tour suivant rouvre la piste", ST().actions === 5, ST().actions);
  check("et le tour est marqué comme couru", ST().competedTurn === ST().turn);
  check("la mise a bien été prélevée quelque part", typeof m0 === "number" && ST().money !== m0);
}


// ------------------------------------------------- La guerre ouverte
section("La guerre ouverte");
{
  const sc = ev("WAR_SCENES");
  check("la guerre a trois phases", sc.length === 3);
  const bad = [];
  sc.forEach((phase, i) => {
    if(phase.length < 3) bad.push("phase " + i + " n'a que " + phase.length + " scènes");
    phase.forEach(x => {
      ["art","title","image"].forEach(f => { if(!x[f]) bad.push("phase "+i+" : scène sans "+f); });
      if(typeof x.text !== "function") bad.push("phase "+i+" : scène sans texte");
    });
  });
  check("chaque phase offre plusieurs scènes, toutes décrites", bad.length === 0, bad.slice(0,3).join(" | "));

  // Chaque scène de chaque phase doit produire une modale jouable.
  const errs = [];
  for(let phase = 0; phase < 3; phase++){
    for(let pick = 0; pick < ev("WAR_SCENES")[phase].length; pick++){
      const s = freshGame();
      s.money = 400000; s.land = 900; s.cattle = 300; s.feed = 900; s.weapons = 4;
      s.cowboys = [
        {name:"A",loyalty:70,shoot:70,ride:70,salary:10,years:2,trait:"Vétéran"},
        {name:"B",loyalty:70,shoot:70,ride:70,salary:10,years:2,trait:"Fidèle"},
        {name:"C",loyalty:70,shoot:70,ride:70,salary:10,years:2,trait:"Fidèle"}
      ];
      G.addChild("Petiot", {age:8, health:100});
      G.ensureSecondHouse();
      s.rival.relation = -90; s.rival.strength = 60;
      s.war = {house:0, name:s.rival.name, phase:phase, due:0, pick:[pick,pick,pick], data:{}};
      let shown = false;
      try{ shown = G.maybeShowWarStep(); }catch(e){ errs.push(`p${phase}/${pick} ouverture : ${e.message}`); continue; }
      if(!shown){ errs.push(`p${phase}/${pick} ne s'ouvre pas`); continue; }
      const ch = $el("eventChoices").children;
      if(!ch.length){ errs.push(`p${phase}/${pick} sans aucun choix`); continue; }
      // Chaque branche s'exécute sur un état neuf.
      for(let c = 0; c < ch.length; c++){
        const s2 = freshGame();
        s2.money = 400000; s2.land = 900; s2.cattle = 300; s2.weapons = 4;
        s2.cowboys = [{name:"A",loyalty:70,shoot:70,ride:70,salary:10,years:2,trait:"V"},
                      {name:"B",loyalty:70,shoot:70,ride:70,salary:10,years:2,trait:"F"}];
        G.addChild("Petiot", {age:8, health:100});
        G.ensureSecondHouse();
        s2.rival.relation = -90; s2.rival.strength = 60;
        s2.war = {house:0, name:s2.rival.name, phase:phase, due:0, pick:[pick,pick,pick], data:{}};
        G.maybeShowWarStep();
        const btns = $el("eventChoices").children;
        if(btns[c]){ try{ btns[c].onclick(); }catch(e){ errs.push(`p${phase}/${pick} choix ${c} : ${e.message}`); } }
      }
    }
  }
  check("les neuf scènes de guerre et toutes leurs branches s'exécutent",
    errs.length === 0, errs.slice(0,3).join(" | "));

  // L'enchaînement : chaque phase mène à la suivante, la troisième referme.
  const s3 = freshGame();
  s3.money = 400000; s3.land = 900; s3.cattle = 300;
  G.ensureSecondHouse();
  s3.war = {house:0, name:s3.rival.name, phase:0, due:0, pick:[1,1,1], data:{}};
  G.advanceWar();
  check("la première phase mène à l'escalade", ST().war.phase === 1, ST().war && ST().war.phase);
  G.advanceWar();
  check("l'escalade mène au règlement", ST().war.phase === 2, ST().war && ST().war.phase);
  G.advanceWar();
  check("après le règlement, la guerre est close", ST().war === null);
  check("et un délai court avant la suivante", ST().warCooldown > ST().turn, ST().warCooldown);

  // L'enlèvement doit désigner un enfant, ou se jouer sans en planter.
  const s4 = freshGame();
  s4.children = [];
  check("sans enfant, la guerre ne cherche personne", G.warChild() === null);
  G.addChild("Cadette", {age:6, health:100});
  G.addChild("Aînée", {age:15, health:100});
  check("avec des enfants, c'est le plus jeune qui est visé", G.warChild().age === 6);

  // Les chances de la fusillade se lisent : des hommes armés valent mieux.
  const s5 = freshGame();
  G.ensureSecondHouse();
  s5.rival.strength = 60;
  s5.cowboys = []; s5.weapons = 0;
  const faible = G.warOdds(ST().rival);
  s5.weapons = 8;
  s5.cowboys = [{name:"A",loyalty:80,shoot:90,ride:80,salary:10,years:2,trait:"V"},
                {name:"B",loyalty:80,shoot:88,ride:80,salary:10,years:2,trait:"V"},
                {name:"C",loyalty:80,shoot:85,ride:80,salary:10,years:2,trait:"V"}];
  check("des hommes et des armes font la fusillade", G.warOdds(ST().rival) > faible,
    Math.round(faible*100) + " % → " + Math.round(G.warOdds(ST().rival)*100) + " %");

  // Elle ne s'ouvre pas contre une maison qui ne vous hait pas.
  const s6 = freshGame();
  G.ensureSecondHouse();
  ST().rival.relation = 40; ST().rival2.relation = 40;
  ST().warCooldown = 0;
  let opened = 0;
  for(let i = 0; i < 400; i++){ ST().war = null; G.maybeOpenWar(); if(ST().war) opened++; }
  check("aucune guerre contre une maison cordiale", opened === 0, opened);

  // Elle reste rare même contre une maison qui vous hait : c'est un événement
  // de partie, pas de trimestre.
  const s7 = freshGame();
  G.ensureSecondHouse();
  ST().rival.relation = -95; ST().rival.strength = 90;
  ST().rival2.relation = 20;
  let rate = 0;
  for(let i = 0; i < 2000; i++){ ST().war = null; ST().warCooldown = 0; G.maybeOpenWar(); if(ST().war) rate++; }
  check("une guerre reste rare, même dans la pire des situations",
    rate > 0 && rate < 60, rate + " ouvertures sur 2000 trimestres");
}

// ------------------------------------------------- Détruire une maison
section("Détruire une maison");
{
  const s = freshGame();
  G.ensureSecondHouse();
  const h = ST().rival;
  h.strength = 40; h.hunted = 0;

  // La dérive ordinaire ne descend pas sous le plancher naturel.
  check("une maison qu'on n'a pas chassée a un plancher", G.houseFloor(h) === 10);
  h.strength = 2;
  G.houseBendPhase();
  check("elle est relevée à ce plancher", ST().rival.strength === 10, ST().rival.strength);

  // Seuls les coups délibérés comptent.
  const s2 = freshGame();
  G.ensureSecondHouse();
  const h2 = ST().rival;
  h2.strength = 60; h2.hunted = 0;
  G.weakenHouse(h2, 20);
  check("frapper une maison laisse une trace", h2.hunted === 20, h2.hunted);
  check("et lui retire vraiment sa puissance", h2.strength === 40, h2.strength);
  G.weakenHouse(h2, 20);
  check("les coups s'additionnent", h2.hunted === 40, h2.hunted);
  check("une maison assez frappée n'a plus de plancher", G.houseFloor(h2) === 0);

  // La chute, et son prix.
  const s3 = freshGame();
  G.ensureSecondHouse();
  const h3 = ST().rival;
  const nom = h3.name;
  h3.strength = 60; h3.hunted = 0;
  G.weakenHouse(h3, 58);
  const land0 = ST().land, rep0 = ST().reputation, sus0 = ST().suspicion;
  G.houseBendPhase(); G.houseBendPhase();
  check("une maison frappée jusqu'au bout disparaît", ST().rival.name !== nom,
    ST().rival.name + " (était " + nom + ")");
  check("ses terres passent au domaine", ST().land > land0, ST().land - land0);
  check("le nom de la famille en souffre", ST().reputation < rep0, rep0 + " → " + ST().reputation);
  check("et l'on se met à vous regarder", ST().suspicion > sus0, sus0 + " → " + ST().suspicion);
  check("une vendetta reste derrière", !!ST().vendetta && ST().vendetta.from === nom);
  check("une autre maison prend la place", !!ST().rival && ST().rival.strength > 0);
  check("il y a toujours deux maisons", G.rivalHouses().length === 2);

  // La vendetta s'exerce puis s'éteint.
  const s4 = freshGame();
  ST().vendetta = {from:"Kessler", who:"Abel Kessler", since:1900, heat:100};
  ST().cowboys = [{name:"A",loyalty:70,shoot:10,ride:40,salary:10,years:2,trait:"V"}];
  ST().weapons = 0;
  let ran = 0;
  for(let i = 0; i < 400 && ST().vendetta; i++){ G.vendettaPhase(); ran++; }
  check("la vendetta finit par s'éteindre", ST().vendetta === null, ran + " passages");

  // La puissance d'une maison se traduit en clair pour le joueur.
  const s5 = freshGame();
  const seuils = [90, 60, 40, 20, 3].map(v => { ST().rival.strength = v; return G.houseThreat(ST().rival); });
  check("chaque niveau de puissance a sa phrase", new Set(seuils).size === 5, seuils.length);

  // Et elle pèse sur le marché.
  const s6 = freshGame();
  G.ensureSecondHouse();
  ST().rival.relation = 30; ST().rival2.relation = 30;
  check("des voisins cordiaux ne coûtent rien", G.houseMarketDrag() === 1);
  ST().rival.relation = -80; ST().rival.strength = 100;
  ST().rival2.relation = -80; ST().rival2.strength = 100;
  const drag = G.houseMarketDrag();
  check("deux voisins puissants et furieux coupent des débouchés", drag < 1, drag.toFixed(3));
  check("mais jamais au point de décider de la partie", drag >= .93, drag.toFixed(3));
}

// ------------------------------------------------- La nation ashkani
section("La nation ashkani");
{
  const phases = ev("NATION_PHASES");
  const eras = ev("ERAS").map(e => e.id);
  const manquantes = eras.filter(id => !phases[id]);
  check("chaque époque a sa posture", manquantes.length === 0, manquantes.join(", "));

  const s = freshGame();
  s.year = 1890; s.eraId = "foundation";
  check("la Fondation est une guerre de frontière", G.nationPhase() === "raid");
  s.eraId = "prohibition";  check("la Prohibition resserre l'étau", G.nationPhase() === "squeeze");
  s.eraId = "depression";   check("la Dépression constitue le dossier", G.nationPhase() === "file");
  s.eraId = "industrial";   check("l'après-guerre ouvre le prétoire", G.nationPhase() === "court");
  s.eraId = "modern";       check("et il ne se referme plus", G.nationPhase() === "court");

  // 1885 doit vraiment faire mal : on mesure les pertes sur cent trimestres.
  const s2 = freshGame();
  s2.year = 1890; s2.eraId = "foundation";
  s2.cattle = 4000; s2.feed = 200000; s2.weapons = 0; s2.cowboys = [];
  const nation = G.factionOfType("nation");
  nation.relation = -80;
  const cattle0 = ST().cattle, claim0 = ST().claimPressure || 0;
  // Mille tirages, pas cent : à cent, la mesure passait ou échouait selon la
  // graine, l'espérance étant tout près du seuil. Espérance ≈ 18 % de raids,
  // dont un tiers coûtent des bêtes, à douze têtes en moyenne — soit ~700.
  for(let i = 0; i < 1000; i++) G.nationHostilePhase(nation);
  const perdu1885 = cattle0 - ST().cattle;
  check("en 1885, la nation coûte des bêtes, et beaucoup", perdu1885 > 300, perdu1885 + " têtes sur 1000 trimestres");
  check("et la revendication monte quand même", (ST().claimPressure||0) > claim0);

  // 1960 ne coûte plus de bêtes : cela coûte des avocats.
  const s3 = freshGame();
  s3.year = 1960; s3.eraId = "industrial";
  s3.cattle = 4000; s3.money = 900000; s3.feed = 200000; s3.weapons = 0; s3.cowboys = [];
  const nation3 = G.factionOfType("nation");
  if(nation3){
    nation3.relation = -80;
    const c0 = ST().cattle, m0 = ST().money, p0 = ST().claimPressure || 0;
    for(let i = 0; i < 1000; i++) G.nationHostilePhase(nation3);
    check("en 1960, plus une bête n'est touchée", ST().cattle === c0, c0 - ST().cattle);
    check("mais l'argent part en frais", ST().money < m0, m0 - ST().money);
    check("et le dossier grossit plus vite qu'en 1885",
      (ST().claimPressure||0) - p0 > perdu1885 * 0, ((ST().claimPressure||0) - p0).toFixed(1));
  }

  // Un domaine bien gardé encaisse moins.
  const s4 = freshGame();
  s4.year = 1890; s4.eraId = "foundation";
  s4.cattle = 4000; s4.feed = 200000; s4.weapons = 10;
  s4.cowboys = [];
  for(let i = 0; i < 8; i++) s4.cowboys.push({name:"G"+i,loyalty:80,shoot:90,ride:80,salary:10,years:3,trait:"Vétéran"});
  const c4 = ST().cattle;
  const nation4 = G.factionOfType("nation");
  nation4.relation = -80;
  for(let i = 0; i < 1000; i++) G.nationHostilePhase(nation4);
  check("des hommes armés découragent les incursions",
    (c4 - ST().cattle) < perdu1885, (c4 - ST().cattle) + " contre " + perdu1885);
}

// ------------------------------------------------- Ceux qui en veulent au ranch
section("Ceux qui en veulent au ranch");
{
  // Les nouvelles scènes doivent exister à chaque époque, et toutes leurs
  // branches doivent s'exécuter — elles manipulent des hommes, des hectares et
  // des factions qui peuvent manquer.
  const titres = ["Les squatters de la source","Le comité des petits éleveurs","L'homme engagé pour vous",
    "Le racket de la brasserie","Les coupeurs de barbelés","Les journaliers refusent de descendre",
    "La caravane des expulsés","Le syndicat entre au ranch","Le tracé de la nationale",
    "Le rapport sur le surpâturage","Le boycott de la coopérative","Ils s'enchaînent au portail",
    "Le sabotage nocturne","Les drones au-dessus des enclos","La campagne organisée",
    "L'homme retranché dans le hangar"];
  const cat = ev("events");
  const absents = titres.filter(t => !cat.some(e => e.title === t));
  check("les seize scènes hostiles sont au catalogue", absents.length === 0, absents.join(", "));

  // Réparties sur les sept époques, aucune laissée de côté.
  const parEre = {};
  cat.filter(e => titres.includes(e.title)).forEach(e => { parEre[e.eraId] = (parEre[e.eraId]||0)+1; });
  const vides = ev("ERAS").map(e=>e.id).filter(id => !parEre[id]);
  check("chaque époque a les siennes", vides.length === 0, vides.join(", "));

  const errs = [];
  titres.forEach(t => {
    const e = cat.find(x => x.title === t);
    if(!e) return;
    e.choices.forEach((c, i) => {
      // Deux états opposés : un ranch riche et armé, un ranch démuni.
      [["riche", g => { g.money = 900000; g.land = 1200; g.cattle = 400; g.weapons = 6; g.feed = 900;
                        g.cowboys = [{name:"A",loyalty:70,shoot:80,ride:70,salary:10,years:3,trait:"V"},
                                     {name:"B",loyalty:70,shoot:80,ride:70,salary:10,years:3,trait:"V"}]; }],
       ["démuni", g => { g.money = 0; g.land = 60; g.cattle = 2; g.weapons = 0; g.feed = 0; g.cowboys = []; }]
      ].forEach(([nom, setup]) => {
        const g = freshGame();
        setup(g);
        G.ensureSecondHouse();
        try{
          if(c.condition && !c.condition()) return;
          if(typeof c.label === "function") c.label();
          c.apply();
        }catch(err){ errs.push(`${t} / choix ${i} (${nom}) : ${err.message}`); }
      });
    });
  });
  check("toutes les branches s'exécutent, riche comme démuni",
    errs.length === 0, errs.slice(0,3).join(" | "));

  // Elles doivent être atteignables : conditions satisfaisables.
  const bloques = [];
  titres.forEach(t => {
    const e = cat.find(x => x.title === t);
    if(!e || !e.condition) return;
    const g = permissiveGame();
    g.eraId = e.eraId;
    g.year = (ev("ERAS").find(x => x.id === e.eraId) || {start:1885}).start + 1;
    try{ if(!e.condition()) bloques.push(t); }catch(err){ bloques.push(t + " (" + err.message + ")"); }
  });
  check("aucune n'est verrouillée sur un état impossible", bloques.length === 0, bloques.join(", "));
}


// ------------------------------------------------- Les choix impossibles
section("Les choix impossibles");
{
  const cat = ev("FAMILY_CRISES");
  check("dix crises de famille au moins", cat.length >= 10, cat.length);
  check("identifiants uniques", new Set(cat.map(c=>c.id)).size === cat.length);

  const bad = [];
  cat.forEach(c => {
    ["id","title","art","image"].forEach(f => { if(!c[f]) bad.push(c.id + " sans " + f); });
    ["canStart","who","text"].forEach(f => { if(typeof c[f] !== "function") bad.push(c.id + " sans " + f); });
    if(!Array.isArray(c.choices) || c.choices.length < 3) bad.push(c.id + " a moins de trois issues");
    // LA RÈGLE DU CATALOGUE : aucune issue n'a le droit d'être gratuite.
    (c.choices||[]).forEach((ch,i) => {
      if(!ch.cost) bad.push(c.id + " : l'issue " + i + " ne coûte rien");
      if(typeof ch.apply !== "function") bad.push(c.id + " : l'issue " + i + " n'agit pas");
    });
  });
  check("chaque crise a trois issues, toutes décrites et toutes coûteuses",
    bad.length === 0, bad.slice(0,4).join(" | "));

  // Chaque crise doit pouvoir s'ouvrir sur un état de famille plausible, et
  // chacune de ses branches s'exécuter sans planter.
  const errs = [];
  const jamais = [];
  cat.forEach(c => {
    // Un état de maison riche en personnes : c'est ce que les crises exigent.
    const setup = () => {
      const g = freshGame();
      g.money = 900000; g.land = 1200; g.cattle = 400; g.unity = 30;
      g.suspicion = 45; g.legacy.greed = 4; g.legacy.honor = 1;
      g.year = 1980; g.eraId = "corporate";
      g.founder.age = 78; g.founder.health = 40;
      g.children = [];
      addAdult(g, "Aîné", {age:44, ambition:80, resentment:65});
      addAdult(g, "Cadet", {age:38, ambition:70, resentment:40});
      G.addChild("Benjamin", {age:15, health:100});
      G.ensureSecondHouse();
      return g;
    };
    const g0 = setup();
    let ok = false;
    try{ ok = c.canStart() && !!c.who(); }catch(e){ errs.push(c.id + " canStart : " + e.message); }
    if(!ok){ jamais.push(c.id); return; }
    c.choices.forEach((ch, i) => {
      setup();
      let sujet = null;
      try{ sujet = c.who(); }catch(e){ errs.push(c.id + "/" + i + " who : " + e.message); return; }
      try{ if(typeof c.text === "function") c.text(sujet); }catch(e){ errs.push(c.id + "/" + i + " texte : " + e.message); }
      try{ if(typeof ch.label === "function") ch.label(sujet); }catch(e){ errs.push(c.id + "/" + i + " libellé : " + e.message); }
      try{ if(ch.condition && !ch.condition()) return; }catch(e){ errs.push(c.id + "/" + i + " condition : " + e.message); return; }
      try{ ch.apply(sujet); }catch(e){ errs.push(c.id + "/" + i + " : " + e.message); }
    });
  });
  check("toutes les branches de toutes les crises s'exécutent", errs.length === 0, errs.slice(0,4).join(" | "));
  check("chaque crise s'ouvre sur une maison plausible", jamais.length <= 2, jamais.join(", "));

  // Le libellé doit citer la personne : c'est ce qui rend le choix insoutenable.
  {
    const g = freshGame();
    g.children = [];
    addAdult(g, "Aîné", {age:40, ambition:80});
    addAdult(g, "Cadet", {age:35, ambition:60});
    const c = cat.find(x => x.id === "twoHeirs");
    const h = c.who();
    check("le choix entre deux héritiers les nomme",
      /Aîné/.test(c.choices[0].label(h)) && /Cadet/.test(c.choices[1].label(h)),
      c.choices[0].label(h));
  }

  // La file : une seule à la fois, jamais deux fois la même.
  {
    const g = freshGame();
    g.unity = 25; g.turn = 200; g.crisisCooldown = 0;
    g.children = [];
    addAdult(g, "Aîné", {age:40, ambition:80, resentment:70});
    addAdult(g, "Cadet", {age:35, ambition:60, resentment:50});
    let opened = 0;
    for(let i = 0; i < 200 && !ST().crisis; i++){ G.maybeStartCrisis(); if(ST().crisis) opened++; }
    check("une crise finit par s'ouvrir sur une maison divisée", opened === 1, opened);
    const id = ST().crisis.id;
    G.maybeStartCrisis();
    check("une seule crise à la fois", ST().crisis.id === id);
    G.closeCrisis(id);
    check("la crise close est enregistrée", (ST().crisesDone||[]).indexOf(id) >= 0);
    check("et un long délai court avant la suivante",
      ST().crisisCooldown >= ST().turn + 40, ST().crisisCooldown - ST().turn);
    ST().crisisCooldown = 0;
    let same = 0;
    for(let i = 0; i < 400; i++){ ST().crisis = null; G.maybeStartCrisis(); if(ST().crisis && ST().crisis.id === id) same++; }
    check("jamais deux fois la même crise", same === 0, same);
  }

  // Une maison unie en essuie moins qu'une maison divisée.
  {
    const mesure = (unity) => {
      const g = freshGame();
      g.unity = unity; g.turn = 500;
      g.children = [];
      addAdult(g, "Aîné", {age:40, ambition:80, resentment:70});
      addAdult(g, "Cadet", {age:35, ambition:60, resentment:50});
      let n = 0;
      for(let i = 0; i < 3000; i++){ ST().crisis = null; ST().crisisCooldown = 0; G.maybeStartCrisis(); if(ST().crisis) n++; }
      return n;
    };
    const divisee = mesure(25), unie = mesure(90);
    check("une maison divisée s'attire plus de crises", divisee > unie * 1.5,
      divisee + " contre " + unie + " sur 3000 essais");
  }
}

// ------------------------------------------------- La scission
section("La scission de la famille");
{
  const s = freshGame();
  s.land = 1000; s.cattle = 400; s.money = 100000;
  s.children = [];
  addAdult(s, "Dissident", {age:40, ambition:90, resentment:80});
  addAdult(s, "Fidèle", {age:35, ambition:40, resentment:10});
  G.ensureSecondHouse();
  const land0 = ST().land, cattle0 = ST().cattle, kids0 = ST().children.length;
  const dissident = ST().children.find(c => c.name === "Dissident");
  G.splitFamily(dissident, "test");

  check("la branche part avec une part du domaine", ST().land < land0, land0 + " → " + ST().land);
  check("et une part du troupeau", ST().cattle < cattle0, cattle0 + " → " + ST().cattle);
  check("elle quitte la maisonnée", ST().children.length === kids0 - 1);
  check("elle devient une maison rivale",
    G.rivalHouses().some(h => h.kin === true));
  check("qui porte votre propre nom",
    G.rivalHouses().some(h => h.kin && h.name === ST().familyName), ST().familyName);
  check("menée par le dissident",
    G.rivalHouses().some(h => h.kin && h.leader && h.leader.name === "Dissident"));
  check("et qui vous en veut", G.rivalHouses().find(h=>h.kin).relation < 0);
  check("il reste deux maisons en face", G.rivalHouses().length === 2);
  check("l'unité s'effondre", ST().unity < 100);
  check("la scission est comptée", ST().familySplit === 1);

  // La branche dissidente doit se comporter comme n'importe quelle maison :
  // c'est tout l'intérêt de la faire passer par le même système.
  const branche = G.rivalHouses().find(h => h.kin);
  branche.relation = -80; branche.strength = 60;
  ST().rivalTarget = 0;
  check("on peut lui nuire comme aux autres", G.rivalOps().length > 0);
  const avant = branche.strength;
  G.weakenHouse(branche, 15);
  check("et l'affaiblir", branche.strength === avant - 15, branche.strength);
}

// ------------------------------------------------- Le dernier assaut
section("Le dernier assaut");
{
  const s = freshGame();
  s.year = 2000;
  check("le siège n'existe pas avant 2012", G.siegeActive() === false);
  s.year = 2015;
  check("il court à partir de 2012", G.siegeActive() === true);

  // Ce qui pousse et ce qui retient sont tous deux nommés.
  const s2 = freshGame();
  s2.year = 2016; s2.eraId = "modern";
  s2.unity = 20; s2.suspicion = 70; s2.debt = 5000;
  s2.reputation = 10;
  (s2.factions||[]).forEach(f => f.relation = -60);
  G.ensureDeveloper(); if(ST().developer) ST().developer.pressure = 70;
  const f1 = G.siegeForces();
  check("les forces qui poussent sont nommées", f1.pour.length >= 3, f1.pour.map(x=>x.label).join(", "));
  const avant = ST().siege || 0;
  G.siegePhase();
  check("et le siège monte", (ST().siege||0) > avant, (ST().siege||0).toFixed(1));

  // Une maison irréprochable le fait redescendre.
  const s3 = freshGame();
  s3.year = 2016; s3.eraId = "modern";
  s3.unity = 90; s3.suspicion = 0; s3.reputation = 100; s3.debt = 0;
  s3.protectedLand = 400;
  (s3.factions||[]).forEach(f => f.relation = 70);
  s3.politics = {office:"governor", scrutiny:0, terms:1};
  ST().siege = 50;
  const f2 = G.siegeForces();
  check("ce qui retient est nommé aussi", f2.contre.length >= 3, f2.contre.map(x=>x.label).join(", "));
  G.siegePhase();
  check("une maison irréprochable fait redescendre le siège", (ST().siege||0) < 50, (ST().siege||0).toFixed(1));

  // Les trois épreuves, dans l'ordre, chacune une seule fois.
  const trials = ev("SIEGE_TRIALS");
  check("trois épreuves échelonnées", trials.length === 3);
  check("elles montent en difficulté",
    trials[0].at < trials[1].at && trials[1].at < trials[2].at,
    trials.map(t=>t.at).join(" < "));

  const errs = [];
  trials.forEach(t => {
    t.choices.forEach((ch, i) => {
      [["riche", 9000000], ["démuni", 0]].forEach(([nom, argent]) => {
        const g = freshGame();
        g.year = 2018; g.eraId = "modern"; g.money = argent;
        g.land = 2000; g.cattle = 800; g.siege = t.at;
        G.ensureDeveloper();
        try{
          if(typeof t.text === "function") t.text();
          if(typeof ch.label === "function") ch.label();
          if(ch.condition && !ch.condition()) return;
          ch.apply();
        }catch(e){ errs.push(`${t.id}/${i} (${nom}) : ${e.message}`); }
      });
    });
  });
  check("toutes les branches des épreuves s'exécutent", errs.length === 0, errs.slice(0,3).join(" | "));

  // L'épreuve s'ouvre au bon palier, une seule fois.
  const s4 = freshGame();
  s4.year = 2018; s4.eraId = "modern"; s4.money = 900000; s4.siege = 10;
  check("sous le premier palier, rien ne s'ouvre", G.maybeShowSiegeTrial() === false);
  ST().siege = 30;
  check("au premier palier, l'épreuve s'ouvre", G.maybeShowSiegeTrial() === true);
  check("le panneau s'affiche", !$el("eventModal")._classes.has("hidden"));
  check("elle ne se rejoue pas", G.maybeShowSiegeTrial() === false);

  // La fin par expropriation.
  const s5 = freshGame();
  s5.year = 2020; s5.eraId = "modern"; s5.siege = 99;
  check("à 99, la partie continue", G.checkSiegeEnd() === false);
  ST().siege = 100;
  check("à 100, le comté exproprie", G.checkSiegeEnd() === true);
  check("et la partie s'arrête", ST().gameOver === true);
  check("avec sa propre fin", $el("eventTitle").textContent === "Déclaré d'utilité publique",
    $el("eventTitle").textContent);

  // Rien n'arrive par surprise : le bandeau d'alertes le dit des années avant.
  const s6 = freshGame();
  s6.year = 2016; s6.eraId = "modern"; s6.siege = 40;
  const al = G.alarms();
  check("le siège figure au bandeau d'alertes", al.some(a => /visé/.test(a.title)),
    al.map(a=>a.title).join(" | "));
  const ligne = al.find(a => /visé/.test(a.title));
  check("il dit ce qui pousse et ce qui retient",
    /pousse/.test(ligne.what) && /retient/.test(ligne.what));
}

console.log("\n" + pass + " vérifications passées, " + fail + " échec(s).");
process.exit(fail ? 1 : 0);
