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
  | 'lose'
  | 'egg'
  | 'flower'
  | 'dying'
  | 'shuffle';

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

function v(base: number): number {
  return base * (1 + (Math.random() - 0.5) * 0.05);
}

/** 带扫频的噪声：像纸牌划过桌面 */
function swoosh(
  ctx: AudioContext,
  duration: number,
  level: number,
  from: number,
  to: number,
  delay = 0,
): void {
  const now = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.8);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(from, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(120, to), now + duration);
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
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
      // 甩牌：纸面摩擦 + 落桌轻响
      swoosh(ctx, 0.16, 0.11, v(2600), v(900));
      tone(ctx, v(210), v(150), 0.1, 'triangle', 0.15, 0.06);
      break;
    case 'respond':
      swoosh(ctx, 0.11, 0.08, v(3000), v(1500));
      tone(ctx, v(880), v(1180), 0.08, 'sine', 0.12, 0.03);
      break;
    case 'damage':
      // 闷响 + 短促金属尾音
      tone(ctx, v(150), 58, 0.22, 'sine', 0.28);
      tone(ctx, v(88), 44, 0.3, 'sine', 0.2, 0.01);
      noise(ctx, 0.1, 0.09, v(720));
      tone(ctx, v(1400), v(900), 0.06, 'square', 0.05, 0.02);
      break;
    case 'heal':
      [660, 880, 1320].forEach((freq, i) => tone(ctx, v(freq), v(freq), 0.16, 'sine', 0.12 - i * 0.02, i * 0.07));
      break;
    case 'draw':
      swoosh(ctx, 0.08, 0.055, v(4200), v(2400));
      break;
    case 'discard':
      swoosh(ctx, 0.1, 0.06, v(1800), v(700));
      break;
    case 'shuffle':
      for (let i = 0; i < 4; i += 1) swoosh(ctx, 0.07, 0.05, v(3200), v(1400), i * 0.055);
      break;
    case 'turn':
      // 轮到自己：上扬双音 + 轻尾音，比单短音更容易被注意到
      tone(ctx, 660, 660, 0.16, 'triangle', 0.16);
      tone(ctx, 990, 990, 0.16, 'triangle', 0.15, 0.15);
      tone(ctx, 1320, 1320, 0.3, 'sine', 0.1, 0.3);
      break;
    case 'egg':
      noise(ctx, 0.07, 0.13, 2400);
      tone(ctx, 220, 90, 0.13, 'square', 0.1, 0.02);
      break;
    case 'flower':
      tone(ctx, 720, 1080, 0.16, 'sine', 0.1);
      tone(ctx, 1080, 1440, 0.18, 'sine', 0.06, 0.08);
      break;
    case 'judge':
      // 翻牌：卡片离手的脆响 + 一点回音
      swoosh(ctx, 0.09, 0.09, v(3600), v(1800));
      tone(ctx, v(1180), v(760), 0.1, 'triangle', 0.12, 0.01);
      tone(ctx, v(590), v(590), 0.18, 'sine', 0.05, 0.07);
      break;
    case 'skill':
      // 技能：上挑 + 泛音
      tone(ctx, v(520), v(820), 0.16, 'sine', 0.13);
      tone(ctx, v(1040), v(1240), 0.22, 'triangle', 0.07, 0.05);
      swoosh(ctx, 0.2, 0.05, v(2200), v(5200));
      break;
    case 'dying':
      // 濒死：两声低沉心跳
      tone(ctx, 62, 42, 0.26, 'sine', 0.3);
      tone(ctx, 58, 40, 0.3, 'sine', 0.24, 0.34);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((freq, index) =>
        tone(ctx, freq, freq, 0.26, 'triangle', 0.13, index * 0.11),
      );
      tone(ctx, 1568, 1568, 0.4, 'sine', 0.06, 0.44);
      break;
    case 'lose':
      tone(ctx, 320, 150, 0.5, 'sine', 0.15);
      tone(ctx, 240, 110, 0.6, 'sine', 0.1, 0.08);
      break;
  }
}

/** 震动反馈（手机端有效）：受设置开关控制 */
export function vibrate(pattern: number | number[] = 30): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // 桌面端或不支持时静默忽略
  }
}

const VIBRATION_KEY = 'sgs-vibration-enabled';

export function getVibrationEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VIBRATION_KEY);
    if (raw === null) return true;
    return raw !== '0';
  } catch {
    return true;
  }
}

export function setVibrationEnabled(value: boolean): void {
  try {
    localStorage.setItem(VIBRATION_KEY, value ? '1' : '0');
  } catch {
    // ignore
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
