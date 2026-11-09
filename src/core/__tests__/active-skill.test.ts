import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class PickIO implements GameIO {
  pickCards: boolean;
  constructor(pickCards: boolean) {
    this.pickCards = pickCards;
  }
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseCards') {
      const ids = this.pickCards ? (req.cards ?? []).slice(0, 1).map((card) => card.id) : [];
      return Promise.resolve({ type: 'chooseCards', cardIds: ids });
    }
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeGame(io: GameIO): Game {
  return new Game(
    {
      players: [
        { name: '孙权', heroId: 'sunquan', isBot: false },
        { name: '刘备', heroId: 'liubei', isBot: false },
        { name: '曹操', heroId: 'caocao', isBot: false },
      ],
      seed: 20261114,
      rules: { skillsEnabled: true },
    },
    io,
  );
}

function cards(): Card[] {
  return [
    { id: 'a', name: '杀', suit: 'spade', rank: 7, type: 'basic' },
    { id: 'b', name: '闪', suit: 'heart', rank: 2, type: 'basic' },
  ];
}

class CancelTargetIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

describe('主动技能取消', () => {
  it('取消选择不消耗每回合次数', async () => {
    const game = makeGame(new PickIO(false));
    const player = game.state.players[0];
    player.hand = cards();
    game.state.current = 0;

    await game.activateSkill(player, 'zhiheng');
    expect(player.usedThisTurn.zhiheng ?? 0).toBe(0);
    expect(game.activeSkillOptions(player).map((skill) => skill.id)).toContain('zhiheng');
  });

  it('巧变在取消目标时不扣费用和次数', async () => {
    const game = new Game(
      {
        players: [
          { name: '张郃', heroId: 'zhanghe', isBot: false },
          { name: '目标', heroId: 'sunquan', isBot: false },
        ],
        seed: 20261115,
        rules: { skillsEnabled: true },
      },
      new CancelTargetIO(),
    );
    const player = game.state.players[0];
    const target = game.state.players[1];
    const cost = cards()[0];
    player.hand = [cost];
    target.equips.weapon = {
      id: 'w1',
      name: '贯石斧',
      suit: 'diamond',
      rank: 5,
      type: 'equip',
      equipSlot: 'weapon',
      range: 3,
    };

    await game.activateSkill(player, 'qiaobian');
    expect(player.hand.map((card) => card.id)).toContain(cost.id);
    expect(player.usedThisTurn.qiaobian ?? 0).toBe(0);
    expect(game.activeSkillOptions(player).map((skill) => skill.id)).toContain('qiaobian');
  });

  it('完整发动后才消耗次数', async () => {
    const game = makeGame(new PickIO(true));
    const player = game.state.players[0];
    player.hand = cards();
    game.state.current = 0;

    await game.activateSkill(player, 'zhiheng');
    expect(player.usedThisTurn.zhiheng).toBe(1);
    expect(game.activeSkillOptions(player).map((skill) => skill.id)).not.toContain('zhiheng');
  });
});
