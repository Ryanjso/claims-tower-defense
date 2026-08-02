import { useEffect, useState } from 'react';
import { useGame } from '../state/store';
import { ROUNDS } from '../game/data/rounds';
import { money, pct } from './format';

export function Hud() {
  const lives = useGame((s) => s.lives);
  const savings = useGame((s) => s.savings);
  const round = useGame((s) => s.round);
  const totalRounds = useGame((s) => s.totalRounds);
  const phase = useGame((s) => s.phase);
  const leakPulse = useGame((s) => s.leakPulse);
  const entered = useGame((s) => s.billedEntered);
  const leaked = useGame((s) => s.billedLeaked);

  const [hurt, setHurt] = useState(false);
  useEffect(() => {
    if (!leakPulse) return;
    setHurt(true);
    const t = setTimeout(() => setHurt(false), 420);
    return () => clearTimeout(t);
  }, [leakPulse]);

  const displayRound = phase === 'running' ? round + 1 : Math.min(round + 1, totalRounds);
  const title = ROUNDS[Math.min(round, ROUNDS.length - 1)]?.title ?? '';
  const contained = entered === 0 ? 1 : 1 - leaked / entered;
  const livesPct = Math.max(0, Math.min(1, lives / 250));

  return (
    <header className="hud">
      <div className="hud__brand">
        <span className="hud__mark" aria-hidden />
        <div>
          <div className="hud__title">Containment</div>
          <div className="hud__sub">Claims Tower Defense</div>
        </div>
      </div>

      <div className={`stat stat--lives ${hurt ? 'is-hurt' : ''}`}>
        <div className="stat__label">Covered lives</div>
        <div className="stat__value">{lives.toLocaleString()}</div>
        <div className="stat__meter">
          <span style={{ width: `${livesPct * 100}%` }} />
        </div>
      </div>

      <div className="stat stat--savings">
        <div className="stat__label">Savings</div>
        <div className="stat__value">{money(savings)}</div>
      </div>

      <div className="stat">
        <div className="stat__label">Round</div>
        <div className="stat__value">
          {displayRound}
          <span className="stat__of">/ {totalRounds}</span>
        </div>
        <div className="stat__note">{title}</div>
      </div>

      <div className="stat stat--wide">
        <div className="stat__label">Billed charges contained</div>
        <div className="stat__value">{pct(contained)}</div>
        <div className="stat__note">
          {money(entered - leaked)} kept off the plan of {money(entered)} billed
        </div>
      </div>
    </header>
  );
}
