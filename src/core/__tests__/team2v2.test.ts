import { describe, expect, it } from 'vitest';
import { SimIO } from '../bot';
import { Game } from '../game';

type Setup = ConstructorParameters<typeof Game>[0];

function makeGame(overrides: Partial<Setup> = {}) {
  const io = new SimIO();
  const game = new Game(
    {
      players: Array.from({ length: 4 }, (_, idx) => ({
        name: `P${idx + 1}`,
        heroId: '',
        isBot: true,
      })),
      seed: 20260222,
      rules: { mode: '2v2' },
      ...overrides,
    },
    io,
  );
  return { game, io };
}

describe('2v2 竞技模式', () => {
  it('队伍按座次固定：1、4号位一队，2、3号位一队', () => {
    const { game } = makeGame();
    expect(game.state.players.map((p) => p.role)).toEqual(['loyalist', 'rebel', 'rebel', 'loyalist']);
  });

  it('需要恰好 4 名玩家', () => {
    expect(() =>
      makeGame({
        players: Array.from({ length: 3 }, (_, i) => ({ name: `P${i + 1}`, heroId: '', isBot: true })),
      }),
    ).toThrow();
  });

  it('4号位开局手牌为 5 张，其余为 4 张', () => {
    const { game } = makeGame();
    expect(game.state.players.map((p) => p.hand.length)).toEqual([4, 4, 4, 5]);
  });

  it('1号位首回合摸牌阶段只摸一张牌', async () => {
    const { game } = makeGame();
    const p0 = game.state.players[0];
    const before = p0.hand.length;
    game.state.turn = 1; // runTurn 进入时会先自增到 1
    // @ts-expect-error 测试中访问私有方法
    await game.drawPhase(p0);
    expect(p0.hand.length).toBe(before + 1);
    expect(game['team2v2FirstDrawUsed']).toBe(true);

    // 第二回合恢复正常摸牌数量
    game.state.turn += 1;
    // @ts-expect-error 测试中访问私有方法
    await game.drawPhase(p0);
    expect(p0.hand.length).toBe(before + 3);
  });

  it('随机对局可以正常结束且胜负为整队', async () => {
    const { game, io } = makeGame();
    io.onLimit = () => game.stop();
    await game.begin();
    if (game.state.over) {
      expect(['loyalist', 'rebel', 'draw']).toContain(game.state.winner);
    } else {
      expect(io.stopped).toBe(true);
    }
  }, 30000);

  it('一队全灭时另一队获胜', () => {
    const { game } = makeGame();
    const players = game.state.players;
    for (const idx of [1, 2]) {
      players[idx].hp = 0;
      players[idx].alive = false;
    }
    // @ts-expect-error 测试中访问私有方法
    game.checkWin();
    expect(game.state.over).toBe(true);
    expect(game.state.winner).toBe('loyalist');
  });
});
