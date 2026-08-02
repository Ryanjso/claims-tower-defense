import { CLAIMS, isLargeClaim, leakLives } from '../data/claims';
import { ROUNDS, STARTING_LIVES, STARTING_SAVINGS, roundBonus } from '../data/rounds';
import { TOWERS, investedIn, kindAt, statsAt, towerTurnRate } from '../data/towers';
import { ZONES } from '../data/zones';
import { NO_TRAITS } from '../types';
import type { ClaimId, ClaimTraits, TargetMode, TowerId, TowerKind, TowerStats } from '../types';
import { PATH } from './Path';
import { TOWER_RADIUS, canPlace } from './placement';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Shortest-path turn from `from` toward `to`, capped at `maxDelta` radians. */
function turnToward(from: number, to: number, maxDelta: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return to;
  return from + Math.sign(diff) * maxDelta;
}

/** Deterministic RNG so a replayed round produces an identical wave. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimClaim {
  id: number;
  type: ClaimId;
  arc: number;
  hp: number;
  maxHp: number;
  traits: ClaimTraits;
  slowUntil: number;
  slowFactor: number;
  lastHitAt: number;
  /** This claim's share of the billed dollars that entered the map. Conserved on split. */
  billedShare: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface SimTower {
  id: number;
  type: TowerId;
  tier: number;
  x: number;
  y: number;
  targetMode: TargetMode;
  cd: number;
  /** Accumulator damage multiplier, grows within a round. */
  ramp: number;
  eff: TowerStats;
  kind: TowerKind;
  zoneId: string | null;
  buffed: boolean;
  contained: number;
  /** Current head facing in radians. Phaser 0 = east (+X). */
  facing: number;
  /** Where the head wants to point; interpolated toward each tick. */
  desiredFacing: number;
}

export interface SimProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  life: number;
  seesOON: boolean;
  piercesContract: boolean;
  bonusVsLarge: number;
  slowFactor: number;
  slowDuration: number;
  rerouteChance: number;
  rerouteMaxTier: number;
  hits: number[];
  ownerId: number;
  ownerType: TowerId;
  color: number;
}

export interface SimThorn {
  id: number;
  x: number;
  y: number;
  damage: number;
  hitsLeft: number;
  life: number;
  attachTier: number;
  seesOON: boolean;
  piercesContract: boolean;
  variety: 'edit' | 'stopLoss';
  ownerId: number;
  ownerType: TowerId;
}

export type SimEventKind =
  | 'break'
  | 'leak'
  | 'deny'
  | 'reroute'
  | 'settle'
  | 'beam'
  /** One per tower activation that launches something, not one per target hit. */
  | 'shot'
  | 'roundEnd';

export interface SimEvent {
  kind: SimEventKind;
  x: number;
  y: number;
  ax?: number;
  ay?: number;
  color?: number;
  text?: string;
  amount?: number;
  /** Owning tower, when the event is a shot or beam from one. */
  towerId?: number;
}

export type Phase = 'idle' | 'running' | 'won' | 'lost';

interface QueuedSpawn {
  at: number;
  type: ClaimId;
  traits: ClaimTraits;
}

export class Sim {
  lives = STARTING_LIVES;
  savings = STARTING_SAVINGS;
  /** Rounds fully cleared. The round in progress is `round + 1`. */
  round = 0;
  phase: Phase = 'idle';
  time = 0;

  claims: SimClaim[] = [];
  towers: SimTower[] = [];
  projectiles: SimProjectile[] = [];
  thorns: SimThorn[] = [];
  events: SimEvent[] = [];

  billedEntered = 0;
  billedLeaked = 0;
  livesLost = 0;
  /** Damage dealt per tower type. Balance instrumentation; free to ignore. */
  damageBy: Partial<Record<TowerId, number>> = {};

  private queue: QueuedSpawn[] = [];
  private qi = 0;
  private nextId = 1;
  private rng = mulberry32(0x5eed);

  // ------------------------------------------------------------- lifecycle

  startRound(): boolean {
    if (this.phase !== 'idle' || this.round >= ROUNDS.length) return false;
    const def = ROUNDS[this.round];
    this.queue = [];
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) {
        this.queue.push({
          at: g.delay + i * g.spacing,
          type: g.type,
          traits: { ...NO_TRAITS, ...g.traits },
        });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.qi = 0;
    this.time = 0;
    this.rng = mulberry32(0x5eed + this.round * 7919);
    for (const t of this.towers) t.ramp = 1;
    this.phase = 'running';
    return true;
  }

  tick(dt: number) {
    if (this.phase !== 'running') return;
    this.time += dt;
    this.spawnDue();
    this.updateClaims(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateThorns(dt);
    this.compact();
    this.checkRoundEnd();
  }

  private spawnDue() {
    while (this.qi < this.queue.length && this.queue[this.qi].at <= this.time) {
      const q = this.queue[this.qi++];
      this.spawnClaim(q.type, 0, q.traits, CLAIMS[q.type].billed, true);
    }
  }

  private checkRoundEnd() {
    if (this.qi < this.queue.length) return;
    for (const c of this.claims) if (c.alive) return;

    this.round++;
    const bonus = roundBonus(this.round);
    this.savings += bonus;
    this.thorns.length = 0;
    this.projectiles.length = 0;
    this.events.push({ kind: 'roundEnd', x: 0, y: 0, amount: bonus });
    this.phase = this.round >= ROUNDS.length ? 'won' : 'idle';
  }

  // ---------------------------------------------------------------- claims

  private spawnClaim(
    type: ClaimId,
    arc: number,
    traits: ClaimTraits,
    billedShare: number,
    topLevel: boolean
  ): SimClaim {
    const def = CLAIMS[type];
    const hp = def.hp * (traits.priorAuth ? 2 : 1);
    const c: SimClaim = {
      id: this.nextId++,
      type,
      arc,
      hp,
      maxHp: hp,
      traits,
      slowUntil: 0,
      slowFactor: 1,
      lastHitAt: -999,
      billedShare,
      x: PATH.posX(arc),
      y: PATH.posY(arc),
      alive: true,
    };
    this.claims.push(c);
    if (topLevel) this.billedEntered += billedShare;
    return c;
  }

  private updateClaims(dt: number) {
    for (const c of this.claims) {
      if (!c.alive) continue;
      const def = CLAIMS[c.type];

      const slowed = c.slowUntil > this.time;
      c.arc += def.speed * (slowed ? c.slowFactor : 1) * dt;

      // Balance-billed claims heal chip damage: you have to finish them outright.
      if (c.traits.balanceBill && c.hp < c.maxHp && this.time - c.lastHitAt > 1.5) {
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.22 * dt);
      }

      if (c.arc >= PATH.length) {
        this.leak(c);
        continue;
      }
      c.x = PATH.posX(c.arc);
      c.y = PATH.posY(c.arc);
    }
  }

  private leak(c: SimClaim) {
    c.alive = false;
    const cost = leakLives(c.type);
    this.lives -= cost;
    this.livesLost += cost;
    this.billedLeaked += c.billedShare;
    this.events.push({
      kind: 'leak',
      x: PATH.posX(PATH.length),
      y: PATH.posY(PATH.length),
      amount: cost,
      color: CLAIMS[c.type].color,
    });
    if (this.lives <= 0) {
      this.lives = 0;
      this.phase = 'lost';
    }
  }

  /** Remove a claim without producing children — navigation, denial, cash settlement. */
  private dissolve(c: SimClaim, kind: 'deny' | 'reroute' | 'settle') {
    if (!c.alive) return;
    c.alive = false;
    this.savings += CLAIMS[c.type].savings;
    this.events.push({ kind, x: c.x, y: c.y, color: CLAIMS[c.type].color });
  }

  private applyDamage(
    c: SimClaim,
    amount: number,
    bonusVsLarge = 1,
    depth = 0,
    source?: TowerId
  ) {
    if (!c.alive || depth > 24 || amount <= 0) return;
    let dmg = amount;
    if (bonusVsLarge !== 1 && isLargeClaim(c.type)) dmg *= bonusVsLarge;
    dmg *= 1 + this.debuffAt(c.x, c.y);
    if (source) this.damageBy[source] = (this.damageBy[source] ?? 0) + Math.min(dmg, c.hp);

    c.hp -= dmg;
    c.lastHitAt = this.time;
    if (c.hp > 0) return;

    const leftover = -c.hp;
    const def = CLAIMS[c.type];
    c.alive = false;
    this.savings += def.savings;
    this.events.push({ kind: 'break', x: c.x, y: c.y, color: def.color });

    if (!def.child) return;

    // Dollars are conserved across the split, so the scoreboard always balances.
    const share = c.billedShare / def.child.count;
    const inherited: ClaimTraits = {
      outOfNetwork: c.traits.outOfNetwork,
      clean: c.traits.clean,
      balanceBill: c.traits.balanceBill,
      priorAuth: false, // the auth was attached to the layer that just broke
    };
    let first: SimClaim | null = null;
    for (let i = 0; i < def.child.count; i++) {
      const kid = this.spawnClaim(
        def.child.type,
        clamp(c.arc - i * 15, 0, PATH.length - 1),
        inherited,
        share,
        false
      );
      if (i === 0) first = kid;
    }
    if (leftover > 0 && first) this.applyDamage(first, leftover, bonusVsLarge, depth + 1, source);
  }

  /** Extra damage multiplier contributed by Direct Contract radii covering a point. */
  private debuffAt(x: number, y: number): number {
    let best = 0;
    for (const t of this.towers) {
      if (t.type !== 'directContract') continue;
      const r = t.eff.range;
      if ((t.x - x) ** 2 + (t.y - y) ** 2 <= r * r && t.eff.contractDebuff > best) {
        best = t.eff.contractDebuff;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- towers

  private visible(t: SimTower, c: SimClaim) {
    if (c.traits.outOfNetwork && !t.eff.seesOutOfNetwork) return false;
    if (c.traits.clean && !t.eff.piercesContract) return false;
    return true;
  }

  private acquire(t: SimTower, max: number, extra?: (c: SimClaim) => boolean): SimClaim[] {
    const r2 = t.eff.range * t.eff.range;
    const hits: SimClaim[] = [];
    for (const c of this.claims) {
      if (!c.alive) continue;
      const dx = c.x - t.x;
      const dy = c.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      if (!this.visible(t, c)) continue;
      if (extra && !extra(c)) continue;
      hits.push(c);
    }
    if (hits.length <= 1) return hits;
    const mode = t.targetMode;
    hits.sort((a, b) => {
      if (mode === 'first') return b.arc - a.arc;
      if (mode === 'last') return a.arc - b.arc;
      if (mode === 'strong') {
        const d = CLAIMS[b.type].tier - CLAIMS[a.type].tier;
        return d !== 0 ? d : b.hp - a.hp;
      }
      return (a.x - t.x) ** 2 + (a.y - t.y) ** 2 - ((b.x - t.x) ** 2 + (b.y - t.y) ** 2);
    });
    return hits.length > max ? hits.slice(0, max) : hits;
  }

  private towerDamage(t: SimTower) {
    return t.type === 'accumulator' ? t.eff.damage * t.ramp : t.eff.damage;
  }

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      const s = t.eff;
      this.updateFacing(t, dt);

      if (t.kind === 'laser') {
        const targets = this.acquire(t, Math.max(1, s.pierce));
        for (const c of targets) {
          this.events.push({
            kind: 'beam',
            x: t.x,
            y: t.y,
            ax: c.x,
            ay: c.y,
            color: 0xff5252,
            towerId: t.id,
          });
          this.applyDamage(c, this.towerDamage(t) * dt, s.bonusVsLarge, 0, t.type);
        }
        continue;
      }
      if (t.kind === 'buff') continue;

      t.cd -= dt;
      if (t.cd > 0) continue;
      if (this.fireTower(t)) {
        t.cd = s.cooldown;
        if (t.type === 'accumulator') t.ramp = Math.min(s.rampMax, t.ramp + s.rampPerHit);
      } else {
        t.cd = 0.05; // idle re-check, cheap
      }
    }
  }

  /** Aim the head at the current target (or path stamp site); interpolate at turn rate. */
  private updateFacing(t: SimTower, dt: number) {
    const rate = towerTurnRate(t.type, t.tier);
    if (rate <= 0) {
      t.facing = 0;
      t.desiredFacing = 0;
      return;
    }

    if (t.kind === 'spikes' || t.kind === 'barrier') {
      const near = PATH.nearest(t.x, t.y);
      t.desiredFacing = PATH.angle(near.arc);
    } else {
      const [target] = this.acquire(t, 1);
      if (target) t.desiredFacing = Math.atan2(target.y - t.y, target.x - t.x);
    }

    t.facing = turnToward(t.facing, t.desiredFacing, rate * dt);
  }

  private fireTower(t: SimTower): boolean {
    const s = t.eff;
    const def = TOWERS[t.type];

    switch (t.kind) {
      case 'shooter': {
        const [target] = this.acquire(t, 1);
        if (!target) return false;
        const ang = Math.atan2(target.y - t.y, target.x - t.x);
        t.desiredFacing = ang;
        this.projectiles.push({
          id: this.nextId++,
          x: t.x,
          y: t.y,
          vx: Math.cos(ang) * s.projectileSpeed,
          vy: Math.sin(ang) * s.projectileSpeed,
          damage: this.towerDamage(t),
          pierce: s.pierce,
          life: 2.5,
          seesOON: s.seesOutOfNetwork,
          piercesContract: s.piercesContract,
          bonusVsLarge: s.bonusVsLarge,
          slowFactor: s.slowFactor,
          slowDuration: s.slowDuration,
          rerouteChance: s.rerouteChance,
          rerouteMaxTier: s.rerouteMaxTier,
          hits: [],
          ownerId: t.id,
          ownerType: t.type,
          color: def.color,
        });
        this.events.push({
          kind: 'shot',
          x: t.x,
          y: t.y,
          ax: target.x,
          ay: target.y,
          towerId: t.id,
        });
        return true;
      }

      case 'hitscan': {
        const targets = this.acquire(t, s.pierce);
        if (!targets.length) return false;
        const dmg = this.towerDamage(t);
        const lead = targets[0];
        t.desiredFacing = Math.atan2(lead.y - t.y, lead.x - t.x);
        this.events.push({
          kind: 'shot',
          x: t.x,
          y: t.y,
          ax: lead.x,
          ay: lead.y,
          towerId: t.id,
        });
        for (const c of targets) {
          this.events.push({
            kind: 'beam',
            x: t.x,
            y: t.y,
            ax: c.x,
            ay: c.y,
            color: def.color,
            towerId: t.id,
          });
          this.applyDamage(c, dmg, s.bonusVsLarge, 0, t.type);
        }
        return true;
      }

      case 'aura': {
        const targets = this.acquire(t, 999);
        if (!targets.length) return false;
        const dmg = this.towerDamage(t);
        for (const c of targets) {
          if (s.denyMaxTier > 0 && CLAIMS[c.type].tier <= s.denyMaxTier) {
            this.dissolve(c, 'deny');
            continue;
          }
          this.applyDamage(c, dmg, s.bonusVsLarge, 0, t.type);
        }
        return true;
      }

      case 'instant': {
        const cands = this.acquire(t, 999, (c) => CLAIMS[c.type].tier <= s.settleMaxTier);
        if (!cands.length) return false;
        let pick = cands[0];
        for (const c of cands) if (CLAIMS[c.type].tier > CLAIMS[pick.type].tier) pick = c;
        t.desiredFacing = Math.atan2(pick.y - t.y, pick.x - t.x);
        // Cash Pay snaps — jump facing immediately rather than waiting on turn rate.
        if (t.type === 'cashPay') t.facing = t.desiredFacing;
        this.savings += s.savingsPerUse;
        this.events.push({
          kind: 'shot',
          x: t.x,
          y: t.y,
          ax: pick.x,
          ay: pick.y,
          towerId: t.id,
        });
        this.dissolve(pick, 'settle');
        return true;
      }

      case 'spikes':
      case 'barrier': {
        const near = PATH.nearest(t.x, t.y);
        if (near.dist > s.range) return false;
        let mine = 0;
        for (const th of this.thorns) if (th.ownerId === t.id && th.hitsLeft > 0) mine++;
        if (mine >= s.spikeCount * 3) return false;

        t.desiredFacing = PATH.angle(near.arc);
        const stampX = PATH.posX(near.arc);
        const stampY = PATH.posY(near.arc);
        this.events.push({
          kind: 'shot',
          x: t.x,
          y: t.y,
          ax: stampX,
          ay: stampY,
          towerId: t.id,
        });

        const spread = Math.min(s.range, 110);
        for (let i = 0; i < s.spikeCount; i++) {
          const arc = clamp(near.arc + (this.rng() - 0.5) * spread * 2, 0, PATH.length - 1);
          this.thorns.push({
            id: this.nextId++,
            x: PATH.posX(arc),
            y: PATH.posY(arc),
            damage: this.towerDamage(t),
            hitsLeft: s.spikeHits,
            life: s.thornLife,
            attachTier: s.attachTier,
            seesOON: s.seesOutOfNetwork,
            piercesContract: s.piercesContract,
            variety: t.type === 'stopLoss' ? 'stopLoss' : 'edit',
            ownerId: t.id,
            ownerType: t.type,
          });
        }
        return true;
      }

      default:
        return false;
    }
  }

  // ----------------------------------------------------------- projectiles

  private updateProjectiles(dt: number) {
    const HIT_R2 = 22 * 22;
    for (const p of this.projectiles) {
      if (p.pierce <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < -60 || p.y < -60 || p.x > 1600 || p.y > 1090) {
        p.pierce = 0;
        continue;
      }
      for (const c of this.claims) {
        if (!c.alive || p.pierce <= 0) continue;
        if (c.traits.outOfNetwork && !p.seesOON) continue;
        if (c.traits.clean && !p.piercesContract) continue;
        if (p.hits.includes(c.id)) continue;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > HIT_R2) continue;

        p.hits.push(c.id);
        p.pierce--;

        if (p.slowDuration > 0) {
          c.slowUntil = this.time + p.slowDuration;
          c.slowFactor = p.slowFactor;
        }
        const canSteer = p.rerouteChance > 0 && CLAIMS[c.type].tier <= p.rerouteMaxTier;
        if (canSteer && this.rng() < p.rerouteChance) this.dissolve(c, 'reroute');
        else this.applyDamage(c, p.damage, p.bonusVsLarge, 0, p.ownerType);
      }
    }
  }

  private updateThorns(dt: number) {
    const HIT_R2 = 21 * 21;
    for (const th of this.thorns) {
      if (th.hitsLeft <= 0) continue;
      th.life -= dt;
      if (th.life <= 0) {
        th.hitsLeft = 0;
        continue;
      }
      for (const c of this.claims) {
        if (!c.alive || th.hitsLeft <= 0) continue;
        if (CLAIMS[c.type].tier < th.attachTier) continue;
        if (c.traits.outOfNetwork && !th.seesOON) continue;
        if (c.traits.clean && !th.piercesContract) continue;
        if ((c.x - th.x) ** 2 + (c.y - th.y) ** 2 > HIT_R2) continue;
        th.hitsLeft--;
        this.applyDamage(c, th.damage, 1, 0, th.ownerType);
      }
    }
  }

  private compact() {
    if (this.claims.some((c) => !c.alive)) this.claims = this.claims.filter((c) => c.alive);
    if (this.projectiles.some((p) => p.pierce <= 0)) {
      this.projectiles = this.projectiles.filter((p) => p.pierce > 0);
    }
    if (this.thorns.some((t) => t.hitsLeft <= 0)) {
      this.thorns = this.thorns.filter((t) => t.hitsLeft > 0);
    }
  }

  // ------------------------------------------------------------- build API

  place(type: TowerId, x: number, y: number): SimTower | null {
    const def = TOWERS[type];
    if (this.savings < def.cost) return null;
    const check = canPlace(type, x, y, this.towers);
    if (!check.ok) return null;

    this.savings -= def.cost;
    const t: SimTower = {
      id: this.nextId++,
      type,
      tier: 0,
      x,
      y,
      targetMode: 'first',
      cd: 0,
      ramp: 1,
      eff: statsAt(type, 0),
      kind: def.kind,
      zoneId: check.zone,
      buffed: false,
      contained: 0,
      facing: 0,
      desiredFacing: 0,
    };
    this.towers.push(t);
    this.recomputeBuffs();
    return t;
  }

  upgradeCost(t: SimTower): number | null {
    return t.tier >= 3 ? null : TOWERS[t.type].upgrades[t.tier].cost;
  }

  upgrade(towerId: number): boolean {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || t.tier >= 3) return false;
    const cost = TOWERS[t.type].upgrades[t.tier].cost;
    if (this.savings < cost) return false;
    this.savings -= cost;
    t.tier++;
    this.recomputeBuffs();
    return true;
  }

  sellValue(t: SimTower) {
    return Math.floor(investedIn(t.type, t.tier) * 0.75);
  }

  sell(towerId: number): boolean {
    const i = this.towers.findIndex((x) => x.id === towerId);
    if (i === -1) return false;
    this.savings += this.sellValue(this.towers[i]);
    this.towers.splice(i, 1);
    this.thorns = this.thorns.filter((th) => th.ownerId !== towerId);
    this.recomputeBuffs();
    return true;
  }

  setTargetMode(towerId: number, mode: TargetMode) {
    const t = this.towers.find((x) => x.id === towerId);
    if (t) t.targetMode = mode;
  }

  /**
   * Rebuilds every tower's effective stats from base + upgrades + zone + Tracy.
   * Tracy bonuses take the best applicable multiplier rather than stacking, so
   * ringing a tower with support does not run away.
   */
  recomputeBuffs() {
    const buffers = this.towers.filter((t) => t.kind === 'buff' || TOWERS[t.type].kind === 'buff');

    for (const t of this.towers) {
      const s = { ...statsAt(t.type, t.tier) };
      t.kind = kindAt(t.type, t.tier);

      const zone = t.zoneId ? ZONES.find((z) => z.id === t.zoneId) : null;
      if (zone && zone.allow.includes(t.type)) {
        if (zone.bonus.damage) s.damage *= zone.bonus.damage;
        if (zone.bonus.range) s.range *= zone.bonus.range;
        if (zone.bonus.rate) s.cooldown /= zone.bonus.rate;
      }

      let bd = 1;
      let br = 1;
      let brt = 1;
      let sight = false;
      if (t.kind !== 'buff') {
        for (const b of buffers) {
          if (b.id === t.id) continue;
          const bs = statsAt(b.type, b.tier);
          if ((b.x - t.x) ** 2 + (b.y - t.y) ** 2 > bs.range * bs.range) continue;
          bd = Math.max(bd, bs.buffDamage);
          br = Math.max(br, bs.buffRange);
          brt = Math.max(brt, bs.buffRate);
          sight = sight || bs.buffGrantsSight;
        }
      }
      s.damage *= bd;
      s.range *= br;
      s.cooldown /= brt;
      if (sight) s.seesOutOfNetwork = true;

      t.buffed = bd > 1 || br > 1 || brt > 1;
      t.eff = s;
    }
  }

  // ---------------------------------------------------------------- readout

  get currentRoundDef() {
    return ROUNDS[Math.min(this.round, ROUNDS.length - 1)];
  }

  get totalRounds() {
    return ROUNDS.length;
  }

  /** Share of billed charges kept off the plan, 0..1. */
  get containmentRate() {
    return this.billedEntered === 0 ? 1 : 1 - this.billedLeaked / this.billedEntered;
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  reset() {
    this.lives = STARTING_LIVES;
    this.savings = STARTING_SAVINGS;
    this.round = 0;
    this.phase = 'idle';
    this.time = 0;
    this.claims = [];
    this.towers = [];
    this.projectiles = [];
    this.thorns = [];
    this.events = [];
    this.billedEntered = 0;
    this.billedLeaked = 0;
    this.livesLost = 0;
    this.damageBy = {};
    this.queue = [];
    this.qi = 0;
    this.nextId = 1;
    this.rng = mulberry32(0x5eed);
  }
}

export { TOWER_RADIUS };
