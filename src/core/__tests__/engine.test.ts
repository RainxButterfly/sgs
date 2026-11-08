import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { SimIO } from '../bot';
import { buildStandardDeck, HEROES } from '../deck';

describe('标准牌堆', () => {
  it('包含 108 张牌且花色点数合法', () => {
    const deck = buildStandardDeck();
    expect(deck).toHaveLength(108);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(108);
    for (const card of deck) {
      expect(['spade', 'heart', 'club', 'diamond']).toContain(card.suit);
      expect(card.rank).toBeGreaterThanOrEqual(1);
      expect(card.rank).toBeLessThanOrEqual(13);
    }
  });

  it('武将库包含标准包与扩展武将且不重复', () => {
    expect(HEROES.length).toBeGreaterThanOrEqual(42);
    expect(new Set(HEROES.map((hero) => hero.id)).size).toBe(HEROES.length);
  });
});

describe('引擎随机对局', () => {
  const counts = [5, 6, 7, 8];

  for (let i = 0; i < 24; i += 1) {
    it(`第 ${i + 1} 局可以正常结束`, async () => {
      const count = counts[i % counts.length];
      const io = new SimIO();
      const setup = {
        players: Array.from({ length: count }, (_, idx) => ({
          name: `P${idx + 1}`,
          heroId: '',
          isBot: true,
        })),
        seed: 1000 + i * 7919,
      };
      const game = new Game(setup, io);
      io.onLimit = () => game.stop();
      await game.begin();
      expect(game.state.players.length).toBe(count);
      expect(game.state.log.length).toBeGreaterThan(5);
      expect(io.asks).toBeGreaterThan(10);
      if (!io.stopped) expect(game.state.over).toBe(true);
    }, 20000);
  }
});
