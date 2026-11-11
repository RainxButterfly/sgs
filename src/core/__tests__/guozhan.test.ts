import { describe, expect, it } from 'vitest';
import { HERO_MAP, PLAYABLE_HEROES } from '../deck';
import { planBotFactions, takeFactionPair } from '../guozhan';
import type { Faction } from '../types';

const FACTIONS: Faction[] = ['wei', 'shu', 'wu', 'qun'];

function countsOf(factions: Faction[]): Map<Faction, number> {
  const counts = new Map<Faction, number>();
  for (const faction of factions) counts.set(faction, (counts.get(faction) ?? 0) + 1);
  return counts;
}

describe('武将势力核对', () => {
  it('孟获与祝融属于蜀，庞德属于群', () => {
    expect(HERO_MAP.get('menghuo')?.faction).toBe('shu');
    expect(HERO_MAP.get('zhurong')?.faction).toBe('shu');
    expect(HERO_MAP.get('pangde')?.faction).toBe('qun');
  });
});

describe('国战电脑势力配额', () => {
  it('人类落单势力优先补队友，整体尽量不出现孤势力', () => {
    for (let round = 0; round < 300; round += 1) {
      const total = 4 + Math.floor(Math.random() * 5);
      const humanCount = 1 + Math.floor(Math.random() * Math.min(3, total - 2));
      const humans: Faction[] = Array.from({ length: humanCount }, () =>
        FACTIONS[Math.floor(Math.random() * FACTIONS.length)],
      );
      const bots = planBotFactions(total, humans);
      expect(bots).toHaveLength(total - humanCount);
      const counts = countsOf([...humans, ...bots]);
      const singletons = [...counts.values()].filter((count) => count === 1).length;
      expect(singletons).toBeLessThanOrEqual(1);
      const humanCounts = countsOf(humans);
      const singletonHumans = [...humanCounts.values()].filter((count) => count === 1).length;
      if (total - humanCount >= singletonHumans) {
        for (const [faction, count] of humanCounts) {
          if (count === 1) expect(counts.get(faction)).toBeGreaterThanOrEqual(2);
        }
      }
      const forced = [...humanCounts.values()].some((count) => count > Math.floor(total / 2));
      if (!forced) {
        for (const count of counts.values()) {
          expect(count).toBeLessThanOrEqual(Math.max(2, Math.floor(total / 2)));
        }
      }
    }
  });

  it('四人局人类单选任何势力都有一名电脑队友', () => {
    for (const faction of FACTIONS) {
      for (let round = 0; round < 30; round += 1) {
        const bots = planBotFactions(4, [faction]);
        expect(bots).toHaveLength(3);
        expect(bots.filter((item) => item === faction)).toHaveLength(1);
      }
    }
  });
});

describe('同势力双将抽取', () => {
  it('抽出的两名武将势力相同且从候选池移除', () => {
    const available = new Set(PLAYABLE_HEROES.map((hero) => hero.id));
    for (let i = 0; i < 10; i += 1) {
      const pair = takeFactionPair(available);
      expect(pair).toBeTruthy();
      if (!pair) continue;
      expect(HERO_MAP.get(pair.primary)?.faction).toBe(HERO_MAP.get(pair.secondary)?.faction);
      expect(available.has(pair.primary)).toBe(false);
      expect(available.has(pair.secondary)).toBe(false);
    }
  });

  it('优先指定势力，数量不足时退回其他势力', () => {
    const weiIds = PLAYABLE_HEROES.filter((hero) => hero.faction === 'wei').map((hero) => hero.id);
    const available = new Set(weiIds.slice(0, 2));
    const pair = takeFactionPair(available, 'wei');
    expect(pair).toBeTruthy();
    expect(HERO_MAP.get(pair!.primary)?.faction).toBe('wei');
    expect(takeFactionPair(available, 'wei')).toBeNull();

    const mixed = new Set(PLAYABLE_HEROES.map((hero) => hero.id));
    const shuCount = PLAYABLE_HEROES.filter((hero) => hero.faction === 'shu').length;
    for (let i = 0; i < Math.floor(shuCount / 2); i += 1) {
      const preferred = takeFactionPair(mixed, 'shu');
      expect(preferred).toBeTruthy();
      expect(HERO_MAP.get(preferred!.primary)?.faction).toBe('shu');
    }
    const fallback = takeFactionPair(mixed, 'shu');
    if (fallback) expect(HERO_MAP.get(fallback.primary)?.faction).not.toBe('shu');
  });
});