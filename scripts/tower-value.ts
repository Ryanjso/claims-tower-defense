/**
 * What a tower is worth per dollar.
 *
 * Gives every type the same budget, places it alone on the best path-covering
 * ground it can find, and reports damage dealt and lives lost over a window of
 * rounds. This is the comparison "is X overpowered" actually asks, and it is
 * the one a full-board run cannot answer: on a shared board a tower can read as
 * useless purely because a faster neighbour reaches the claims first.
 *
 *   npx tsx scripts/tower-value.ts [budget] [rounds]
 *   npx tsx scripts/tower-value.ts 350 8      # the early game, one cheap tower
 *   npx tsx scripts/tower-value.ts 3250 18    # a maxed tower over a full run
 */
import { TOWERS, TOWER_ORDER, investedIn } from '../src/game/data/towers';
import { Sim } from '../src/game/sim/Sim';
import { canPlace } from '../src/game/sim/placement';
import { PATH } from '../src/game/sim/Path';
import type { TowerId } from '../src/game/types';

const BUDGET = Number(process.argv[2] ?? 3250);
const UNTIL = Number(process.argv[3] ?? 12);

// Candidate spots ranked by how much path they cover, so no type gets a bad seat.
const ARCS: Array<[number, number]> = [];
for (let a = 0; a < PATH.length; a += 18) ARCS.push([PATH.posX(a), PATH.posY(a)]);
function spots(type: TowerId, sim: Sim, n: number) {
  const range = TOWERS[type].base.range;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] | null = null, bestScore = -1;
    for (let y = 40; y < 1000; y += 20) for (let x = 40; x < 1500; x += 20) {
      if (!canPlace(type, x, y, [...sim.towers, ...out.map(([a,b])=>({x:a,y:b}))]).ok) continue;
      let score = 0;
      for (const [ax, ay] of ARCS) if ((ax-x)**2 + (ay-y)**2 <= range*range) score++;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    if (!best) break;
    out.push(best);
  }
  return out;
}

console.log(`\n  EQUAL BUDGET $${BUDGET}, ONE TOWER TYPE, SOLO, ROUNDS 1-${UNTIL}\n`);
console.log('  ' + 'tower'.padEnd(18) + 'board'.padStart(22) + 'spent'.padStart(8) + 'damage'.padStart(10) + 'lives lost'.padStart(12) + '  per $');

const rows: Array<{ name: string; dmg: number; spent: number; lost: number; board: string }> = [];
for (const type of TOWER_ORDER) {
  const sim = new Sim();
  sim.savings = BUDGET;
  // Buy the deepest single tower the budget allows, then extra copies with the rest.
  const places = spots(type, sim, 6);
  let si = 0;
  while (si < places.length && sim.savings >= TOWERS[type].cost) {
    const t = sim.place(type, places[si][0], places[si][1]);
    if (!t) break;
    si++;
    if (si === 1) while (t.tier < 3 && sim.savings >= TOWERS[type].upgrades[t.tier].cost) sim.upgrade(t.id);
  }
  const spent = sim.towers.reduce((s, t) => s + investedIn(t.type, t.tier), 0);
  let lost = 0;
  for (let r = 0; r < UNTIL; r++) {
    const before = sim.lives;
    sim.lives = 1e9;
    if (!sim.startRound()) break;
    let n = 0;
    while (sim.phase === 'running' && n < 60 * 400) { sim.tick(1/60); n++; sim.drainEvents(); }
    lost += 1e9 - sim.lives;
    sim.lives = before;
  }
  const dmg = sim.damageBy[type] ?? 0;
  rows.push({ name: TOWERS[type].name, dmg, spent, lost, board: sim.towers.map(t=>t.tier).join('/') });
}
for (const r of rows.sort((a, b) => b.dmg / b.spent - a.dmg / a.spent)) {
  const per = r.dmg / r.spent;
  console.log('  ' + r.name.slice(0,18).padEnd(18) + r.board.padStart(22) + `$${r.spent}`.padStart(8) +
    Math.round(r.dmg).toLocaleString().padStart(10) + Math.round(r.lost).toLocaleString().padStart(12) +
    '  ' + per.toFixed(2).padStart(5) + ' ' + '█'.repeat(Math.round(per * 8)));
}
