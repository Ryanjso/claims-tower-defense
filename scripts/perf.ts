// Times the simulation alone on the heaviest round, so browser FPS numbers can be
// attributed to the renderer or the sim rather than guessed at.
import { ROUNDS } from '../src/game/data/rounds';
import { Sim } from '../src/game/sim/Sim';
import type { TowerId } from '../src/game/types';

const BOARD: Array<[TowerId, number, number]> = [
  ['network', 1260, 620], ['network', 460, 480], ['ncci', 1300, 640],
  ['careNav', 500, 500], ['rbp', 900, 600], ['planDesign', 1240, 660],
  ['cashPay', 440, 700], ['directContract', 420, 500], ['accumulator', 380, 700],
  ['tracy', 400, 620], ['stopLoss', 420, 740],
];

const sim = new Sim();
sim.savings = 1e9;
for (const [t, x, y] of BOARD) {
  const placed = sim.place(t, x, y);
  if (!placed) console.error(`  could not place ${t} @${x},${y}`);
  else for (let i = 0; i < 3; i++) sim.upgrade(placed.id);
}
console.log(`board: ${sim.towers.length} towers, all tier ${sim.towers[0]?.tier}`);

sim.round = ROUNDS.length - 1; // jump to round 20
sim.startRound();

let ticks = 0;
let peakClaims = 0;
let peakProjectiles = 0;
let worstTick = 0;
const t0 = performance.now();
while (sim.phase === 'running' && ticks < 60 * 400) {
  const a = performance.now();
  sim.tick(1 / 60);
  const d = performance.now() - a;
  if (d > worstTick) worstTick = d;
  peakClaims = Math.max(peakClaims, sim.claims.length);
  peakProjectiles = Math.max(peakProjectiles, sim.projectiles.length + sim.thorns.length);
  sim.drainEvents();
  ticks++;
}
const total = performance.now() - t0;

console.log(`round 20: ${ticks} ticks (${(ticks / 60).toFixed(0)}s of game time)`);
console.log(`  wall clock      ${total.toFixed(0)}ms  ->  ${(total / ticks).toFixed(3)}ms per tick`);
console.log(`  worst tick      ${worstTick.toFixed(2)}ms`);
console.log(`  peak claims     ${peakClaims}`);
console.log(`  peak projectiles+thorns ${peakProjectiles}`);
console.log(`  budget at 60fps 16.7ms/frame; at 3x speed the sim runs 3 ticks/frame`);
console.log(`  sim cost/frame @3x ≈ ${((3 * total) / ticks).toFixed(2)}ms`);
console.log(`  result: lives ${sim.lives}, phase ${sim.phase}`);
