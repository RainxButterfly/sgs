import { scheduleDataSnapshot } from './dataStorage';
import { loadHistory, markHistoryProfileCounted } from './history';

export type MatchMode = 'identity' | 'duel' | 'landlord' | 'guozhan' | 'custom';
export type MatchResult = 'win' | 'lose' | 'draw';

export interface PlayerProfile {
  name: string;
  level: number;
  xp: number;
  totalGames: number;
  wins: number;
}

export interface XpGain {
  mode: MatchMode;
  result: MatchResult;
  realPlayers: number;
  base: number;
  winBonus: number;
  realBonus: number;
  total: number;
  levelBefore: number;
  levelAfter: number;
  xpBefore: number;
  xpAfter: number;
  levelsGained: number;
}

const STORAGE_KEY = 'sgs-profile-v1';
export const MAX_LEVEL = 99;

const MODE_BASE: Record<MatchMode, number> = {
  identity: 60,
  duel: 35,
  landlord: 45,
  guozhan: 80,
  custom: 40,
};

const MODE_LABEL: Record<MatchMode, string> = {
  identity: '身份场',
  duel: '1v1 单挑',
  landlord: '斗地主',
  guozhan: '国战',
  custom: '自定义',
};

export const DEFAULT_PROFILE: PlayerProfile = {
  name: '星河一叶',
  level: 1,
  xp: 0,
  totalGames: 0,
  wins: 0,
};

export function normalizePlayerName(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 12)
    : DEFAULT_PROFILE.name;
}

export function nameTier(level: number): number {
  if (level >= 60) return 6;
  if (level >= 50) return 5;
  if (level >= 40) return 4;
  if (level >= 30) return 3;
  if (level >= 20) return 2;
  if (level >= 10) return 1;
  return 0;
}

export function nameTierClass(level: number): string {
  return `tier-${nameTier(level)}`;
}

export function nameTierLabel(level: number): string {
  return ['素白', '青竹', '流蓝', '紫电', '鎏金', '赤霞', '星虹'][nameTier(level)];
}

export function modeLabel(mode: MatchMode): string {
  return MODE_LABEL[mode];
}

export function xpForLevel(level: number): number {
  if (level >= MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return 120 + Math.max(0, level - 1) * 80;
}

export function levelTitle(level: number): string {
  if (level >= 60) return '星河传说';
  if (level >= 50) return '天下闻名';
  if (level >= 40) return '名扬四海';
  if (level >= 30) return '威震一方';
  if (level >= 20) return '一方名士';
  if (level >= 15) return '小有名气';
  if (level >= 10) return '略有耳闻';
  if (level >= 5) return '初露锋芒';
  return '初出茅庐';
}

export function normalizeProfile(value: unknown): PlayerProfile {
  const raw = value && typeof value === 'object' ? (value as Partial<PlayerProfile>) : {};
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(raw.level) || 1)));
  const need = xpForLevel(level);
  const xp = Number.isFinite(raw.xp)
    ? Math.max(0, Math.min(Number.isFinite(need) ? need - 1 : 0, Math.round(Number(raw.xp))))
    : 0;
  return {
    name: normalizePlayerName(raw.name),
    level,
    xp,
    totalGames: Math.max(0, Math.round(Number(raw.totalGames) || 0)),
    wins: Math.max(0, Math.round(Number(raw.wins) || 0)),
  };
}

export function loadProfile(): PlayerProfile {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const savedName = localStorage.getItem('sgk-name');
      return normalizeProfile(savedName ? { name: savedName } : {});
    }
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

export function matchXpBreakdown(mode: MatchMode, result: MatchResult, realPlayers: number): Omit<XpGain, 'levelBefore' | 'levelAfter' | 'xpBefore' | 'xpAfter' | 'levelsGained'> {
  const base = MODE_BASE[mode] ?? MODE_BASE.custom;
  const winner = Math.max(1, Math.round(realPlayers || 1));
  const winRate = result === 'win' ? 0.5 : result === 'draw' ? 0.2 : 0;
  const winBonus = Math.round(base * winRate);
  const realMultiplier = Math.min(2, 1 + 0.25 * (winner - 1));
  const realBonus = Math.round((base + winBonus) * (realMultiplier - 1));
  return {
    mode,
    result,
    realPlayers: winner,
    base,
    winBonus,
    realBonus,
    total: base + winBonus + realBonus,
  };
}

export function applyMatchXp(
  profile: PlayerProfile,
  mode: MatchMode,
  result: MatchResult,
  realPlayers: number,
): { profile: PlayerProfile; gain: XpGain } {
  const breakdown = matchXpBreakdown(mode, result, realPlayers);
  let level = profile.level;
  let xp = profile.xp;
  const levelBefore = level;
  const xpBefore = xp;
  xp += breakdown.total;
  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;
  const next: PlayerProfile = {
    name: profile.name,
    level,
    xp,
    totalGames: profile.totalGames + 1,
    wins: profile.wins + (result === 'win' ? 1 : 0),
  };
  saveProfile(next);
  return {
    profile: next,
    gain: {
      ...breakdown,
      levelBefore,
      levelAfter: level,
      xpBefore,
      xpAfter: xp,
      levelsGained: level - levelBefore,
    },
  };
}

export function profileProgress(profile: PlayerProfile): number {
  const need = xpForLevel(profile.level);
  if (!Number.isFinite(need)) return 100;
  return Math.max(0, Math.min(100, Math.round((profile.xp / need) * 100)));
}

const HISTORY_BACKFILL_KEY = 'sgs-history-backfill-v1';

export function backfillProfileFromHistory(profile: PlayerProfile): PlayerProfile {
  try {
    if (localStorage.getItem(HISTORY_BACKFILL_KEY) === '1') return profile;
  } catch {
    return profile;
  }
  const records = loadHistory()
    .flatMap((group) => group.matches)
    .sort((left, right) => left.playedAt.localeCompare(right.playedAt));
  const missingCount = Math.max(0, records.length - profile.totalGames);
  const missing = records.slice(0, missingCount);
  let next = profile;
  for (const record of missing) {
    const realPlayers = record.players.filter((player) => !player.isBot).length;
    next = applyMatchXp(next, record.mode, record.result, realPlayers).profile;
  }
  saveProfile(next);
  markHistoryProfileCounted();
  try {
    localStorage.setItem(HISTORY_BACKFILL_KEY, '1');
  } catch {
    // ignore storage failures
  }
  return next;
}
