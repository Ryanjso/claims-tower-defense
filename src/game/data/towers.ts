import type { TowerDef, TowerId, TowerStats } from '../types';

/** Neutral defaults so each tower only states the knobs its kind actually reads. */
const BASE: TowerStats = {
  range: 160,
  cooldown: 1,
  damage: 1,
  pierce: 1,
  projectileSpeed: 620,
  seesOutOfNetwork: false,
  piercesContract: false,
  slowFactor: 1,
  slowDuration: 0,
  rerouteChance: 0,
  rerouteMaxTier: 0,
  spikeCount: 0,
  spikeHits: 0,
  denyMaxTier: 0,
  rampPerHit: 0,
  rampMax: 1,
  settleMaxTier: 0,
  savingsPerUse: 0,
  contractDebuff: 0,
  buffDamage: 1,
  buffRange: 1,
  buffRate: 1,
  buffGrantsSight: false,
  attachTier: 0,
  thornLife: 0,
  bonusVsLarge: 1,
};

const stats = (over: Partial<TowerStats>): TowerStats => ({ ...BASE, ...over });

export const TOWERS: Record<TowerId, TowerDef> = {
  network: {
    id: 'network',
    name: 'Network',
    short: 'NET',
    cost: 200,
    kind: 'shooter',
    color: 0x1b8b8c,
    accent: 0x115859,
    glyph: 'NET',
    blurb: 'Contracted discounts off billed charges. Cheap, broad, and shallow.',
    fact: 'A rented PPO network takes a percentage off billed charges — but the provider sets the chargemaster those discounts come off of, so a "60% discount" can still land above a fair price.',
    base: stats({ range: 150, cooldown: 0.85, damage: 1, pierce: 2, projectileSpeed: 640 }),
    upgrades: [
      {
        name: 'Broader Network',
        cost: 180,
        blurb: 'More contracted providers means more claims caught per pass.',
        stats: { pierce: 3, cooldown: 0.72 },
      },
      {
        name: 'Tiered Network',
        cost: 450,
        blurb: 'Steer to the high-value tier and the discount deepens.',
        stats: { pierce: 3, cooldown: 0.72, damage: 2, range: 175 },
      },
      {
        name: 'National PPO',
        cost: 1400,
        blurb: 'Full national footprint with wrap coverage.',
        stats: { pierce: 7, cooldown: 0.55, damage: 5, range: 210 },
      },
    ],
  },

  ncci: {
    id: 'ncci',
    name: 'NCCI Edits',
    short: 'NCCI',
    cost: 350,
    kind: 'spikes',
    color: 0xd44d4a,
    accent: 0x932d2b,
    glyph: 'EDIT',
    blurb: 'Coding edits that catch unbundling and duplicates before payment goes out.',
    fact: 'The National Correct Coding Initiative publishes procedure-to-procedure edit pairs that should never be billed together. Cheap, automatic, and completely useless against a cleanly coded claim.',
    base: stats({ range: 150, cooldown: 3.0, damage: 1, spikeCount: 2, spikeHits: 3, thornLife: 999 }),
    upgrades: [
      {
        name: 'Bundling Rules',
        cost: 300,
        blurb: 'Column 1 / column 2 pairs applied automatically at intake.',
        stats: { spikeCount: 3, cooldown: 2.6 },
      },
      {
        name: 'Modifier Scrutiny',
        cost: 700,
        blurb: 'Stop waving through a modifier 59 just because it is present.',
        stats: { spikeCount: 3, cooldown: 2.2, damage: 2, spikeHits: 5 },
      },
      {
        name: 'Full Edit Suite',
        cost: 1900,
        blurb: 'MUE limits, global period rules and frequency edits, all live.',
        stats: { spikeCount: 4, cooldown: 1.9, damage: 5, spikeHits: 9 },
      },
    ],
  },

  careNav: {
    id: 'careNav',
    name: 'Care Navigation',
    short: 'NAV',
    cost: 450,
    kind: 'shooter',
    color: 0x4b9fe1,
    accent: 0x1f5f96,
    glyph: 'NAV',
    blurb: 'Slow claims down and steer members to high-value sites of care.',
    fact: 'The cheapest claim is the one that never gets generated at the expensive place. Navigation works upstream of pricing entirely — it changes where care happens, not what it costs once it has.',
    base: stats({
      range: 190,
      cooldown: 1.4,
      damage: 1,
      seesOutOfNetwork: true,
      slowFactor: 0.55,
      slowDuration: 1.6,
      rerouteChance: 0.18,
      rerouteMaxTier: 2,
    }),
    upgrades: [
      {
        name: 'Nurse Line',
        cost: 400,
        blurb: 'A clinician answers before the member picks a door.',
        stats: { cooldown: 1.1, slowDuration: 2.2, rerouteChance: 0.28 },
      },
      {
        name: 'Steerage Incentives',
        cost: 1000,
        blurb: 'Waive the copay at the site you want them to use.',
        stats: { cooldown: 1.1, slowDuration: 2.2, rerouteChance: 0.4, rerouteMaxTier: 5, range: 220 },
      },
      {
        name: 'Concierge Navigation',
        cost: 2800,
        blurb: 'A named human books the appointment and closes the loop.',
        stats: {
          cooldown: 0.95,
          slowDuration: 2.6,
          slowFactor: 0.35,
          rerouteChance: 0.55,
          rerouteMaxTier: 7,
          damage: 2,
          range: 240,
        },
      },
    ],
  },

  rbp: {
    id: 'rbp',
    name: 'Reference-Based Pricing',
    short: 'RBP',
    cost: 550,
    kind: 'hitscan',
    color: 0xf0b429,
    accent: 0xa8760a,
    glyph: 'RBP',
    blurb: 'Ignore the chargemaster. Pay a defensible multiple of Medicare.',
    fact: 'RBP prices off a public benchmark instead of a negotiated discount. It reaches the whole map because it does not need a contract to work — but it does need the plan to be willing to defend the number.',
    base: stats({
      range: 5000,
      cooldown: 1.9,
      damage: 10,
      pierce: 1,
      seesOutOfNetwork: true,
      piercesContract: true,
    }),
    zoneRule: 'pricingOnly',
    upgrades: [
      {
        name: '150% of Medicare',
        cost: 520,
        blurb: 'A standard, well-litigated reference point.',
        stats: { damage: 16, cooldown: 1.6 },
      },
      {
        name: '125% of Medicare',
        cost: 1300,
        blurb: 'Tighter benchmark, more provider pushback, real savings.',
        stats: { damage: 26, cooldown: 1.35 },
      },
      {
        name: 'Plan-Determined Allowable',
        cost: 4200,
        blurb: 'Your number, with legal support behind every appeal.',
        stats: { damage: 60, cooldown: 0.95, pierce: 3, bonusVsLarge: 2.2 },
      },
    ],
  },

  planDesign: {
    id: 'planDesign',
    name: 'Good Plan Design',
    short: 'PLAN',
    cost: 700,
    kind: 'aura',
    color: 0x56c271,
    accent: 0x2c7a44,
    glyph: 'SPD',
    blurb: 'Benefits that make the high-value choice the cheap choice for the member.',
    fact: 'Design decides what is even payable. Deductibles, coinsurance tiers and site-of-care rules shrink every claim in their radius before any pricing tool touches them — including out-of-network claims, which simply land in a worse benefit tier.',
    // Benefit design applies to every claim regardless of network status or how
    // cleanly it was coded, so it sees and touches everything inside its radius.
    base: stats({
      range: 165,
      cooldown: 0.9,
      damage: 1,
      denyMaxTier: 1,
      seesOutOfNetwork: true,
      piercesContract: true,
    }),
    upgrades: [
      {
        name: 'Deductible + Coinsurance',
        cost: 620,
        blurb: 'Real member cost-sharing, applied consistently.',
        stats: { damage: 2, range: 185 },
      },
      {
        name: 'Site-of-Care Steering',
        cost: 1500,
        blurb: 'Hospital outpatient costs the member more. On purpose.',
        stats: { damage: 3, range: 205, denyMaxTier: 3 },
      },
      {
        name: 'Value-Based Benefit Design',
        cost: 3800,
        blurb: 'Zero-dollar high-value care, full freight on low-value care.',
        stats: { damage: 7, range: 245, denyMaxTier: 3, cooldown: 0.55 },
      },
    ],
  },

  accumulator: {
    id: 'accumulator',
    name: 'Accumulators',
    short: 'ACCUM',
    cost: 850,
    kind: 'shooter',
    color: 0xa06ee1,
    accent: 0x5e3a91,
    glyph: 'ACC',
    blurb: 'Tracks deductible and out-of-pocket progress. Ramps up as the round goes on.',
    fact: 'Accumulators are the plan’s running ledger of what each member has paid. Get them wrong and you either overpay claims or wrongly deny them — get them right and the back half of a plan year prices itself.',
    base: stats({ range: 175, cooldown: 1.5, damage: 2, pierce: 1, rampPerHit: 0.06, rampMax: 3 }),
    upgrades: [
      {
        name: 'Real-Time Accumulator Feed',
        cost: 700,
        blurb: 'No more month-end batch files from the PBM.',
        stats: { cooldown: 1.2, rampPerHit: 0.09 },
      },
      {
        name: 'Family Deductible Tracking',
        cost: 1650,
        blurb: 'Embedded and aggregate limits, tracked per member and per family.',
        stats: { cooldown: 1.2, rampPerHit: 0.09, damage: 4, rampMax: 4.5 },
      },
      {
        name: 'Out-of-Pocket Max Enforcement',
        cost: 4400,
        blurb: 'Once the member is capped, the plan’s exposure is known exactly.',
        stats: { cooldown: 0.85, rampPerHit: 0.14, damage: 11, rampMax: 9, pierce: 4 },
      },
    ],
  },

  cashPay: {
    id: 'cashPay',
    name: 'Cash Pay Card',
    short: 'CARD',
    cost: 900,
    kind: 'instant',
    color: 0x2fbfa4,
    accent: 0x11786a,
    glyph: 'CASH',
    blurb: 'Settle at the cash price up front. Clears the claim and mints savings.',
    fact: 'A single-use virtual card that pays a provider’s cash rate at the point of service. The cash price is frequently below the negotiated network rate, and the claim never enters the adjudication pipeline at all — so network status and coding are irrelevant.',
    // Paying cash sidesteps the network and the coding entirely.
    base: stats({
      range: 170,
      cooldown: 4.5,
      settleMaxTier: 4,
      savingsPerUse: 45,
      seesOutOfNetwork: true,
      piercesContract: true,
    }),
    upgrades: [
      {
        name: 'Higher Card Limit',
        cost: 800,
        blurb: 'Bigger single-transaction ceiling opens up more claims.',
        stats: { cooldown: 3.8, settleMaxTier: 5, savingsPerUse: 70 },
      },
      {
        name: 'Negotiated Cash Rates',
        cost: 1900,
        blurb: 'Pre-shopped rates with a curated provider list.',
        stats: { cooldown: 3.2, settleMaxTier: 6, savingsPerUse: 110, range: 190 },
      },
      {
        name: 'Direct-to-Provider Settlement',
        cost: 5200,
        blurb: 'Same-day funds. Providers love it, so the price drops again.',
        stats: { cooldown: 2.2, settleMaxTier: 8, savingsPerUse: 200, range: 215 },
      },
    ],
  },

  directContract: {
    id: 'directContract',
    name: 'Direct Contracts',
    short: 'DIRECT',
    cost: 1200,
    kind: 'shooter',
    color: 0xef8033,
    accent: 0xa04f13,
    glyph: 'DC',
    blurb: 'Contract straight with the provider. Weakens every claim in the radius.',
    fact: 'Cutting out the rented network means the plan and the health system agree on a price directly — often a case rate for a whole episode. Fewer intermediaries, no chargemaster games, and terms you actually wrote.',
    base: stats({
      range: 200,
      cooldown: 0.9,
      damage: 5,
      pierce: 2,
      piercesContract: true,
      contractDebuff: 0.3,
    }),
    zoneRule: 'providerRow',
    upgrades: [
      {
        name: 'Bundled Case Rate',
        cost: 1000,
        blurb: 'One price for the whole episode, complications included.',
        stats: { damage: 8, cooldown: 0.75 },
      },
      {
        name: 'Centers of Excellence',
        cost: 2300,
        blurb: 'Send the hard cases to the places with the best outcomes.',
        stats: { damage: 13, cooldown: 0.75, range: 230, contractDebuff: 0.5 },
      },
      {
        name: 'Direct Primary + Specialty',
        cost: 6000,
        blurb: 'The whole care pathway under contract, top to bottom.',
        stats: { damage: 34, cooldown: 0.55, pierce: 5, range: 260, contractDebuff: 0.9 },
      },
    ],
  },

  tracy: {
    id: 'tracy',
    name: 'Tracy',
    short: 'TRACY',
    cost: 1500,
    kind: 'buff',
    color: 0xf5c518,
    accent: 0xb08800,
    glyph: 'TRACY',
    blurb: 'Makes every tower in her radius meaningfully better at its job.',
    fact: 'Every containment program lives or dies on operations. The tooling only performs as well as the person making sure it is configured, monitored and actually used.',
    base: stats({ range: 210, buffDamage: 1.25, buffRange: 1.15, buffRate: 1.15 }),
    upgrades: [
      {
        name: 'Ops Playbooks',
        cost: 1300,
        blurb: 'Documented, repeatable, no longer living in one head.',
        stats: { buffDamage: 1.4, buffRate: 1.25 },
      },
      {
        name: 'Cross-Team Escalation',
        cost: 2900,
        blurb: 'Clinical, claims and account management in one thread.',
        stats: { buffDamage: 1.6, buffRange: 1.3, buffRate: 1.35, range: 240 },
      },
      {
        name: 'Tracy, Everywhere',
        cost: 7600,
        blurb: 'The whole operation runs the way she would run it.',
        stats: { buffDamage: 2.2, buffRange: 1.5, buffRate: 1.7, range: 300, buffGrantsSight: true },
      },
    ],
  },

  stopLoss: {
    id: 'stopLoss',
    name: 'Stop-Loss',
    short: 'STOP',
    cost: 1800,
    kind: 'barrier',
    color: 0x8b95a6,
    accent: 0x4a5361,
    glyph: 'SL',
    blurb: 'A thorn barrier that only engages claims above the specific deductible.',
    fact: 'Stop-loss reinsurance reimburses the plan once a single claimant blows past the specific deductible. It does nothing at all on routine claims — and it is the only reason a small self-funded plan can survive a catastrophic one.',
    // Reinsurance attaches on dollars, not on network status.
    base: stats({
      range: 180,
      cooldown: 1.1,
      damage: 4,
      spikeCount: 3,
      spikeHits: 4,
      thornLife: 6,
      attachTier: 7,
      seesOutOfNetwork: true,
    }),
    zoneRule: 'backOffice',
    upgrades: [
      {
        name: 'Lower Specific Deductible',
        cost: 1500,
        blurb: 'Attaches sooner. Costs more in premium, catches more claims.',
        stats: { cooldown: 0.85, damage: 6, attachTier: 6, spikeCount: 4 },
      },
      {
        name: 'Aggregate + Specific',
        cost: 3400,
        blurb: 'Protection against one huge claim and against too many at once.',
        stats: { cooldown: 0.7, damage: 10, attachTier: 5, spikeCount: 5, spikeHits: 6 },
      },
      {
        name: 'Laser',
        cost: 10000,
        blurb: 'A continuous beam on the largest claim in range. No threshold, no mercy.',
        kind: 'laser',
        stats: {
          cooldown: 0.05,
          damage: 68, // continuous, so this is damage per second
          range: 275,
          pierce: 1,
          attachTier: 0,
          piercesContract: true,
          seesOutOfNetwork: true,
          bonusVsLarge: 1.5,
        },
      },
    ],
  },
};

export const TOWER_ORDER: TowerId[] = [
  'network',
  'ncci',
  'careNav',
  'rbp',
  'planDesign',
  'accumulator',
  'cashPay',
  'directContract',
  'tracy',
  'stopLoss',
];

/** Effective stats for a tower at an upgrade tier (0 = unupgraded). */
export function statsAt(id: TowerId, tier: number): TowerStats {
  const def = TOWERS[id];
  let out = { ...def.base };
  for (let i = 0; i < tier; i++) out = { ...out, ...def.upgrades[i].stats };
  return out;
}

export function kindAt(id: TowerId, tier: number) {
  const def = TOWERS[id];
  let kind = def.kind;
  for (let i = 0; i < tier; i++) if (def.upgrades[i].kind) kind = def.upgrades[i].kind!;
  return kind;
}

/** Total spend on a tower at a given tier — used for sell value. */
export function investedIn(id: TowerId, tier: number): number {
  const def = TOWERS[id];
  let total = def.cost;
  for (let i = 0; i < tier; i++) total += def.upgrades[i].cost;
  return total;
}

/**
 * Head turn rates (rad/s) from SPRITES.md §3. `0` means the head never rotates
 * (Tracy, Good Plan Design). Stop-Loss t3 is snappier for the laser.
 */
export const TOWER_TURN_RATE: Record<TowerId, number> = {
  network: 10,
  ncci: 3,
  careNav: 8,
  rbp: 14,
  planDesign: 0,
  accumulator: 9,
  cashPay: 12,
  directContract: 9,
  tracy: 0,
  stopLoss: 7,
};

export function towerTurnRate(id: TowerId, tier: number): number {
  if (id === 'stopLoss' && tier >= 3) return 16;
  return TOWER_TURN_RATE[id];
}
