// Tests du moteur Holotable : node holotable/tests/engine.test.js [parties par scénario]
// Joue des batailles complètes IA contre IA et vérifie les invariants.
const assert = require("assert");
const E = require("../engine.js");

const GAMES = +(process.argv[2] || 30);
let failures = 0;
function check(name, fn) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failures++; console.log("FAIL " + name + "\n     " + e.message); }
}

function playOut(state, maxSteps = 6000) {
  let steps = 0;
  while (!state.over && steps++ < maxSteps) {
    const act = E.aiNext(state, state.active);
    E.apply(state, act);
    const seen = new Set();
    for (const u of state.units) {
      const k = E.key(u.c, u.r);
      assert(!seen.has(k), "deux unités sur " + k);
      seen.add(k);
      assert(u.hp > 0 && u.hp <= E.maxHp(u), u.name + " a " + u.hp + " PV");
      assert(isFinite(E.moveCost(E.TYPES[u.type], E.terrainAt(state.map, u.c, u.r))), u.name + " sur un terrain interdit");
    }
  }
  assert(state.over, "la partie ne se termine pas");
  return state;
}

check("géométrie hexagonale", () => {
  const map = E.generateMap("desert", 1);
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    for (const n of E.neighbors(map, c, r)) assert.strictEqual(E.dist({ c, r }, n), 1);
    const p = E.center(c, r, 30), h = E.pixelToHex(p.x + 3, p.y - 4, 30);
    assert.deepStrictEqual(h, { c, r });
  }
  const line = E.hexLine({ c: 0, r: 0 }, { c: 7, r: 5 });
  assert.strictEqual(line.length, E.dist({ c: 0, r: 0 }, { c: 7, r: 5 }) + 1);
});

check("le déploiement place toutes les unités de chaque scénario", () => {
  for (const sc of E.SCENARIOS) {
    const s = E.createScenario(sc.id, ["ai", "ai"]);
    const want = sc.sides[0].units.length + sc.sides[1].units.length;
    assert.strictEqual(s.units.length, want, sc.id);
  }
});

check("le blindage n'est percé que par les 6 sans arme perforante", () => {
  const s = E.createGame({ seed: 4, biome: "desert", sides: [{ faction: "republic", units: [] }, { faction: "separatists", units: [] }] });
  const clone = E.addUnit(s, "clone", 0, 5, 5), aat = E.addUnit(s, "aat", 1, 7, 5);
  assert.strictEqual(E.profile(s, clone, aat).need, 6);
  const tank = E.addUnit(s, "tx130", 0, 5, 6);
  assert(E.profile(s, tank, aat).need < 6);
});

check("corps à corps : charge, parade au sabre et riposte", () => {
  const s = E.createGame({ seed: 9, biome: "foret", sides: [{ faction: "republic", units: [] }, { faction: "empire", units: [] }] });
  for (let r = 0; r < s.map.rows; r++) for (let c = 0; c < s.map.cols; c++) s.map.hexes[r * s.map.cols + c] = "plaine";
  const jedi = E.addUnit(s, "jedi", 0, 5, 5), sith = E.addUnit(s, "sith", 1, 6, 5), at = E.addUnit(s, "atst", 1, 5, 6);
  assert(!E.canShoot(s, jedi, sith), "un Jedi n'a pas de blaster");
  assert(E.canMelee(s, jedi, sith));
  jedi.moved = true;
  const p = E.meleeProfile(s, jedi, sith);
  assert.strictEqual(p.dice, 7, "6 dés + charge");
  assert.strictEqual(p.defNeed, 4, "le Sith pare au sabre");
  assert(E.meleeProfile(s, jedi, at).need < 6, "le sabre tranche le blindage");
  const clone = E.addUnit(s, "clone", 0, 7, 5);
  assert.strictEqual(E.meleeProfile(s, clone, at).need, 6, "une crosse ne perce pas un AT-ST");
  let ripostes = 0;
  for (let i = 0; i < 20; i++) {
    const t = E.createGame({ seed: 100 + i, biome: "foret", sides: [{ faction: "republic", units: [] }, { faction: "empire", units: [] }] });
    const a = E.addUnit(t, "jedi", 0, 5, 5), b = E.addUnit(t, "sith", 1, 6, 5);
    const res = E.melee(t, a, b);
    if (res.riposte) ripostes++;
    assert(a.acted && a.moved);
  }
  assert(ripostes > 10, "le Sith survit souvent et riposte");
});

check("le beskar protège des tirs comme du corps à corps", () => {
  const s = E.createGame({ seed: 4, biome: "desert", sides: [{ faction: "underworld", units: [] }, { faction: "mandalorians", units: [] }] });
  const tr = E.addUnit(s, "trando", 0, 5, 5), mando = E.addUnit(s, "mando", 1, 6, 5);
  assert.strictEqual(E.profile(s, tr, mando).defNeed, 4);
  assert.strictEqual(E.meleeProfile(s, tr, mando).defNeed, 4);
});

check("le rapport de bataille suit les pertes et les personnages", () => {
  const s = E.createGame({ seed: 12, biome: "desert", turnLimit: 12, sides: [{ faction: "underworld", units: ["chasseur", "trando"], control: "ai" }, { faction: "mandalorians", units: ["mando"], control: "ai" }] });
  const hero = s.units.find(u => u.type === "chasseur");
  hero.name = "Boba Fett";
  playOut(s);
  const txt = E.report(s);
  assert(/RAPPORT DE BATAILLE/.test(txt));
  assert(/PERSONNAGES/.test(txt) && /Boba Fett/.test(txt), "le personnage figure dans le rapport");
  assert(/Issue : .+/.test(txt));
  const dead = Object.values(s.record).filter(r => r.fate);
  for (const r of dead) assert(txt.includes(r.name));
});

check("formules de dés", () => {
  const s = E.blankState({ seed: 3, sides: [{ faction: "free" }, { faction: "free" }] });
  const r = E.rollFormula(s, "3d6+2");
  assert.strictEqual(r.rolls.length, 3);
  assert.strictEqual(r.total, r.rolls.reduce((a, b) => a + b, 0) + 2);
  assert.strictEqual(E.rollFormula(s, "n'importe quoi"), null);
});

const results = {};
check(GAMES + " batailles IA contre IA par scénario", () => {
  for (const sc of E.SCENARIOS) {
    const w = [0, 0, 0];
    let turns = 0;
    for (let g = 0; g < GAMES; g++) {
      const s = E.createGame({
        seed: 1000 + g * 7, name: sc.name, biome: sc.biome, turnLimit: sc.turnLimit, mapOpts: sc.map,
        sides: sc.sides.map(x => ({ faction: x.faction, units: x.units, control: "ai" })),
      });
      playOut(s);
      w[s.over.winner < 0 ? 2 : s.over.winner]++;
      turns += s.turn;
    }
    results[sc.id] = { A: w[0], B: w[1], nul: w[2], tours: (turns / GAMES).toFixed(1) };
  }
});

check("batailles sur mesure, toutes factions", () => {
  const F = Object.keys(E.FACTIONS).filter(f => f !== "free");
  let n = 0;
  for (const theater of ["space", "ground"]) for (const a of F) for (const b of F) {
    const ua = E.randomArmy(a, theater, 200, n + 1), ub = E.randomArmy(b, theater, 200, n + 2);
    if (!ua.length || !ub.length) continue;
    const s = E.createGame({ seed: n++, biome: theater === "space" ? "espace" : "neige", turnLimit: 12,
      sides: [{ faction: a, units: ua, control: "ai" }, { faction: b, units: ub, control: "ai" }] });
    playOut(s);
  }
  assert(n > 10);
});

console.table(results);
if (failures) { console.log(failures + " échec(s)"); process.exit(1); }
console.log("tout est vert");
