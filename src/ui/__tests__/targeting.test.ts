import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore } from '../store';

describe('借刀杀人两段式选目标', () => {
  beforeEach(() => {
    useGameStore.setState({
      humanId: 0,
      pending: {
        id: 1,
        playerId: 0,
        kind: 'play',
        prompt: '出牌阶段',
        canEnd: true,
        cardOptions: [
          {
            cardId: 'jd',
            as: '借刀杀人',
            validTargets: [1],
            targetMin: 2,
            targetMax: 2,
            targetAfter: { 1: [2, 3] },
          },
        ],
      },
      selected: { cardId: 'jd', as: '借刀杀人' },
      selectedTargets: [],
      asChooser: null,
    });
  });

  it('先选持武器角色，再选其攻击范围内的目标', () => {
    const store = useGameStore.getState();
    store.seatClick(2);
    expect(useGameStore.getState().selectedTargets).toEqual([]);

    store.seatClick(1);
    expect(useGameStore.getState().selectedTargets).toEqual([1]);

    store.seatClick(3);
    expect(useGameStore.getState().selectedTargets).toEqual([1, 3]);

    store.seatClick(2);
    expect(useGameStore.getState().selectedTargets).toEqual([1, 3]);

    store.seatClick(3);
    expect(useGameStore.getState().selectedTargets).toEqual([1]);

    store.seatClick(1);
    expect(useGameStore.getState().selectedTargets).toEqual([]);
  });
});
