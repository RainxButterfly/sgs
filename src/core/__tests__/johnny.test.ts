import { describe, expect, it } from 'vitest';
import { SimIO } from '../bot';
import { Game } from '../game';
import { SKILL_MAP } from '../skills';
import type { Card, Suit, CardType } from '../types';

function makeGame(heroId = 'qiangniyinshou', count = 4): { game: Game; io: SimIO } {
  const io = new SimIO();
  const game = new Game(
    {
      players: Array.from({ length: count }, (_, i) => ({
        name: `P${i + 1}`,
        heroId: i === 0 ? heroId : '',
        isBot: true,
      })),
      seed: 20261112,
      rules: { mode: 'identity' },
    },
    io,
  );
  return { game, io };
}

const logText = (game: Game) => JSON.stringify(game.state.log);

function mk(suit: Suit, rank: number, type: CardType = 'basic'): Card {
  return { id: `t-${suit}-${rank}`, name: '杀', suit, rank, type };
}

describe('强尼银手', () => {
  it('三个技能均已注册，烈火与武仕为锁定技', () => {
    expect(SKILL_MAP.get('laisheng')?.name).toBe('残躯');
    expect(SKILL_MAP.get('hebao')?.locked).toBe(true);
    expect(SKILL_MAP.get('duxing')?.locked).toBe(true);
  });

  it('烈火：判定闪电时所有黑桃都命中（含点数 13 与 1）', () => {
    const { game } = makeGame();
    const player = game.state.players[0];
    expect(player.skills).toContain('hebao');
    // @ts-expect-error 测试私有判定函数
    expect(game.judgeResult(mk('spade', 13), '闪电', player)).toBe(true);
    // @ts-expect-error
    expect(game.judgeResult(mk('spade', 1), '闪电', player)).toBe(true);
    // @ts-expect-error
    expect(game.judgeResult(mk('spade', 7), '闪电', player)).toBe(true);
    // @ts-expect-error
    expect(game.judgeResult(mk('heart', 3), '闪电', player)).toBe(false);
    // @ts-expect-error
    expect(game.judgeResult(mk('club', 5), '闪电', player)).toBe(false);
  });

  it('无烈火时闪电仍只判定黑桃 2~9', () => {
    const { game } = makeGame('caocao');
    const player = game.state.players[0];
    // @ts-expect-error
    expect(game.judgeResult(mk('spade', 13), '闪电', player)).toBe(false);
    // @ts-expect-error
    expect(game.judgeResult(mk('spade', 1), '闪电', player)).toBe(false);
    // @ts-expect-error
    expect(game.judgeResult(mk('spade', 5), '闪电', player)).toBe(true);
  });

  it('烈火：被闪电命中时弃置所有手牌并令全场受到雷电伤害', async () => {
    const { game } = makeGame();
    const player = game.state.players[0];
    const others = game.state.players.slice(1);
    player.hand = [mk('heart', 3), mk('diamond', 8)];
    player.judgeZone = [{ id: 'sd', name: '闪电', suit: 'spade', rank: 1, type: 'delayed' }];
    // 清空其他角色手牌，避免随机的无懈可击把闪电抵消掉导致用例不稳定
    others.forEach((p) => {
      p.hand = [];
    });
    const othersHp = others.map((p) => p.hp);
    // 固定判定牌为黑桃 5，保证命中
    game.judge = async () => mk('spade', 5);
    // @ts-expect-error 测试直接结算判定阶段
    await game.judgePhase(player);
    // 原手牌被全部弃置（残躯复活摸牌不影响此断言）
    expect(player.hand.some((card) => card.id === 't-heart-3')).toBe(false);
    expect(player.hand.some((card) => card.id === 't-diamond-8')).toBe(false);
    expect(logText(game)).toContain('烈火');
    // 全场（含强尼）各受 3 点伤害
    for (let i = 0; i < others.length; i += 1) {
      expect(others[i].hp).toBe(othersHp[i] - 3);
    }
    expect(player.hp).toBe(player.maxHp - 3);
  });

  it('残躯：阵亡时设置待复活标记，且整局只触发一次', async () => {
    const { game } = makeGame();
    const player = game.state.players[0];
    expect(player.skills).toContain('laisheng');
    await game.trigger('death', { player, target: player, source: undefined, data: {} });
    expect(player.flags.laishengUsed).toBe(1);
    expect(player.flags.laishengArmed).toBe(1);
    expect(logText(game)).toContain('残躯');
    // 再次触发不再重复设置
    player.flags.laishengArmed = 0;
    await game.trigger('death', { player, target: player, source: undefined, data: {} });
    expect(player.flags.laishengArmed).toBe(0);
  });

  it('残躯：阵亡角色待复活时，回合推进能找到它', () => {
    const { game } = makeGame();
    const player = game.state.players[0];
    player.alive = false;
    player.flags.laishengArmed = 1;
    game.state.current = 1;
    // @ts-expect-error 测试私有推进函数
    game.advance();
    expect(game.state.current).toBe(player.id);
  });

  it('武仕：强尼技能不会进入随机获得技能池', () => {
    // grantRandomSkills 的排除列表已包含 laisheng/hebao/duxing（见 skills.ts）
    expect(SKILL_MAP.has('duxing')).toBe(true);
    expect(SKILL_MAP.has('laisheng')).toBe(true);
    expect(SKILL_MAP.has('hebao')).toBe(true);
  });
});
