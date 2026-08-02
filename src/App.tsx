import { useEffect } from 'react';
import { PhaserGame } from './game/PhaserGame';
import { EventBus } from './game/EventBus';
import { Bestiary } from './ui/Bestiary';
import { EndScreen } from './ui/EndScreen';
import { Hud } from './ui/Hud';
import { Inspector } from './ui/Inspector';
import { RoundBar } from './ui/RoundBar';
import { WaveBriefing } from './ui/WaveBriefing';
import { Shop } from './ui/Shop';

export default function App() {
  // Esc cancels placement even when focus is in the sidebar rather than the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') EventBus.send({ type: 'selectTowerType', tower: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Hud />
      <main className="stage">
        <div className="stage__board">
          <PhaserGame />
          <EndScreen />
          <WaveBriefing />
        </div>
        <aside className="sidebar">
          <span className="sidebar__clip" aria-hidden />
          <Shop />
          <Inspector />
          <div className="sidebar__foot">
            <Bestiary />
            <a
              className="ghostlink"
              href="https://yuzu.health"
              target="_blank"
              rel="noreferrer noopener"
            >
              yuzu.health
            </a>
          </div>
        </aside>
      </main>
      <RoundBar />
    </div>
  );
}
