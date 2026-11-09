import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class PickFirstIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    if (req.kind === 'chooseCards') {
      const count = Math.max(req.min ?? 1, 1);
      return Promise.resolve({
        type: 'chooseCards',
        cardIds: (req.cards ?? []).slice(0, count).map((card) => card.id),
      });
    }
    if (req.kind === 'choosePlayer') {
      return Promise.resolve({
        type: 'choosePlayers',
        playerIds: [req.players?.[0] ?? 0],
      });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function basic(id: string, name = '杀'): Card {
  return { id, name, suit: 'spade', rank: 7, type: 'basic' };
}

function makeGame(io: GameIO): Game {
  return new Game(
    {
      players: [
        { name: '张昭张纮', heroId: 'zhangzhao', isBot: false },
        { name: '目标', heroId: 'sunquan', isBot: false },
        { name: '第三人', heroId: 'caocao', isBot: false },
      ],
      seed: 20261116,
      rules: { skillsEnabled: true },
    },
    io,
  );
}

describe('张昭张纮', () => {
  it('直谏把装备放进目标空装备栏并摸一张', async () => {
    const game = makeGame(new PickFirstIO());
    const [owner, target] = game.state.players;
    owner.skills = ['zhijian', 'guzheng'];
    const equip: Card = {
      id: 'w1',
      name: '贯石斧',
      suit: 'diamond',
      rank: 5,
      type: 'equip',
      equipSlot: 'weapon',
      range: 3,
    };
    owner.hand = [equip];
    const before = owner.hand.length;

    await game.activateSkill(owner, 'zhijian');
    expect(target.equips.weapon?.id).toBe(equip.id);
    expect(owner.hand.length).toBe(before - 1 + 1);
  });

  it('固政把一张弃牌还给原角色，其余归张昭张纮', async () => {
    const game = makeGame(new PickFirstIO());
    const [owner, target] = game.state.players;
    owner.skills = ['zhijian', 'guzheng'];
    owner.hand = [];
    target.hp = 1;
    target.maxHp = 4;
    target.hand = [basic('a'), basic('b'), basic('c')];
    const discardPhase = (
      game as unknown as { discardPhase: (player: unknown) => Promise<void> }
    ).discardPhase.bind(game);

    await discardPhase(target);
    expect(target.hand.length).toBe(2);
    expect(owner.hand.length).toBe(1);
  });
});
