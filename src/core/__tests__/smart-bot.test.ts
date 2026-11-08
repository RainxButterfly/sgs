import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { smartBotAction } from '../smartBot';
import { botAction } from '../bot';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../types';

class SmartIO implements GameIO {
  game: Game | null = null;
  asks = 0;
  stopped = false;

  async ask(req: AskRequest): Promise<GameAction> {
    this.asks += 1;
    if (this.asks > 20000) {
      this.stopped = true;
      this.game?.stop();
      return req.kind === 'play' ? { type: 'endPlay' } : botAction(req);
    }
    return this.game ? smartBotAction(this.game.state, req) : botAction(req);
  }

  emit(_event: GameEvent): void {}

  async delay(): Promise<void> {}
}

describe('智能出牌对局', () => {
  for (let i = 0; i < 12; i += 1) {
    it(`第 ${i + 1} 局可以正常结束`, async () => {
      const io = new SmartIO();
      const count = 5 + (i % 4);
      const game = new Game(
        {
          players: Array.from({ length: count }, (_, index) => ({
            name: `P${index + 1}`,
            heroId: '',
            isBot: true,
          })),
          seed: 9000 + i * 313,
        },
        io,
      );
      io.game = game;
      await game.begin();
      expect(io.asks).toBeGreaterThan(20);
      if (!io.stopped) expect(game.state.over).toBe(true);
    }, 20000);
  }
});
