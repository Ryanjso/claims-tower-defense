import Phaser from 'phaser';
import { CLAIMS } from '../data/claims';
import { TOWERS } from '../data/towers';
import type { ClaimId, TowerId } from '../types';

/**
 * Placeholder art, generated into canvas textures at boot.
 *
 * Every sprite the game draws goes through a texture key from this module. When
 * real artwork lands, drop `<id>.png` into public/assets/towers or /claims and
 * PreloadScene picks it up instead — nothing in the renderer changes.
 */

export const towerTextureKey = (id: TowerId) => `tower-${id}`;
export const towerBaseKey = (id: TowerId, tier = 0) => `tower-${id}-base-t${tier}`;
export const towerHeadKey = (id: TowerId, tier = 0) => `tower-${id}-head-t${tier}`;
export const claimTextureKey = (id: ClaimId) => `claim-${id}`;

/** True when an authored base+head kit is loaded for this tower at the given tier. */
export function hasTowerKit(scene: Phaser.Scene, id: TowerId, tier = 0) {
  return scene.textures.exists(towerBaseKey(id, tier)) && scene.textures.exists(towerHeadKey(id, tier));
}

/** On-screen radius of a claim token, by ladder tier. */
export function claimRadius(id: ClaimId): number {
  const tier = CLAIMS[id].tier;
  if (tier >= 13) return 46;
  if (tier >= 12) return 39;
  if (tier >= 11) return 33;
  if (tier >= 9) return 24;
  if (tier >= 7) return 21;
  if (tier >= 5) return 18;
  return 15;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function canvasFor(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

function hexagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number) {
  let size = start;
  for (;;) {
    ctx.font = `700 ${size}px "Aeonik", "Inter", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= 7) return size;
    size -= 1;
  }
}

/**
 * Towers read as a Yuzu-logomark hexagon: coloured plate, dark rim, glyph on top.
 * Distinct enough at a glance to tell ten tower types apart on a busy board.
 */
function makeTowerTexture(scene: Phaser.Scene, id: TowerId) {
  const def = TOWERS[id];
  const S = 72;
  const { tex, ctx } = canvasFor(scene, towerTextureKey(id), S, S);
  const c = S / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  hexagonPath(ctx, c, c, 29);
  ctx.fillStyle = hex(def.accent);
  ctx.fill();
  ctx.restore();

  hexagonPath(ctx, c, c, 25);
  const grad = ctx.createLinearGradient(0, c - 25, 0, c + 25);
  grad.addColorStop(0, hex(def.color));
  grad.addColorStop(1, hex(def.accent));
  ctx.fillStyle = grad;
  ctx.fill();

  hexagonPath(ctx, c, c, 25);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, def.glyph, 42, 15);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.fillText(def.glyph, c, c + 1);

  tex.refresh();
}

/**
 * Claims read as coloured discs; MOAB-class claims get a heavier plated look so
 * the thing you must not let through is obvious without reading the label.
 */
function makeClaimTexture(scene: Phaser.Scene, id: ClaimId) {
  const def = CLAIMS[id];
  const r = claimRadius(id);
  const S = r * 2 + 8;
  const { tex, ctx } = canvasFor(scene, claimTextureKey(id), S, S);
  const c = S / 2;
  const large = def.tier >= 11;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  if (large) {
    const w = r * 1.9;
    const h = r * 1.45;
    ctx.roundRect(c - w / 2, c - h / 2, w, h, r * 0.32);
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = hex(def.color);
  ctx.fill();
  ctx.restore();

  // Top-light so the tokens don't read flat against the map.
  const grad = ctx.createLinearGradient(0, c - r, 0, c + r);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.beginPath();
  if (large) {
    const w = r * 1.9;
    const h = r * 1.45;
    ctx.roundRect(c - w / 2, c - h / 2, w, h, r * 0.32);
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  if (large) {
    const w = r * 1.9;
    const h = r * 1.45;
    ctx.roundRect(c - w / 2, c - h / 2, w, h, r * 0.32);
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
  ctx.strokeStyle = large ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = large ? 3 : 2;
  ctx.stroke();

  // Dark claim colours need light text and vice versa.
  const lum =
    0.299 * ((def.color >> 16) & 255) + 0.587 * ((def.color >> 8) & 255) + 0.114 * (def.color & 255);
  ctx.fillStyle = lum > 150 ? '#1d1d1f' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, def.glyph, r * 1.7, Math.max(8, Math.round(r * 0.62)));
  ctx.fillText(def.glyph, c, c + 1);

  tex.refresh();
}

/** Small round pellet used for every travelling projectile, tinted per tower. */
function makeProjectileTexture(scene: Phaser.Scene) {
  const S = 16;
  const { tex, ctx } = canvasFor(scene, 'projectile', S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.refresh();
}

/** Four-pointed caltrop for NCCI edit spikes and stop-loss thorns. */
function makeThornTexture(scene: Phaser.Scene, key: string, color: number) {
  const S = 22;
  const { tex, ctx } = canvasFor(scene, key, S, S);
  const c = S / 2;
  ctx.translate(c, c);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const r = i % 2 === 0 ? 9 : 3.2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = hex(color);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  tex.refresh();
}

/** Soft white puff for pop bursts. */
function makePuffTexture(scene: Phaser.Scene) {
  const S = 24;
  const { tex, ctx } = canvasFor(scene, 'puff', S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.refresh();
}

/**
 * Generates a placeholder for anything a real sprite did not already provide.
 * Called after the loader finishes so authored PNGs always win.
 */
export function buildPlaceholderArt(scene: Phaser.Scene) {
  for (const id of Object.keys(TOWERS) as TowerId[]) {
    if (!scene.textures.exists(towerTextureKey(id))) makeTowerTexture(scene, id);
  }
  for (const id of Object.keys(CLAIMS) as ClaimId[]) {
    if (!scene.textures.exists(claimTextureKey(id))) makeClaimTexture(scene, id);
  }
  if (!scene.textures.exists('projectile')) makeProjectileTexture(scene);
  if (!scene.textures.exists('thorn-edit')) makeThornTexture(scene, 'thorn-edit', 0xd44d4a);
  if (!scene.textures.exists('thorn-stopLoss')) makeThornTexture(scene, 'thorn-stopLoss', 0x9fb4c7);
  if (!scene.textures.exists('puff')) makePuffTexture(scene);
}
