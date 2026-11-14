import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore } from '../store';

function seedPreGame() {
  useGameStore.setState({
    preGame: {
      count: 3,
      rules: { mode: 'landlord' },
      candidates: ['liubei'],
      bots: [
        { name: '电脑甲', heroId: 'caocao' },
        { name: '电脑乙', heroId: 'sunquan' },
      ],
      roles: ['rebel', 'rebel', 'rebel'],
      lordIndex: -1,
      firstPlayer: 0,
      lordHeroId: null,
      bid: { highest: 0, highestBidder: -1, bids: [null, null, null], done: false },
    },
    version: 1,
  });
}

describe('斗地主叫分', () => {
  beforeEach(() => {
    seedPreGame();
  });

  it('叫 3 分立即成为地主', () => {
    useGameStore.getState().bidLocal(3);
    const preGame = useGameStore.getState().preGame!;
    expect(preGame.bid?.done).toBe(true);
    expect(preGame.lordIndex).toBe(0);
    expect(preGame.roles[0]).toBe('lord');
    expect(preGame.bid?.highest).toBe(3);
  });

});
