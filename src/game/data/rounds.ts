import type { RoundDef } from '../types';

/**
 * Twenty rounds. The shape of the escalation:
 *   1-5    routine professional claims. Teaches placement and targeting.
 *   6-10   volume, then the first out-of-network and cleanly-coded claims.
 *   11-15  institutional claims, the first Institutional Bundle at 13, and an
 *          air ambulance preview at 13 so round 15 is a test, not an ambush.
 *   16-19  inpatient pressure, NICU at 17, balance bills and prior auths.
 *   20     two gene therapies behind a NICU screen and an air ambulance rush.
 */
export const ROUNDS: RoundDef[] = [
  {
    round: 1,
    title: 'Routine lab work',
    groups: [{ type: 'lab', count: 12, spacing: 0.75, delay: 0.5 }],
  },
  {
    round: 2,
    title: 'The everyday stuff',
    groups: [
      { type: 'lab', count: 22, spacing: 0.55, delay: 0.5 },
      { type: 'officeVisit', count: 6, spacing: 1.2, delay: 6 },
    ],
  },
  {
    round: 3,
    title: 'Primary care picks up',
    groups: [
      { type: 'lab', count: 24, spacing: 0.45, delay: 0.5 },
      { type: 'officeVisit', count: 13, spacing: 0.85, delay: 4 },
    ],
  },
  {
    round: 4,
    title: 'Therapy series authorised',
    groups: [
      { type: 'officeVisit', count: 18, spacing: 0.65, delay: 0.5 },
      { type: 'therapy', count: 14, spacing: 0.5, delay: 6 },
    ],
  },
  {
    round: 5,
    title: 'Urgent care season',
    groups: [
      { type: 'officeVisit', count: 22, spacing: 0.55, delay: 0.5 },
      { type: 'therapy', count: 20, spacing: 0.42, delay: 4 },
      { type: 'urgentCare', count: 9, spacing: 0.95, delay: 12 },
    ],
  },
  {
    round: 6,
    title: 'Volume, not price',
    groups: [
      { type: 'therapy', count: 26, spacing: 0.38, delay: 0.5 },
      { type: 'urgentCare', count: 18, spacing: 0.65, delay: 5 },
    ],
  },
  {
    round: 7,
    title: 'Out-of-network appears',
    groups: [
      { type: 'urgentCare', count: 20, spacing: 0.5, delay: 0.5 },
      { type: 'officeVisit', count: 12, spacing: 0.75, delay: 6, traits: { outOfNetwork: true } },
      { type: 'therapy', count: 18, spacing: 0.38, delay: 14 },
    ],
  },
  {
    round: 8,
    title: 'Imaging orders spike',
    groups: [
      { type: 'imaging', count: 13, spacing: 0.95, delay: 0.5 },
      { type: 'therapy', count: 24, spacing: 0.33, delay: 3 },
      { type: 'urgentCare', count: 14, spacing: 0.55, delay: 12 },
    ],
  },
  {
    round: 9,
    title: 'Hospital outpatient pricing',
    groups: [
      { type: 'imaging', count: 18, spacing: 0.75, delay: 0.5 },
      { type: 'urgentCare', count: 14, spacing: 0.55, delay: 8, traits: { outOfNetwork: true } },
      { type: 'officeVisit', count: 20, spacing: 0.38, delay: 14 },
    ],
  },
  {
    round: 10,
    title: 'Clean claims, correctly coded',
    groups: [
      { type: 'emergency', count: 14, spacing: 0.95, delay: 0.5 },
      { type: 'imaging', count: 16, spacing: 0.65, delay: 4 },
      { type: 'lab', count: 26, spacing: 0.28, delay: 14, traits: { clean: true } },
    ],
  },
  {
    round: 11,
    title: 'Specialty pharmacy',
    groups: [
      { type: 'specialtyDrug', count: 16, spacing: 1.0, delay: 0.5 },
      { type: 'emergency', count: 20, spacing: 0.7, delay: 5 },
      { type: 'imaging', count: 18, spacing: 0.45, delay: 16 },
    ],
  },
  {
    round: 12,
    title: 'Infusion site of care',
    groups: [
      { type: 'specialtyDrug', count: 22, spacing: 0.8, delay: 0.5 },
      { type: 'imaging', count: 16, spacing: 0.6, delay: 6, traits: { outOfNetwork: true } },
      { type: 'emergency', count: 18, spacing: 0.5, delay: 12 },
    ],
  },
  {
    round: 13,
    title: 'First institutional bundle',
    groups: [
      { type: 'bundle', count: 1, spacing: 1, delay: 2 },
      { type: 'outpatientSurgery', count: 18, spacing: 0.85, delay: 8 },
      { type: 'emergency', count: 22, spacing: 0.4, delay: 18 },
      { type: 'airAmbulance', count: 3, spacing: 2.6, delay: 28, traits: { outOfNetwork: true } },
    ],
  },
  {
    round: 14,
    title: 'Prior auth on file',
    groups: [
      { type: 'outpatientSurgery', count: 16, spacing: 0.75, delay: 0.5 },
      { type: 'specialtyDrug', count: 20, spacing: 0.6, delay: 6, traits: { priorAuth: true } },
      { type: 'bundle', count: 3, spacing: 3.5, delay: 18 },
    ],
  },
  {
    round: 15,
    title: 'Air ambulance',
    groups: [
      { type: 'airAmbulance', count: 10, spacing: 1.8, delay: 0.5, traits: { outOfNetwork: true } },
      { type: 'outpatientSurgery', count: 23, spacing: 0.65, delay: 5 },
      { type: 'bundle', count: 3, spacing: 4.5, delay: 16 },
    ],
  },
  {
    round: 16,
    title: 'Admissions',
    groups: [
      { type: 'inpatient', count: 14, spacing: 1.25, delay: 0.5 },
      { type: 'bundle', count: 6, spacing: 3.2, delay: 8 },
      { type: 'emergency', count: 34, spacing: 0.35, delay: 16, traits: { balanceBill: true } },
    ],
  },
  {
    round: 17,
    title: 'NICU admission',
    groups: [
      { type: 'nicu', count: 2, spacing: 9, delay: 3 },
      { type: 'inpatient', count: 16, spacing: 1.1, delay: 12 },
      { type: 'airAmbulance', count: 14, spacing: 1.3, delay: 24, traits: { outOfNetwork: true } },
    ],
  },
  {
    round: 18,
    title: 'Everything at once',
    groups: [
      { type: 'bundle', count: 7, spacing: 3.0, delay: 0.5 },
      { type: 'inpatient', count: 23, spacing: 0.9, delay: 10 },
      { type: 'nicu', count: 3, spacing: 5.5, delay: 26 },
      { type: 'outpatientSurgery', count: 21, spacing: 0.55, delay: 34, traits: { outOfNetwork: true } },
    ],
  },
  {
    round: 19,
    title: 'Catastrophic quarter',
    groups: [
      { type: 'nicu', count: 3, spacing: 6, delay: 0.5 },
      { type: 'bundle', count: 7, spacing: 2.2, delay: 6, traits: { priorAuth: true } },
      { type: 'inpatient', count: 23, spacing: 0.6, delay: 14 },
      { type: 'airAmbulance', count: 14, spacing: 0.8, delay: 22, traits: { outOfNetwork: true } },
      { type: 'emergency', count: 28, spacing: 0.35, delay: 34, traits: { balanceBill: true } },
    ],
  },
  {
    round: 20,
    title: 'Gene therapy',
    groups: [
      { type: 'bundle', count: 9, spacing: 2.0, delay: 0.5 },
      { type: 'airAmbulance', count: 23, spacing: 0.6, delay: 8, traits: { outOfNetwork: true } },
      { type: 'nicu', count: 2, spacing: 5, delay: 18 },
      { type: 'inpatient', count: 28, spacing: 0.5, delay: 26, traits: { balanceBill: true } },
      { type: 'geneTherapy', count: 2, spacing: 16, delay: 34 },
      { type: 'airAmbulance', count: 18, spacing: 0.45, delay: 58, traits: { outOfNetwork: true } },
    ],
  },
];

/**
 * Tuning knob for the balance harness. Ships at 1.
 *
 * Most of a run's budget comes from the round bonus rather than from popping
 * claims. Pop income scales with how deep a claim's cascade runs, which means it
 * explodes exactly when waves get harder — so leaning on it would make late
 * rounds fund the defence that trivialises them.
 */
export const ECONOMY = { bonusScale: 1 };

/** Savings handed out for surviving a round. */
export const roundBonus = (round: number) =>
  Math.round((208 + 58 * round + 6.5 * round * round) * ECONOMY.bonusScale);

export const STARTING_SAVINGS = 1000;
export const STARTING_LIVES = 250;
