import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { SimIO } from '../bot';
import { HERO_MAP } from '../deck';
import { cardLabel } from '../game';
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

describe('兵粮寸断', () => {
  it('视为使用兵粮寸断时，判定区显示兵粮而不是原牌', async () => {
    const game = new Game(
      {
        players: [
          { name: '徐晃', heroId: 'xuhuang', isBot: false },
          { name: 'P2', heroId: '', isBot: false },
        ],
        seed: 20261111,
        rules: { mode: 'duel' },
      },
      new SimIO(),
    );
    const [user, target] = game.state.players;
    user.hand = [];
    target.hand = [];
    const card = fakeCard('雷杀', 'spade', 4);
    card.type = 'basic';
    card.element = 'thunder';
    user.hand.push(card);
    await game.useCard(user, card, '兵粮寸断', [target.id]);
    expect(target.judgeZone).toHaveLength(1);
    expect(target.judgeZone[0].name).toBe('兵粮寸断');
    expect(target.judgeZone[0].type).toBe('delayed');
    expect(cardLabel(target.judgeZone[0])).toContain('兵粮寸断');
  });

  it('火杀转化为乐不思蜀后，判定区和战报显示乐不思蜀而不是火杀', async () => {
    const game = new Game(
      {
        players: [
          { name: '大乔', heroId: 'daqiao', isBot: false },
          { name: 'P2', heroId: '', isBot: false },
        ],
        seed: 20261117,
        rules: { mode: 'duel' },
      },
      new SimIO(),
    );
    const [user, target] = game.state.players;
    user.hand = [];
    target.hand = [];
    const fireSha = fakeCard('杀', 'diamond', 5);
    fireSha.type = 'basic';
    fireSha.element = 'fire';
    user.hand.push(fireSha);
    await game.useCard(user, fireSha, '乐不思蜀', [target.id]);
    expect(target.judgeZone).toHaveLength(1);
    expect(target.judgeZone[0].name).toBe('乐不思蜀');
    expect(target.judgeZone[0].element).toBeUndefined();
    expect(cardLabel(target.judgeZone[0])).toContain('乐不思蜀');
  });

  it('同一角色不能被两张兵粮寸断指定', async () => {
    const game = new Game(
      {
        players: [
          { name: '徐晃', heroId: 'xuhuang', isBot: false },
          { name: 'P2', heroId: '', isBot: false },
        ],
        seed: 20261112,
        rules: { mode: 'duel' },
      },
      new SimIO(),
    );
    const [user, target] = game.state.players;
    user.hand = [];
    target.hand = [];
    target.judgeZone.push({ ...fakeCard('兵粮寸断', 'club', 2), type: 'delayed' });
    const card = fakeCard('杀', 'spade', 9);
    card.type = 'basic';
    user.hand.push(card);
    const options = game.buildPlayOptions(user).filter((option) => option.as === '兵粮寸断');
    expect(options.every((option) => !option.validTargets.includes(target.id))).toBe(true);
  });
});

describe('战报序号', () => {
  it('超过 300 条后仍保持单调递增，不产生重复 id', () => {
    const game = makeGame(new SimIO(), 2);
    for (let i = 0; i < 320; i += 1) game.log(`测试 ${i}`);
    const log = game.state.log;
    expect(log).toHaveLength(300);
    const ids = log.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i += 1) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
  });
});

describe('国战双将', () => {
  it('同势力双将合并体力与技能', () => {
    const game = new Game(
      {
        players: [
          { name: 'P1', heroId: 'guanyu', heroIds: ['guanyu', 'zhangfei'], isBot: false },
          { name: 'P2', heroId: 'caocao', heroIds: ['caocao', 'simayi'], isBot: false },
          { name: 'P3', heroId: 'sunquan', heroIds: ['sunquan', 'zhouyu'], isBot: false },
          { name: 'P4', heroId: 'lvbu', heroIds: ['lvbu', 'diaochan'], isBot: false },
        ],
        seed: 20261113,
        rules: { mode: 'guozhan' },
      },
      new SimIO(),
    );
    const [first, second] = game.state.players;
    expect(first.heroIds).toEqual(['guanyu', 'zhangfei']);
    expect(first.maxHp).toBe(8);
    expect(first.heroName).toContain('关羽');
    expect(first.heroName).toContain('张飞');
    expect(first.skills).toContain('wusheng');
    expect(first.skills).toContain('paoxiao');
    expect(second.faction).toBe('wei');
  });

  it('国战只传一个武将时会自动补同势力副将，且全场不重复', () => {
    const game = new Game(
      {
        players: Array.from({ length: 6 }, (_, index) => ({
          name: `P${index + 1}`,
          heroId: '',
          isBot: true,
        })),
        seed: 20261114,
        rules: { mode: 'guozhan' },
      },
      new SimIO(),
    );
    const ids = game.state.players.flatMap((player) => player.heroIds ?? []);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const player of game.state.players) {
      const [first, second] = player.heroIds ?? [];
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(HERO_MAP.get(first!)?.faction).toBe(HERO_MAP.get(second!)?.faction);
      expect(player.maxHp).toBe((HERO_MAP.get(first!)?.hp ?? 0) + (HERO_MAP.get(second!)?.hp ?? 0));
    }
  });
});
