import { beforeEach, describe, expect, it } from 'vitest';
import { HERO_MAP } from '../../core/deck';
import { useGameStore } from '../store';

describe('主公将候选', () => {
  beforeEach(() => {
    useGameStore.setState({ game: null, preGame: null });
  });

  it('主公候选比普通玩家多一名，并至少包含两名主公将', () => {
    let sawHumanLord = false;
    for (let round = 0; round < 120; round += 1) {
      useGameStore.getState().prepareLocal(8, { mode: 'identity' });
      const pre = useGameStore.getState().preGame;
      expect(pre).toBeTruthy();
      if (!pre) continue;
      if (pre.roles[0] === 'lord') {
        sawHumanLord = true;
        expect(pre.candidates).toHaveLength(6);
        const lordCount = pre.candidates.filter((id) => !!HERO_MAP.get(id)?.lordSkillId).length;
        expect(lordCount).toBeGreaterThanOrEqual(2);
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
});
