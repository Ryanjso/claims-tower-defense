// Counts how many discrete UI events the sim can emit in a single frame. Each one
// currently drives a Phaser Text update, which re-uploads a texture to the GPU.
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
  if (p) for (let i = 0; i < 3; i++) sim.upgrade(p.id);
}

const LABEL = new Set(['deny', 'reroute', 'settle', 'leak']);
let worstLabels = 0, worstRound = 0, worstBreaks = 0;
const hist: number[] = [];
for (let r = 0; r < ROUNDS.length; r++) {
  if (!sim.startRound()) break;
  // Three sim ticks per rendered frame at 3x speed.
  let acc: number[] = [];
  let n = 0;
  while (sim.phase === 'running' && n < 60 * 400) {
    sim.tick(1 / 60);
    n++;
    acc.push(...sim.drainEvents().map((e) => e.kind));
    if (n % 3 === 0) {
      const labels = acc.filter((k) => LABEL.has(k)).length;
      const breaks = acc.filter((k) => k === 'break').length;
      if (labels > worstLabels) { worstLabels = labels; worstRound = r + 1; }
      worstBreaks = Math.max(worstBreaks, breaks);
      hist.push(labels);
      acc = [];
    }
  }
}
hist.sort((a, b) => b - a);
console.log(`  worst label burst in one rendered frame: ${worstLabels}  (round ${worstRound})`);
console.log(`  worst break burst in one frame:          ${worstBreaks}`);
console.log(`  top 15 frames by label count:            ${hist.slice(0, 15).join(' ')}`);
console.log(`  frames with >5 labels:                   ${hist.filter((h) => h > 5).length}`);
console.log(`  frames with >10 labels:                  ${hist.filter((h) => h > 10).length}`);
