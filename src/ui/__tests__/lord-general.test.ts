import { beforeEach, describe, expect, it } from 'vitest';
import { HERO_MAP, PLAYABLE_HEROES } from '../../core/deck';
import { useGameStore } from '../store';

describe('主公将候选', () => {
  beforeEach(() => {
    useGameStore.setState({ game: null, preGame: null });
  });

  it('主公候选包含全部主公技武将，另加默认 3 名备选', () => {
    const allLordCount = PLAYABLE_HEROES.filter((hero) => hero.lordSkillId).length;
    let sawHumanLord = false;
    for (let round = 0; round < 120; round += 1) {
      useGameStore.getState().prepareLocal(8, { mode: 'identity' });
      const pre = useGameStore.getState().preGame;
      expect(pre).toBeTruthy();
      if (!pre) continue;
      if (pre.roles[0] === 'lord') {
        sawHumanLord = true;
        const lordCount = pre.candidates.filter((id) => !!HERO_MAP.get(id)?.lordSkillId).length;
        expect(lordCount).toBe(allLordCount);
        expect(pre.candidates.length).toBe(allLordCount + 3);
      } else {
        expect(pre.candidates).toHaveLength(5);
      }
      if (pre.lordIndex > 0) {
        const lordHero = HERO_MAP.get(pre.bots[pre.lordIndex - 1].heroId);
        expect(lordHero?.lordSkillId).toBeTruthy();
      }
    }
    expect(sawHumanLord).toBe(true);
  });

  it('主公备选数量可由房主自定义', () => {
    for (let round = 0; round < 60; round += 1) {
      useGameStore.getState().prepareLocal(8, { mode: 'identity', lordBackupCount: 5 });
      const pre = useGameStore.getState().preGame;
      if (pre?.roles[0] === 'lord') {
        const allLordCount = PLAYABLE_HEROES.filter((hero) => hero.lordSkillId).length;
        expect(pre.candidates.length).toBe(allLordCount + 5);
        return;
      }
    }
  });
});
