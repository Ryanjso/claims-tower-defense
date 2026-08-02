import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/path.generated';
import type { SpriteManifest } from '../assets';
import {
  buildPlaceholderArt,
  claimTextureKey,
  towerBaseKey,
  towerHeadKey,
  towerTextureKey,
} from '../render/art';
import type { ClaimId, TowerId } from '../types';

/** Texture key for an fx file stem, e.g. `proj-network.png` → `fx-proj-network`. */
export const fxTextureKey = (filename: string) =>
  `fx-${filename.replace(/\.png$/i, '')}`;

export class PreloadScene extends Phaser.Scene {
  private manifest: SpriteManifest = {};

  constructor() {
    super('Preload');
  }

  init(data: { manifest?: SpriteManifest }) {
    this.manifest = data?.manifest ?? {};
  }

  preload() {
    const base = import.meta.env.BASE_URL;
    const w = this.scale.width;
    const h = this.scale.height;

    const bar = this.add.graphics();
    const label = this.add
      .text(w / 2, h / 2 + 42, 'Loading claims…', {
        fontFamily: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
        fontSize: '20px',
        color: '#e9dab7',
      })
      .setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x33281c, 0.9).fillRoundedRect(w / 2 - 180, h / 2 - 12, 360, 24, 12);
      bar.fillStyle(0xf0b429, 1).fillRoundedRect(w / 2 - 175, h / 2 - 7, 350 * p, 14, 7);
    });
    this.load.once('complete', () => {
      bar.destroy();
      label.destroy();
    });

    this.load.image('map', `${base}assets/map/field.png`);

    for (const id of this.manifest.towers ?? []) {
      this.load.image(towerTextureKey(id as TowerId), `${base}assets/towers/${id}.png`);
    }

    const maxTier = this.manifest.towerKitMaxTier ?? 3;
    for (const id of this.manifest.towerKits ?? []) {
      const tid = id as TowerId;
      for (let tier = 0; tier <= maxTier; tier++) {
        this.load.image(
          towerBaseKey(tid, tier),
          `${base}assets/towers/${id}/t${tier}/base.png`
        );
        this.load.image(
          towerHeadKey(tid, tier),
          `${base}assets/towers/${id}/t${tier}/head.png`
        );
      }
    }

    for (const id of this.manifest.claims ?? []) {
      this.load.image(claimTextureKey(id as ClaimId), `${base}assets/claims/${id}.png`);
    }

    for (const file of this.manifest.fx ?? []) {
      const key = fxTextureKey(file);
      // Authoritative aliases that replace generated placeholder keys.
      const alias =
        file === 'thorn-edit.png'
          ? 'thorn-edit'
          : file === 'thorn-stopLoss.png'
            ? 'thorn-stopLoss'
            : file === 'puff.png'
              ? 'puff'
              : null;
      this.load.image(key, `${base}assets/fx/${file}`);
      if (alias) this.load.image(alias, `${base}assets/fx/${file}`);
    }

    for (const id of this.manifest.portraits ?? []) {
      this.load.image(`portrait-${id}`, `${base}assets/ui/portrait-${id}.png`);
    }

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[containment] optional asset failed to load: ${file.key}`);
    });
  }

  create() {
    buildPlaceholderArt(this);
    this.smoothLoadedTextures();

    const warm = this.warmRenderer();
    this.time.delayedCall(140, () => {
      for (const o of warm) o.destroy();
      this.scene.start('Game');
    });
  }

  private smoothLoadedTextures() {
    for (const key of this.textures.getTextureKeys()) {
      if (key === '__DEFAULT' || key === '__MISSING' || key === '__WHITE') continue;
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  private warmRenderer(): Phaser.GameObjects.GameObject[] {
    const x = this.scale.width / 2;
    const y = this.scale.height / 2;
    const out: Phaser.GameObjects.GameObject[] = [];

    out.push(this.add.image(x, y, 'map').setDisplaySize(8, 8).setAlpha(0.01));
    out.push(this.add.image(x, y, towerTextureKey('network')).setTint(0xff8080).setAlpha(0.01));

    const g = this.add.graphics().setAlpha(0.01);
    g.fillStyle(0xffffff, 1).fillCircle(x, y, 60);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(x, y, 60);
    g.fillRoundedRect(x - 40, y - 40, 80, 80, 12);
    g.strokeRect(x - 20, y - 20, 40, 40);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 40, y + 40);
    g.strokePath();
    out.push(g);

    out.push(
      this.add
        .text(x, y, '000', { fontSize: '26px', stroke: '#000000', strokeThickness: 5 })
        .setAlpha(0.01)
    );

    const p = this.add.particles(x, y, 'puff', {
      lifespan: 80,
      speed: 10,
      alpha: { start: 0.01, end: 0 },
      emitting: false,
    });
    p.emitParticleAt(x, y, 4);
    out.push(p);

    return out;
  }
}

export const GAME_WIDTH = MAP_WIDTH;
export const GAME_HEIGHT = MAP_HEIGHT;
