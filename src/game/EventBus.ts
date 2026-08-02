import type { TargetMode, TowerId } from './types';

/**
 * Commands flow React -> Phaser through here. State flows back the other way via
 * the zustand store, which GameScene writes to. Keeping the two directions on
 * separate rails means the render loop never waits on React.
 */
export type Command =
  | { type: 'selectTowerType'; tower: TowerId | null }
  | { type: 'selectTower'; id: number | null }
  | { type: 'upgradeTower'; id: number }
  | { type: 'sellTower'; id: number }
  | { type: 'setTargetMode'; id: number; mode: TargetMode }
  | { type: 'startRound' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setAutoStart'; on: boolean }
  | { type: 'dismissBriefing' }
  | { type: 'restart' };

type Handler = (c: Command) => void;

const handlers = new Set<Handler>();

export const EventBus = {
  send(command: Command) {
    for (const h of handlers) h(command);
  },
  subscribe(h: Handler) {
    handlers.add(h);
    return () => handlers.delete(h);
  },
};
