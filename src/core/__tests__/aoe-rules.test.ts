import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { SimIO } from '../bot';
import type { AoeEntry, Card, GameEvent } from '../types';

function fakeCard(name: string, suit: Card['suit'] = 'spade', rank = 1): Card {
  return { id: `test-${name}-${suit}-${rank}`, name, suit, rank, type: 'trick' };
}

function makeGame(io: SimIO, count = 5) {
  return new Game(
    {
      players: Array.from({ length: count }, (_, index) => ({
        name: `P${index + 1}`,
        heroId: '',
        isBot: true,
      })),
      seed: 20261110,
      rules: { skillsEnabled: false },
    },
    io,
  );
}

type TestGame = {
  resolveAoe: (user: unknown, card: Card, responseName: '杀' | '闪') => Promise<void>;
  judgeResult: (card: Card, reason: string) => boolean;
  resetTurnFlags: (player: unknown) => void;
};

describe('群体锦囊规则', () => {
  it('南蛮入侵从使用者下家开始，按座次依次结算', async () => {
    const io = new SimIO();
    const game = makeGame(io);
    const testGame = game as unknown as TestGame;
    game.state.current = 2;
    for (const player of game.state.players) player.hand = [];
    game.state.players[3].hand.push(fakeCard('杀', 'club', 7));
    game.state.players[0].hand.push(fakeCard('杀', 'spade', 8));
    await testGame.resolveAoe(game.state.players[2], fakeCard('南蛮入侵', 'spade', 7), '杀');

    const events = io.events.filter(
      (event): event is Extract<GameEvent, { type: 'aoe' }> => event.type === 'aoe',
    );
    expect(events.length).toBeGreaterThan(0);
    const done = events[events.length - 1];
    expect(done.done).toBe(true);
    expect(done.entries.map((entry) => entry.playerId)).toEqual([3, 4, 0, 1]);
    const byPlayer = new Map(done.entries.map((entry) => [entry.playerId, entry] as [number, AoeEntry]));
    expect(byPlayer.get(3)?.result).toBe('answered');
    expect(byPlayer.get(0)?.result).toBe('answered');
    expect(byPlayer.get(4)?.result).toBe('damage');
    expect(byPlayer.get(1)?.result).toBe('damage');
  });
});

describe('判定与铁索状态', () => {
  it('乐不思蜀和兵粮寸断的判定成功含义正确', () => {
    const game = makeGame(new SimIO());
    const testGame = game as unknown as TestGame;
    expect(testGame.judgeResult(fakeCard('杀', 'heart', 5), '乐不思蜀')).toBe(false);
    expect(testGame.judgeResult(fakeCard('杀', 'spade', 5), '乐不思蜀')).toBe(true);
    expect(testGame.judgeResult(fakeCard('杀', 'club', 5), '兵粮寸断')).toBe(false);
    expect(testGame.judgeResult(fakeCard('杀', 'diamond', 5), '兵粮寸断')).toBe(true);
  });

  it('铁索连环只在属性伤害时解除，普通伤害不会清空横置', async () => {
    const game = makeGame(new SimIO(), 4);
    const [a, b] = game.state.players;
    a.chained = true;
    b.chained = true;
    await game.damage(null, a, 1, fakeCard('杀', 'spade', 7), '普通伤害');
    expect(a.chained).toBe(true);
    expect(b.chained).toBe(true);
    await game.damage(null, a, 1, fakeCard('火杀', 'heart', 7), '火焰伤害', 'fire');
    expect(a.chained).toBe(false);
    expect(b.chained).toBe(false);
  });

  it('一次性限定技标记跨回合保留，回合内标记正常清理', () => {
    const game = makeGame(new SimIO(), 4);
    const testGame = game as unknown as TestGame;
    const player = game.state.players[0];
    player.flags = { niepan: 1, luanwu: 1, jiu: 1, tianyi: 1 };
    testGame.resetTurnFlags(player);
    expect(player.flags.niepan).toBe(1);
    expect(player.flags.luanwu).toBe(1);
    expect(player.flags.jiu).toBeUndefined();
    expect(player.flags.tianyi).toBeUndefined();
  });
});
