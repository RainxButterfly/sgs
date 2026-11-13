/**
 * 背景音乐：完全由 Web Audio 实时合成的五声音阶氛围乐，
 * 不依赖任何外部音频文件，音量跟随设置里的「背景音乐」通道。
 */

import { getBgmVolume, isBgmEnabled } from './sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | null = null;
let started = false;
let nextBarAt = 0;
let bar = 0;

/** 五声音阶（D 宫）：D E #F A B */
const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0];
/** 四个和弦的低音与和声：D - Bm - G - A */
const CHORDS: number[][] = [
  [146.83, 220.0, 293.66],
  [123.47, 185.0, 246.94],
  [98.0, 146.83, 196.0],
  [110.0, 164.81, 220.0],
];
const BAR_SECONDS = 3.2;

function create(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

function pad(audio: AudioContext, freqs: number[], at: number, duration: number, level: number): void {
  for (const freq of freqs) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + duration * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master ?? audio.destination);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }
}

function pluck(audio: AudioContext, freq: number, at: number, level: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, at);
  filter.frequency.exponentialRampToValueAtTime(700, at + 0.6);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master ?? audio.destination);
  osc.start(at);
  osc.stop(at + 1.2);
}

/** 排下一小节：和声铺底 + 两三个零星拨弦 */
function scheduleBar(): void {
  const audio = ctx;
  if (!audio || !master) return;
  const chord = CHORDS[bar % CHORDS.length];
  pad(audio, chord, nextBarAt, BAR_SECONDS * 1.02, 0.05);
  if (bar % 2 === 1) pad(audio, chord.map((f) => f * 2), nextBarAt + 0.4, BAR_SECONDS * 0.7, 0.018);

  const notes = bar % 4 === 0 ? 2 : 3;
  for (let i = 0; i < notes; i += 1) {
    const offset = 0.35 + i * (BAR_SECONDS / (notes + 0.6)) + Math.random() * 0.25;
    const freq = SCALE[Math.floor(Math.random() * SCALE.length)];
    pluck(audio, freq, nextBarAt + offset, 0.035 + Math.random() * 0.02);
  }

  bar += 1;
  nextBarAt += BAR_SECONDS;
}

function tick(): void {
  const audio = ctx;
  if (!audio) return;
  const target = Math.max(0, Math.min(1, getBgmVolume())) * 0.9;
  master?.gain.setTargetAtTime(isBgmEnabled() ? target : 0, audio.currentTime, 0.35);
  if (!isBgmEnabled() || target <= 0.001) return;
  // 提前排 2 小节，避免定时器抖动出现空档
  while (nextBarAt < audio.currentTime + BAR_SECONDS * 2) scheduleBar();
}

function begin(): void {
  const audio = create();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  if (started) return;
  started = true;
  nextBarAt = audio.currentTime + 0.15;
  bar = 0;
  tick();
  timer = window.setInterval(tick, 700);
}

function halt(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  started = false;
  if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

/** 首次交互后开始播放（浏览器要求先有一次用户手势） */
export function installBgm(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const kick = () => {
    if (isBgmEnabled()) begin();
  };
  kick();
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('keydown', kick);
  const onVisible = () => {
    if (document.hidden) halt();
    else if (isBgmEnabled()) begin();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    document.removeEventListener('visibilitychange', onVisible);
    halt();
  };
}

/** 设置里切换开关后立即生效 */
export function syncBgm(): void {
  if (!isBgmEnabled()) {
    halt();
    return;
  }
  begin();
}
