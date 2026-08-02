/** Shared vocabulary for the simulation. No Phaser imports live below this line. */

export type ClaimId =
  | 'lab'
  | 'officeVisit'
  | 'therapy'
  | 'urgentCare'
  | 'imaging'
  | 'emergency'
  | 'specialtyDrug'
  | 'outpatientSurgery'
  | 'airAmbulance'
  | 'inpatient'
  | 'bundle'
  | 'nicu'
  | 'geneTherapy';

/**
 * Modifiers a claim can carry. Each mirrors a real adjudication headache and maps
 * onto a Bloons-style bloon property, so the counterplay is already intuitive.
 */
export interface ClaimTraits {
  /** Out-of-network: invisible to towers without network visibility. (camo) */
  outOfNetwork: boolean;
  /** Cleanly coded and contracted: blunt edit tooling slides right off. (lead) */
  clean: boolean;
  /** Provider re-bills the member for the balance: regrows a layer over time. (regrow) */
  balanceBill: boolean;
  /** Prior authorisation on file: harder to unwind, doubled layer health. (fortified) */
  priorAuth: boolean;
}

export const NO_TRAITS: ClaimTraits = {
  outOfNetwork: false,
  clean: false,
  balanceBill: false,
  priorAuth: false,
};

export interface ClaimDef {
  id: ClaimId;
  name: string;
  /** Ordering by billed amount. Towers gate on this for thresholds and caps. */
  tier: number;
  /** Average billed charge, in dollars. Drives the scoreboard, not the combat math. */
  billed: number;
  /** Health of this layer only. MOAB-class claims carry a real pool; the rest are thin. */
  hp: number;
  /** Pixels per second along the path. */
  speed: number;
  /** What this degrades into when its layer breaks. */
  child: { type: ClaimId; count: number } | null;
  /**
   * Lives lost if this claim reaches the plan.
   *
   * Authored rather than summed over the cascade. Deriving it recursively made a
   * single leaked NICU cost 559 of the player's 250 lives, which turned every
   * MOAB-class round into pass-or-instantly-lose. These numbers keep a big leak
   * a serious wound that a good board can recover from.
   */
  leakLives: number;
  /** Savings awarded when this layer breaks. */
  savings: number;
  /** Fill colour for the placeholder sprite. */
  color: number;
  /** Short label drawn on the placeholder token. */
  glyph: string;
  /** Shown in the bestiary. Real, not flavour text. */
  fact: string;
}

export type TowerId =
  | 'network'
  | 'ncci'
  | 'careNav'
  | 'rbp'
  | 'planDesign'
  | 'accumulator'
  | 'cashPay'
  | 'directContract'
  | 'tracy'
  | 'stopLoss';

/**
 * How a tower behaves in the update loop. Each kind has a dedicated branch in the
 * sim; `stats` below carries every knob any kind reads.
 */
export type TowerKind =
  | 'shooter'   // fires a travelling projectile at a target
  | 'hitscan'   // instant damage, no projectile flight
  | 'spikes'    // drops persistent traps onto the nearest stretch of path
  | 'aura'      // ticks damage to everything inside its radius
  | 'instant'   // consumes a claim outright on cooldown and mints savings
  | 'buff'      // multiplies the stats of other towers in radius
  | 'barrier'   // threshold-gated thorn emitter
  | 'laser';    // continuous beam on the lead claim

export interface TowerStats {
  range: number;
  /** Seconds between activations. */
  cooldown: number;
  damage: number;
  /** How many claims one projectile or tick can touch. */
  pierce: number;
  projectileSpeed: number;

  seesOutOfNetwork: boolean;
  /** Can meaningfully touch cleanly-coded contracted claims. */
  piercesContract: boolean;

  /** careNav: multiplier applied to claim speed while slowed, and how long it lasts. */
  slowFactor: number;
  slowDuration: number;
  /** careNav: chance to steer a claim off-path entirely, and the highest tier eligible. */
  rerouteChance: number;
  rerouteMaxTier: number;

  /** ncci: traps dropped per activation and how many claims each can hit. */
  spikeCount: number;
  spikeHits: number;

  /** planDesign: claims at or below this tier are denied outright on contact. */
  denyMaxTier: number;

  /** accumulator: damage multiplier growth per hit, and its ceiling, within a round. */
  rampPerHit: number;
  rampMax: number;

  /** cashPay: highest tier it can settle, and savings minted per settlement. */
  settleMaxTier: number;
  savingsPerUse: number;

  /** directContract: extra damage all sources deal to claims inside the radius. */
  contractDebuff: number;

  /** tracy: multipliers granted to towers in radius. */
  buffDamage: number;
  buffRange: number;
  buffRate: number;
  /** tracy tier 3: lends network visibility to everyone in radius. */
  buffGrantsSight: boolean;

  /** stopLoss: only engages claims at or above this tier — the specific deductible. */
  attachTier: number;
  /** stopLoss: thorn lifetime in seconds. */
  thornLife: number;

  /** Extra multiplier against MOAB-class claims. */
  bonusVsLarge: number;
}

export interface TowerUpgrade {
  name: string;
  cost: number;
  blurb: string;
  /** Absolute overrides — every tier states its own numbers so balance stays legible. */
  stats: Partial<TowerStats>;
  /** Some upgrades change behaviour outright (Stop-Loss tier 3 becomes the Laser). */
  kind?: TowerKind;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  short: string;
  cost: number;
  kind: TowerKind;
  color: number;
  accent: number;
  glyph: string;
  blurb: string;
  /** The real cost-containment mechanic, for the tooltip. */
  fact: string;
  base: TowerStats;
  upgrades: [TowerUpgrade, TowerUpgrade, TowerUpgrade];
  /** Placement zones this tower is restricted from, by zone id. */
  zoneRule?: 'pricingOnly' | 'backOffice' | 'providerRow';
}

export type TargetMode = 'first' | 'last' | 'strong' | 'close';

export interface SpawnGroup {
  type: ClaimId;
  count: number;
  /** Seconds between claims inside the group. */
  spacing: number;
  /** Seconds after round start before the first claim of the group. */
  delay: number;
  traits?: Partial<ClaimTraits>;
}

export interface RoundDef {
  round: number;
  /** Shown on the round banner — names the pressure the wave applies. */
  title: string;
  groups: SpawnGroup[];
}
