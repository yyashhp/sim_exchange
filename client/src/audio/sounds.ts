/**
 * Sound effects engine — Web Audio API synthesis.
 *
 * All sounds are generated mathematically; no audio files required.
 * Each call creates independent nodes so sounds overlap freely.
 *
 * Design intent:
 *   bread   → low, warm thud       (recognisable without looking)
 *   veggies → bright, airy chime
 *   cheese  → soft, rounded bell
 *   meat    → deep, heavy thump
 *   start   → rising three-tone fanfare
 *   end     → descending buzzer
 *   tick    → escalating click; becomes urgent in final 3 seconds
 */

let _ctx: AudioContext | null = null;
let _muted = (() => {
  try { return localStorage.getItem('tradingExchange_muted') === 'true'; }
  catch { return false; }
})();

// ── Context ──────────────────────────────────────────────────────────────────

function ctx(): AudioContext | null {
  if (_muted) return null;
  if (!_ctx) {
    try { _ctx = new AudioContext(); } catch { return null; }
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function setMuted(muted: boolean): void {
  _muted = muted;
  try { localStorage.setItem('tradingExchange_muted', String(muted)); } catch {}
}

export function isMuted(): boolean { return _muted; }

// ── Primitives ────────────────────────────────────────────────────────────────

interface ToneOptions {
  type?: OscillatorType;
  startFreq: number;
  endFreq?: number;          // defaults to startFreq
  duration: number;          // seconds
  peakGain?: number;         // 0–1
  attackTime?: number;       // seconds
  releaseStart?: number;     // fraction of duration where release begins (0–1)
  startAt?: number;          // delay in seconds from now
  // Optional second oscillator detuned for richness
  detuneCents?: number;
  detuneGain?: number;
}

function tone(o: ToneOptions): void {
  const c = ctx();
  if (!c) return;

  const {
    type = 'sine',
    startFreq,
    endFreq = startFreq,
    duration,
    peakGain = 0.25,
    attackTime = 0.008,
    releaseStart = 0.35,
    startAt = 0,
    detuneCents,
    detuneGain = 0.4,
  } = o;

  const t0 = c.currentTime + startAt;
  const releaseAt = t0 + duration * releaseStart;
  const stopAt = t0 + duration;

  function makeOsc(freq: number, gain: number) {
    const osc = c.createOscillator();
    const gainNode = c.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, stopAt);
    }

    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(gain, t0 + attackTime);
    gainNode.gain.setValueAtTime(gain, releaseAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.connect(gainNode);
    gainNode.connect(c.destination);

    osc.start(t0);
    osc.stop(stopAt + 0.05);
  }

  makeOsc(startFreq, peakGain);

  if (detuneCents !== undefined) {
    const ratio = Math.pow(2, detuneCents / 1200);
    makeOsc(startFreq * ratio, peakGain * detuneGain);
  }
}

// ── Trade sounds — one per product ──────────────────────────────────────────

/** Bread: low, warm thud — like a loaf dropping on a counter */
export function playTradeBread(): void {
  tone({ type: 'sine', startFreq: 180, endFreq: 60,  duration: 0.45, peakGain: 0.45, releaseStart: 0.2 });
  // Sub-octave pulse for weight
  tone({ type: 'sine', startFreq: 90,  endFreq: 40,  duration: 0.35, peakGain: 0.2,  releaseStart: 0.15 });
}

/** Veggies: bright, airy chime — light and crisp */
export function playTradeVeggies(): void {
  tone({ type: 'triangle', startFreq: 1200, endFreq: 880, duration: 0.5, peakGain: 0.22, attackTime: 0.004, releaseStart: 0.15, detuneCents: 7, detuneGain: 0.5 });
  // Shimmer overtone
  tone({ type: 'sine',     startFreq: 2400, endFreq: 1760, duration: 0.35, peakGain: 0.08, attackTime: 0.003, releaseStart: 0.1, startAt: 0.02 });
}

/** Cheese: soft, warm bell — rounded and mellow */
export function playTradeCheese(): void {
  tone({ type: 'sine', startFreq: 550, endFreq: 440, duration: 0.6, peakGain: 0.3,  attackTime: 0.006, releaseStart: 0.25, detuneCents: 5, detuneGain: 0.35 });
  // Gentle second harmonic
  tone({ type: 'sine', startFreq: 1100, endFreq: 880, duration: 0.45, peakGain: 0.1, attackTime: 0.006, releaseStart: 0.2 });
}

/** Meat: deep, heavy thump — satisfying low-end weight */
export function playTradeMeat(): void {
  tone({ type: 'sine', startFreq: 110, endFreq: 45, duration: 0.55, peakGain: 0.55, releaseStart: 0.18 });
  // Click transient at the front
  tone({ type: 'square', startFreq: 220, endFreq: 55, duration: 0.08, peakGain: 0.15, attackTime: 0.002, releaseStart: 0.5 });
}

/** Dispatch the correct trade sound for a product name */
export function playTradeSound(product: string, delaySeconds = 0): void {
  const c = ctx();
  if (!c) return;

  // Inline delay by passing startAt to each tone helper
  // We re-call with a startAt offset instead — simplest approach: schedule
  // a timeout and call the relevant function.
  // Use startAt on all tones inside each function by wrapping them.
  const fn = TRADE_FNS[product.toLowerCase()];
  if (fn) {
    if (delaySeconds === 0) { fn(); } else { setTimeout(fn, delaySeconds * 1000); }
  }
}

const TRADE_FNS: Record<string, () => void> = {
  bread:  playTradeBread,
  veggies: playTradeVeggies,
  cheese: playTradeCheese,
  meat:   playTradeMeat,
};

// ── Game lifecycle ────────────────────────────────────────────────────────────

/** Rising three-beep fanfare — "game on!" */
export function playGameStart(): void {
  // Three ascending square-wave beeps
  tone({ type: 'square', startFreq: 440, duration: 0.13, peakGain: 0.18, releaseStart: 0.6, startAt: 0.00 });
  tone({ type: 'square', startFreq: 554, duration: 0.13, peakGain: 0.18, releaseStart: 0.6, startAt: 0.16 });
  tone({ type: 'square', startFreq: 659, duration: 0.22, peakGain: 0.22, releaseStart: 0.5, startAt: 0.32 });
  // Short sustain chord
  tone({ type: 'sine',   startFreq: 659, duration: 0.4,  peakGain: 0.15, attackTime: 0.05, releaseStart: 0.4, startAt: 0.55 });
  tone({ type: 'sine',   startFreq: 440, duration: 0.4,  peakGain: 0.10, attackTime: 0.05, releaseStart: 0.4, startAt: 0.55 });
}

/** Descending sawtooth buzz — classic "time's up" buzzer */
export function playGameEnd(): void {
  tone({ type: 'sawtooth', startFreq: 480, endFreq: 140, duration: 0.9, peakGain: 0.28, releaseStart: 0.55, startAt: 0.0 });
  tone({ type: 'sawtooth', startFreq: 380, endFreq: 110, duration: 0.9, peakGain: 0.18, releaseStart: 0.55, startAt: 0.05 });
  // Final low thud
  tone({ type: 'sine', startFreq: 80, endFreq: 30, duration: 0.5, peakGain: 0.35, releaseStart: 0.3, startAt: 0.3 });
}

// ── Countdown ─────────────────────────────────────────────────────────────────

/**
 * Call once per second for the last 10 seconds.
 * remainingTime: 10 → 1  (0 = game over, use playGameEnd instead)
 */
export function playCountdownTick(remainingTime: number): void {
  const t = Math.max(1, Math.min(10, remainingTime));
  const urgency = (10 - t) / 9; // 0 at t=10, 1 at t=1

  // Pitch: 700 Hz at t=10, rising to 1100 Hz at t=1
  const freq = 700 + urgency * 400;

  // Duration: shorter and snappier as urgency increases
  const dur = 0.12 - urgency * 0.04;

  // Gain: slightly louder toward the end; final 3 seconds pop more
  const gain = t <= 3 ? 0.28 : 0.16 + urgency * 0.06;

  // Use a slightly harder waveform for last 3 ticks
  const waveType: OscillatorType = t <= 3 ? 'square' : 'sine';

  tone({ type: waveType, startFreq: freq, endFreq: freq * 0.75, duration: dur, peakGain: gain, attackTime: 0.003, releaseStart: 0.3 });

  // Second harmonic click for extra definition at high urgency
  if (t <= 5) {
    tone({ type: 'sine', startFreq: freq * 2, endFreq: freq, duration: dur * 0.6, peakGain: gain * 0.3, attackTime: 0.002, releaseStart: 0.2 });
  }
}
