import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class YesIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function card(id: string, suit: Card['suit']): Card {
  return { id, name: '杀', suit, rank: 7, type: 'basic' };
}

describe('孟获再起', () => {
  it('放弃摸牌，亮出已损失体力张数，只保留红桃并回复1点', async () => {
    const game = new Game(
      {
        players: [
          { name: '孟获', heroId: 'menghuo', isBot: false },
          { name: '目标', heroId: 'sunquan', isBot: false },
          { name: '第三人', heroId: 'caocao', isBot: false },
        ],
        seed: 20261117,
        rules: { skillsEnabled: true },
      },
      new YesIO(),
    );
    const player = game.state.players[0];
    game.state.current = 0;
    player.hp = 2;
    player.maxHp = 4;
    player.hand = [];
    game.state.deck = [card('c1', 'spade'), card('c2', 'club'), card('c3', 'heart')];

    const drawPhase = (
      game as unknown as { drawPhase: (player: unknown) => Promise<void> }
    ).drawPhase.bind(game);
    await drawPhase(player);

    expect(player.hp).toBe(3);
    expect(player.hand).toHaveLength(1);
    expect(player.hand[0].suit).toBe('heart');
  });
});
