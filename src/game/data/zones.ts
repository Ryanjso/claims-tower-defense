import type { TowerId } from '../types';

/**
 * Placement zones carved out of the map. Inside a zone only the listed towers may
 * be built, and those that qualify get a bonus for being in their element. Land
 * outside every zone is unrestricted, so zones shape a build rather than dictate it.
 */
export interface Zone {
  id: string;
  name: string;
  blurb: string;
  rect: { x: number; y: number; w: number; h: number };
  allow: TowerId[];
  /** Multipliers applied to a qualifying tower placed inside. */
  bonus: { damage?: number; range?: number; rate?: number };
  color: number;
}

export const ZONES: Zone[] = [
  {
    id: 'providerRow',
    name: 'Provider Row',
    blurb: 'Where the claims originate. Contracting and navigation work best at the source.',
    rect: { x: 96, y: 352, w: 470, h: 232 },
    allow: ['directContract', 'careNav', 'network'],
    bonus: { damage: 1.2 },
    color: 0xef8033,
  },
  {
    id: 'seaOfPricing',
    name: 'Sea of Pricing',
    blurb: 'No contracts here, only benchmarks. Pricing tools only.',
    rect: { x: 706, y: 300, w: 404, h: 224 },
    allow: ['rbp', 'network'],
    bonus: { damage: 1.25 },
    color: 0xf0b429,
  },
  {
    id: 'tpaLand',
    name: 'TPA Land',
    blurb: 'The back office. Last line before a claim hits the plan.',
    rect: { x: 96, y: 700, w: 330, h: 292 },
    allow: ['stopLoss', 'accumulator', 'tracy'],
    bonus: { range: 1.15, rate: 1.1 },
    color: 0x1b8b8c,
  },
];

export function zoneAt(x: number, y: number): Zone | null {
  for (const z of ZONES) {
    if (x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h) return z;
  }
  return null;
}
