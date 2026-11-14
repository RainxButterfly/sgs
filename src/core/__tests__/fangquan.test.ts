import { describe, expect, it } from 'vitest';
import { SimIO } from '../bot';
import { Game } from '../game';
import { SKILL_MAP } from '../skills';
import { redactState, TEAM_MATE_SEAT } from '../../net/protocol';

function makeGame(mode: 'identity' | '2v2' = 'identity', heroId = 'liushan') {
  const io = new SimIO();
  const game = new Game(
    {
      players: Array.from({ length: 4 }, (_, i) => ({
        name: `P${i + 1}`,
        heroId: i === 0 ? heroId : '',
        isBot: true,
      })),
      seed: 20261112,
      rules: { mode },
    },
    io,
  );
  return { game, io };
}

const logText = (game: Game) => JSON.stringify(game.state.log);

describe('刘禅【放权】', () => {
  it('不是出牌阶段可随时发动的主动技', () => {
    const skill = SKILL_MAP.get('fangquan');
    expect(skill?.active).toBeFalsy();
  });

  it('出牌阶段开始时确认发动，立即置「待结算」标记', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    game.confirm = async () => true;
    // @ts-expect-error 测试中直接触发阶段开始询问
    const skipped = await game.offerFangquan(owner);
    expect(skipped).toBe(true);
    expect(owner.flags.fangquanPending).toBe(1);
    expect(logText(game)).toContain('跳过出牌阶段');
  });

  it('出牌阶段开始时选择取消则不发动', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    game.confirm = async () => false;
    // @ts-expect-error 测试中直接触发阶段开始询问
    const skipped = await game.offerFangquan(owner);
    expect(skipped).toBe(false);
    expect(owner.flags.fangquanPending).toBeUndefined();
    expect(logText(game)).not.toContain('放权');
  });

  it('无手牌时不会询问，也不会跳过出牌阶段', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    owner.hand = [];
    let asked = false;
    game.confirm = async () => {
      asked = true;
      return true;
    };
    // @ts-expect-error 测试中直接触发阶段开始询问
    const skipped = await game.offerFangquan(owner);
    expect(skipped).toBe(false);
    expect(asked).toBe(false);
  });

  it('回合末弃一张手牌，并令其他角色获得额外回合', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    const mate = game.state.players[1];
    owner.flags.fangquanPending = 1;
    const before = owner.hand.length;

    // 固定应答：必弃一张、必选 P2
    game.askCards = async () => owner.hand.slice(0, 1);
    game.askPlayer = async () => mate;

    // @ts-expect-error 测试中直接结算放权
    await game.resolveFangquan(owner);

    expect(logText(game)).toContain('获得一个额外回合');
    expect(owner.hand.length).toBe(before - 1);
    expect(owner.flags.fangquanPending).toBe(0);
    expect(game['extraTurnPlayerId']).toBe(mate.id);
  });

  it('无手牌时不授予额外回合，也不会卡住流程', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    owner.hand = [];
    owner.flags.fangquanPending = 1;

    // @ts-expect-error 测试中直接结算放权
    await game.resolveFangquan(owner);

    expect(logText(game)).toContain('放权未能授予额外回合');
    expect(owner.flags.fangquanPending).toBe(0);
    expect(game['extraTurnPlayerId']).toBeNull();
  });

  it('未发动放权时回合末不做任何处理', async () => {
    const { game } = makeGame();
    const owner = game.state.players[0];
    const before = owner.hand.length;

    // @ts-expect-error 测试中直接结算放权
    await game.resolveFangquan(owner);

    expect(owner.hand.length).toBe(before);
    expect(logText(game)).not.toContain('放权');
  });
});

describe('2v2 信息可见性', () => {
  it('队友手牌可见，对手手牌仍为暗牌', () => {
    const { game } = makeGame('2v2');
    const view = redactState(game.state, 0);

    // 1 号位视角：4 号位是队友，2、3 号位是对手
    expect(TEAM_MATE_SEAT[0]).toBe(3);
    expect(view.players[3].hand.every((card) => card.name !== '未知')).toBe(true);
    expect(view.players[1].hand.every((card) => card.name === '未知')).toBe(true);
    expect(view.players[2].hand.every((card) => card.name === '未知')).toBe(true);
  });

  it('队伍身份对所有人公开', () => {
    const { game } = makeGame('2v2');
    const view = redactState(game.state, 1);
    expect(view.players.map((p) => p.role)).toEqual(['loyalist', 'rebel', 'rebel', 'loyalist']);
  });
});
