import { loadSettings } from './engine';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, when = 0, type: OscillatorType = 'sine', volume = 0.18) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function correct() {
  if (!loadSettings().sound) return;
  tone(660, 0.09, 0, 'sine', 0.16);
  tone(990, 0.13, 0.05, 'sine', 0.14);
}

export function wrong() {
  if (!loadSettings().sound) return;
  tone(220, 0.16, 0, 'square', 0.1);
  tone(160, 0.16, 0.05, 'square', 0.08);
}

export function perfect() {
  if (!loadSettings().sound) return;
  tone(523.25, 0.12, 0, 'triangle', 0.16); // C5
  tone(659.25, 0.12, 0.1, 'triangle', 0.16); // E5
  tone(783.99, 0.18, 0.2, 'triangle', 0.16); // G5
  tone(1046.5, 0.3, 0.32, 'triangle', 0.16); // C6
}

export function tick() {
  if (!loadSettings().sound) return;
  tone(880, 0.04, 0, 'sine', 0.08);
}

export function vibrate(ms: number) {
  if (!loadSettings().haptics) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms);
  }
}
