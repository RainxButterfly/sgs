import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { SimIO } from '../bot';
import type { AskRequest, Card, GameAction, GameEvent } from '../types';

class HarvestIO extends SimIO {
  private injected = false;
  private gameRef: { game?: Game } = {};

  bind(game: Game): void {
    this.gameRef.game = game;
  }

  async ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'play' && req.playerId === 0 && !this.injected) {
      const game = this.gameRef.game;
      if (!game) return super.ask(req);
      const card: Card = {
        id: 'test-wugu',
        name: '五谷丰登',
        suit: 'heart',
        rank: 3,
        type: 'trick',
      };
      game.state.players[0].hand.push(card);
      this.injected = true;
      return { type: 'useCard', cardId: card.id, as: '五谷丰登', targets: [] };
    }
    if (req.kind === 'chooseCards' && req.prompt.startsWith('五谷')) {
      return { type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] };
    }
    return super.ask(req);
  }

  emit(ev: GameEvent): void {
    super.emit(ev);
    if (ev.type === 'harvest' && ev.done) this.gameRef.game?.stop();
  }
}

describe('五谷丰登结算事件', () => {
  it('每名角色选择后更新归属，结束后给出完整结果', async () => {
    const io = new HarvestIO();
    const game = new Game(
      {
        players: [
          { name: 'P1', heroId: '', isBot: false },
          { name: 'P2', heroId: '', isBot: false },
        ],
        seed: 20261109,
        rules: { mode: 'duel' },
      },
      io,
    );
    io.bind(game);
    await game.begin();

    const harvests = io.events.filter(
      (event): event is Extract<GameEvent, { type: 'harvest' }> => event.type === 'harvest',
    );
    expect(harvests.length).toBeGreaterThan(0);
    const first = harvests[0];
    expect(first.cards).toHaveLength(2);
    expect(first.picks).toHaveLength(0);

    const done = [...harvests].reverse().find((event) => event.done);
    expect(done).toBeTruthy();
    expect(done?.picks).toHaveLength(2);
    expect(new Set(done?.picks.map((pick) => pick.playerId)).size).toBe(2);
    for (const pick of done?.picks ?? []) {
      expect(first.cards.some((card) => card.id === pick.card.id)).toBe(true);
    }
    expect(new Set(done?.picks.map((pick) => pick.card.id)).size).toBe(2);
  });
});
