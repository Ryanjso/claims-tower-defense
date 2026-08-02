import { describe, expect, it } from 'vitest';
import { CLAIMS, CLAIM_ORDER, isLargeClaim, leakLives, totalHp } from './claims';
import { ROUNDS, STARTING_LIVES, roundBonus } from './rounds';
import { TOWERS, TOWER_ORDER, investedIn, kindAt, statsAt } from './towers';
import type { ClaimId } from '../types';

describe('claim ladder', () => {
  it('orders strictly by billed charge', () => {
    for (let i = 1; i < CLAIM_ORDER.length; i++) {
      const prev = CLAIMS[CLAIM_ORDER[i - 1]];
      const cur = CLAIMS[CLAIM_ORDER[i]];
      expect(cur.tier).toBeGreaterThan(prev.tier);
      expect(cur.billed).toBeGreaterThan(prev.billed);
    }
  });

  it('never costs more lives for a cheaper claim', () => {
    for (let i = 1; i < CLAIM_ORDER.length; i++) {
      expect(leakLives(CLAIM_ORDER[i])).toBeGreaterThanOrEqual(leakLives(CLAIM_ORDER[i - 1]));
    }
  });

  it('keeps every leak survivable from a full life pool', () => {
    // A single leak must be a setback, never an instant loss, or the difficulty
    // curve becomes pass-or-die on every MOAB-class round.
    for (const id of CLAIM_ORDER) {
      expect(leakLives(id)).toBeLessThan(STARTING_LIVES * 0.7);
    }
  });

  it('degrades downward and terminates', () => {
    for (const id of CLAIM_ORDER) {
      const def = CLAIMS[id];
      if (!def.child) continue;
      expect(CLAIMS[def.child.type].tier).toBeLessThan(def.tier);
      expect(def.child.count).toBeGreaterThan(0);
    }
    // totalHp recurses the whole chain; a cycle would blow the stack.
    for (const id of CLAIM_ORDER) expect(totalHp(id)).toBeGreaterThan(0);
  });

  it('marks only the top three tiers as catastrophic', () => {
    const large = CLAIM_ORDER.filter(isLargeClaim);
    expect(large).toEqual(['bundle', 'nicu', 'geneTherapy']);
  });
});

describe('tower roster', () => {
  it('exposes every tower exactly once in display order', () => {
    expect([...TOWER_ORDER].sort()).toEqual(Object.keys(TOWERS).sort());
  });

  it('prices upgrades so later tiers cost more', () => {
    for (const id of TOWER_ORDER) {
      const [a, b, c] = TOWERS[id].upgrades;
      expect(b.cost).toBeGreaterThan(a.cost);
      expect(c.cost).toBeGreaterThan(b.cost);
    }
  });

  it('accumulates the full purchase price into sell value', () => {
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      const expected =
        def.cost + def.upgrades[0].cost + def.upgrades[1].cost + def.upgrades[2].cost;
      expect(investedIn(id, 3)).toBe(expected);
      expect(investedIn(id, 0)).toBe(def.cost);
    }
  });

  it('layers upgrade stats over the base', () => {
    const base = statsAt('rbp', 0);
    const top = statsAt('rbp', 3);
    expect(top.damage).toBeGreaterThan(base.damage);
    expect(top.cooldown).toBeLessThan(base.cooldown);
    // Untouched knobs survive the merge.
    expect(top.seesOutOfNetwork).toBe(true);
  });

  it('switches Stop-Loss to the Laser at tier three', () => {
    expect(kindAt('stopLoss', 2)).toBe('barrier');
    expect(kindAt('stopLoss', 3)).toBe('laser');
    // The Laser drops the specific-deductible gate entirely.
    expect(statsAt('stopLoss', 2).attachTier).toBeGreaterThan(0);
    expect(statsAt('stopLoss', 3).attachTier).toBe(0);
  });

  it('gives at least one answer to every claim trait', () => {
    const all = TOWER_ORDER.flatMap((id) => [0, 1, 2, 3].map((t) => statsAt(id, t)));
    expect(all.some((s) => s.seesOutOfNetwork)).toBe(true);
    expect(all.some((s) => s.piercesContract)).toBe(true);
    // Out-of-network claims cascade, so a single detector would be a hard wall.
    const detectors = TOWER_ORDER.filter((id) => statsAt(id, 1).seesOutOfNetwork);
    expect(detectors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('rounds', () => {
  it('runs twenty rounds numbered in order', () => {
    expect(ROUNDS).toHaveLength(20);
    ROUNDS.forEach((r, i) => expect(r.round).toBe(i + 1));
  });

  it('references only real claim types with sane timing', () => {
    for (const r of ROUNDS) {
      expect(r.groups.length).toBeGreaterThan(0);
      for (const g of r.groups) {
        expect(CLAIMS[g.type as ClaimId]).toBeDefined();
        expect(g.count).toBeGreaterThan(0);
        expect(g.spacing).toBeGreaterThan(0);
        expect(g.delay).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('escalates total exposure across the run', () => {
    const exposure = ROUNDS.map((r) =>
      r.groups.reduce((s, g) => s + g.count * leakLives(g.type), 0)
    );
    // Not monotonic round to round, but each third must clearly outweigh the last.
    const early = exposure.slice(0, 7).reduce((a, b) => a + b, 0);
    const mid = exposure.slice(7, 14).reduce((a, b) => a + b, 0);
    const late = exposure.slice(14).reduce((a, b) => a + b, 0);
    expect(mid).toBeGreaterThan(early * 2);
    expect(late).toBeGreaterThan(mid * 2);
    expect(exposure[19]).toBe(Math.max(...exposure));
  });

  it('grows the round bonus every round', () => {
    for (let r = 2; r <= 20; r++) expect(roundBonus(r)).toBeGreaterThan(roundBonus(r - 1));
  });
});
