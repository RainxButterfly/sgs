import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  applyMatchXp,
  backfillProfileFromHistory,
  levelTitle,
  matchXpBreakdown,
  nameTier,
  normalizeProfile,
  profileProgress,
  xpForLevel,
} from '../profile';

describe('等级与经验', () => {
  it('不同模式基础经验不同', () => {
    expect(matchXpBreakdown('guozhan', 'lose', 1).total).toBe(80);
    expect(matchXpBreakdown('identity', 'lose', 1).total).toBe(60);
    expect(matchXpBreakdown('duel', 'lose', 1).total).toBe(35);
    expect(matchXpBreakdown('landlord', 'lose', 1).total).toBe(45);
  });

  it('真人越多经验越高，但不超过两倍', () => {
    const solo = matchXpBreakdown('identity', 'win', 1);
    const two = matchXpBreakdown('identity', 'win', 2);
    const eight = matchXpBreakdown('identity', 'win', 8);
    expect(two.total).toBeGreaterThan(solo.total);
    expect(eight.total).toBeGreaterThan(two.total);
    expect(eight.realBonus).toBe((eight.base + eight.winBonus));
  });

  it('胜利有额外经验，失败只有基础', () => {
    const win = matchXpBreakdown('identity', 'win', 1);
    const lose = matchXpBreakdown('identity', 'lose', 1);
    expect(win.winBonus).toBe(30);
    expect(lose.winBonus).toBe(0);
    expect(win.total).toBeGreaterThan(lose.total);
  });

  it('升级会扣除本级所需经验并支持连续升级', () => {
    const profile = normalizeProfile({ level: 1, xp: xpForLevel(1) - 10, totalGames: 3, wins: 2 });
    const { profile: next, gain } = applyMatchXp(profile, 'guozhan', 'win', 1);
    expect(gain.levelsGained).toBeGreaterThanOrEqual(1);
    expect(gain.levelBefore).toBe(1);
    expect(next.level).toBeGreaterThan(1);
    expect(next.totalGames).toBe(4);
    expect(next.wins).toBe(3);
  });

  it('满级后不再溢出经验', () => {
    const profile = normalizeProfile({ level: MAX_LEVEL, xp: 0, totalGames: 10, wins: 5 });
    const { profile: next } = applyMatchXp(profile, 'identity', 'win', 2);
    expect(next.level).toBe(MAX_LEVEL);
    expect(next.xp).toBe(0);
    expect(profileProgress(next)).toBe(100);
  });

  it('等级称号随等级变化', () => {
    expect(levelTitle(1)).toBe('初出茅庐');
    expect(levelTitle(20)).toBe('一方名士');
    expect(levelTitle(60)).toBe('星河传说');
  });

  it('非法存档会被归一化', () => {
    expect(normalizeProfile({ level: -3, xp: -20, totalGames: 'x', wins: null })).toEqual({
      name: '星河一叶',
      level: 1,
      xp: 0,
      totalGames: 0,
      wins: 0,
    });
  });

  it('昵称会保留并限制长度', () => {
    expect(normalizeProfile({ name: '  星河一叶  ' }).name).toBe('星河一叶');
    expect(normalizeProfile({ name: '一二三四五六七八九十一二三' }).name).toHaveLength(12);
    expect(normalizeProfile({ name: '   ' }).name).toBe('星河一叶');
  });

  it('等级决定昵称颜色档位，60 级解锁星虹', () => {
    expect(nameTier(1)).toBe(0);
    expect(nameTier(10)).toBe(1);
    expect(nameTier(30)).toBe(3);
    expect(nameTier(50)).toBe(5);
    expect(nameTier(60)).toBe(6);
  });
});

describe('历史战绩补算', () => {
  it('把未计入档案的旧对局补进总场次、胜场和经验', () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, String(value)),
        removeItem: (key: string) => memory.delete(key),
        clear: () => memory.clear(),
      },
    });
    localStorage.clear();
    const players = [
      { name: '我', heroId: 'liubei', heroName: '刘备', faction: 'shu', role: 'lord', isBot: false, alive: true },
      { name: '电脑', heroId: 'caocao', heroName: '曹操', faction: 'wei', role: 'rebel', isBot: true, alive: false },
    ];
    localStorage.setItem(
      'sgs-match-history-v1',
      JSON.stringify([
        {
          key: '2026-11-09',
          name: '2026-11-09',
          matches: [
            {
              id: 'old-1',
              dateKey: '2026-11-09',
              playedAt: '2026-11-09T10:00:00.000Z',
              mode: 'identity',
              modeLabel: '身份场',
              playerCount: 2,
              result: 'win',
              winner: 'lord',
              humanHeroName: '刘备',
              firstPlayerName: '我',
              players,
              log: [],
            },
            {
              id: 'old-2',
              dateKey: '2026-11-09',
              playedAt: '2026-11-09T11:00:00.000Z',
              mode: 'duel',
              modeLabel: '1v1 单挑',
              playerCount: 2,
              result: 'lose',
              winner: 'rebel',
              humanHeroName: '刘备',
              firstPlayerName: '我',
              players,
              log: [],
            },
          ],
        },
      ]),
    );
    const profile = normalizeProfile({ name: '我', totalGames: 0, wins: 0 });
    const next = backfillProfileFromHistory(profile);
    expect(next.totalGames).toBe(2);
    expect(next.wins).toBe(1);
    expect(next.level).toBeGreaterThan(1);
    const stored = JSON.parse(localStorage.getItem('sgs-match-history-v1') ?? '[]');
    expect(stored[0].matches.every((match: { profileCounted?: boolean }) => match.profileCounted)).toBe(true);
    localStorage.clear();
  });
});
