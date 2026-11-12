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

describe('卡牌单选', () => {
  beforeEach(() => {
    useGameStore.setState({
      humanId: 0,
      pending: {
        id: 2,
        playerId: 0,
        kind: 'play',
        prompt: '出牌阶段',
        canEnd: true,
        cardOptions: [
          { cardId: 'a', as: '杀', validTargets: [1], targetMin: 1, targetMax: 1 },
          { cardId: 'b', as: '桃', validTargets: [], targetMin: 0, targetMax: 0 },
        ],
      },
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
    });
  });

  it('选中第二张手牌时替换第一张，再点同一张取消', () => {
    const store = useGameStore.getState();
    store.selectCard('a');
    expect(useGameStore.getState().selected?.cardId).toBe('a');

    store.selectCard('b');
    expect(useGameStore.getState().selected?.cardId).toBe('b');

    store.selectCard('b');
    expect(useGameStore.getState().selected).toBeNull();
  });

  it('单选目标：点第二个角色应替换第一个（锦囊换目标）', () => {
    useGameStore.setState({
      humanId: 0,
      pending: {
        id: 9,
        playerId: 0,
        kind: 'play',
        prompt: '出牌阶段',
        canEnd: true,
        cardOptions: [
          { cardId: 'ss', as: '顺手牵羊', validTargets: [1, 2, 3], targetMin: 1, targetMax: 1 },
        ],
      },
      selected: { cardId: 'ss', as: '顺手牵羊' },
      selectedTargets: [],
      asChooser: null,
    });
    const store = useGameStore.getState();
    store.seatClick(1);
    expect(useGameStore.getState().selectedTargets).toEqual([1]);
    store.seatClick(2);
    expect(useGameStore.getState().selectedTargets).toEqual([2]);
    store.seatClick(3);
    expect(useGameStore.getState().selectedTargets).toEqual([3]);
  });

  it('单选弹窗点击另一张牌时替换选择', () => {
    useGameStore.setState({
      pending: {
        id: 3,
        playerId: 0,
        kind: 'chooseCards',
        prompt: '弃置一张牌',
        min: 1,
        max: 1,
        cards: [{ id: 'a' } as never, { id: 'b' } as never],
      },
    });
    const store = useGameStore.getState();
    store.toggleCardChoice('a');
    expect(useGameStore.getState().cardChoices).toEqual(['a']);

    store.toggleCardChoice('b');
    expect(useGameStore.getState().cardChoices).toEqual(['b']);

    store.toggleCardChoice('b');
    expect(useGameStore.getState().cardChoices).toEqual([]);
  });

  it('两段式目标：点另一个第一段目标应替换（借刀杀人换持刀者）', () => {
    useGameStore.setState({
      humanId: 0,
      pending: {
        id: 10,
        playerId: 0,
        kind: 'play',
        prompt: '出牌阶段',
        canEnd: true,
        cardOptions: [
          {
            cardId: 'jd2',
            as: '借刀杀人',
            validTargets: [1, 4],
            targetMin: 2,
            targetMax: 2,
            targetAfter: { 1: [2, 3], 4: [5] },
          },
        ],
      },
      selected: { cardId: 'jd2', as: '借刀杀人' },
      selectedTargets: [],
      asChooser: null,
    });
    const store = useGameStore.getState();
    store.seatClick(1);
    expect(useGameStore.getState().selectedTargets).toEqual([1]);
    // 换成另一个持刀者 4
    store.seatClick(4);
    expect(useGameStore.getState().selectedTargets).toEqual([4]);
  });
});
