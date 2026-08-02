import Phaser from 'phaser';
import { EventBus, type Command } from '../EventBus';
import { clickMenu, playSfx } from '../../audio/sfx';
import { useGame, type SelectedTower } from '../../state/store';
import { briefingsFor } from '../data/briefings';
import { CLAIMS } from '../data/claims';
import { MAP_HEIGHT, MAP_WIDTH, PATH_POINTS } from '../data/path.generated';
import { TERRAIN_CELL, TERRAIN_COLS, TERRAIN_ROWS } from '../data/terrain.generated';
import { TOWERS, statsAt } from '../data/towers';
import { ROUNDS } from '../data/rounds';
import { ZONES } from '../data/zones';
import {
  claimRadius,
  claimTextureKey,
  hasTowerKit,
  towerBaseKey,
  towerHeadKey,
  towerTextureKey,
} from '../render/art';
import { Sim, type SimClaim } from '../sim/Sim';
import { TOWER_RADIUS, canPlace, groundClear } from '../sim/placement';
import type { TowerId } from '../types';

const FIXED_STEP = 1 / 60;
const TOWER_DISPLAY = TOWER_RADIUS * 2.6;

const DEPTH = {
  zones: 2,
  thorns: 3,
  ranges: 4,
  ghost: 5,
  claims: 6,
  towers: 7,
  projectiles: 8,
  beams: 9,
  effects: 10,
} as const;

/** Placed tower visuals: static base + optional rotating head. */
interface TowerView {
  base: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image | null;
  /** Which authored kit tier the textures currently show. */
  kitTier: number;
}

const PROJ_TEXTURE: Partial<Record<TowerId, string>> = {
  network: 'fx-proj-network',
  careNav: 'fx-proj-careNav',
  accumulator: 'fx-proj-accumulator',
  directContract: 'fx-proj-directContract',
  stopLoss: 'fx-proj-stopLoss',
};

const STAMP_TEXTURE: Record<string, string> = {
  DENIED: 'fx-stamp-denied',
  STEERED: 'fx-stamp-steered',
  'CASH PAID': 'fx-stamp-cash-paid',
};

/** Reusable sprite pool for short-lived entities like projectiles and thorns. */
class SpritePool {
  private sprites: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private scene: Phaser.Scene;
  private texture: string;
  private depth: number;

  constructor(scene: Phaser.Scene, texture: string, depth: number) {
    this.scene = scene;
    this.texture = texture;
    this.depth = depth;
  }

  begin() {
    this.used = 0;
  }

  next(): Phaser.GameObjects.Image {
    if (this.used === this.sprites.length) {
      const img = this.scene.add.image(0, 0, this.texture).setDepth(this.depth);
      this.sprites.push(img);
    }
    const img = this.sprites[this.used++];
    img.setVisible(true);
    return img;
  }

  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
  }
}

export class GameScene extends Phaser.Scene {
  private sim!: Sim;
  private accumulator = 0;
  private speed = 1;
  private autoStart = false;

  private claimSprites = new Map<number, Phaser.GameObjects.Image>();
  private claimBadges = new Map<number, Phaser.GameObjects.Image>();
  private towerSprites = new Map<number, TowerView>();
  private projectiles!: SpritePool;
  private editThorns!: SpritePool;
  private stopThorns!: SpritePool;

  private beams!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private ranges!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;

  private floaters: Phaser.GameObjects.Text[] = [];
  private floaterIndex = 0;

  private placing: TowerId | null = null;
  private selectedId: number | null = null;
  private pointer = new Phaser.Math.Vector2(-999, -999);

  private seenBriefings = new Set<string>();
  private pendingBriefing: string | null = null;

  private lastColdKey = '';
  private lastHotKey = '';
  private lastHotPush = 0;
  private lastOverlayKey = '';
  private unsubscribe?: () => void;

  // Perf overlay (toggle with P). Kept in Phaser so measuring costs nothing in React.
  private perfText?: Phaser.GameObjects.Text;
  private frameTimes: number[] = [];
  private simMs = 0;
  private renderMs = 0;
  private storePushes = 0;
  private perfWorst = 0;
  private perfLastUpdate = 0;

  constructor() {
    super('Game');
  }

  create() {
    this.sim = new Sim();

    this.add.image(0, 0, 'map').setOrigin(0, 0).setDepth(0);
    this.drawZones();
    this.drawEndpoints();

    this.projectiles = new SpritePool(this, 'projectile', DEPTH.projectiles);
    this.editThorns = new SpritePool(this, 'thorn-edit', DEPTH.thorns);
    this.stopThorns = new SpritePool(this, 'thorn-stopLoss', DEPTH.thorns);

    this.beams = this.add.graphics().setDepth(DEPTH.beams);
    this.bars = this.add.graphics().setDepth(DEPTH.effects);
    this.ranges = this.add.graphics().setDepth(DEPTH.ranges);

    this.ghost = this.add
      .image(-999, -999, towerTextureKey('network'))
      .setDepth(DEPTH.ghost)
      .setAlpha(0.75)
      .setVisible(false);

    this.puffs = this.add.particles(0, 0, 'puff', {
      lifespan: 320,
      speed: { min: 20, max: 90 },
      scale: { start: 0.75, end: 0 },
      alpha: { start: 0.85, end: 0 },
      emitting: false,
    });
    this.puffs.setDepth(DEPTH.effects);

    for (let i = 0; i < 18; i++) {
      this.floaters.push(
        this.add
          .text(0, 0, '', {
            fontFamily: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
            fontSize: '26px',
            fontStyle: '700',
            color: '#ffffff',
            stroke: '#1d1d1f',
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(DEPTH.effects)
          .setVisible(false)
      );
    }

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.worldX, p.worldY);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.worldX, p.worldY);
      this.handleClick(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection());
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.sim.startRound()) this.acknowledgeBriefing();
    });
    this.input.keyboard?.on('keydown-P', () => this.togglePerf());

    this.unsubscribe = EventBus.subscribe((c) => this.handleCommand(c));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());

    useGame.getState().apply({ ready: true, totalRounds: this.sim.totalRounds });
    this.pushState(true);

    // Dev handle for the profiling and screenshot scripts: lets them jump to a
    // late round or stack a board without playing twenty rounds first.
    if (import.meta.env.DEV) {
      (window as unknown as { containment: unknown }).containment = {
        scene: this,
        sim: this.sim,
        sync: () => this.pushState(true),
        jumpTo: (round: number, tier = 3) => {
          this.sim.reset();
          for (const s of this.claimSprites.values()) s.destroy();
          this.claimSprites.clear();
          for (const s of this.claimBadges.values()) s.destroy();
          this.claimBadges.clear();
          this.destroyTowerSprites();
          this.sim.savings = 1e9;
          const board: Array<[TowerId, number, number]> = [
            ['network', 1260, 620], ['network', 460, 480], ['ncci', 1300, 640],
            ['careNav', 500, 500], ['rbp', 900, 600], ['planDesign', 1240, 660],
            ['cashPay', 440, 700], ['directContract', 420, 500],
            ['accumulator', 380, 700], ['tracy', 400, 620], ['stopLoss', 420, 740],
          ];
          for (const [t, x, y] of board) {
            const placed = this.sim.place(t, x, y);
            if (placed) for (let i = 0; i < tier; i++) this.sim.upgrade(placed.id);
          }
          this.sim.round = Math.max(0, round - 1);
          this.sim.startRound();
          this.pushState(true);
        },
      };
    }
  }

  // ------------------------------------------------------------- static art

  private drawZones() {
    const g = this.add.graphics().setDepth(DEPTH.zones);
    for (const z of ZONES) {
      const { x, y, w, h } = z.rect;
      g.fillStyle(z.color, 0.14).fillRoundedRect(x, y, w, h, 18);

      // Dashed border, drawn by hand so the zone reads as a boundary not a panel.
      g.lineStyle(3, z.color, 0.85);
      const dash = 16;
      const gap = 11;
      const edge = (fromX: number, fromY: number, toX: number, toY: number) => {
        const len = Math.hypot(toX - fromX, toY - fromY);
        const ux = (toX - fromX) / len;
        const uy = (toY - fromY) / len;
        for (let d = 0; d < len; d += dash + gap) {
          const e = Math.min(d + dash, len);
          g.beginPath();
          g.moveTo(fromX + ux * d, fromY + uy * d);
          g.lineTo(fromX + ux * e, fromY + uy * e);
          g.strokePath();
        }
      };
      edge(x + 18, y, x + w - 18, y);
      edge(x + w, y + 18, x + w, y + h - 18);
      edge(x + w - 18, y + h, x + 18, y + h);
      edge(x, y + h - 18, x, y + 18);

      this.add
        .text(x + 16, y + 12, z.name.toUpperCase(), {
          fontFamily: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
          fontSize: '19px',
          fontStyle: '700',
          color: '#ffffff',
          stroke: '#1d1d1f',
          strokeThickness: 4,
        })
        .setDepth(DEPTH.zones)
        .setAlpha(0.9);
    }
  }

  private drawEndpoints() {
    const [sx, sy] = PATH_POINTS[0];
    const [ex, ey] = PATH_POINTS[PATH_POINTS.length - 1];

    if (this.textures.exists('fx-gate-spawn')) {
      this.add
        .image(sx, sy, 'fx-gate-spawn')
        .setDepth(DEPTH.zones)
        .setDisplaySize(72, 72);
    } else {
      const g = this.add.graphics().setDepth(DEPTH.zones);
      g.fillStyle(0x56c271, 0.9).fillCircle(sx, sy, 14);
      g.lineStyle(3, 0xffffff, 0.9).strokeCircle(sx, sy, 14);
    }
    this.add
      .text(sx + 36, sy - 10, 'CLAIMS IN', {
        fontFamily: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#1d1d1f',
        strokeThickness: 4,
      })
      .setDepth(DEPTH.zones);

    if (this.textures.exists('fx-gate-exit')) {
      this.add
        .image(ex, ey, 'fx-gate-exit')
        .setDepth(DEPTH.zones)
        .setDisplaySize(96, 96);
    } else {
      const g = this.add.graphics().setDepth(DEPTH.zones);
      g.fillStyle(0xd44d4a, 0.9).fillCircle(ex, ey, 16);
      g.lineStyle(3, 0xffffff, 0.9).strokeCircle(ex, ey, 16);
    }
    this.add
      .text(ex + 40, ey - 40, 'THE PLAN PAYS', {
        fontFamily: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#1d1d1f',
        strokeThickness: 4,
      })
      .setDepth(DEPTH.zones);
  }

  // ---------------------------------------------------------------- commands

  private handleCommand(c: Command) {
    switch (c.type) {
      case 'selectTowerType':
        this.placing = c.tower;
        this.selectedId = c.tower ? null : this.selectedId;
        if (c.tower) this.ghost.setTexture(towerTextureKey(c.tower));
        this.ghost.setVisible(!!c.tower);
        break;
      case 'selectTower':
        this.selectedId = c.id;
        this.placing = null;
        this.ghost.setVisible(false);
        break;
      case 'upgradeTower':
        this.sim.upgrade(c.id);
        break;
      case 'sellTower':
        this.sim.sell(c.id);
        if (this.selectedId === c.id) this.selectedId = null;
        break;
      case 'setTargetMode':
        this.sim.setTargetMode(c.id, c.mode);
        break;
      case 'startRound':
        if (this.sim.startRound()) this.acknowledgeBriefing();
        break;
      case 'dismissBriefing':
        this.acknowledgeBriefing();
        break;
      case 'setSpeed':
        this.speed = c.speed;
        break;
      case 'setAutoStart':
        this.autoStart = c.on;
        break;
      case 'restart':
        this.restart();
        break;
    }
    this.pushState(true);
  }

  private destroyTowerSprites() {
    for (const view of this.towerSprites.values()) {
      view.base.destroy();
      view.head?.destroy();
    }
    this.towerSprites.clear();
  }

  private restart() {
    this.seenBriefings.clear();
    this.pendingBriefing = null;
    this.sim.reset();
    for (const s of this.claimSprites.values()) s.destroy();
    this.claimSprites.clear();
    for (const s of this.claimBadges.values()) s.destroy();
    this.claimBadges.clear();
    this.destroyTowerSprites();
    this.selectedId = null;
    this.placing = null;
    this.ghost.setVisible(false);
    this.accumulator = 0;
  }

  private clearSelection() {
    this.selectedId = null;
    this.placing = null;
    this.ghost.setVisible(false);
    this.pushState(true);
  }

  private handleClick(x: number, y: number) {
    if (this.placing) {
      const check = canPlace(this.placing, x, y, this.sim.towers);
      if (check.ok && this.sim.savings >= TOWERS[this.placing].cost) {
        const t = this.sim.place(this.placing, x, y);
        if (t) {
          playSfx('place');
          // Shift-click keeps the tower armed so several can be dropped in a row.
          if (!this.input.activePointer.event?.shiftKey) {
            this.placing = null;
            this.ghost.setVisible(false);
          }
          this.selectedId = t.id;
        }
      }
      this.pushState(true);
      return;
    }

    let hit: number | null = null;
    let bestD2 = (TOWER_RADIUS + 8) ** 2;
    for (const t of this.sim.towers) {
      const d2 = (t.x - x) ** 2 + (t.y - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        hit = t.id;
      }
    }
    if (hit !== null && hit !== this.selectedId) clickMenu();
    this.selectedId = hit;
    this.pushState(true);
  }

  // -------------------------------------------------------------- main loop

  update(_time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    this.accumulator += dt * this.speed;

    const simStart = performance.now();
    let steps = 0;
    const maxSteps = 4 * Math.ceil(this.speed);
    while (this.accumulator >= FIXED_STEP && steps < maxSteps) {
      this.sim.tick(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (this.accumulator > FIXED_STEP * maxSteps) this.accumulator = 0;
    const simEnd = performance.now();

    this.consumeEvents();
    this.renderClaims();
    this.renderTowers();
    this.renderProjectiles();
    this.renderThorns();
    this.renderOverlays();
    this.pushState(false);

    // Exponential moving average keeps the overlay readable instead of flickering.
    const now = performance.now();
    this.simMs += (simEnd - simStart - this.simMs) * 0.1;
    this.renderMs += (now - simEnd - this.renderMs) * 0.1;
    this.updatePerf(delta);

    this.refreshBriefing();
    if (this.autoStart && this.sim.phase === 'idle' && !this.pendingBriefing) {
      this.sim.startRound();
    }
  }

  private acknowledgeBriefing() {
    if (!this.pendingBriefing) return;
    this.seenBriefings.add(this.pendingBriefing);
    this.pendingBriefing = null;
    this.refreshBriefing();
  }

  /**
   * A round the player has no answer to holds the queue until acknowledged.
   * Recomputed while idle rather than latched, so building the answering tower
   * dismisses it without a click.
   */
  private refreshBriefing() {
    const next =
      this.sim.phase === 'idle' && this.sim.round < ROUNDS.length
        ? (briefingsFor(
            ROUNDS[this.sim.round],
            this.sim.towers.map((t) => ({ type: t.type, tier: t.tier })),
            this.seenBriefings
          )[0]?.id ?? null)
        : null;
    if (next === this.pendingBriefing) return;
    this.pendingBriefing = next;
    this.pushState(true);
  }

  private consumeEvents() {
    const events = this.sim.drainEvents();
    if (!events.length) return;

    this.beams.clear();
    let puffBudget = 26;
    let impacts = 0;

    for (const e of events) {
      switch (e.kind) {
        case 'beam':
          if (e.ax === undefined || e.ay === undefined) break;
          this.drawBeam(e.x, e.y, e.ax, e.ay, e.color ?? 0xffffff, e.towerId);
          break;
        case 'break':
          impacts++;
          if (puffBudget-- > 0) {
            this.puffs.setParticleTint(e.color ?? 0xffffff);
            this.puffs.emitParticleAt(e.x, e.y, 3);
          }
          break;
        case 'deny':
          this.float(e.x, e.y, 'DENIED', '#56c271');
          break;
        case 'reroute':
          this.float(e.x, e.y, 'STEERED', '#4b9fe1');
          break;
        case 'settle':
          this.float(e.x, e.y, 'CASH PAID', '#2fbfa4');
          break;
        case 'leak':
          playSfx('leak');
          if (this.textures.exists('fx-leak-burst')) {
            this.flashFx('fx-leak-burst', e.x, e.y, 96);
          }
          if (this.textures.exists('fx-stamp-paid')) {
            this.flashFx('fx-stamp-paid', e.x, e.y - 28, 110);
          } else {
            this.float(e.x, e.y - 20, `-${e.amount}`, '#ff6b6b');
          }
          this.cameras.main.shake(140, 0.004);
          useGame.getState().apply({ leakPulse: Date.now() });
          break;
        case 'shot':
          playSfx('shot');
          break;
        case 'roundEnd':
          this.clearBoardEffects();
          break;
      }
    }

    if (impacts > 0) playSfx('pop');
  }

  private clearBoardEffects() {
    this.beams.clear();
    this.editThorns.begin();
    this.editThorns.end();
    this.stopThorns.begin();
    this.stopThorns.end();
  }

  private float(x: number, y: number, text: string, color: string) {
    const stampKey = STAMP_TEXTURE[text];
    if (stampKey && this.textures.exists(stampKey)) {
      this.flashFx(stampKey, x, y, 100);
      return;
    }
    const t = this.floaters[this.floaterIndex];
    this.floaterIndex = (this.floaterIndex + 1) % this.floaters.length;
    this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setScale(1).setVisible(true);
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => t.setVisible(false),
    });
  }

  private flashFx(key: string, x: number, y: number, size: number) {
    const img = this.add.image(x, y, key).setDepth(DEPTH.effects).setDisplaySize(size, size);
    this.tweens.add({
      targets: img,
      y: y - 36,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** Prefer authored beam textures for RBP / stop-loss laser; fall back to a stroke. */
  private drawBeam(x: number, y: number, ax: number, ay: number, color: number, towerId?: number) {
    const owner = towerId !== undefined ? this.sim.towers.find((t) => t.id === towerId) : undefined;
    const key =
      owner?.type === 'rbp' && this.textures.exists('fx-beam-rbp')
        ? 'fx-beam-rbp'
        : owner?.kind === 'laser' && this.textures.exists('fx-beam-laser-core')
          ? 'fx-beam-laser-core'
          : null;

    if (!key) {
      this.beams.lineStyle(3, color, 0.55);
      this.beams.beginPath();
      this.beams.moveTo(x, y);
      this.beams.lineTo(ax, ay);
      this.beams.strokePath();
      return;
    }

    const dx = ax - x;
    const dy = ay - y;
    const len = Math.hypot(dx, dy) || 1;
    const img = this.add
      .image(x, y, key)
      .setDepth(DEPTH.beams)
      .setOrigin(0, 0.5)
      .setDisplaySize(len, key === 'fx-beam-laser-core' ? 10 : 8)
      .setRotation(Math.atan2(dy, dx))
      .setAlpha(0.85);
    // Beams are one-frame events; destroy next tick via a short fade.
    this.tweens.add({
      targets: img,
      alpha: 0,
      duration: 80,
      onComplete: () => img.destroy(),
    });

    if (this.textures.exists('fx-beam-muzzle-glow')) {
      const glow = this.add
        .image(x, y, 'fx-beam-muzzle-glow')
        .setDepth(DEPTH.beams)
        .setDisplaySize(28, 28)
        .setAlpha(0.9);
      this.tweens.add({
        targets: glow,
        alpha: 0,
        duration: 100,
        onComplete: () => glow.destroy(),
      });
    }
  }

  // --------------------------------------------------------------- entities

  private renderClaims() {
    const seen = new Set<number>();
    this.bars.clear();

    for (const c of this.sim.claims) {
      seen.add(c.id);
      let img = this.claimSprites.get(c.id);
      const d = claimRadius(c.type) * 2;
      if (!img) {
        img = this.add
          .image(c.x, c.y, claimTextureKey(c.type))
          .setDepth(DEPTH.claims)
          .setDisplaySize(d, d);
        this.claimSprites.set(c.id, img);
      } else if (img.texture.key !== claimTextureKey(c.type)) {
        img.setTexture(claimTextureKey(c.type)).setDisplaySize(d, d);
      } else {
        img.setDisplaySize(d, d);
      }
      img.setPosition(c.x, c.y);
      this.styleClaim(img, c);
      this.renderClaimBadge(c);

      if (CLAIMS[c.type].tier >= 11) this.drawHealthBar(c);
    }

    for (const [id, img] of this.claimSprites) {
      if (!seen.has(id)) {
        img.destroy();
        this.claimSprites.delete(id);
        const badge = this.claimBadges.get(id);
        if (badge) {
          badge.destroy();
          this.claimBadges.delete(id);
        }
      }
    }
  }

  private renderClaimBadge(c: SimClaim) {
    const key = c.traits.outOfNetwork
      ? 'fx-trait-oon'
      : c.traits.clean
        ? 'fx-trait-clean'
        : c.traits.balanceBill
          ? 'fx-trait-balanceBill'
          : c.traits.priorAuth
            ? 'fx-trait-priorAuth'
            : null;

    let badge = this.claimBadges.get(c.id);
    if (!key || !this.textures.exists(key)) {
      if (badge) {
        badge.destroy();
        this.claimBadges.delete(c.id);
      }
      return;
    }

    const r = claimRadius(c.type);
    const bx = c.x + r * 0.55;
    const by = c.y - r * 0.55;
    if (!badge) {
      badge = this.add.image(bx, by, key).setDepth(DEPTH.claims + 1).setDisplaySize(18, 18);
      this.claimBadges.set(c.id, badge);
    } else if (badge.texture.key !== key) {
      badge.setTexture(key);
    }
    badge.setPosition(bx, by).setVisible(true);
  }

  /** Traits are conveyed by tint and alpha so they read without extra UI. */
  private styleClaim(img: Phaser.GameObjects.Image, c: SimClaim) {
    if (c.traits.outOfNetwork) {
      img.setAlpha(0.62);
      img.setTint(0xb388ff);
    } else if (c.traits.clean) {
      img.setAlpha(1);
      img.setTint(0xdfe6ee);
    } else if (c.traits.priorAuth) {
      img.setAlpha(1);
      img.setTint(0xffd479);
    } else if (c.traits.balanceBill) {
      img.setAlpha(1);
      img.setTint(0xff9e80);
    } else {
      img.setAlpha(1);
      img.clearTint();
    }
  }

  private drawHealthBar(c: SimClaim) {
    const r = claimRadius(c.type);
    const w = r * 2;
    const x = c.x - r;
    const y = c.y - r * 0.95 - 12;
    const pct = Phaser.Math.Clamp(c.hp / c.maxHp, 0, 1);
    this.bars.fillStyle(0x1d1d1f, 0.75).fillRoundedRect(x - 2, y - 2, w + 4, 11, 4);
    this.bars
      .fillStyle(pct > 0.5 ? 0x56c271 : pct > 0.22 ? 0xf0b429 : 0xd44d4a, 1)
      .fillRoundedRect(x, y, w * pct, 7, 3);
  }

  private renderTowers() {
    const seen = new Set<number>();
    for (const t of this.sim.towers) {
      seen.add(t.id);
      const wantKit = this.bestKitTier(t.type, t.tier);
      let view = this.towerSprites.get(t.id);
      if (!view) {
        view = this.spawnTowerView(t.type, t.tier, t.x, t.y);
        this.towerSprites.set(t.id, view);
      } else if (view.kitTier !== wantKit) {
        view.base.destroy();
        view.head?.destroy();
        view = this.spawnTowerView(t.type, t.tier, t.x, t.y);
        this.towerSprites.set(t.id, view);
      }

      view.base.setPosition(t.x, t.y);
      if (view.head) {
        view.head.setPosition(t.x, t.y).setRotation(t.facing);
      }

      // Upgraded and buffed towers glow so board state is readable at a glance.
      const tint = t.buffed ? 0xfff0b0 : t.tier >= 3 ? 0xfff8e1 : null;
      if (tint !== null) {
        view.base.setTint(tint);
        view.head?.setTint(tint);
      } else {
        view.base.clearTint();
        view.head?.clearTint();
      }
    }
    for (const [id, view] of this.towerSprites) {
      if (!seen.has(id)) {
        view.base.destroy();
        view.head?.destroy();
        this.towerSprites.delete(id);
      }
    }
  }

  /** Highest authored kit tier ≤ the tower's upgrade tier, or -1 if none. */
  private bestKitTier(type: TowerId, tier: number): number {
    for (let t = tier; t >= 0; t--) {
      if (hasTowerKit(this, type, t)) return t;
    }
    return -1;
  }

  private spawnTowerView(type: TowerId, tier: number, x: number, y: number): TowerView {
    const kitTier = this.bestKitTier(type, tier);
    if (kitTier >= 0) {
      const base = this.add
        .image(x, y, towerBaseKey(type, kitTier))
        .setDepth(DEPTH.towers)
        .setDisplaySize(TOWER_DISPLAY, TOWER_DISPLAY);
      const head = this.add
        .image(x, y, towerHeadKey(type, kitTier))
        .setDepth(DEPTH.towers + 1)
        .setDisplaySize(TOWER_DISPLAY, TOWER_DISPLAY);
      return { base, head, kitTier };
    }
    const base = this.add
      .image(x, y, towerTextureKey(type))
      .setDepth(DEPTH.towers)
      .setDisplaySize(TOWER_DISPLAY, TOWER_DISPLAY);
    return { base, head: null, kitTier: -1 };
  }

  private renderProjectiles() {
    this.projectiles.begin();
    for (const p of this.sim.projectiles) {
      const img = this.projectiles.next();
      const owner = this.sim.towers.find((t) => t.id === p.ownerId);
      const key = (owner && PROJ_TEXTURE[owner.type]) || 'projectile';
      if (this.textures.exists(key) && img.texture.key !== key) img.setTexture(key);
      const ang = Math.atan2(p.vy, p.vx);
      img
        .setPosition(p.x, p.y)
        .setRotation(ang)
        .clearTint()
        .setDisplaySize(18, 18);
      // Fallback pellet still needs the tower colour.
      if (key === 'projectile') img.setTint(p.color);
    }
    this.projectiles.end();
  }

  private renderThorns() {
    this.editThorns.begin();
    this.stopThorns.begin();
    for (const th of this.sim.thorns) {
      const pool = th.variety === 'stopLoss' ? this.stopThorns : this.editThorns;
      const img = pool.next();
      img
        .setPosition(th.x, th.y)
        .setDisplaySize(22, 22)
        .setAlpha(th.life < 1.5 ? 0.45 : 0.95);
    }
    this.editThorns.end();
    this.stopThorns.end();
  }

  /**
   * Range circles and the placement wash are static between input changes, but
   * Phaser re-triangulates every filled circle on redraw. Keying the overlay on
   * its inputs keeps that work off the frames where nothing about it moved.
   */
  private renderOverlays() {
    const selected = this.selectedId
      ? this.sim.towers.find((t) => t.id === this.selectedId)
      : undefined;

    const key = this.placing
      ? `p|${this.placing}|${Math.round(this.pointer.x)}|${Math.round(this.pointer.y)}` +
        `|${this.sim.savings >= TOWERS[this.placing].cost}|${this.sim.towers.length}`
      : selected
        ? `s|${selected.id}|${selected.tier}|${Math.round(selected.eff.range)}`
        : 'none';
    if (key === this.lastOverlayKey) return;
    this.lastOverlayKey = key;

    this.ranges.clear();

    if (selected) {
      if (selected.eff.range >= 900) {
        this.ranges.lineStyle(4, 0xf0b429, 0.7).strokeRect(8, 8, MAP_WIDTH - 16, MAP_HEIGHT - 16);
      } else {
        this.ranges.fillStyle(0xffffff, 0.08).fillCircle(selected.x, selected.y, selected.eff.range);
        this.ranges
          .lineStyle(3, 0xffffff, 0.55)
          .strokeCircle(selected.x, selected.y, selected.eff.range);
      }
      this.ranges.lineStyle(3, 0xf5c518, 0.9).strokeCircle(selected.x, selected.y, TOWER_RADIUS + 6);
    }

    if (!this.placing) {
      this.ghost.setVisible(false);
      return;
    }

    // Open ground near the cursor. This used to be a baked 1536x1024 texture
    // covering the whole map, which cost 6MB of VRAM and stalled the first time
    // it was shown. Drawing the cells around the pointer is cheaper, and reads
    // better besides — the answer you want is about where you are pointing.
    const SHOW = 210;
    const cell = TERRAIN_CELL;
    const cx0 = Math.max(0, Math.floor((this.pointer.x - SHOW) / cell));
    const cx1 = Math.min(TERRAIN_COLS - 1, Math.ceil((this.pointer.x + SHOW) / cell));
    const cy0 = Math.max(0, Math.floor((this.pointer.y - SHOW) / cell));
    const cy1 = Math.min(TERRAIN_ROWS - 1, Math.ceil((this.pointer.y + SHOW) / cell));
    this.ranges.fillStyle(0xffffff, 0.5);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = cx * cell + cell / 2;
        const py = cy * cell + cell / 2;
        const d2 = (px - this.pointer.x) ** 2 + (py - this.pointer.y) ** 2;
        if (d2 > SHOW * SHOW) continue;
        if (!groundClear(px, py)) continue;
        // Squares, not circles: no triangulation, and indistinguishable at 3px.
        this.ranges.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }

    for (const z of ZONES) {
      if (z.allow.includes(this.placing)) continue;
      this.ranges.fillStyle(0xd44d4a, 0.18).fillRoundedRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h, 18);
    }

    const { x, y } = this.pointer;
    const check = canPlace(this.placing, x, y, this.sim.towers);
    const affordable = this.sim.savings >= TOWERS[this.placing].cost;
    const ok = check.ok && affordable;

    this.ghost
      .setVisible(true)
      .setPosition(x, y)
      .setDisplaySize(TOWER_DISPLAY, TOWER_DISPLAY)
      .setTint(ok ? 0xffffff : 0xff8080)
      .setAlpha(ok ? 0.85 : 0.5);

    // A map-wide tower gets a border rather than a circle; a 900px disc centred on
    // the cursor would wash out the whole board.
    const tint = ok ? 0x56c271 : 0xd44d4a;
    const range = statsAt(this.placing, 0).range;
    if (range >= 900) {
      this.ranges.lineStyle(4, tint, 0.7).strokeRect(8, 8, MAP_WIDTH - 16, MAP_HEIGHT - 16);
    } else {
      this.ranges.fillStyle(tint, 0.1).fillCircle(x, y, range);
      this.ranges.lineStyle(3, tint, 0.6).strokeCircle(x, y, range);
    }
  }

  // ----------------------------------------------------------- state bridge

  private pushState(force: boolean) {
    const sim = this.sim;
    const selected = this.selectedId
      ? sim.towers.find((t) => t.id === this.selectedId)
      : undefined;

    let sel: SelectedTower | null = null;
    if (selected) {
      sel = {
        id: selected.id,
        type: selected.type,
        tier: selected.tier,
        targetMode: selected.targetMode,
        sellValue: sim.sellValue(selected),
        upgradeCost: sim.upgradeCost(selected),
        zoneId: selected.zoneId,
        buffed: selected.buffed,
        range: Math.round(selected.eff.range),
        damage: Math.round(selected.eff.damage * 10) / 10,
        cooldown: Math.round(selected.eff.cooldown * 100) / 100,
      };
    }

    let placementOk = false;
    let placementReason = '';
    if (this.placing) {
      const check = canPlace(this.placing, this.pointer.x, this.pointer.y, sim.towers);
      if (!check.ok) placementReason = check.reason;
      else if (sim.savings < TOWERS[this.placing].cost) placementReason = 'Not enough savings';
      else placementOk = true;
    }

    // Discrete state goes through immediately: it is a direct response to input
    // and any delay would feel like lag.
    const cold = {
      round: sim.round,
      totalRounds: sim.totalRounds,
      phase: sim.phase,
      speed: this.speed,
      autoStart: this.autoStart,
      placing: this.placing,
      placementOk,
      placementReason,
      selected: sel,
      owned: sim.towers.map((t) => ({ type: t.type, tier: t.tier })),
      pendingBriefing: this.pendingBriefing,
    };
    const coldKey = JSON.stringify(cold);
    if (force || coldKey !== this.lastColdKey) {
      this.lastColdKey = coldKey;
      this.storePushes++;
      useGame.getState().apply(cold);
    }

    // The running counters change on nearly every frame during a round. Pushing
    // them at frame rate re-rendered the entire sidebar sixty times a second to
    // animate digits nobody can read that fast, so they go at 10Hz instead.
    const now = this.time.now;
    if (!force && now - this.lastHotPush < 100) return;
    this.lastHotPush = now;

    const hot = {
      lives: Math.max(0, Math.round(sim.lives)),
      savings: Math.floor(sim.savings),
      billedEntered: Math.round(sim.billedEntered),
      billedLeaked: Math.round(sim.billedLeaked),
    };
    const hotKey = `${hot.lives}|${hot.savings}|${hot.billedEntered}|${hot.billedLeaked}`;
    if (!force && hotKey === this.lastHotKey) return;
    this.lastHotKey = hotKey;
    this.storePushes++;
    useGame.getState().apply(hot);
  }

  // ---------------------------------------------------------- perf overlay

  private togglePerf() {
    if (this.perfText) {
      this.perfText.destroy();
      this.perfText = undefined;
      return;
    }
    this.perfText = this.add
      .text(14, 14, '', {
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: '17px',
        color: '#eeeeee',
        backgroundColor: 'rgba(15,15,17,0.82)',
        padding: { x: 12, y: 10 },
        lineSpacing: 3,
      })
      .setDepth(60)
      .setScrollFactor(0);
  }

  /** Refreshed once a second so the overlay never becomes the thing it measures. */
  private updatePerf(delta: number) {
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (delta > this.perfWorst) this.perfWorst = delta;
    if (!this.perfText) return;

    const now = this.time.now;
    if (now - this.perfLastUpdate < 1000) return;
    this.perfLastUpdate = now;

    const n = this.frameTimes.length;
    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / n;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(n * 0.95)];
    const over100 = this.frameTimes.filter((f) => f > 100).length;

    this.perfText.setText(
      [
        `fps        ${(1000 / mean).toFixed(0)}   (frame ${mean.toFixed(1)}ms)`,
        `p95 frame  ${p95.toFixed(0)}ms      >100ms: ${over100}/${n}`,
        `worst      ${this.perfWorst.toFixed(0)}ms   (since toggle)`,
        `sim        ${this.simMs.toFixed(2)}ms/frame`,
        `render     ${this.renderMs.toFixed(2)}ms/frame`,
        `store      ${this.storePushes}/s -> React`,
        `entities   ${this.sim.claims.length} claims  ${this.sim.projectiles.length} proj  ${this.sim.thorns.length} thorn`,
        `towers     ${this.sim.towers.length}   sprites ${this.claimSprites.size}`,
        `speed      ${this.speed}x   round ${this.sim.round + 1}`,
      ].join('\n')
    );
    this.storePushes = 0;
  }
}
