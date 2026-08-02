import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { loadSpriteManifest } from './assets';
import { MAP_HEIGHT, MAP_WIDTH } from './data/path.generated';
import { GameScene } from './scenes/GameScene';
import { PreloadScene } from './scenes/PreloadScene';

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const manifest = await loadSpriteManifest();
      if (cancelled || !hostRef.current || gameRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        backgroundColor: '#1d1d1f',
        // FIT keeps the whole board visible at any window size; the sim works in
        // map pixels regardless, so nothing downstream cares about the viewport.
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
        // All audio goes through src/audio/sfx.ts, so Phaser does not need
        // its own AudioContext.
        audio: { noAudio: true },
        scene: [PreloadScene, GameScene],
        banner: false,
      });

      game.scene.start('Preload', { manifest });
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="board" ref={hostRef} />;
}
