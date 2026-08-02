import type { ClaimDef, ClaimId } from '../types';

/**
 * The claim ladder, ordered by billed charge. Every claim breaks down into cheaper
 * claims rather than vanishing: a tower does not destroy a claim, it reprices it.
 * "Contained" means the allowed amount reached zero.
 */
export const CLAIMS: Record<ClaimId, ClaimDef> = {
  lab: {
    id: 'lab',
    name: 'Lab Panel',
    tier: 1,
    billed: 80,
    hp: 1,
    speed: 150,
    child: null,
    leakLives: 1,
    savings: 1,
    color: 0x2fbfa4,
    glyph: 'LAB',
    fact: 'A CBC costs a few dollars to run. Hospital outpatient labs routinely bill 20-40x what an independent lab charges for the identical test.',
  },
  officeVisit: {
    id: 'officeVisit',
    name: 'Office Visit',
    tier: 2,
    billed: 180,
    hp: 1,
    speed: 100,
    child: { type: 'lab', count: 1 },
    leakLives: 1,
    savings: 1,
    color: 0x56c271,
    glyph: 'E/M',
    fact: 'A level-3 established patient visit (99213) is the most common claim in American healthcare. Volume, not unit price, is what makes it matter.',
  },
  therapy: {
    id: 'therapy',
    name: 'PT / OT Session',
    tier: 3,
    billed: 220,
    hp: 1,
    speed: 170,
    child: { type: 'lab', count: 2 },
    leakLives: 1,
    savings: 1,
    color: 0x8bc94a,
    glyph: 'PT',
    fact: 'Physical therapy arrives in long authorised series. One knee course can be 24 visits, so small unit prices compound quickly.',
  },
  urgentCare: {
    id: 'urgentCare',
    name: 'Urgent Care',
    tier: 4,
    billed: 350,
    hp: 1,
    speed: 125,
    child: { type: 'officeVisit', count: 1 },
    leakLives: 2,
    savings: 1,
    color: 0xf0b429,
    glyph: 'UC',
    fact: 'Urgent care runs roughly a tenth of an emergency department visit for the same complaint. Steering here is one of the highest-ROI moves a plan has.',
  },
  imaging: {
    id: 'imaging',
    name: 'Advanced Imaging',
    tier: 5,
    billed: 1800,
    hp: 1,
    speed: 95,
    child: { type: 'officeVisit', count: 2 },
    leakLives: 3,
    savings: 3,
    color: 0x4b9fe1,
    glyph: 'MRI',
    fact: 'The same MRI can bill $450 at a freestanding centre and $4,500 on a hospital campus. Nothing about the scan changes — only the place of service code.',
  },
  emergency: {
    id: 'emergency',
    name: 'ER Visit',
    tier: 6,
    billed: 8500,
    hp: 2,
    speed: 155,
    child: { type: 'urgentCare', count: 2 },
    leakLives: 4,
    savings: 3,
    color: 0xd44d4a,
    glyph: 'ER',
    fact: 'Emergency claims move fast and arrive with a facility fee that scales by acuity level. Level 5 coding has climbed steadily for two decades.',
  },
  specialtyDrug: {
    id: 'specialtyDrug',
    name: 'Specialty Infusion',
    tier: 7,
    billed: 9000,
    hp: 3,
    speed: 85,
    child: { type: 'imaging', count: 2 },
    leakLives: 6,
    savings: 3,
    color: 0xa06ee1,
    glyph: 'RX',
    fact: 'Specialty drugs are under 3% of prescriptions and over half of pharmacy spend. Site of care matters enormously: hospital infusion can be triple a home or clinic setting.',
  },
  outpatientSurgery: {
    id: 'outpatientSurgery',
    name: 'Outpatient Surgery',
    tier: 8,
    billed: 22000,
    hp: 5,
    speed: 90,
    child: { type: 'specialtyDrug', count: 2 },
    leakLives: 10,
    savings: 4,
    color: 0xef8033,
    glyph: 'ASC',
    fact: 'An ambulatory surgery centre typically performs the same procedure for 45-60% of hospital outpatient department pricing, with equal or better outcomes.',
  },
  airAmbulance: {
    id: 'airAmbulance',
    name: 'Air Ambulance',
    tier: 9,
    billed: 45000,
    hp: 10,
    speed: 190,
    child: { type: 'outpatientSurgery', count: 2 },
    leakLives: 15,
    savings: 5,
    color: 0xe8e3d3,
    glyph: 'AIR',
    fact: 'Almost always out-of-network and impossible to shop from a stretcher. The No Surprises Act moved these into arbitration rather than balance billing.',
  },
  inpatient: {
    id: 'inpatient',
    name: 'Inpatient Admission',
    tier: 10,
    billed: 90000,
    hp: 12,
    speed: 75,
    child: { type: 'outpatientSurgery', count: 2 },
    leakLives: 19,
    savings: 7,
    color: 0x8b95a6,
    glyph: 'DRG',
    fact: 'Priced by diagnosis-related group. A single complication code can move an admission into a higher-weighted DRG worth tens of thousands more.',
  },
  bundle: {
    id: 'bundle',
    name: 'Institutional Bundle',
    tier: 11,
    billed: 250000,
    hp: 200,
    speed: 62,
    child: { type: 'inpatient', count: 3 },
    leakLives: 30,
    savings: 16,
    color: 0x5b6472,
    glyph: 'BUNDLE',
    fact: 'A surgical episode arrives as one enormous institutional claim: facility, implant, anesthesia and the professional side, all at once.',
  },
  nicu: {
    id: 'nicu',
    name: 'NICU Stay',
    tier: 12,
    billed: 900000,
    hp: 520,
    speed: 50,
    child: { type: 'bundle', count: 3 },
    leakLives: 48,
    savings: 33,
    color: 0x3d4550,
    glyph: 'NICU',
    fact: 'A long neonatal intensive care stay bills per diem for months. It is the single most common way a small self-funded plan blows through its aggregate attachment point.',
  },
  geneTherapy: {
    id: 'geneTherapy',
    name: 'Gene Therapy',
    tier: 13,
    billed: 3200000,
    hp: 2000,
    speed: 40,
    child: { type: 'nicu', count: 3 },
    leakLives: 75,
    savings: 65,
    color: 0xf5c518,
    glyph: 'GENE',
    fact: 'One-time cell and gene therapies list from $2M to $4.25M. A single dose can exceed an entire small plan’s annual claims budget, which is why stop-loss exists.',
  },
};

export const CLAIM_ORDER: ClaimId[] = (Object.keys(CLAIMS) as ClaimId[]).sort(
  (a, b) => CLAIMS[a].tier - CLAIMS[b].tier
);

/** Lives a claim costs if it reaches the plan. */
export const leakLives = (id: ClaimId) => CLAIMS[id].leakLives;

/** Total layer health a claim represents, counting everything it degrades into. */
export const totalHp = (() => {
  const memo = new Map<ClaimId, number>();
  const walk = (id: ClaimId): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const def = CLAIMS[id];
    const total = def.hp + (def.child ? def.child.count * walk(def.child.type) : 0);
    memo.set(id, total);
    return total;
  };
  return walk;
})();

/** MOAB-class: shown with a dollar bar and immune to the cheap denial tricks. */
export const isLargeClaim = (id: ClaimId) => CLAIMS[id].tier >= 11;
