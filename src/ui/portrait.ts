/**
 * 武将牌立绘解析：按「选中皮肤 → 默认内置立绘 → 程序生成牌面」的顺序取图。
 * 暗将强制用生成暗面，不泄露身份。
 */

import { HERO_MAP } from '../core/deck';
import type { Faction, HeroData } from '../core/types';
import { heroSkinUrl } from './skins';

interface Palette {
  skyTop: string;
  skyBottom: string;
  sun: string;
  hillFar: string;
  hillNear: string;
  robe: string;
  robeDark: string;
  trim: string;
  face: string;
  ink: string;
  seal: string;
  sealText: string;
}

const PALETTES: Record<Faction, Palette> = {
  wei: {
    skyTop: '#101d33', skyBottom: '#2c4b70', sun: '#c9dcf2',
    hillFar: '#3d608a', hillNear: '#1b2f4c', robe: '#52749e', robeDark: '#223a5b',
    trim: '#bcd6f2', face: '#e7d3ac', ink: '#0a1424', seal: '#2a4c7c', sealText: '#e3efff',
  },
  shu: {
    skyTop: '#2b1214', skyBottom: '#6f2a26', sun: '#f6d9b8',
    hillFar: '#94463c', hillNear: '#3d181a', robe: '#a3503f', robeDark: '#4b1d1c',
    trim: '#f3cda6', face: '#f2d8b6', ink: '#220c0d', seal: '#8f2f27', sealText: '#ffe9d2',
  },
  wu: {
    skyTop: '#0c2420', skyBottom: '#22594a', sun: '#d6f0d5',
    hillFar: '#3d8267', hillNear: '#123228', robe: '#3f8367', robeDark: '#173d31',
    trim: '#c4ecd2', face: '#e5dcc0', ink: '#081c17', seal: '#276b50', sealText: '#e4ffe9',
  },
  qun: {
    skyTop: '#241a2f', skyBottom: '#5a4260', sun: '#f0dcae',
    hillFar: '#79608a', hillNear: '#2b2038', robe: '#715580', robeDark: '#33243f',
    trim: '#e8d5a8', face: '#eedcb8', ink: '#160f1d', seal: '#6a4a70', sealText: '#fbeec9',
  },
};

const HIDDEN_PALETTE: Palette = {
  skyTop: '#16171c', skyBottom: '#33363f', sun: '#9aa3b2',
  hillFar: '#464b57', hillNear: '#1c1f26', robe: '#4b505c', robeDark: '#23262e',
  trim: '#b9c0cc', face: '#cdd3dc', ink: '#0d0f13', seal: '#3a404c', sealText: '#dfe5ee',
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(list: T[], n: number): T {
  return list[n % list.length];
}

/** 远山轮廓，按种子变化，保持两端落在画布边缘 */
function hills(seed: number, y: number, amp: number, color: string, opacity: number): string {
  const pts: string[] = [`M0 ${y + 30}`];
  for (let i = 0; i <= 6; i += 1) {
    const x = (i / 6) * 240;
    const jitter = ((seed >> (i * 3)) & 7) - 3;
    const peak = y - amp + jitter * 6 - (i % 2) * amp * 0.45;
    pts.push(`L${x.toFixed(1)} ${peak.toFixed(1)}`);
  }
  pts.push('L240 340 L0 340 Z');
  return `<path d="${pts.join(' ')}" fill="${color}" opacity="${opacity}"/>`;
}

/** 主角剪影：披风、甲胄、头盔与兵器，按姿态变体绘制 */
function figure(seed: number, p: Palette): string {
  const variant = seed % 6;
  const female = variant === 5;
  const plume = (seed >> 4) % 3;

  const cape = `
    <path d="M-74 138 C-82 74 -58 30 -30 20 L-22 14 L22 14 L30 20
             C58 30 82 74 74 138 Z" fill="${p.robeDark}" opacity="0.96"/>
    <path d="M-74 138 C-80 78 -54 34 -30 20" fill="none" stroke="${p.trim}" stroke-width="2.4" opacity="0.85"/>
    <path d="M74 138 C80 78 54 34 30 20" fill="none" stroke="${p.trim}" stroke-width="2.4" opacity="0.85"/>
    <path d="M-58 118 C-52 66 -36 38 -18 28" fill="none" stroke="${p.trim}" stroke-width="1.2" opacity="0.35"/>
    <path d="M58 118 C52 66 36 38 18 28" fill="none" stroke="${p.trim}" stroke-width="1.2" opacity="0.35"/>`;

  const body = `
    <path d="M-36 30 L-46 138 L46 138 L36 30 Z" fill="${p.robe}" stroke="${p.trim}" stroke-width="1.5" stroke-opacity="0.7"/>
    <path d="M-36 30 L-46 138 L-16 138 L-12 30 Z" fill="${p.robeDark}" opacity="0.6"/>
    <path d="M0 34 L0 138" stroke="${p.trim}" stroke-width="2" opacity="0.7"/>
    <path d="M-30 62 Q0 76 30 62" fill="none" stroke="${p.trim}" stroke-width="3" opacity="0.85"/>
    <path d="M-30 96 L30 96" stroke="${p.trim}" stroke-width="1.8" opacity="0.6"/>
    <circle cx="0" cy="76" r="5" fill="${p.trim}" opacity="0.8"/>`;

  const shoulders = `
    <ellipse cx="-34" cy="40" rx="19" ry="12" fill="${p.robe}" stroke="${p.trim}" stroke-width="2" stroke-opacity="0.85"/>
    <ellipse cx="34" cy="40" rx="19" ry="12" fill="${p.robe}" stroke="${p.trim}" stroke-width="2" stroke-opacity="0.85"/>
    <path d="M-50 38 Q-34 26 -18 38" fill="none" stroke="${p.trim}" stroke-width="2.2" opacity="0.9"/>
    <path d="M18 38 Q34 26 50 38" fill="none" stroke="${p.trim}" stroke-width="2.2" opacity="0.9"/>`;

  const head = female
    ? `<path d="M-19 -6 C-21 -30 -12 -40 0 -40 C12 -40 21 -30 19 -6 Z" fill="${p.ink}" stroke="${p.trim}" stroke-width="2" stroke-opacity="0.9"/>
       <ellipse cx="0" cy="-2" rx="13" ry="17" fill="${p.face}" opacity="0.9"/>
       <circle cx="0" cy="-42" r="10" fill="${p.ink}" stroke="${p.trim}" stroke-width="2" stroke-opacity="0.9"/>
       <path d="M-10 -46 Q0 -58 10 -46" fill="none" stroke="${p.trim}" stroke-width="2.4" opacity="0.95"/>
       <path d="M-16 -30 C-34 -14 -30 18 -44 42" fill="none" stroke="${p.trim}" stroke-width="3" opacity="0.75"/>
       <path d="M16 -30 C34 -14 30 18 44 42" fill="none" stroke="${p.trim}" stroke-width="3" opacity="0.75"/>
       <path d="M-6 -3 L-2 -3 M2 -3 L6 -3" stroke="${p.ink}" stroke-width="1.6" opacity="0.8"/>`
    : `<ellipse cx="0" cy="-2" rx="14" ry="18" fill="${p.face}" opacity="0.92"/>
       <path d="M-6 -3 L-2 -3 M2 -3 L6 -3" stroke="${p.ink}" stroke-width="1.8" opacity="0.85"/>
       <path d="M-4 8 Q0 11 4 8" fill="none" stroke="${p.ink}" stroke-width="1.3" opacity="0.7"/>
       <path d="M-20 -8 C-22 -34 -12 -44 0 -44 C12 -44 22 -34 20 -8 Z" fill="${p.robe}" stroke="${p.trim}" stroke-width="2.4" stroke-opacity="0.95"/>
       <path d="M-20 -8 L20 -8" stroke="${p.trim}" stroke-width="3.2" opacity="1"/>
       <path d="M0 -44 L0 -22" stroke="${p.trim}" stroke-width="2.2" opacity="0.9"/>
       <path d="M0 -44 Q${plume === 0 ? -18 : 18} ${-56 - plume * 4} ${plume === 1 ? 0 : plume === 0 ? -26 : 26} -50"
             fill="none" stroke="${p.trim}" stroke-width="3.6" stroke-linecap="round" opacity="1"/>`;

  let weapon = '';
  if (variant === 0 || variant === 3) {
    // 长刀斜扛
    weapon = `<path d="M-64 128 L52 -66" stroke="${p.ink}" stroke-width="6" stroke-linecap="round"/>
              <path d="M52 -66 Q72 -78 66 -52 L48 -54 Z" fill="${p.trim}" opacity="0.92"/>
              <path d="M-64 128 L52 -66" stroke="${p.trim}" stroke-width="1.4" opacity="0.5"/>`;
  } else if (variant === 1) {
    // 羽扇
    weapon = `<path d="M42 116 L54 44" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/>
              <path d="M54 44 C18 40 22 -6 54 -8 C86 -6 90 40 54 44 Z" fill="${p.trim}" opacity="0.85"/>
              <path d="M54 44 L54 -6 M54 44 L32 -2 M54 44 L76 -2" stroke="${p.robeDark}" stroke-width="1.3" opacity="0.65"/>`;
  } else if (variant === 2) {
    // 长枪竖立
    weapon = `<path d="M62 138 L62 -84" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/>
              <path d="M62 -84 L54 -60 L70 -60 Z" fill="${p.trim}" opacity="0.92"/>
              <path d="M54 -58 L70 -58" stroke="${p.trim}" stroke-width="2" opacity="0.8"/>
              <path d="M62 -44 Q78 -38 74 -24" fill="none" stroke="${p.trim}" stroke-width="2.6" opacity="0.7"/>`;
  } else if (variant === 4) {
    // 弓
    weapon = `<path d="M-62 -60 Q-94 34 -62 128" fill="none" stroke="${p.ink}" stroke-width="6"/>
              <path d="M-62 -60 L-62 128" stroke="${p.trim}" stroke-width="1.4" opacity="0.8"/>
              <path d="M-62 34 L-30 34" stroke="${p.trim}" stroke-width="2" opacity="0.7"/>`;
  } else {
    // 执卷/令旗
    weapon = `<path d="M46 128 L46 -28" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/>
              <path d="M46 -28 L88 -22 L82 12 L46 6 Z" fill="${p.trim}" opacity="0.82"/>
              <path d="M52 -18 L78 -14 M52 -6 L76 -2" stroke="${p.robeDark}" stroke-width="1.6" opacity="0.6"/>`;
  }

  return `<g transform="translate(120,176)">${cape}${body}${shoulders}${head}${weapon}</g>`;
}

function verticalName(name: string, color: string, opacity: number): string {
  const chars = [...name].slice(0, 4);
  return chars
    .map((ch, i) => {
      const y = 58 + i * 40;
      return `<text x="205" y="${y}" text-anchor="middle" font-size="34" font-family="KaiTi,STKaiti,SimSun,serif"
        fill="${color}" opacity="${opacity}">${ch}</text>`;
    })
    .join('');
}

function buildSvg(hero: HeroData, hidden: boolean): string {
  const h = hash(hero.id);
  const p = hidden ? HIDDEN_PALETTE : PALETTES[hero.faction];
  const sunX = 62 + ((h >> 5) % 90);
  const sunY = 66 + ((h >> 9) % 26);
  const hillSeedA = h ^ 0x5f3a;
  const hillSeedB = h ^ 0x1c77;
  const name = hidden ? '暗将' : hero.name;
  const sealChar = hidden ? '?' : { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }[hero.faction];
  const motif = pick([0, 1, 2, 3], (h >> 12) % 4);

  // 云纹 / 星点
  const clouds = `
    <path d="M-10 ${118 + motif * 6} Q40 ${104 + motif * 4} 92 ${118 + motif * 6} T194 ${112 + motif * 6}"
          fill="none" stroke="${p.trim}" stroke-width="1.6" opacity="0.24"/>
    <path d="M18 ${140 + motif * 5} Q70 ${128 + motif * 4} 122 ${140 + motif * 5} T230 ${134 + motif * 5}"
          fill="none" stroke="${p.trim}" stroke-width="1.2" opacity="0.16"/>`;
  const stars = Array.from({ length: 9 }, (_, i) => {
    const x = 16 + ((h >> (i + 2)) % 210);
    const y = 12 + ((h >> (i + 7)) % 92);
    const r = i % 3 === 0 ? 1.7 : 1;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.trim}" opacity="0.5"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="240" height="320">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${p.skyTop}"/><stop offset="1" stop-color="${p.skyBottom}"/>
    </linearGradient>
    <radialGradient id="sun"><stop offset="0" stop-color="${p.sun}" stop-opacity="0.9"/>
      <stop offset="0.62" stop-color="${p.sun}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="${p.sun}" stop-opacity="0.62"/>
      <stop offset="0.5" stop-color="${p.sun}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.ink}" stop-opacity="0"/>
      <stop offset="0.58" stop-color="${p.ink}" stop-opacity="0.02"/>
      <stop offset="1" stop-color="${p.ink}" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="240" height="320" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="82" fill="url(#sun)"/>
  <circle cx="${sunX}" cy="${sunY}" r="30" fill="${p.sun}" opacity="0.34"/>
  ${stars}
  ${hills(hillSeedA, 176, 42, p.hillFar, 0.44)}
  ${clouds}
  ${hills(hillSeedB, 214, 34, p.hillNear, 0.7)}
  <ellipse cx="120" cy="166" rx="104" ry="96" fill="url(#halo)"/>
  ${figure(h, p)}
  <rect width="240" height="320" fill="url(#fade)"/>
  ${verticalName(name, p.trim, hidden ? 0.3 : 0.44)}
  <g transform="translate(18,268)">
    <rect x="0" y="0" width="30" height="30" rx="4" fill="${p.seal}" stroke="${p.sealText}" stroke-width="1.2" stroke-opacity="0.65"/>
    <text x="15" y="22" text-anchor="middle" font-size="19" font-family="KaiTi,STKaiti,SimSun,serif" fill="${p.sealText}">${sealChar}</text>
  </g>
  <rect x="3" y="3" width="234" height="314" rx="7" fill="none" stroke="${p.trim}" stroke-width="1.5" stroke-opacity="0.5"/>
  <rect x="8" y="8" width="224" height="304" rx="5" fill="none" stroke="${p.trim}" stroke-width="0.7" stroke-opacity="0.22"/>
  <path d="M3 26 L3 3 L26 3 M214 3 L237 3 L237 26 M3 294 L3 317 L26 317 M214 317 L237 317 L237 294"
        fill="none" stroke="${p.trim}" stroke-width="2.2" stroke-opacity="0.75"/>
</svg>`;
}

const cache = new Map<string, string>();

/** 生成内置牌面 SVG 的 data URL */
export function builtinPortrait(heroId: string | undefined, hidden = false): string {
  const key = `${heroId ?? '_'}|${hidden ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const hero = heroId ? HERO_MAP.get(heroId) : undefined;
  const data: HeroData = hero ?? {
    id: heroId ?? 'unknown', name: '无名', faction: 'qun', gender: 'male',
    hp: 3, title: '', skillIds: [],
  };
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSvg(data, hidden))}`;
  cache.set(key, url);
  return url;
}

/**
 * 座位/图鉴用的立绘地址：选中皮肤优先（含「默认」内置图），
 * 都没有时用程序生成的牌面。暗将（国战未明置）强制用暗面。
 */
export function portraitFor(heroId: string | undefined, hidden = false): string {
  if (!hidden) {
    const skin = heroSkinUrl(heroId);
    if (skin) return skin;
  }
  return builtinPortrait(heroId, hidden);
}
