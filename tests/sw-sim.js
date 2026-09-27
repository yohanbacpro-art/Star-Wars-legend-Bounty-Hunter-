// Simule des parties complètes de star-wars.html hors navigateur.
// Seul le premier bloc <script> (le moteur, sans DOM) est chargé ; toutes les
// factions, joueur compris, sont confiées à l'IA.
//
// Usage : node tests/sw-sim.js [nombre de parties] [tours max]
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "star-wars.html"), "utf8");
const ENGINE = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const ctx = {Math, JSON, Object, Array, String, Number, Set, Map, console};
vm.createContext(ctx);
vm.runInContext(ENGINE + "\n;globalThis.__E = {newGame, runAI, finishTurn, applyBattle, autoBattle, battleValid, createBattle, bRunAI, bResult, bDamage, bArc, bSideUnits, makeBattle, addFleet, fleetById, shipCount, planetsOf, income, FACTION_IDS, SYSTEMS, SYS, ADJ, FLEET_MP, BMAX_ROUNDS};", ctx);
const E = ctx.__E;

const GAMES = +process.argv[2] || 24;
const MAX_TURNS = +process.argv[3] || 150;
let failures = 0;
const fail = (msg) => { failures++; console.error("ÉCHEC : " + msg); };
const finite = (v) => typeof v === "number" && Number.isFinite(v);

function checkInvariants(st, where){
  E.FACTION_IDS.forEach(f => {
    const F = st.factions[f];
    ["cr", "mat", "inf", "shock"].forEach(k => { if(!finite(F[k])) fail(where + " : " + f + "." + k + " = " + F[k]); });
  });
  Object.values(st.systems).forEach(s => {
    if(s.owner !== null && !E.FACTION_IDS.includes(s.owner)) fail(where + " : propriétaire inconnu " + s.owner);
    if(s.owner && !st.factions[s.owner].alive) fail(where + " : " + s.id + " tenu par une faction effondrée");
    if(!(s.loyalty >= 0 && s.loyalty <= 100)) fail(where + " : loyauté hors bornes " + s.id + " " + s.loyalty);
    if(!(s.def >= 0 && s.def <= s.maxDef)) fail(where + " : défense hors bornes " + s.id + " " + s.def);
  });
  const ids = new Set();
  st.fleets.forEach(f => {
    if(ids.has(f.id)) fail(where + " : id de flotte en double " + f.id);
    ids.add(f.id);
    if(!E.SYS[f.at]) fail(where + " : flotte " + f.id + " hors carte");
    if(E.shipCount(f) <= 0) fail(where + " : flotte vide " + f.id);
    if(["dest", "frig", "esc"].some(t => !(f.ships[t] >= 0))) fail(where + " : effectif négatif " + f.id);
    if(!st.factions[f.owner].alive) fail(where + " : flotte d'une faction effondrée");
    if(!(f.vet >= 0 && f.vet <= 3)) fail(where + " : vétérance " + f.vet);
  });
}

// ---------- Parties complètes ----------
const results = [];
for(let g = 0; g < GAMES; g++){
  const player = E.FACTION_IDS[g % 4];
  const st = E.newGame(player, 1000 + g);
  checkInvariants(st, "partie " + g + " départ");
  let battles = 0;
  try{
    while(!st.over && st.turn <= MAX_TURNS){
      const before = st.log.length;
      E.runAI(st, {includePlayer:true});
      battles += st.log.slice(before).filter(e => e.msg.startsWith("Bataille")).length;
      E.finishTurn(st);
      checkInvariants(st, "partie " + g + " tour " + st.turn);
      if(failures > 20) break;
    }
  }catch(e){ fail("partie " + g + " : exception " + e.stack); }
  const counts = {};
  E.FACTION_IDS.forEach(f => { counts[f] = E.planetsOf(st, f).length; });
  results.push({g, player, turn:st.turn - 1, over:st.over, counts, battles});
}
console.log("Parties (IA contre IA) :");
results.forEach(r => {
  console.log("  #" + String(r.g).padStart(2) + " " + r.player + " — " +
    (r.over ? (r.over.winner ? "vainqueur " + r.over.winner : "joueur éliminé") + " au tour " + r.over.turn : "sans vainqueur après " + r.turn + " tours") +
    " · mondes " + E.FACTION_IDS.map(f => f + ":" + r.counts[f]).join(" ") + " · batailles " + r.battles);
});
const wins = {};
results.forEach(r => { if(r.over && r.over.winner) wins[r.over.winner] = (wins[r.over.winner] || 0) + 1; });
console.log("Victoires :", JSON.stringify(wins));
if(!results.some(r => r.battles > 0)) fail("aucune bataille en " + GAMES + " parties");
if(!results.some(r => r.over)) fail("aucune partie terminée en " + MAX_TURNS + " tours");

// ---------- Batailles tactiques IA contre IA ----------
let tactical = 0, rounds = 0;
for(let k = 0; k < 60; k++){
  const st = E.newGame("emp", 5000 + k);
  const sys = "fondor";
  const a = E.addFleet(st, "rep", "fondor", {dest:k % 3, frig:1 + k % 4, esc:2 + k % 5}, k % 2);
  const d = E.addFleet(st, "man", "fondor", {dest:(k + 1) % 2, frig:2 + k % 3, esc:1 + k % 6}, 0);
  // Un renfort adjacent de chaque côté, une fois sur deux
  if(k % 2){ E.addFleet(st, "rep", "kuat", {frig:1, esc:1}, 0); E.addFleet(st, "man", "carida", {esc:3}, 0); }
  const bs = E.makeBattle(st, a, d);
  const b = E.createBattle(st, bs);
  E.bRunAI(b);
  if(!b.over){ fail("bataille " + k + " non terminée"); continue; }
  if(b.round > E.BMAX_ROUNDS + 1) fail("bataille " + k + " trop longue : " + b.round);
  const res = E.bResult(b);
  E.applyBattle(st, bs, res);
  checkInvariants(st, "bataille " + k);
  tactical++; rounds += b.round;
}
console.log("Batailles tactiques : " + tactical + " terminées, " + (rounds / Math.max(1, tactical)).toFixed(1) + " rounds en moyenne");

// ---------- Boucliers orientés : un tir dans le dos fait plus mal ----------
{
  const st = E.newGame("emp", 42);
  const a = E.addFleet(st, "rep", "fondor", {dest:1}, 0);
  const d = E.addFleet(st, "man", "fondor", {frig:1}, 0);
  const b = E.createBattle(st, E.makeBattle(st, a, d));
  const [att] = E.bSideUnits(b, 0), [tgt] = E.bSideUnits(b, 1);
  tgt.c = 5; tgt.r = 4; tgt.facing = 3;     // tourné vers l'ouest
  const front = E.bDamage(b, att, tgt, 3, 4, "hull", true); // tir depuis l'ouest
  const rear = E.bDamage(b, att, tgt, 7, 4, "hull", true);  // tir depuis l'est
  if(front.arc !== "f") fail("arc avant attendu, obtenu " + front.arc);
  if(rear.arc !== "r") fail("arc arrière attendu, obtenu " + rear.arc);
  if(!(rear.hull > front.hull)) fail("le tir arrière devrait percer davantage (" + rear.hull + " ≤ " + front.hull + ")");
  console.log("Boucliers : avant " + front.hull + " de coque, arrière " + rear.hull);
}

if(failures){ console.error(failures + " échec(s)."); process.exit(1); }
console.log("OK");
