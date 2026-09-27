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
vm.runInContext(ENGINE + "\n;globalThis.__E = {newGame, runAI, finishTurn, applyBattle, autoBattle, battleValid, createBattle, bRunAI, bResult, bDamage, bArc, bSideUnits, makeBattle, addFleet, fleetById, shipCount, planetsOf, income, FACTION_IDS, SYSTEMS, SYS, ADJ, FLEET_MP, BMAX_ROUNDS, BMAX_ROUNDS_GROUND, troops, troopCount, fleetLoad, fleetCap, makeInvasion, invasionValid, createGroundBattle, applyGround, bOrbital, bUnitAt, TROOP_TYPES, charOf, voteSupport, canEnact, enactDecree, hasDecree, resolveDilemma, dilemmaOptions, MAX_DECREES, DECREE_IDS, EVENTS, eventOptions, resolveEvent, takeLoan, repayLoan, hireMercs, assassinate, assassinTargets, purge, buyIntel, syndicateTurn, finishTurnOnly:finishTurn, LOAN};", ctx);
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
    if(E.TROOP_TYPES.some(t => !(f.troops[t] >= 0))) fail(where + " : troupes négatives dans " + f.id);
    if(E.fleetLoad(f) > E.fleetCap(f)) fail(where + " : soutes surchargées " + f.id + " " + E.fleetLoad(f) + "/" + E.fleetCap(f));
  });
  Object.values(st.systems).forEach(s => {
    if(E.TROOP_TYPES.some(t => !(s.garrison[t] >= 0))) fail(where + " : garnison négative " + s.id);
    if(!(s.synd >= 0 && s.synd <= 100)) fail(where + " : emprise hors bornes " + s.id + " " + s.synd);
    if(s.cartel && s.owner) fail(where + " : " + s.id + " tenu à la fois par le Syndicat et par " + s.owner);
    const g = E.charOf(st, s.governor);
    if(s.owner && (!g || g.fid !== s.owner || g.at !== s.id)) fail(where + " : " + s.id + " sans gouverneur valide");
  });
  st.fleets.forEach(f => {
    const a = E.charOf(st, f.admiral);
    if(!a || a.fid !== f.owner || a.at !== f.id) fail(where + " : flotte " + f.id + " sans amiral valide");
  });
  E.FACTION_IDS.forEach(fid => {
    const F = st.factions[fid];
    if(!F.alive) return;
    F.groups.forEach(g => { if(!(g.sat >= 0 && g.sat <= 100)) fail(where + " : satisfaction hors bornes " + fid + "." + g.key); if(!E.charOf(st, g.chief)) fail(where + " : groupe sans chef " + fid + "." + g.key); });
    if(!E.charOf(st, F.leader)) fail(where + " : " + fid + " sans dirigeant");
    if(F.decrees.length > E.MAX_DECREES) fail(where + " : trop de décrets " + fid);
    if(!(F.weariness >= 0 && F.weariness <= 100 && F.syndicate >= 0 && F.syndicate <= 100)) fail(where + " : jauges hors bornes " + fid);
  });
  Object.values(st.chars).forEach(c => { if(!st.factions[c.fid].alive) fail(where + " : personnage d'une faction effondrée"); });
}

// ---------- Parties complètes ----------
const results = [];
for(let g = 0; g < GAMES; g++){
  const player = E.FACTION_IDS[g % 4];
  const st = E.newGame(player, 1000 + g);
  checkInvariants(st, "partie " + g + " départ");
  let battles = 0, invasions = 0;
  try{
    while(!st.over && st.turn <= MAX_TURNS){
      const before = st.log.length;
      E.runAI(st, {includePlayer:true});
      battles += st.log.slice(before).filter(e => e.msg.startsWith("Bataille")).length;
      invasions += st.log.slice(before).filter(e => /^Invasion|débarque/.test(e.msg)).length;
      E.finishTurn(st);
      checkInvariants(st, "partie " + g + " tour " + st.turn);
      if(failures > 20) break;
    }
  }catch(e){ fail("partie " + g + " : exception " + e.stack); }
  const counts = {};
  E.FACTION_IDS.forEach(f => { counts[f] = E.planetsOf(st, f).length; });
  results.push({g, player, turn:st.turn - 1, over:st.over, counts, battles, invasions});
}
console.log("Parties (IA contre IA) :");
results.forEach(r => {
  console.log("  #" + String(r.g).padStart(2) + " " + r.player + " — " +
    (r.over ? (r.over.winner ? "vainqueur " + r.over.winner : "joueur éliminé") + " au tour " + r.over.turn : "sans vainqueur après " + r.turn + " tours") +
    " · mondes " + E.FACTION_IDS.map(f => f + ":" + r.counts[f]).join(" ") + " · batailles " + r.battles + " · invasions " + r.invasions);
});
const wins = {};
results.forEach(r => { if(r.over && r.over.winner) wins[r.over.winner] = (wins[r.over.winner] || 0) + 1; });
console.log("Victoires :", JSON.stringify(wins));
if(!results.some(r => r.battles > 0)) fail("aucune bataille en " + GAMES + " parties");
if(!results.some(r => r.invasions > 0)) fail("aucune invasion en " + GAMES + " parties");
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

// ---------- Batailles terrestres IA contre IA ----------
{
  let done = 0, attWins = 0, rounds = 0;
  for(let k = 0; k < 60; k++){
    const st = E.newGame("emp", 7000 + k);
    const s = st.systems.fondor;                        // monde indépendant
    s.def = k % 3 === 0 ? s.maxDef : 0;                 // fortifications intactes ou tombées
    const f = E.addFleet(st, "man", "fondor", {dest:1 + k % 2, frig:1}, 0);
    f.troops = E.troops({inf:2 + k % 4, tank:k % 3, walk:k % 2, art:k % 2});
    const gs = E.makeInvasion(st, f);
    if(!E.invasionValid(st, gs)){ fail("invasion " + k + " refusée"); continue; }
    const b = E.createGroundBattle(st, gs);
    E.bRunAI(b);
    if(!b.over){ fail("bataille terrestre " + k + " non terminée"); continue; }
    if(b.round > E.BMAX_ROUNDS_GROUND + 1) fail("bataille terrestre " + k + " trop longue");
    const before = s.owner;
    const r = E.applyGround(st, gs, E.bResult(b));
    checkInvariants(st, "bataille terrestre " + k);
    if(b.over.winner === 0){
      attWins++;
      if(s.owner !== "man") fail("bataille terrestre " + k + " gagnée sans prise du monde");
      if(E.troopCount(f.troops) !== 0) fail("les vainqueurs devraient avoir débarqué");
    } else if(s.owner !== before) fail("bataille terrestre " + k + " perdue mais monde pris");
    done++; rounds += b.round;
  }
  console.log("Batailles terrestres : " + done + " terminées, " + attWins + " victoires de l'assaillant, " + (rounds / Math.max(1, done)).toFixed(1) + " rounds en moyenne");
}

// ---------- Frappe orbitale : touche la case visée et les voisines ----------
{
  const st = E.newGame("emp", 99);
  const f = E.addFleet(st, "rep", "fondor", {dest:2}, 0);
  f.troops = E.troops({inf:3});
  st.systems.fondor.def = 0;                            // bouclier planétaire tombé
  const b = E.createGroundBattle(st, E.makeInvasion(st, f));
  if(!b.orbital || b.orbital.left < 1) fail("appui orbital attendu");
  const t = E.bSideUnits(b, 1)[0];
  const hp = t.hull;
  if(!E.bOrbital(b, t.c, t.r)) fail("frappe orbitale refusée");
  if(!(t.hull < hp)) fail("la frappe orbitale n'a pas blessé la cible");
  console.log("Frappe orbitale : " + (hp - Math.max(0, t.hull)) + " dégâts sur la cible");
}

// ---------- Politique : vote du Sénat, décrets, dilemmes ----------
{
  const st = E.newGame("rep", 4242);
  const F = st.factions.rep;
  F.inf = 200;
  F.groups.forEach(g => { g.sat = 20; });                // Sénat furieux
  const v = E.voteSupport(st, "rep", "conscription");
  if(v.pass) fail("un Sénat furieux ne devrait pas voter la conscription");
  if(E.canEnact(st, "rep", "conscription", false)) fail("décret soumis au vote promulgué sans majorité");
  if(!E.enactDecree(st, "rep", "conscription", true)) fail("l'achat des voix devrait permettre la conscription");
  if(!E.hasDecree(st, "rep", "conscription")) fail("conscription absente après promulgation");
  if(E.enactDecree(st, "rep", "terror", false)) fail("la Doctrine de terreur est réservée aux Vestiges impériaux");
  // Chaque option de chaque dilemme se résout sans erreur.
  const kinds = [
    {kind:"duel", fid:"man", group:"war"}, {kind:"defiance", fid:"rep"},
    {kind:"rival", fid:"emp", char:st.fleets.find(f => f.owner === "emp").admiral},
  ];
  let n = 0;
  kinds.forEach(base => {
    const probe = E.newGame("emp", 99);
    probe.factions[base.fid].inf = 100;
    const d0 = Object.assign({title:"", text:""}, base);
    if(d0.kind === "rival") d0.char = probe.fleets.find(f => f.owner === "emp").admiral;
    E.dilemmaOptions(probe, d0).forEach(o => {
      const game = E.newGame("emp", 99);
      game.factions[base.fid].inf = 100;
      const d = Object.assign({}, d0);
      try{ E.resolveDilemma(game, d, o.key); n++; checkInvariants(game, "dilemme " + d.kind + "/" + o.key); }
      catch(e){ fail("dilemme " + d.kind + "/" + o.key + " : " + e.message); }
    });
  });
  console.log("Politique : vote " + v.yes + "/100 sans achat, " + n + " options de dilemme résolues");
}

// ---------- Événements : chaque option de chaque événement ----------
{
  let n = 0, missing = [];
  E.EVENTS.forEach(ev => {
    let game = null, ctx = null;
    for(let seed = 0; seed < 40 && !ctx; seed++){
      game = E.newGame(E.FACTION_IDS[seed % 4], 800 + seed);
      const fid = game.player;
      // Un peu d'histoire pour rendre tous les événements possibles
      game.factions[fid].inf = 60; game.factions[fid].cr = 300; game.factions[fid].mat = 50;
      Object.values(game.chars).forEach(c => { if(c.fid === fid && c.role === "admiral") c.xp = 2; });
      E.planetsOf(game, fid).forEach(p => { p.synd = 60; p.queue.push({type:"frig", left:2, total:3}); });
      if(ev.weight(game, fid) > 0) ctx = ev.ctx(game, fid);
    }
    if(!ctx){ missing.push(ev.id); return; }
    const opts = E.eventOptions(game, {id:ev.id, fid:game.player, ctx});
    opts.forEach(o => {
      const g2 = JSON.parse(JSON.stringify(game));
      try{
        const msg = E.resolveEvent(g2, {id:ev.id, fid:g2.player, ctx}, o.key);
        if(!msg) fail("événement " + ev.id + "/" + o.key + " sans message");
        // Laisser passer quelques tours pour déclencher les effets différés
        for(let t = 0; t < 12 && !g2.over; t++){ E.runAI(g2, {includePlayer:true}); E.finishTurnOnly(g2); }
        checkInvariants(g2, "événement " + ev.id + "/" + o.key);
        n++;
      }catch(e){ fail("événement " + ev.id + "/" + o.key + " : " + e.stack); }
    });
  });
  if(missing.length) fail("événements jamais déclenchables : " + missing.join(", "));
  console.log("Événements : " + E.EVENTS.length + " types, " + n + " options résolues");
}

// ---------- Syndicat : prêt, dette impayée, mercenaires, assassinat, purge ----------
{
  const st = E.newGame("lig", 5150), F = st.factions.lig;
  const cr0 = F.cr;
  if(!E.takeLoan(st, "lig")) fail("prêt refusé");
  if(F.cr !== cr0 + E.LOAN.amount || !F.debt) fail("prêt mal versé");
  if(E.takeLoan(st, "lig")) fail("deux prêts à la fois");
  F.cr = -500;                                         // insolvable
  st.turn = F.debt.due;
  const planets0 = JSON.stringify(E.planetsOf(st, "lig").map(p => [p.def, p.loyalty]));
  E.syndicateTurn(st);
  if(!F.debt || F.debt.late !== 1 || F.debt.amount <= E.LOAN.repay) fail("la dette impayée devrait grossir");
  F.cr = 2000;
  if(!E.repayLoan(st, "lig") || F.debt) fail("remboursement impossible");
  const cap = st.systems.lothal;
  const merc = E.hireMercs(st, "lig", "fleet", "lothal");
  if(!merc || merc.owner !== "lig") fail("flotte de mercenaires absente");
  const t = E.assassinTargets(st, "lig").find(c => c.role === "admiral");
  if(!t || E.assassinate(st, "lig", t) === null) fail("assassinat refusé");
  cap.synd = 90; F.inf = 50;
  const loy = cap.loyalty;
  if(!E.purge(st, "lothal") || cap.synd !== 55 || cap.loyalty !== Math.max(0, loy - 15)) fail("purge incorrecte");
  checkInvariants(st, "services du Syndicat");
  console.log("Syndicat : prêt, dette impayée, mercenaires, assassinat et purge vérifiés");
}

// ---------- Boucliers orientés : un tir dans le dos fait plus mal ----------
{
  const st = E.newGame("emp", 42);
  const a = E.addFleet(st, "rep", "fondor", {dest:1}, 0);
  const d = E.addFleet(st, "man", "fondor", {frig:1}, 0);
  const b = E.createBattle(st, E.makeBattle(st, a, d));
  const [att] = E.bSideUnits(b, 0), [tgt] = E.bSideUnits(b, 1);
  att.dmgMul = 1; b.terrain = {};                        // sans amiral ni terrain
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
