import { CLAIMS } from './claims';
import { TOWERS, statsAt } from './towers';
import type { RoundDef, TowerId } from '../types';

/** What the player currently owns, flattened for capability checks. */
export interface OwnedTower {
  type: TowerId;
  tier: number;
}

/**
 * A wave threat the player can be mechanically locked out of answering.
 *
 * Deliberately narrow. These fire only where a missing capability means the
 * claim cannot be touched at all, or will not go down in time — not for every
 * piece of advice that could be given, because a briefing that appears when the
 * player is merely under-optimised is noise they will learn to dismiss unread.
 */
export interface Briefing {
  id: string;
  /** Does the round about to run contain this threat? */
  present: (round: RoundDef) => boolean;
  /** Does anything on the board already answer it? */
  answered: (owned: OwnedTower[]) => boolean;
  /** Which towers would answer it, for the suggestion list. */
  answers: TowerId[];
  eyebrow: string;
  title: string;
  /** Why the claim is hard. The real-world reason, not the game mechanic. */
  why: string;
  /** What to do about it. */
  fix: string;
}

const hasTrait = (round: RoundDef, trait: 'outOfNetwork' | 'clean') =>
  round.groups.some((g) => g.traits?.[trait]);

const capable = (owned: OwnedTower[], test: (t: OwnedTower) => boolean) => owned.some(test);

/** Best single-hit damage on the board. Chip damage will not finish a big claim. */
const peakHit = (owned: OwnedTower[]) =>
  owned.reduce((best, t) => Math.max(best, statsAt(t.type, t.tier).damage), 0);

/** Towers whose base or any upgrade grants a capability, for the suggestion list. */
const towersWith = (test: (id: TowerId, tier: number) => boolean): TowerId[] =>
  (Object.keys(TOWERS) as TowerId[]).filter((id) => [0, 1, 2, 3].some((tier) => test(id, tier)));

export const BRIEFINGS: Briefing[] = [
  {
    id: 'outOfNetwork',
    present: (r) => hasTrait(r, 'outOfNetwork'),
    answered: (owned) => capable(owned, (t) => statsAt(t.type, t.tier).seesOutOfNetwork),
    answers: towersWith((id, tier) => statsAt(id, tier).seesOutOfNetwork),
    eyebrow: 'Out-of-network',
    title: 'Most of your board cannot see these',
    why: 'An out-of-network provider never signed your contract, so there is no negotiated rate to apply and nothing to discount against. A network tower has no relationship to invoke, and coding edits have no agreement to enforce. On the map these claims are ghosted, and towers without network visibility will not fire at them at all.',
    fix: 'You need something that works without a contract. Reference-based pricing prices off Medicare instead. Care navigation moves the member before the claim exists. A cash pay card settles at the counter, and stop-loss does not care whose network you are in.',
  },
  {
    id: 'clean',
    present: (r) => hasTrait(r, 'clean'),
    answered: (owned) => capable(owned, (t) => statsAt(t.type, t.tier).piercesContract),
    answers: towersWith((id, tier) => statsAt(id, tier).piercesContract),
    eyebrow: 'Cleanly coded',
    title: 'There is nothing wrong with these claims',
    why: 'No unbundling, no duplicate, no modifier to challenge. Coding edits exist to catch billing that is incorrect, and this billing is correct — it is simply expensive. Edits slide straight off, and a network discount still comes off a chargemaster the provider wrote.',
    fix: 'When a claim is right, the only lever left is what you agree to pay for it. That is reference-based pricing, a direct contract, benefit design, or paying cash.',
  },
  {
    id: 'catastrophic',
    present: (r) =>
      r.groups.some((g) => CLAIMS[g.type].tier >= 11),
    // Eight is roughly where a single hit stops being chip damage against a
    // claim carrying a health pool in the hundreds.
    answered: (owned) => peakHit(owned) >= 8,
    answers: ['rbp', 'stopLoss', 'directContract', 'accumulator'],
    eyebrow: 'Catastrophic claim',
    title: 'Chip damage will not finish this in time',
    why: 'A catastrophic claim arrives as one enormous institutional bill rather than a stream of small ones, and it carries a health pool in the hundreds. Towers built to clear volume will scratch it and let it walk. Every hit that fails to finish it is a hit that still gets paid.',
    fix: 'You need concentrated damage rather than coverage: reference-based pricing, a direct contract, or stop-loss, which exists precisely for the one claim that would otherwise sink the plan.',
  },
];

/** Briefings that apply to a round the player is not equipped for. */
export function briefingsFor(round: RoundDef, owned: OwnedTower[], seen: ReadonlySet<string>) {
  return BRIEFINGS.filter((b) => !seen.has(b.id) && b.present(round) && !b.answered(owned));
}
