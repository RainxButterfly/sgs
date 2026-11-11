import { describe, expect, it, vi } from 'vitest';
import { Game } from '../game';
import type { GameEvent, GameIO } from '../types';

function setup() {
  const events: GameEvent[] = [];
  const delay = vi.fn(async () => undefined);
  const ask = vi.fn(async (_request: unknown) => ({ type: 'cancel' as const }));
  const io: GameIO = {
    emit: (event) => events.push(event),
    ask,
    delay,
  };
  const game = new Game(
    {
      players: [
        { name: '玩家', heroId: '', isBot: false },
        { name: '电脑', heroId: '', isBot: true },
      ],
      seed: 1,
      rules: { skillsEnabled: false },
    },
    io,
  );
  return { game, events, delay, ask, player: game.state.players[0] };
}

describe('普通响应窗口', () => {
  it('无牌且无相关技能时跳过响应计时', async () => {
    const { game, events, delay, player } = setup();
    player.hand = [];
    const result = await (game as unknown as {
      askRespond: (
        player: unknown,
        name: string,
        opts: { prompt: string },
      ) => Promise<unknown>;
    }).askRespond(player, '闪', { prompt: '请打出一张闪' });
    expect(result).toBeNull();
    expect(
      events.some((event) => event.type === 'responseWindow' && event.name === '闪'),
    ).toBe(false);
    expect(delay).not.toHaveBeenCalled();
  });

  it('有牌但无匹配时仍保留计时防止信息泄露', async () => {
    const { game, events, delay, player } = setup();
    player.hand = [{ id: 'sha', name: '杀', suit: 'spade', rank: 7, type: 'basic' }];
    const result = await (game as unknown as {
      askRespond: (
        player: unknown,
        name: string,
        opts: { prompt: string },
      ) => Promise<unknown>;
    }).askRespond(player, '闪', { prompt: '请打出一张闪' });
    expect(result).toBeNull();
    expect(
      events.some((event) => event.type === 'responseWindow' && event.name === '闪'),
    ).toBe(true);
    expect(delay).toHaveBeenCalled();
  });

  it('响应窗口覆盖人类玩家的响应超时', async () => {
    const { game, ask, player } = setup();
    player.hand = [
      { id: 'shan', name: '闪', suit: 'heart', rank: 2, type: 'basic' },
    ];
    await (game as unknown as {
      askRespond: (
        player: unknown,
        name: string,
        opts: { prompt: string },
      ) => Promise<unknown>;
    }).askRespond(player, '闪', { prompt: '请打出一张闪' });
    expect(ask).toHaveBeenCalled();
    const request = ask.mock.calls[0]?.[0] as { timeout?: number } | undefined;
    expect(request?.timeout).toBe(12000);
  });
});
