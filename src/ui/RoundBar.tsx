import { useState } from 'react';
import { clickMenu, isMuted, setMuted } from '../audio/sfx';
import { EventBus } from '../game/EventBus';
import { ROUNDS } from '../game/data/rounds';
import { useGame } from '../state/store';

const SPEEDS = [1, 2, 3];

export function RoundBar() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const totalRounds = useGame((s) => s.totalRounds);
  const speed = useGame((s) => s.speed);
  const autoStart = useGame((s) => s.autoStart);
  const [sound, setSound] = useState(!isMuted());

  const next = ROUNDS[Math.min(round, ROUNDS.length - 1)];
  const done = phase === 'won' || phase === 'lost';

  return (
    <footer className="roundbar">
      {phase === 'idle' && !done ? (
        <button
          type="button"
          className="go"
          onClick={() => {
            clickMenu();
            EventBus.send({ type: 'startRound' });
          }}
        >
          <span className="go__round">Round {round + 1}</span>
          <span className="go__title">{next.title}</span>
          <span className="go__key">Space</span>
        </button>
      ) : (
        <div className="running">
          <span className="running__dot" />
          {done ? 'Run complete' : `Round ${round + 1} of ${totalRounds} in progress`}
        </div>
      )}

      <div className="roundbar__controls">
        <label className="toggle" title="Mute music and effects">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              const on = e.target.checked;
              setSound(on);
              setMuted(!on);
              if (on) clickMenu();
            }}
          />
          <span>Sound</span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => {
              clickMenu();
              EventBus.send({ type: 'setAutoStart', on: e.target.checked });
            }}
          />
          <span>Auto</span>
        </label>

        <div className="segmented segmented--speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={speed === s ? 'is-on' : ''}
              onClick={() => {
                if (speed !== s) clickMenu();
                EventBus.send({ type: 'setSpeed', speed: s });
              }}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
