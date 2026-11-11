export type SoundName =
  | 'click'
  | 'play'
  | 'respond'
  | 'damage'
  | 'heal'
  | 'draw'
  | 'discard'
  | 'turn'
  | 'judge'
  | 'skill'
  | 'win'
  | 'lose';

interface SoundSettings {
  enabled: boolean;
  volume: number;
}

const STORAGE_KEY = 'sgs-sound-settings';
const DEFAULTS: SoundSettings = { enabled: true, volume: 0.32 };

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: parsed.enabled !== false,
      volume: Math.max(0, Math.min(1, Number(parsed.volume ?? DEFAULTS.volume))),
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = loadSettings();
let context: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<string, number>();

export function getSoundSettings(): SoundSettings {
  return settings;
}

export function applySoundSettings(next: SoundSettings): void {
  settings = {
    enabled: next.enabled,
    volume: Math.max(0, Math.min(1, next.volume)),
  };
  if (master && context) {
    master.gain.setTargetAtTime(settings.enabled ? settings.volume : 0, context.currentTime, 0.02);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = settings.enabled ? settings.volume : 0;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(
  ctx: AudioContext,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  level: number,
  delay = 0,
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(master ?? ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function noise(ctx: AudioContext, duration: number, level: number, frequency: number): void {
  const now = ctx.currentTime;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  gain.gain.value = level;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master ?? ctx.destination);
  source.start(now);
}

export function playSound(name: SoundName): void {
  if (!settings.enabled || settings.volume <= 0) return;
  const now = performance.now();
  const gap: Partial<Record<SoundName, number>> = {
    click: 35,
    draw: 70,
    discard: 70,
    damage: 50,
  };
  if (now - (lastPlayed.get(name) ?? 0) < (gap[name] ?? 45)) return;
  lastPlayed.set(name, now);
  const ctx = ensureContext();
  if (!ctx) return;
  switch (name) {
    case 'click':
      tone(ctx, 920, 720, 0.035, 'sine', 0.12);
      break;
    case 'play':
      noise(ctx, 0.09, 0.08, 1700);
      tone(ctx, 300, 180, 0.12, 'triangle', 0.16);
      break;
    case 'respond':
      tone(ctx, 760, 1040, 0.075, 'sine', 0.14);
      break;
    case 'damage':
      tone(ctx, 150, 62, 0.2, 'sine', 0.26);
      noise(ctx, 0.1, 0.08, 700);
      break;
    case 'heal':
      tone(ctx, 660, 660, 0.12, 'sine', 0.14);
      tone(ctx, 990, 990, 0.16, 'sine', 0.12, 0.08);
      break;
    case 'draw':
      noise(ctx, 0.055, 0.05, 3200);
      break;
    case 'discard':
      noise(ctx, 0.075, 0.06, 1400);
      break;
    case 'turn':
      tone(ctx, 880, 880, 0.22, 'sine', 0.1);
      tone(ctx, 1320, 1320, 0.18, 'sine', 0.06, 0.05);
      break;
    case 'judge':
      tone(ctx, 240, 240, 0.12, 'triangle', 0.14);
      break;
    case 'skill':
      tone(ctx, 520, 780, 0.12, 'sine', 0.12);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((freq, index) => tone(ctx, freq, freq, 0.22, 'triangle', 0.13, index * 0.11));
      break;
    case 'lose':
      tone(ctx, 320, 160, 0.45, 'sine', 0.14);
      break;
  }
}

export function installClickSound(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const control = target.closest(
      'button, .card, .hand-card, .menu-action, .count-btn, .chat-sticker, .address-item, .lobby-player',
    );
    if (!control) return;
    if (control instanceof HTMLButtonElement && control.disabled) return;
    playSound('click');
  };
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  return () => document.removeEventListener('pointerdown', onPointerDown);
}
