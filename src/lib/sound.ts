/**
 * Tiny synthesised sound effects (Web Audio API) – no audio files to download.
 * The AudioContext is created lazily on first use, after a user gesture,
 * which is what browsers require for audio playback.
 */
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One oscillator note with a quick attack/decay envelope. */
function tone(freq: number, duration: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const { type = 'sine', gain = 0.12, delay = 0, slideTo } = opts;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  /** UI click */
  click: () => tone(880, 0.06, { type: 'square', gain: 0.04 }),
  /** Marker placed / moved on the map */
  pin: () => tone(620, 0.12, { type: 'triangle', gain: 0.1, slideTo: 980 }),
  /** Guess locked in */
  lock: () => {
    tone(330, 0.18, { type: 'sawtooth', gain: 0.06 });
    tone(660, 0.25, { type: 'triangle', gain: 0.08, delay: 0.08 });
  },
  /** Portal opening for a new round */
  portal: () => tone(140, 0.7, { type: 'sawtooth', gain: 0.05, slideTo: 900 }),
  /** Timer warning in the last seconds */
  tick: () => tone(1320, 0.05, { type: 'square', gain: 0.035 }),
  /** Time ran out */
  timeout: () => tone(220, 0.6, { type: 'sawtooth', gain: 0.08, slideTo: 70 }),
  /** Reveal fanfare, pitched by how good the guess was (0..1) */
  reveal: (quality: number) => {
    const base = 300 + quality * 300;
    [0, 4, 7].forEach((semi, i) => tone(base * 2 ** (semi / 12), 0.35, { type: 'triangle', gain: 0.07, delay: i * 0.07 }));
  },
  /** Streak bonus */
  streak: () => [0, 5, 9, 12].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.16, { type: 'square', gain: 0.04, delay: i * 0.05 })),
  /** Game complete */
  finale: () =>
    [0, 4, 7, 12, 16].forEach((s, i) => tone(262 * 2 ** (s / 12), 0.6, { type: 'triangle', gain: 0.07, delay: i * 0.09 })),
};
