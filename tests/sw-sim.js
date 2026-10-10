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
vm.runInContext(ENGINE + "\n;globalThis.__E = {newGame, runAI, finishTurn, applyBattle, autoBattle, battleValid, createBattle, bRunAI, bResult, bDamage, bArc, bSideUnits, makeBattle, addFleet, fleetById, shipCount, planetsOf, income, FACTION_IDS, SYSTEMS, SYS, ADJ, FLEET_MP, BMAX_ROUNDS, BMAX_ROUNDS_GROUND, troops, troopCount, fleetLoad, fleetCap, makeInvasion, invasionValid, createGroundBattle, applyGround, bOrbital, bUnitAt, TROOP_TYPES, charOf, voteSupport, canEnact, enactDecree, hasDecree, resolveDilemma, dilemmaOptions, MAX_DECREES, DECREE_IDS, EVENTS, eventOptions, resolveEvent, takeLoan, repayLoan, hireMercs, assassinate, assassinTargets, purge, buyIntel, syndicateTurn, finishTurnOnly:finishTurn, LOAN, sithCoup, sithCoupReady, sithClaim, sithTurn, charDies, makeTruce, moveFleet, canInvade, hostileFleetsAt, probeChar, checkVictory, HEROES, genChar, startCrisis, crisisTurn, canMove, tradeRoutes, makeAlliance, allied, hostile, hegemonyStatus, convokeCongress, quarantine, canQuarantine, WEAPON_TURNS, playableFactions, SYS, SPECS, BUILDINGS, UNIQUE_IDS, slotsUsed, defenseMul, specialize, canSpecialize, queueBuilding, canQueueBuilding, buildBlock, buildingsTurn, shipCostAt, recruitCostAt, planetYield, capture, warDamage, groundBonus, refreshPlanet, JEDI_MASTERS, MASTER_IDS, trainPadawan, lendJedi, recallJedi, guardWorld, guardAt, mediate, canMediate, sendAid, jediHunt, jediDuel, canDuel, jediSearch, jediJudge, conclaveStatus, convokeConclave, jediTotal, jediTurn, aiJedi, heroMul, hireGeneral, generalToFleet, generalToPlanet, generalMul, generalsOf, mergeFleets, removeFleet, groundPower, autoGround, applyGround};", ctx);
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
  const S = st.factions.sith;
  if(!(st.jedi.strength >= 0)) fail(where + " : force Jedi négative");
  if(S.alive && !(S.acolytes >= 0 && S.acolytes <= 6 && S.exposure >= 0 && S.exposure <= 100 && S.dark >= 0)) fail(where + " : jauges Sith hors bornes");
  if(S.alive && S.shadow && (E.planetsOf(st, "sith").length || st.fleets.some(f => f.owner === "sith"))) fail(where + " : un Sith caché ne devrait rien posséder");
  st.fleets.forEach(f => (f.heroes || []).forEach(h => { if(!E.HEROES[h.kind]) fail(where + " : héros inconnu " + h.kind); }));
  const W = st.factions.war;
  if(W.shadow && (E.planetsOf(st, "war").length || st.fleets.some(f => f.owner === "war"))) fail(where + " : seigneur de guerre dormant mais présent");
  st.closedLinks.forEach(([a, b]) => { if(!E.SYS[a] || !E.SYS[b]) fail(where + " : route fermée inconnue"); });
  Object.values(st.systems).forEach(s => {
    if(E.slotsUsed(s) > s.slots) fail(where + " : " + s.id + " dépasse ses emplacements");
    if(Object.values(s.build).some(l => !(l >= 1 && l <= 3))) fail(where + " : niveau de bâtiment invalide " + s.id);
    if(s.spec !== null && !E.SPECS[s.spec]) fail(where + " : spécialisation inconnue " + s.spec);
    if(Object.keys(s.build).some(t => E.BUILDINGS[t].spec && E.BUILDINGS[t].spec !== s.spec)) fail(where + " : bâtiment hors vocation " + s.id);
    if(s.maxDef !== Math.round(s.baseDef * E.defenseMul(s))) fail(where + " : défense maximale incohérente " + s.id);
    if(s.bqueue.length > 1) fail(where + " : plusieurs chantiers à " + s.id);
  });
  // v0.9 : généraux à leur poste, Ordre Jedi cohérent
  st.fleets.forEach(f => {
    if(f.general == null) return;
    const c = E.charOf(st, f.general);
    if(!c || c.role !== "general" || c.fid !== f.owner || c.at !== f.id || c.post !== "fleet") fail(where + " : général invalide sur " + f.id);
  });
  Object.values(st.systems).forEach(s => {
    if(s.general == null) return;
    const c = E.charOf(st, s.general);
    if(!c || c.role !== "general" || c.fid !== s.owner || c.at !== s.id || c.post !== "sys") fail(where + " : général invalide à " + s.id);
  });
  Object.values(st.chars).filter(c => c.role === "general").forEach(c => {
    const ok = c.post === "fleet" ? st.fleets.some(f => f.general === c.id) : st.systems[c.at] && st.systems[c.at].general === c.id;
    if(!ok) fail(where + " : général sans poste " + c.name);
  });
  const J = st.jedi;
  if(!(J.strength >= 0) || J.padawans.length > 3) fail(where + " : Ordre Jedi incohérent");
  E.MASTER_IDS.forEach(m => {
    if(!["temple", "fleet", "guard", "away", "dead"].includes(J.masters[m].state)) fail(where + " : état de Maître inconnu " + m);
    const inFleets = st.fleets.reduce((a, f) => a + (f.heroes || []).filter(h => h.master === m).length, 0);
    if(inFleets > 1 || (inFleets && J.masters[m].state !== "fleet")) fail(where + " : Maître " + m + " mal placé");
    if(J.guards.filter(g => g.master === m).length > (J.masters[m].state === "guard" ? 1 : 0)) fail(where + " : Maître " + m + " en double mission");
  });
  J.guards.forEach(g => { if(!E.SYS[g.sys]) fail(where + " : mission Jedi hors carte"); });
  const uniques = Object.values(st.systems).filter(s => s.unique).length;
  if(uniques !== E.UNIQUE_IDS.length) fail(where + " : " + uniques + " bâtiments uniques au lieu de " + E.UNIQUE_IDS.length);
}

// ---------- Parties complètes ----------
const results = [];
for(let g = 0; g < GAMES; g++){
  const player = E.playableFactions()[g % E.playableFactions().length];
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

// ---------- La Force : coup d'État, Empire Sith, découverte, succession, trêve, héros ----------
{
  // Coup d'État : deux Moffs corrompus livrent les Vestiges impériaux.
  let st = E.newGame("sith", 6100), S = st.factions.sith;
  S.phase = 3; S.dark = 300;
  Object.values(st.chars).filter(c => c.fid === "emp" && c.role === "chief").slice(0, 2).forEach(c => { c.sith = true; });
  if(!E.sithCoupReady(st)) fail("coup d'État attendu");
  const empPlanets = E.planetsOf(st, "emp").length;
  E.sithCoup(st);
  if(st.factions.emp.alive || S.shadow || E.planetsOf(st, "sith").length !== empPlanets) fail("coup d'État incomplet");
  if(!st.fleets.some(f => f.owner === "sith" && f.heroes.some(h => h.kind === "sith"))) fail("le Seigneur Sith devrait mener une flotte");
  checkInvariants(st, "coup d'État");
  for(let t = 0; t < 10 && !st.over; t++){ E.runAI(st, {includePlayer:true}); E.finishTurnOnly(st); }
  checkInvariants(st, "après le coup d'État");

  // Empire Sith : trois gouverneurs corrompus font sécession.
  st = E.newGame("rep", 6200); S = st.factions.sith; S.phase = 3;
  const worlds = ["corellia", "ryloth", "concord", "chandrila"];
  worlds.forEach(id => { E.charOf(st, st.systems[id].governor).sith = true; });
  if(!E.sithClaim(st) || worlds.some(id => st.systems[id].owner !== "sith") || S.shadow) fail("Empire Sith non proclamé");
  checkInvariants(st, "Empire Sith");

  // Découvert trop tôt : c'est la fin.
  st = E.newGame("emp", 6300); S = st.factions.sith; S.exposure = 100; S.lastAct = st.turn;
  E.sithTurn(st);
  if(S.alive) fail("un Sith à 100 d'Exposition devrait être anéanti");
  checkInvariants(st, "Sith découvert");

  // Succession : un acolyte prend la place du maître, puis la lignée s'éteint.
  st = E.newGame("emp", 6400); S = st.factions.sith; S.acolytes = 1;
  E.charDies(st, E.charOf(st, S.leader), "tombe");
  if(!S.alive || S.acolytes !== 0 || !E.charOf(st, S.leader)) fail("succession du Seigneur Sith ratée");
  E.charDies(st, E.charOf(st, S.leader), "tombe");
  if(S.alive) fail("sans disciple, la lignée Sith devrait s'éteindre");

  // Trêve : ni bataille ni invasion entre partenaires.
  st = E.newGame("rep", 6500);
  E.makeTruce(st, "rep", "man");
  const a = E.addFleet(st, "rep", "iridonia", {frig:2}, 0), b = E.addFleet(st, "man", "ordmantell", {frig:2}, 0);
  a.troops = E.troops({inf:1});
  if(E.moveFleet(st, b, "iridonia")) fail("une trêve devrait empêcher la bataille");
  a.at = "concord"; a.landed = 0;
  if(E.canInvade(st, a)) fail("une trêve devrait empêcher l'invasion");

  // Invasion menée par des héros, face à un Chevalier Jedi.
  st = E.newGame("sith", 6600);
  const f = E.addFleet(st, "man", "iridonia", {dest:1, frig:1}, 0);
  f.troops = E.troops({inf:3, tank:1});
  f.heroes = [{kind:"acolyte", name:"Acolyte Test"}, {kind:"jedi", name:"Chevalier Test"}];
  const gs = E.makeInvasion(st, f); gs.jedi = true;
  const bt = E.createGroundBattle(st, gs);
  if(!bt.units.some(u => u.type === "jedi" && u.side === 1) || !bt.units.some(u => u.type === "acolyte")) fail("héros absents de la bataille");
  E.bRunAI(bt);
  E.applyGround(st, gs, E.bResult(bt));
  checkInvariants(st, "invasion avec héros");

  // Enquête : un Moff corrompu finit démasqué.
  st = E.newGame("emp", 6700);
  const moff = Object.values(st.chars).find(c => c.fid === "emp" && c.role === "chief");
  moff.sith = true; st.factions.emp.inf = 500;
  let found = false;
  for(let i = 0; i < 20 && !found; i++){ st.turn++; E.probeChar(st, "emp", E.charOf(st, moff.id) || moff); found = !E.charOf(st, moff.id); }
  if(!found) fail("l'enquête ne démasque jamais l'agent");

  // Victoire Sith : il faut aussi que l'Ordre Jedi ait disparu.
  st = E.newGame("sith", 6800); S = st.factions.sith; S.shadow = false; S.capital = "kaldor";
  ["emp", "rep", "man", "lig"].forEach(x => { st.factions[x].alive = false; });
  Object.values(st.systems).forEach(p => { if(p.owner) p.owner = "sith"; });
  if(E.checkVictory(st) === "sith") fail("le Sith ne gagne pas tant que les Jedi vivent");
  st.jedi.strength = 0;
  if(E.checkVictory(st) === "sith") fail("le Sith ne gagne pas tant qu'un Maître garde le Temple");
  Object.keys(st.jedi.masters).forEach(m => { if(st.jedi.masters[m].state === "temple") st.jedi.masters[m] = {state:"dead"}; });
  if(E.checkVictory(st) !== "sith") fail("victoire Sith attendue");
  console.log("Force : coup d'État, Empire Sith, découverte, succession, trêve, héros, enquête et victoire vérifiés");
}

// ---------- v0.7 : grandes crises, alliances, hégémonie ----------
{
  ["warlord", "hyperlane", "weapon", "pandemic", "droids"].forEach(id => {
    const st = E.newGame("lig", 7100);
    try{
      E.startCrisis(st, id);
      checkInvariants(st, "crise " + id + " (départ)");
      for(let t = 0; t < 15 && !st.over; t++){ E.runAI(st, {includePlayer:true}); E.finishTurnOnly(st); }
      checkInvariants(st, "crise " + id + " (15 tours)");
    }catch(e){ fail("crise " + id + " : " + e.stack); }
  });
  // Seigneur de guerre : il surgit avec des mondes et une flotte.
  let st = E.newGame("rep", 7200);
  E.startCrisis(st, "warlord");
  if(st.factions.war.shadow || !E.planetsOf(st, "war").length || !st.fleets.some(f => f.owner === "war")) fail("seigneur de guerre absent");
  // Route coupée : ni passage ni commerce.
  st = E.newGame("rep", 7300);
  E.startCrisis(st, "hyperlane");
  const [a, b] = st.closedLinks[0];
  const f = E.addFleet(st, "rep", a, {frig:1}, 0);
  if(E.canMove(st, f, b)) fail("une route coupée ne devrait pas se franchir");
  if(E.FACTION_IDS.some(x => E.tradeRoutes(st, x).some(([p, q]) => (p === a && q === b) || (p === b && q === a)))) fail("une route coupée ne devrait pas commercer");
  // Arme ancienne : quatre tours de contrôle continu.
  st = E.newGame("man", 7400);
  E.startCrisis(st, "weapon");
  const rs = st.systems[st.relic.sys];
  rs.owner = "man";
  for(let t = 0; t <= E.WEAPON_TURNS; t++){ st.turn++; E.crisisTurn(st); }
  if(!st.factions.man.superweapon || st.relic.owner !== "man") fail("l'arme ancienne devrait revenir à qui tient son monde");
  // Pandémie et quarantaine
  st = E.newGame("lig", 7500);
  E.startCrisis(st, "pandemic");
  const src = Object.keys(st.plague.infected)[0], owner = st.systems[src].owner;
  st.factions[owner].cr = 100;
  if(!E.canQuarantine(st, owner, src) || !E.quarantine(st, owner, src)) fail("quarantaine impossible");
  for(let t = 0; t < 30 && st.plague; t++){ st.turn++; E.crisisTurn(st); }
  if(st.plague) fail("la pandémie devrait finir par s'éteindre");
  // Alliance et hégémonie
  st = E.newGame("rep", 7600);
  E.makeAlliance(st, "rep", "lig"); E.makeAlliance(st, "rep", "man");
  if(E.hostile(st, "rep", "lig") || !E.allied(st, "man", "rep")) fail("une alliance devrait empêcher l'hostilité");
  const ids = Object.keys(st.systems);
  ids.slice(0, 16).forEach(x => { st.systems[x].owner = "rep"; });
  ids.slice(16, 22).forEach(x => { st.systems[x].owner = "lig"; });
  ids.slice(22, 25).forEach(x => { st.systems[x].owner = "man"; });
  st.factions.rep.inf = 200;
  const h = E.hegemonyStatus(st, "rep");
  if(!h.ready) fail("hégémonie attendue : " + JSON.stringify(h));
  if(!E.convokeCongress(st, "rep") || !st.over || st.over.winner !== "rep" || st.over.how !== "hegemony") fail("le Congrès galactique devrait donner la victoire");
  console.log("v0.7 : cinq crises, seigneur de guerre, route coupée, arme ancienne, pandémie, alliances et hégémonie vérifiés");
}

// ---------- v0.8 : bâtiments, spécialisation, bâtiments uniques ----------
{
  const st = E.newGame("rep", 8100);
  const F = st.factions.rep;
  F.cr = 5000; F.mat = 5000; F.inf = 500;
  const s = st.systems[F.capital];
  // Spécialisation : forteresse → défense +50 %.
  const def0 = s.maxDef;
  if(!E.specialize(st, s.id, "fortress") || s.maxDef !== Math.round(s.baseDef * 1.5)) fail("un monde-forteresse devrait avoir +50 % de défense (" + def0 + " → " + s.maxDef + ")");
  // Construction : une seule à la fois, achevée au bout de son délai.
  if(!E.queueBuilding(st, s.id, "defense")) fail("défenses impossibles à construire");
  if(E.canQueueBuilding(st, s.id, "trade")) fail("deux chantiers en même temps");
  for(let t = 0; t < 2; t++) E.buildingsTurn(st);
  if(s.build.defense !== 1 || s.maxDef !== Math.round(s.baseDef * 1.5 * 1.25)) fail("défenses niveau 1 non appliquées");
  // Bâtiment réservé à une vocation, niveau 3 réservé.
  if(!E.buildBlock(st, s.id, "foundry")) fail("les fonderies devraient être réservées au monde-usine");
  if(E.buildBlock(st, s.id, "bunker")) fail("les bunkers devraient être permis sur une forteresse");
  E.queueBuilding(st, s.id, "bunker"); for(let t = 0; t < 3; t++) E.buildingsTurn(st);
  if(s.build.bunker !== 1) fail("bunkers non achevés");
  // Changer de vocation rase les bunkers.
  E.specialize(st, s.id, "factory");
  if(s.build.bunker || s.maxDef !== Math.round(s.baseDef * 1.25)) fail("changer de vocation devrait raser les bunkers et retirer le bonus");
  // Emplacements limités.
  const o = Object.values(st.systems).find(x => x.owner === "rep" && x.id !== s.id && !x.unique);
  o.build = {}; o.bqueue = []; o.spec = null;
  for(let i = 0; i < o.slots; i++) o.build[["trade", "palace", "barracks", "defense"][i]] = 1;
  E.refreshPlanet(o);
  if(E.buildBlock(st, o.id, "yard") !== "plus d'emplacement libre") fail("emplacements illimités");
  // Chantier : un niveau supérieur réduit coût et délai.
  s.build.yard = 1; s.yard = true;
  const c1 = E.shipCostAt(st, s.id, "dest");
  s.build.yard = 3;
  const c3 = E.shipCostAt(st, s.id, "dest");
  if(!(c3.cr < c1.cr && c3.turns < c1.turns)) fail("un chantier de niveau 3 devrait coûter moins et aller plus vite");
  // Comptoirs : crédits en hausse.
  const y0 = E.planetYield(st, o).cr;
  o.build.trade = 3;
  if(!(E.planetYield(st, o).cr > y0)) fail("les comptoirs devraient augmenter les crédits");
  // Bâtiment unique : il change de mains avec le monde.
  const u = Object.values(st.systems).find(x => x.unique === "forges");
  const owner0 = u.owner;
  u.owner = "man";
  if(E.groundBonus(st, "man") !== 0.15 || E.groundBonus(st, "rep") !== 0) fail("forges mandaloriennes mal attribuées");
  u.owner = owner0;
  checkInvariants(st, "v0.8");
  // L'IA construit et se spécialise.
  const g = E.newGame("emp", 8200);
  for(let t = 0; t < 40 && !g.over; t++){ E.runAI(g, {includePlayer:true}); E.finishTurnOnly(g); }
  const all = Object.values(g.systems).filter(x => x.owner);
  const specs = all.filter(x => x.spec).length, built = all.reduce((n, x) => n + Object.keys(x.build).length, 0);
  if(!specs || built <= all.filter(x => x.yard).length) fail("l'IA ne se développe pas (" + specs + " spécialisations, " + built + " bâtiments)");
  console.log("v0.8 : vocations, chantiers, emplacements, chantier naval, comptoirs, bâtiment unique vérifiés ; IA au tour 40 : " + specs + " mondes spécialisés, " + built + " bâtiments");
}

// ---------- v0.9 : l'Ordre Jedi jouable, Maîtres uniques, généraux ----------
{
  let st = E.newGame("jedi", 9100);
  const J = st.jedi, F = st.factions.jedi;
  F.cr = 500; F.inf = 500;
  if(E.planetsOf(st, "jedi").length || st.fleets.some(f => f.owner === "jedi")) fail("l'Ordre Jedi ne devrait avoir ni monde ni flotte");
  if(E.MASTER_IDS.filter(m => J.masters[m].state === "temple").length !== 3) fail("trois Maîtres attendus au Temple");
  // Padawans : huit tours pour faire un Chevalier.
  const k0 = J.strength;
  E.trainPadawan(st);
  for(let i = 0; i < 8; i++){ st.turn++; E.jediTurn(st); }
  if(J.strength !== k0 + 1) fail("un padawan devrait devenir Chevalier (" + k0 + " → " + J.strength + ")");
  // Prêter puis rappeler un Chevalier
  st.factions.rep.jediRep = 50; st.turn++;
  E.lendJedi(st, "rep", null);
  const lent = st.fleets.find(f => f.owner === "rep" && (f.heroes || []).some(h => h.kind === "jedi"));
  if(!lent || !J.lent.rep) fail("Chevalier non prêté");
  E.recallJedi(st, lent.id, lent.heroes.findIndex(h => h.kind === "jedi"));
  if(J.lent.rep || J.strength !== k0 + 1) fail("Chevalier non rappelé");
  // Un Maître prêté : Oro Dakkan renforce la flotte
  J.masters.dakkan = {state:"temple"}; st.turn++;
  E.lendJedi(st, "rep", "dakkan");
  const df = st.fleets.find(f => (f.heroes || []).some(h => h.master === "dakkan"));
  if(!df || J.masters.dakkan.state !== "fleet" || !(E.heroMul(df) >= 1.25)) fail("Oro Dakkan devrait porter sa flotte (+25 %)");
  // Protéger un monde : l'envahisseur affronte un Maître
  J.masters.vaal = {state:"temple"}; st.turn++;
  E.guardWorld(st, "coruscant", "vaal");
  const atk = E.addFleet(st, "man", "coruscant", {frig:2}, 0); atk.troops = {inf:4, tank:0, walk:0, art:0};
  st.fleets.filter(f => f.at === "coruscant" && f.owner === "rep").forEach(f => E.removeFleet(st, f));
  const gs = E.makeInvasion(st, atk);
  if(!gs.jedi || !gs.jedi.guard || gs.jedi.master !== "vaal") fail("le Maître de garde devrait défendre Coruscant");
  const rep0 = st.factions.man.jediRep;
  E.applyGround(st, gs, E.autoGround(st, gs, null));
  if(st.factions.man.jediRep !== rep0 - 10) fail("envahir un monde protégé devrait coûter 10 de réputation");
  // Médiation entre deux factions en guerre
  st.factions.lig.jediRep = 50;
  let truce = false;
  for(let i = 0; i < 6 && !truce; i++){
    st.turn++; st.clashes["lig:emp"] = st.clashes["emp:lig"] = st.turn;
    st.factions.lig.weariness = st.factions.emp.weariness = 100;
    E.mediate(st, "lig", "emp");
    truce = st.truces.some(x => (x.a === "lig" && x.b === "emp") || (x.a === "emp" && x.b === "lig"));
  }
  if(!truce) fail("la médiation devrait finir par aboutir");
  // Enquête sur le culte Sith, fouille d'un site
  const S = st.factions.sith, x0 = S.exposure;
  st.turn++; E.jediHunt(st);
  if(!(S.exposure > x0)) fail("l'enquête Jedi devrait exposer le Sith");
  const site = st.sithSites[0];
  E.jediSearch(st, site);
  if(st.sithSites.includes(site)) fail("le site Sith devrait être scellé");
  // Aide humanitaire
  const w = st.systems.lothal; w.loyalty = 30; st.turn++;
  E.sendAid(st, "lothal");
  if(w.loyalty !== 42) fail("l'aide Jedi devrait donner +12 de loyauté");
  checkInvariants(st, "v0.9 Jedi");
  // Duel contre un Seigneur Sith révélé
  st = E.newGame("jedi", 9200);
  st.factions.sith.shadow = false; st.factions.sith.acolytes = 0; st.factions.jedi.inf = 500;
  let dueled = false;
  for(let i = 0; i < 30 && st.factions.sith.alive; i++){
    st.turn += 5;
    const m = E.MASTER_IDS.find(x => E.canDuel(st, x));
    if(!m){ E.MASTER_IDS.forEach(x => { if(st.jedi.masters[x].state === "dead") st.jedi.masters[x] = {state:"temple"}; }); continue; }
    E.jediDuel(st, m); dueled = true;
  }
  if(!dueled || st.factions.sith.alive) fail("un duel devrait finir par abattre le Seigneur Sith sans disciple");
  // Conclave de la Paix
  st = E.newGame("jedi", 9300);
  st.factions.sith.alive = false; st.turn = 60; st.factions.jedi.inf = 200;
  ["emp", "rep", "man", "lig"].forEach(x => { st.factions[x].jediRep = 60; });
  E.makeTruce(st, "emp", "rep"); E.makeTruce(st, "man", "lig");
  if(!E.conclaveStatus(st).ready || !E.convokeConclave(st) || st.over.winner !== "jedi") fail("le Conclave de la Paix devrait donner la victoire : " + JSON.stringify(E.conclaveStatus(st)));
  // Extinction
  st = E.newGame("jedi", 9400);
  st.jedi.strength = 0; E.MASTER_IDS.forEach(x => { st.jedi.masters[x] = {state:"dead"}; });
  E.jediTurn(st);
  if(st.factions.jedi.alive) fail("un Ordre sans Jedi devrait s'éteindre");
  // Généraux
  st = E.newGame("rep", 9500);
  const R = st.factions.rep; R.cr = 1000; R.inf = 200;
  const g = E.hireGeneral(st, "coruscant");
  if(!g || st.systems.coruscant.general !== g.id) fail("général non nommé");
  const fl = st.fleets.find(f => f.owner === "rep" && f.at === "coruscant");
  fl.troops = {inf:4, tank:0, walk:0, art:0};
  E.generalToFleet(st, "coruscant", fl.id);
  if(fl.general !== g.id || st.systems.coruscant.general != null) fail("le général devrait embarquer");
  st.systems.chandrila.owner = "man";
  fl.at = "chandrila";
  g.traits = ["brilliant"]; g.xp = 2;
  const gi = E.makeInvasion(st, fl), pw = E.groundPower(st, gi).att;
  fl.general = null;
  const pw0 = E.groundPower(st, gi).att;
  fl.general = g.id;
  if(!(pw > pw0 * 1.2)) fail("un général brillant devrait renforcer l'assaut (" + pw0 + " → " + pw + ")");
  fl.at = "coruscant"; st.systems.chandrila.owner = "rep";
  const g2 = E.hireGeneral(st, "coruscant");
  const fl2 = E.addFleet(st, "rep", "coruscant", {frig:1}, 0);
  E.generalToFleet(st, "coruscant", fl2.id);
  E.mergeFleets(st, fl, fl2);
  if(st.systems.coruscant.general !== g2.id) fail("le second général devrait redescendre sur le monde");
  E.capture(st, st.systems.coruscant, "man");
  if(E.charOf(st, g2.id)) fail("un monde pris devrait coûter son général");
  checkInvariants(st, "v0.9 généraux");
  // L'IA nomme des généraux, l'Ordre Jedi IA agit
  const ga = E.newGame("emp", 9600);
  for(let t = 0; t < 50 && !ga.over; t++){ E.runAI(ga, {includePlayer:true}); E.finishTurnOnly(ga); checkInvariants(ga, "v0.9 IA tour " + ga.turn); }
  const gens = Object.values(ga.chars).filter(c => c.role === "general").length;
  if(!gens) fail("l'IA devrait nommer des généraux");
  if(!ga.jedi.searched.length && !ga.jedi.guards.length && !Object.values(ga.jedi.lent).some(Boolean) && ga.jedi.huntTurn === 0) fail("l'Ordre Jedi IA ne fait rien");
  console.log("v0.9 : padawans, Chevaliers et Maîtres prêtés, protection, médiation, enquête, fouille, aide, duel, Conclave, extinction, généraux vérifiés ; IA au tour 50 : " + gens + " généraux, " + ga.jedi.strength + " Chevaliers au Temple");
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
