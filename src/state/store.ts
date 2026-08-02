import { create } from 'zustand';
import type { Phase } from '../game/sim/Sim';
import type { OwnedTower } from '../game/data/briefings';
import type { TargetMode, TowerId } from '../game/types';

/** Everything the selected tower's inspector panel needs, flattened for React. */
export interface SelectedTower {
  id: number;
  type: TowerId;
  tier: number;
  targetMode: TargetMode;
  sellValue: number;
  upgradeCost: number | null;
  zoneId: string | null;
  buffed: boolean;
  range: number;
  damage: number;
  cooldown: number;
}

interface GameState {
  lives: number;
  savings: number;
  /** Rounds cleared. The round about to run (or running) is `round + 1`. */
  round: number;
  totalRounds: number;
  phase: Phase;
  speed: number;
  autoStart: boolean;

  /** Tower type armed for placement, if any. */
  placing: TowerId | null;
  /** Whether the cursor is currently over legal ground for `placing`. */
  placementOk: boolean;
  placementReason: string;

  selected: SelectedTower | null;
  /** Everything on the board, for capability checks in the wave briefing. */
  owned: OwnedTower[];
  /**
   * Briefing the player has not acknowledged yet, if any. Owned by the scene
   * rather than by React: auto-start fires in the same frame the round ends, so
   * a flag React sets after rendering would always arrive too late to hold it.
   */
  pendingBriefing: string | null;

  billedEntered: number;
  billedLeaked: number;

  /** Bumped whenever a claim leaks, so the HUD can flash. */
  leakPulse: number;

  ready: boolean;

  apply: (patch: Partial<GameState>) => void;
}

export const useGame = create<GameState>((set) => ({
  lives: 250,
  savings: 1000,
  round: 0,
  totalRounds: 20,
  phase: 'idle',
  speed: 1,
  autoStart: false,

  placing: null,
  placementOk: false,
  placementReason: '',

  selected: null,
  owned: [],
  pendingBriefing: null,

  billedEntered: 0,
  billedLeaked: 0,
  leakPulse: 0,

  ready: false,

  apply: (patch) => set(patch),
}));
