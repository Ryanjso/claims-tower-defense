// Looks for stretches where the board is empty and nothing is due to spawn — dead
// air that reads to a player as the game freezing, with no CPU cost at all.
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
  const p = sim.place(t, x, y);
  if (p) for (let i = 0; i < 2; i++) sim.upgrade(p.id);
}

console.log('\n  DEAD AIR PER ROUND  (board empty, nothing spawning)\n');
console.log('  rd  ' + 'wave'.padEnd(28) + 'length'.padStart(8) + 'longest gap'.padStart(13) + '  total idle');

let worst = 0;
for (let r = 0; r < ROUNDS.length; r++) {
  sim.startRound();
  let t = 0;
  let gap = 0;
  let longest = 0;
  let totalIdle = 0;
  while (sim.phase === 'running' && t < 400) {
    sim.tick(1 / 60);
    sim.drainEvents();
    t += 1 / 60;
    if (sim.claims.length === 0) {
      gap += 1 / 60;
      totalIdle += 1 / 60;
      longest = Math.max(longest, gap);
    } else {
      gap = 0;
    }
  }
  worst = Math.max(worst, longest);
  const flag = longest > 3 ? '  <-- visible stall' : '';
  console.log(
    `  ${String(r + 1).padStart(2)}  ` +
      ROUNDS[r].title.padEnd(28) +
      `${t.toFixed(0)}s`.padStart(8) +
      `${longest.toFixed(1)}s`.padStart(13) +
      `  ${totalIdle.toFixed(0)}s` +
      flag
  );
}
console.log(`\n  worst gap anywhere: ${worst.toFixed(1)}s\n`);
