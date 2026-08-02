/**
 * Sound effects, shared by the React chrome and the Phaser scene.
 *
 * Deliberately not Phaser's sound manager: the sidebar needs to click too, and
 * routing every menu press through the command bus into the canvas would be a
 * lot of indirection for a 10KB sample. One module owns audio, both sides call it.
 *
 * Files are fetched up front but only decoded on the first play, so no
 * AudioContext exists until the page has been interacted with. That avoids the
 * browser's "AudioContext was not allowed to start" warning entirely.
 */

interface SfxDef {
  file: string;
  /** Gain, tuned per sample rather than per call site. */
  volume: number;
  /**
   * Cut off a still-playing instance before starting another. Right for long
   * samples, where firing twice in quick succession would otherwise smear.
   */
  solo?: boolean;
  /** Shortest gap between starts, in ms. Throttles sounds on hot paths. */
  minInterval?: number;
  /** Ceiling on instances ringing at once. */
  maxVoices?: number;
  /** Randomises playback rate by ±this fraction so repeats don't sound looped. */
  detune?: number;
}

const SOUNDS = {
  place: { file: 'place.m4a', volume: 0.45 },
  menu: { file: 'menu.m4a', volume: 0.35 },
  sell: { file: 'sell.m4a', volume: 0.4, solo: true },
  /**
   * Claims break up to 321 times a second on round 20, and 64 times in a single
   * frame. Unthrottled that is three hundred overlapping one-second tears, which
   * is noise rather than sound. Callers coalesce a frame's impacts into one call
   * and these limits carry the rest, so the texture thickens with the pressure
   * on screen without ever turning to mush.
   */
  pop: { file: 'pop.m4a', volume: 0.16, minInterval: 70, maxVoices: 4, detune: 0.14 },
  /**
   * Towers peak at ten shots a second across a full board, and this one is meant
   * to be heard on essentially every one of them. The floor is a single frame,
   * only enough to merge shots landing in the same instant, because stacking the
   * identical sample phase-aligned spikes the amplitude rather than sounding
   * busier. The sample rings for 1.1s, so the voice ceiling has to clear ten.
   */
  shot: { file: 'shot.m4a', volume: 0.2, maxVoices: 20, detune: 0.09 },
  /**
   * A claim reaching the plan. Loud on purpose — this is the only sound that
   * means something went wrong. Even a total collapse only leaks eight a second
   * because the path spaces claims out, so a gap slightly longer than the buzz
   * is audible keeps each one distinct instead of smearing into a drone. No
   * detune: a warning should sound the same every time it fires.
   */
  leak: { file: 'leak.m4a', volume: 0.4, minInterval: 170, maxVoices: 3 },
} satisfies Record<string, SfxDef>;

export type SfxKey = keyof typeof SOUNDS;

/** Looping background bed. Not a one-shot, so it sits outside SOUNDS. */
const MUSIC = { file: 'music.m4a', volume: 0.14 };
const MUTE_KEY = 'containment:muted';

const encoded = new Map<SfxKey, ArrayBuffer>();
const decoded = new Map<SfxKey, AudioBuffer>();
const playing = new Map<SfxKey, Set<AudioBufferSourceNode>>();
const lastStart = new Map<SfxKey, number>();
let ctx: AudioContext | undefined;
let bus: DynamicsCompressorNode | undefined;
let master: GainNode | undefined;
let contextFailed = false;

let musicEncoded: ArrayBuffer | undefined;
let musicFetch: Promise<void> | undefined;
let musicSource: AudioBufferSourceNode | undefined;
let musicStarting = false;

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

const voices = (key: SfxKey) => {
  let set = playing.get(key);
  if (!set) playing.set(key, (set = new Set()));
  return set;
};

function context(): AudioContext | undefined {
  if (ctx || contextFailed) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    contextFailed = true;
  }
  return ctx;
}

/** Single point of control for volume, so muting is one gain rather than many. */
function masterOut(c: AudioContext): GainNode {
  if (master) return master;
  master = c.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(c.destination);
  return master;
}

/**
 * Effects route through one compressor. A dozen gunshots and four paper tears
 * can be ringing at once late in a round, and summing that many voices would
 * clip on peaks. This holds the ceiling wherever the mix lands, so no individual
 * sound has to be quiet enough to be safe in the worst case.
 *
 * Music deliberately bypasses it and goes straight to the master, so a busy
 * round does not pump the backing track.
 */
function output(c: AudioContext): AudioNode {
  if (bus) return bus;
  bus = c.createDynamicsCompressor();
  bus.threshold.value = -16;
  bus.knee.value = 22;
  bus.ratio.value = 8;
  bus.attack.value = 0.003;
  bus.release.value = 0.22;
  bus.connect(masterOut(c));
  return bus;
}

function emit(key: SfxKey, buffer: AudioBuffer) {
  if (muted) return; // don't build voices nobody will hear
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();

  const def: SfxDef = SOUNDS[key];
  const live = voices(key);
  const now = performance.now();

  if (def.minInterval && now - (lastStart.get(key) ?? -Infinity) < def.minInterval) return;
  if (def.maxVoices && live.size >= def.maxVoices) return;

  if (def.solo) {
    for (const prior of live) {
      try {
        prior.stop();
      } catch {
        // Already finished; stopping a spent source throws and does not matter.
      }
    }
    live.clear();
  }

  const source = c.createBufferSource();
  source.buffer = buffer;
  if (def.detune) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.detune;
  const gain = c.createGain();
  gain.gain.value = def.volume;
  source.connect(gain).connect(output(c));
  source.onended = () => live.delete(source);
  source.start();
  live.add(source);
  lastStart.set(key, now);
}

const grab = (file: string) =>
  fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`).then((r) =>
    r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))
  );

/**
 * Fetches every sample. Safe to call once at startup; failures are non-fatal.
 * Also arms the first-gesture hook, because browsers will not let audio start
 * before the page has been interacted with.
 */
export function preloadSfx() {
  for (const [key, def] of Object.entries(SOUNDS) as Array<[SfxKey, SfxDef]>) {
    if (encoded.has(key)) continue;
    void grab(def.file)
      .then((buf) => encoded.set(key, buf))
      .catch((err: Error) =>
        console.warn(`[containment] sound "${key}" unavailable, continuing silently:`, err.message)
      );
  }

  // The music alone is five times every effect combined and cannot play before
  // the page is interacted with, so it stays off the critical path: fetched once
  // the browser is idle after load, or immediately on the first gesture if that
  // comes first.
  const idle =
    window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
  if (document.readyState === 'complete') idle(() => void ensureMusic());
  else window.addEventListener('load', () => idle(() => void ensureMusic()), { once: true });

  const kick = () => {
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    void ctx?.resume();
    if (!muted) void ensureMusic();
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

/** Fetches the music once, whenever it is first wanted. */
function ensureMusic(): Promise<void> {
  musicFetch ??= grab(MUSIC.file)
    .then((buf) => {
      musicEncoded = buf;
      if (!muted) startMusic();
    })
    .catch((err: Error) =>
      console.warn('[containment] music unavailable, continuing silently:', err.message)
    );
  return musicFetch;
}

/**
 * Starts the loop. Idempotent, and safe to call before the page has been
 * interacted with: the source is scheduled against a suspended context, whose
 * clock is not running, so it plays from the top the moment the context resumes.
 *
 * Deliberately not async. Awaiting resume() on a suspended context never settles
 * until a gesture arrives, which previously left this holding its own start lock
 * and meant the gesture-triggered call bailed out and music never played at all.
 */
export function startMusic() {
  const c = context();
  if (!c || !musicEncoded || musicSource || musicStarting) return;
  musicStarting = true;

  void c
    .decodeAudioData(musicEncoded.slice(0))
    .then((buffer) => {
      if (musicSource) return;
      const gain = c.createGain();
      gain.gain.value = MUSIC.volume;
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true; // sample-accurate, so the seam has no gap of its own
      source.connect(gain).connect(masterOut(c));
      source.start();
      musicSource = source;
      void c.resume();
    })
    .catch(() => {
      musicEncoded = undefined;
    })
    .finally(() => {
      musicStarting = false;
    });
}

export const isMuted = () => muted;

/** Mutes music and effects together, and remembers the choice. */
export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // Private browsing; the setting just will not persist.
  }
  if (master && ctx) {
    // Ramp rather than jump, so unmuting mid-round is not a thump.
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(next ? 0 : 1, ctx.currentTime, 0.02);
  }
  if (!next) void ensureMusic().then(startMusic);
}

/**
 * Plays a one-shot. No-ops when the sample is missing, still downloading, or
 * undecodable, so audio can never take the interface down.
 */
export function playSfx(key: SfxKey) {
  const ready = decoded.get(key);
  if (ready) {
    emit(key, ready);
    return;
  }

  const raw = encoded.get(key);
  if (!raw) return;
  const c = context();
  if (!c) return;

  // decodeAudioData detaches the buffer it is given, so hand it a copy.
  void c
    .decodeAudioData(raw.slice(0))
    .then((buffer) => {
      decoded.set(key, buffer);
      emit(key, buffer);
    })
    .catch(() => encoded.delete(key));
}

export const clickMenu = () => playSfx('menu');
