/**
 * Headless balance harness.
 *
 * Plays all 20 rounds with a scripted "competent player" — a fixed build order and
 * a greedy placement heuristic — and reports what the run looks like round by round.
 * The scripted player is a decent proxy but places better than a casual human, so
 * the target is a run that clears round 20 with roughly 60-120 lives left: enough
 * headroom that a real player is pressured rather than walled.
 *
 *   npx tsx scripts/balance.ts                 # single run at the shipped numbers
 *   npx tsx scripts/balance.ts --verbose       # + the build log
 *   npx tsx scripts/balance.ts --sweep         # scan claim-payout multipliers
 *   npx tsx scripts/balance.ts --econ 2.2      # single run at a scaled economy
 */

import { CLAIMS, leakLives, totalHp } from '../src/game/data/claims';
import { ECONOMY, ROUNDS } from '../src/game/data/rounds';
import { TOWERS, statsAt } from '../src/game/data/towers';
import { ZONES } from '../src/game/data/zones';
import { PATH } from '../src/game/sim/Path';
import { Sim } from '../src/game/sim/Sim';
import { canPlace } from '../src/game/sim/placement';
import type { ClaimId, TowerId } from '../src/game/types';

const VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 60;
const MAX_TICKS = 60 * 60 * 6;

// ------------------------------------------------------------ build order

type Step = { buy: TowerId } | { up: TowerId; nth?: number };

const PLANS: Record<string, Step[]> = {
  // Buys a bit of everything — the default a first-time player drifts into.
  balanced: [
    { buy: 'network' }, { buy: 'network' }, { buy: 'ncci' }, { up: 'network' },
    { buy: 'careNav' }, { buy: 'rbp' }, { up: 'rbp' }, { buy: 'planDesign' },
    { up: 'network', nth: 1 }, { up: 'planDesign' }, { buy: 'cashPay' }, { up: 'rbp' },
    { buy: 'directContract' }, { buy: 'accumulator' }, { up: 'directContract' },
    { up: 'careNav' }, { buy: 'tracy' }, { buy: 'stopLoss' }, { up: 'rbp' },
    { up: 'tracy' }, { up: 'stopLoss' }, { up: 'planDesign' }, { up: 'accumulator' },
    { up: 'directContract' }, { up: 'cashPay' }, { up: 'stopLoss' }, { up: 'tracy' },
    { up: 'accumulator' }, { up: 'planDesign' }, { up: 'directContract' },
    { up: 'careNav' }, { up: 'cashPay' }, { up: 'ncci' }, { up: 'network' },
    { up: 'network', nth: 1 }, { up: 'ncci' },
  ],

  // Pricing-first: lean on RBP and direct contracts, minimal support.
  pricing: [
    { buy: 'network' }, { buy: 'rbp' }, { up: 'rbp' }, { buy: 'network' },
    { up: 'rbp' }, { buy: 'directContract' }, { up: 'directContract' },
    { buy: 'rbp' }, { up: 'rbp', nth: 1 }, { up: 'directContract' },
    { buy: 'tracy' }, { up: 'rbp', nth: 1 }, { up: 'tracy' },
    { buy: 'stopLoss' }, { up: 'directContract' }, { up: 'stopLoss' },
    { up: 'tracy' }, { up: 'stopLoss' }, { buy: 'planDesign' }, { up: 'planDesign' },
    { up: 'planDesign' }, { up: 'network' }, { up: 'network', nth: 1 },
  ],

  // Upstream-led: navigation and design first, pricing bolted on later.
  navigation: [
    { buy: 'network' }, { buy: 'careNav' }, { buy: 'planDesign' }, { up: 'careNav' },
    { up: 'planDesign' }, { buy: 'rbp' }, { up: 'rbp' }, { buy: 'cashPay' },
    { up: 'planDesign' }, { buy: 'accumulator' }, { up: 'rbp' }, { buy: 'tracy' },
    { up: 'careNav' }, { buy: 'stopLoss' }, { up: 'tracy' }, { up: 'stopLoss' },
    { up: 'accumulator' }, { up: 'cashPay' }, { up: 'stopLoss' }, { up: 'tracy' },
    { up: 'careNav' }, { up: 'accumulator' }, { up: 'cashPay' }, { up: 'network' },
  ],

  // Reinsurance-led: cheap chaff clear, then everything into stop-loss.
  reinsurance: [
    { buy: 'network' }, { buy: 'network' }, { buy: 'ncci' }, { buy: 'planDesign' },
    { up: 'planDesign' }, { buy: 'rbp' }, { up: 'rbp' }, { buy: 'stopLoss' },
    { up: 'stopLoss' }, { buy: 'directContract' }, { up: 'stopLoss' },
    { buy: 'tracy' }, { up: 'tracy' }, { up: 'planDesign' }, { up: 'rbp' },
    { up: 'directContract' }, { up: 'stopLoss' }, { up: 'tracy' },
    { up: 'directContract' }, { up: 'ncci' }, { up: 'network' },
    { up: 'network', nth: 1 },
  ],
};

// -------------------------------------------------------- placement search

const ARCS: Array<[number, number]> = [];
for (let a = 0; a < PATH.length; a += 18) ARCS.push([PATH.posX(a), PATH.posY(a)]);

const CANDIDATES: Array<[number, number]> = [];
for (let y = 40; y < 1000; y += 20) {
  for (let x = 40; x < 1500; x += 20) CANDIDATES.push([x, y]);
}

function bestSpot(sim: Sim, type: TowerId): [number, number] | null {
  const range = statsAt(type, 0).range;
  const isBuff = TOWERS[type].kind === 'buff';
  const homeZone = ZONES.find((z) => z.allow.includes(type));

  let best: [number, number] | null = null;
  let bestScore = -Infinity;

  for (const [x, y] of CANDIDATES) {
    if (!canPlace(type, x, y, sim.towers).ok) continue;

    let score: number;
    if (isBuff) {
      score = 0;
      for (const t of sim.towers) {
        if ((t.x - x) ** 2 + (t.y - y) ** 2 <= range * range) score += 40;
      }
    } else if (range > 1000) {
      score = 100; // global range only cares about the zone bonus
    } else {
      score = 0;
      for (const [ax, ay] of ARCS) {
        if ((ax - x) ** 2 + (ay - y) ** 2 <= range * range) score++;
      }
    }

    if (homeZone) {
      const r = homeZone.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) score *= 1.35;
    }
    if (type === 'stopLoss') {
      score *= 0.4 + (PATH.nearest(x, y).arc / PATH.length) * 1.6;
    }

    if (score > bestScore) {
      bestScore = score;
      best = [x, y];
    }
  }
  return best;
}

// ------------------------------------------------------------------- play

/**
 * Walks the build order strictly in sequence and stops at the first step it cannot
 * afford — a player saving up for the next thing rather than one who skips ahead
 * and buys whatever happens to be cheap.
 */
function spend(sim: Sim, plan: Step[], log: string[], state: { cursor: number }) {
  while (state.cursor < plan.length) {
    const step = plan[state.cursor];

    if ('buy' in step) {
      if (sim.savings < TOWERS[step.buy].cost) return;
      const spot = bestSpot(sim, step.buy);
      if (!spot) {
        log.push(`    !!   no legal spot for ${TOWERS[step.buy].name}`);
        state.cursor++;
        continue;
      }
      if (!sim.place(step.buy, spot[0], spot[1])) return;
      log.push(`    buy  ${TOWERS[step.buy].name} @ ${spot[0]},${spot[1]}`);
      state.cursor++;
      continue;
    }

    const t = sim.towers.filter((x) => x.type === step.up)[step.nth ?? 0];
    if (!t || t.tier >= 3) {
      state.cursor++;
      continue;
    }
    const cost = TOWERS[t.type].upgrades[t.tier].cost;
    if (sim.savings < cost) return;
    const name = TOWERS[t.type].upgrades[t.tier].name;
    if (!sim.upgrade(t.id)) return;
    log.push(`    up   ${TOWERS[t.type].name} -> ${name}`);
    state.cursor++;
  }

  // The scripted order eventually runs out. Without this the AI sits on tens of
  // thousands of unspent savings and reads as a balance failure when it is really
  // just an exhausted build order.
  greedy(sim, log);
}

function greedy(sim: Sim, log: string[]) {
  for (;;) {
    let bestUpgrade: { id: number; cost: number; label: string } | null = null;
    for (const t of sim.towers) {
      if (t.tier >= 3) continue;
      const up = TOWERS[t.type].upgrades[t.tier];
      if (up.cost > sim.savings) continue;
      if (!bestUpgrade || up.cost < bestUpgrade.cost) {
        bestUpgrade = { id: t.id, cost: up.cost, label: `${TOWERS[t.type].name} -> ${up.name}` };
      }
    }
    if (bestUpgrade) {
      if (!sim.upgrade(bestUpgrade.id)) return;
      log.push(`    up*  ${bestUpgrade.label}`);
      continue;
    }

    // Nothing left to upgrade: add another copy of a tower already in the build.
    const owned = [...new Set(sim.towers.map((t) => t.type))]
      .filter((type) => TOWERS[type].cost <= sim.savings)
      .sort((a, b) => TOWERS[b].cost - TOWERS[a].cost);
    let placed = false;
    for (const type of owned) {
      const spot = bestSpot(sim, type);
      if (spot && sim.place(type, spot[0], spot[1])) {
        log.push(`    buy* ${TOWERS[type].name} @ ${spot[0]},${spot[1]}`);
        placed = true;
        break;
      }
    }
    if (!placed) return;
  }
}

interface RoundRow {
  round: number;
  title: string;
  exposure: number;
  lives: number;
  lost: number;
  savings: number;
  towers: number;
  secs: number;
}

interface RunResult {
  phase: string;
  lives: number;
  rows: RoundRow[];
  entered: number;
  leaked: number;
  contained: number;
  board: string;
  peakSavings: number;
}

const BASE_SAVINGS: Record<string, number> = {};
for (const id of Object.keys(CLAIMS)) BASE_SAVINGS[id] = CLAIMS[id as ClaimId].savings;

/** Original spawn counts, so the late-round scaler can be applied idempotently. */
const BASE_COUNTS = ROUNDS.map((r) => r.groups.map((g) => g.count));
const LATE_FROM = 14; // zero-based: rounds 15-20

function play(econ: number, plan: Step[], log: string[], late = 1): RunResult {
  for (const id of Object.keys(CLAIMS)) {
    CLAIMS[id as ClaimId].savings = Math.max(1, Math.round(BASE_SAVINGS[id] * econ));
  }
  ECONOMY.bonusScale = econ;
  ROUNDS.forEach((r, ri) =>
    r.groups.forEach((g, gi) => {
      const base = BASE_COUNTS[ri][gi];
      g.count = ri >= LATE_FROM ? Math.max(1, Math.round(base * late)) : base;
    })
  );

  const sim = new Sim();
  const state = { cursor: 0 };
  const rows: RoundRow[] = [];
  let peakSavings = 0;

  for (let r = 0; r < ROUNDS.length; r++) {
    spend(sim, plan, log, state);
    peakSavings = Math.max(peakSavings, sim.savings);

    const livesBefore = sim.lives;
    const def = ROUNDS[r];
    const exposure = def.groups.reduce((s, g) => s + g.count * leakLives(g.type), 0);
    if (!sim.startRound()) break;

    let ticks = 0;
    while (sim.phase === 'running' && ticks < MAX_TICKS) {
      sim.tick(DT);
      ticks++;
    }
    sim.drainEvents();

    rows.push({
      round: r + 1,
      title: def.title,
      exposure,
      lives: sim.lives,
      lost: livesBefore - sim.lives,
      savings: Math.round(sim.savings),
      towers: sim.towers.length,
      secs: Math.round(ticks * DT),
    });

    if (sim.phase === 'lost' || ticks >= MAX_TICKS) break;
  }

  return {
    phase: sim.phase,
    lives: sim.lives,
    rows,
    entered: sim.billedEntered,
    leaked: sim.billedLeaked,
    contained: sim.containmentRate,
    board: sim.towers.map((t) => `${TOWERS[t.type].short}${t.tier}`).join(' '),
    peakSavings,
  };
}

// ------------------------------------------------------------------ output

function printLadder() {
  console.log('\n  CLAIM LADDER');
  console.log(
    '  ' +
      'claim'.padEnd(22) +
      'billed'.padStart(11) +
      'hp'.padStart(6) +
      'totHp'.padStart(8) +
      'leak'.padStart(7) +
      'speed'.padStart(7)
  );
  for (const id of Object.keys(CLAIMS) as ClaimId[]) {
    const d = CLAIMS[id];
    console.log(
      '  ' +
        d.name.padEnd(22) +
        ('$' + d.billed.toLocaleString()).padStart(11) +
        String(d.hp).padStart(6) +
        String(totalHp(id)).padStart(8) +
        String(leakLives(id)).padStart(7) +
        String(d.speed).padStart(7)
    );
  }
}

function printRun(res: RunResult) {
  console.log('\n  RUN');
  console.log(
    '  rd  ' +
      'wave'.padEnd(28) +
      'expose'.padStart(8) +
      'lives'.padStart(7) +
      'lost'.padStart(6) +
      'save$'.padStart(8) +
      'twr'.padStart(5) +
      'secs'.padStart(6)
  );
  for (const r of res.rows) {
    console.log(
      `  ${String(r.round).padStart(2)}  ` +
        r.title.padEnd(28) +
        String(r.exposure).padStart(8) +
        String(r.lives).padStart(7) +
        String(r.lost).padStart(6) +
        String(r.savings).padStart(8) +
        String(r.towers).padStart(5) +
        String(r.secs).padStart(6)
    );
  }
  console.log('\n  RESULT');
  console.log(`  phase            ${res.phase}`);
  console.log(`  lives            ${res.lives} / 250`);
  console.log(`  billed entered   $${Math.round(res.entered).toLocaleString()}`);
  console.log(`  billed leaked    $${Math.round(res.leaked).toLocaleString()}`);
  console.log(`  contained        ${(100 * res.contained).toFixed(2)}%`);
  console.log(`  peak savings     $${res.peakSavings.toLocaleString()}`);
  console.log(`  final board      ${res.board}\n`);
}

const econArg = process.argv.indexOf('--econ');
const lateArg = process.argv.indexOf('--late');
const PLAN_NAMES = Object.keys(PLANS);

function verdict(res: RunResult) {
  return res.phase === 'won' ? `won ${res.lives}` : `LOST r${res.rows.length}`;
}

const sweepEcon = econArg !== -1 ? Number(process.argv[econArg + 1]) : 1.3;

if (process.argv.includes('--late-sweep')) {
  console.log(`\n  LATE-ROUND DIFFICULTY SWEEP  (rounds 15-20 spawn counts, economy ${sweepEcon})\n`);
  const lates = [1.0, 1.15, 1.3, 1.45, 1.6, 1.8];
  console.log('  ' + 'strategy'.padEnd(14) + lates.map((l) => l.toFixed(2).padStart(11)).join(''));
  for (const name of PLAN_NAMES) {
    let row = '  ' + name.padEnd(14);
    for (const late of lates) row += verdict(play(sweepEcon, PLANS[name], [], late)).padStart(11);
    console.log(row);
  }
  console.log();
} else if (process.argv.includes('--sweep')) {
  console.log('\n  BALANCE MATRIX   strategy x economy scale');
  console.log('  Every strategy should clear round 20, with the margin varying.\n');
  const econs = [0.9, 1.0, 1.1, 1.2];
  const late = lateArg !== -1 ? Number(process.argv[lateArg + 1]) : 1;
  console.log('  ' + 'strategy'.padEnd(14) + econs.map((e) => e.toFixed(2).padStart(11)).join(''));
  for (const name of PLAN_NAMES) {
    let row = '  ' + name.padEnd(14);
    for (const econ of econs) row += verdict(play(econ, PLANS[name], [], late)).padStart(11);
    console.log(row);
  }
  console.log('\n  (won N = cleared round 20 with N of 250 lives left)\n');
} else {
  const econ = econArg !== -1 ? Number(process.argv[econArg + 1]) : 1;
  const late = lateArg !== -1 ? Number(process.argv[lateArg + 1]) : 1;
  const nameArg = process.argv.indexOf('--plan');
  const name = nameArg !== -1 ? process.argv[nameArg + 1] : 'balanced';
  const log: string[] = [];
  printLadder();
  console.log(`\n  strategy: ${name}   economy: ${econ}   late: ${late}`);
  const res = play(econ, PLANS[name], log, late);
  if (VERBOSE) console.log('\n  BUILD\n' + log.join('\n'));
  printRun(res);
}
