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
