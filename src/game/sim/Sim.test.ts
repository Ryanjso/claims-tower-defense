import { describe, expect, it } from 'vitest';
import { CLAIMS, leakLives } from '../data/claims';
import { ROUNDS, STARTING_LIVES, STARTING_SAVINGS } from '../data/rounds';
import { TOWERS } from '../data/towers';
import { PATH } from './Path';
import { Sim } from './Sim';
import { canPlace, groundClear } from './placement';

const DT = 1 / 60;

/** Ticks until the round resolves, with a guard against a wave that never ends. */
function runRound(sim: Sim, maxSeconds = 400) {
  const limit = maxSeconds / DT;
  let ticks = 0;
  while (sim.phase === 'running' && ticks < limit) {
    sim.tick(DT);
    ticks++;
  }
  return ticks < limit;
}

/** A spot verified to be open ground, used wherever a test just needs a tower. */
const OPEN: [number, number] = [900, 600];

describe('path', () => {
  it('spans the map from the provider cluster to the exit', () => {
    expect(PATH.length).toBeGreaterThan(3000);
    expect(PATH.posX(0)).toBeCloseTo(220, -1);
    expect(PATH.posY(PATH.length)).toBeGreaterThan(1000);
  });

  it('stays inside the map at every arc length', () => {
    for (let d = 0; d <= PATH.length; d += 25) {
      expect(PATH.posX(d)).toBeGreaterThanOrEqual(0);
      expect(PATH.posX(d)).toBeLessThanOrEqual(1536);
      expect(PATH.posY(d)).toBeGreaterThanOrEqual(0);
      expect(PATH.posY(d)).toBeLessThanOrEqual(1024);
    }
  });

  it('moves forward monotonically', () => {
    let travelled = 0;
    for (let d = 0; d < PATH.length - 20; d += 20) {
      travelled += Math.hypot(PATH.posX(d + 20) - PATH.posX(d), PATH.posY(d + 20) - PATH.posY(d));
    }
    // Sampled travel should track arc length closely on a smooth centreline.
    expect(travelled).toBeGreaterThan(PATH.length * 0.95);
    expect(travelled).toBeLessThan(PATH.length * 1.05);
  });
});

describe('placement', () => {
  it('refuses ground on the claim path', () => {
    const onPath = { x: PATH.posX(1200), y: PATH.posY(1200) };
    const r = canPlace('network', onPath.x, onPath.y, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/path/i);
  });

  it('accepts verified open ground', () => {
    expect(groundClear(...OPEN)).toBe(true);
    expect(canPlace('network', ...OPEN, []).ok).toBe(true);
  });

  it('refuses a tower stacked on another', () => {
    const [x, y] = OPEN;
    const r = canPlace('network', x + 6, y + 6, [{ x, y }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/overlap/i);
  });

  it('enforces zone allow-lists', () => {
    // Sea of Pricing takes pricing tools only.
    const inSea: [number, number] = [900, 400];
    expect(canPlace('rbp', ...inSea, []).ok).toBe(true);
    expect(canPlace('tracy', ...inSea, []).ok).toBe(false);
  });
});

describe('economy', () => {
  it('charges for a tower and refunds three quarters on sale', () => {
    const sim = new Sim();
    const t = sim.place('network', ...OPEN)!;
    expect(t).toBeTruthy();
    expect(sim.savings).toBe(STARTING_SAVINGS - TOWERS.network.cost);

    sim.sell(t.id);
    expect(sim.towers).toHaveLength(0);
    expect(sim.savings).toBe(
      STARTING_SAVINGS - TOWERS.network.cost + Math.floor(TOWERS.network.cost * 0.75)
    );
  });

  it('refuses a tower the player cannot afford', () => {
    const sim = new Sim();
    sim.savings = 10;
    expect(sim.place('stopLoss', ...OPEN)).toBeNull();
    expect(sim.towers).toHaveLength(0);
    expect(sim.savings).toBe(10);
  });

  it('charges for upgrades and raises sell value', () => {
    const sim = new Sim();
    const t = sim.place('network', ...OPEN)!;
    const before = sim.savings;
    expect(sim.upgrade(t.id)).toBe(true);
    expect(sim.savings).toBe(before - TOWERS.network.upgrades[0].cost);
    expect(t.tier).toBe(1);
    expect(sim.sellValue(t)).toBeGreaterThan(Math.floor(TOWERS.network.cost * 0.75));
  });
});

describe('a round with no defence', () => {
  const sim = new Sim();
  sim.startRound();
  const finished = runRound(sim);

  it('terminates', () => {
    expect(finished).toBe(true);
    expect(sim.claims).toHaveLength(0);
  });

  it('leaks every billed dollar that entered', () => {
    // Nothing is contained, so the ledger must balance exactly. This is the
    // guard on billedShare being split without loss across the degrade cascade.
    expect(sim.billedEntered).toBeGreaterThan(0);
    expect(sim.billedLeaked).toBeCloseTo(sim.billedEntered, 6);
    expect(sim.containmentRate).toBeCloseTo(0, 6);
  });

  it('charges exactly the authored leak cost per claim', () => {
    const group = ROUNDS[0].groups[0];
    expect(sim.livesLost).toBe(group.count * leakLives(group.type));
    expect(sim.lives).toBe(STARTING_LIVES - sim.livesLost);
  });
});

describe('a round with a defence', () => {
  it('contains claims and pays out savings', () => {
    const sim = new Sim();
    // Reference-based pricing reaches the whole map, so one tower clears round 1.
    sim.savings = 5000;
    sim.place('rbp', ...OPEN);
    const before = sim.savings;

    sim.startRound();
    expect(runRound(sim)).toBe(true);

    expect(sim.lives).toBe(STARTING_LIVES);
    expect(sim.billedLeaked).toBe(0);
    expect(sim.containmentRate).toBe(1);
    expect(sim.savings).toBeGreaterThan(before);
    expect(sim.round).toBe(1);
    expect(sim.phase).toBe('idle');
  });

  it('degrades a big claim into its children rather than deleting it', () => {
    const sim = new Sim();
    sim.startRound();
    sim.tick(DT);
    // Reach past the wave queue and inject one claim directly.
    const spawn = (sim as unknown as {
      spawnClaim: (t: string, a: number, tr: object, b: number, top: boolean) => { id: number };
    }).spawnClaim.bind(sim);
    const parent = spawn(
      'imaging',
      100,
      { outOfNetwork: false, clean: false, balanceBill: false, priorAuth: false },
      CLAIMS.imaging.billed,
      true
    );

    const applyDamage = (sim as unknown as {
      applyDamage: (c: unknown, n: number) => void;
    }).applyDamage.bind(sim);
    const claim = sim.claims.find((c) => c.id === parent.id)!;
    applyDamage(claim, 99);

    const kids = sim.claims.filter((c) => c.type === 'officeVisit');
    expect(kids).toHaveLength(CLAIMS.imaging.child!.count);
    // Dollars are conserved across the split.
    const total = kids.reduce((s, k) => s + k.billedShare, 0);
    expect(total).toBeCloseTo(CLAIMS.imaging.billed, 6);
  });
});

describe('lifecycle', () => {
  it('only ever loses lives', () => {
    const sim = new Sim();
    sim.place('network', ...OPEN);
    let last = sim.lives;
    for (let r = 0; r < 3; r++) {
      sim.startRound();
      let ticks = 0;
      while (sim.phase === 'running' && ticks < 400 / DT) {
        sim.tick(DT);
        expect(sim.lives).toBeLessThanOrEqual(last);
        last = sim.lives;
        ticks++;
      }
    }
  });

  it('refuses to start a round while one is running', () => {
    const sim = new Sim();
    expect(sim.startRound()).toBe(true);
    expect(sim.startRound()).toBe(false);
  });

  it('resets cleanly', () => {
    const sim = new Sim();
    sim.place('network', ...OPEN);
    sim.startRound();
    for (let i = 0; i < 200; i++) sim.tick(DT);

    sim.reset();
    expect(sim.lives).toBe(STARTING_LIVES);
    expect(sim.savings).toBe(STARTING_SAVINGS);
    expect(sim.towers).toHaveLength(0);
    expect(sim.claims).toHaveLength(0);
    expect(sim.round).toBe(0);
    expect(sim.phase).toBe('idle');
    expect(sim.billedEntered).toBe(0);
  });

  it('is deterministic for the same inputs', () => {
    const play = () => {
      const sim = new Sim();
      sim.savings = 4000;
      sim.place('careNav', ...OPEN);
      for (let r = 0; r < 3; r++) {
        sim.startRound();
        runRound(sim);
      }
      return { lives: sim.lives, savings: sim.savings, leaked: sim.billedLeaked };
    };
    expect(play()).toEqual(play());
  });
});

describe('Tracy', () => {
  it('boosts neighbours and not herself', () => {
    const sim = new Sim();
    sim.savings = 20000;
    const net = sim.place('network', 900, 600)!;
    const baseDamage = net.eff.damage;

    const tracy = sim.place('tracy', 950, 540)!;
    expect(net.eff.damage).toBeGreaterThan(baseDamage);
    expect(net.buffed).toBe(true);
    expect(tracy.buffed).toBe(false);

    sim.sell(tracy.id);
    expect(net.eff.damage).toBe(baseDamage);
    expect(net.buffed).toBe(false);
  });
});
