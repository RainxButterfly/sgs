import type { Faction, LogEntry, Role } from '../core/types';
import { scheduleDataSnapshot } from './dataStorage';

export interface MatchPlayerRecord {
  name: string;
  heroId: string;
  heroName: string;
  faction: Faction;
  role: Role;
  isBot: boolean;
  alive: boolean;
  level?: number;
}

export interface MatchRecord {
  id: string;
  dateKey: string;
  playedAt: string;
  mode: 'identity' | 'duel' | 'landlord' | 'guozhan' | '2v2';
  modeLabel: string;
  playerCount: number;
  result: 'win' | 'lose' | 'draw';
  winner: string;
  humanHeroName: string;
  firstPlayerName: string;
  players: MatchPlayerRecord[];
  log: LogEntry[];
  profileCounted?: boolean;
}

export interface HistoryGroup {
  key: string;
  name: string;
  matches: MatchRecord[];
}

const STORAGE_KEY = 'sgs-match-history-v1';
const MAX_MATCHES = 80;

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sortGroups(groups: HistoryGroup[]): HistoryGroup[] {
  return groups
    .filter((group) => group && typeof group.key === 'string' && Array.isArray(group.matches))
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({
      ...group,
      matches: [...group.matches].sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
    }));
}

export function loadHistory(): HistoryGroup[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryGroup[];
    return Array.isArray(parsed) ? sortGroups(parsed) : [];
  } catch {
    return [];
  }
}

function saveHistory(groups: HistoryGroup[]): void {
  try {
    const trimmed = sortGroups(groups).slice(0, 24);
    let total = 0;
    for (const group of trimmed) {
      group.matches = group.matches.slice(0, 20);
      total += group.matches.length;
    }
    if (total > MAX_MATCHES) {
      let remaining = total - MAX_MATCHES;
      for (let i = trimmed.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const drop = Math.min(remaining, trimmed[i].matches.length);
        trimmed[i].matches.splice(-drop, drop);
        remaining -= drop;
        if (trimmed[i].matches.length === 0) {
          trimmed.splice(i, 1);
        }
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    scheduleDataSnapshot();
  } catch {
    // 存储空间不足时保留已有记录
  }
}

export function addMatchRecord(record: MatchRecord): HistoryGroup[] {
  const groups = loadHistory();
  let group = groups.find((item) => item.key === record.dateKey);
  if (!group) {
    group = { key: record.dateKey, name: record.dateKey, matches: [] };
    groups.unshift(group);
  }
  group.matches.unshift({ ...record, profileCounted: true, log: record.log.slice(-400) });
  saveHistory(groups);
  return loadHistory();
}

export function markHistoryProfileCounted(): void {
  const groups = loadHistory();
  for (const group of groups) {
    for (const match of group.matches) match.profileCounted = true;
  }
  saveHistory(groups);
}

export function renameHistoryGroup(key: string, name: string): HistoryGroup[] {
  const groups = loadHistory();
  const group = groups.find((item) => item.key === key);
  if (!group) return groups;
  group.name = name.trim() || key;
  saveHistory(groups);
  return loadHistory();
}

export function formatHistoryTime(playedAt: string): string {
  const date = new Date(playedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
