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
  s.factions.forEach((f,i) => f.relation = i === 0 ? -50 : 70);
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
    () => { const s = permissiveGame(); s.cowboys = s.cowboys.slice(0,1); s.cattle = 300; return s; }
  ];
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
  check("la plupart des époques ont un tournant", covered.length >= 5, covered.join(", "));
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

  // Une époque sans tournant garde son simple « Continuer ».
  G.showEraTransition(ev("ERAS.find(e=>e.id==='foundation')"));
  check("une époque sans tournant reste simple", $el("eventChoices").children.length === 1);
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
  check("la carte est dessinée dans la page", $el("mapContent").innerHTML.includes("<svg"));
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
  check("les scènes se teintent aux couleurs de l'époque",
    svgs.every(x => x.includes("var(--")));
  const ids = svgs.map(x => (x.match(/id="([^"]+)"/)||[])[1]);
  check("les dégradés ont des identifiants distincts",
    new Set(ids).size === ids.length, ids.join(","));

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
  const era = ev("ERAS").find(e => ev(`ILLEGAL_OPS["${e.id}"]`).some(o => o.cost));
  const withCost = ev(`ILLEGAL_OPS["${era.id}"]`).find(o => o.cost);
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
  // Arbitrage voulu : le crime paie davantage sur le coup, l'honnêteté gagne
  // dans la durée par la réputation, qui majore les revenus du ranch.
  check("la contrebande paie plus à l'action",
    illeg1 > compet1, "trafic " + Math.round(illeg1) + " vs concours " + Math.round(compet1));
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
  const s = freshGame();
  s.reputation = 100; s.cattle = 40; s.land = 200; s.money = 100000;
  s.feed = 5000; s.rival.relation = 0;
  s.factions.forEach(f => f.relation = 0);
  for(let i = 0; i < 40; i++) G.endTurn();
  check("une réputation non entretenue redescend", ST().reputation < 100, ST().reputation);
  check("elle ne s'effondre pas non plus", ST().reputation > 40, ST().reputation);
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
  check("la quasi-totalité des objectifs sont atteignables", unlocked.size >= all.length - 3, unlocked.size + "/" + all.length);
}

console.log("\n" + pass + " vérifications passées, " + fail + " échec(s).");
process.exit(fail ? 1 : 0);
