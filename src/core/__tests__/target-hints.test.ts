import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class TestIO implements GameIO {
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  emit(_event: GameEvent): void {}
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeCard(
  id: string,
  name: string,
  suit: Card['suit'] = 'spade',
  type: Card['type'] = 'basic',
  equipSlot?: Card['equipSlot'],
  element?: Card['element'],
): Card {
  return { id, name, suit, rank: 7, type, equipSlot, element };
}

function makeGame(count: number) {
  return new Game(
    {
      players: Array.from({ length: count }, (_, i) => ({
        name: `玩家${i + 1}`,
        heroId: 'liubei',
        isBot: false,
      })),
      seed: 20261111,
      rules: { skillsEnabled: false },
    },
    new TestIO(),
  );
}

function shaOption(game: Game, attacker: ReturnType<typeof makeGame>['state']['players'][number], card: Card) {
  return game
    .buildPlayOptions(attacker)
    .find((item) => item.cardId === card.id && item.as === '杀');
}

describe('目标不可选原因', () => {
  it('普通杀对藤甲显示藤甲，而不是距离不足', () => {
    const game = makeGame(3);
    const [attacker, tengjia, other] = game.state.players;
    const sha = makeCard('sha-black', '杀', 'spade');
    attacker.hand = [sha];
    tengjia.equips.armor = makeCard('tengjia', '藤甲', 'club', 'equip', 'armor');
    const option = shaOption(game, attacker, sha);
    expect(option?.validTargets).toContain(other.id);
    expect(option?.validTargets).not.toContain(tengjia.id);
    expect(option?.invalidTargets?.[tengjia.id]).toBe('藤甲');
  });

  it('火杀可以正常选择藤甲目标', () => {
    const game = makeGame(3);
    const [attacker, tengjia, other] = game.state.players;
    const fireSha = makeCard('sha-fire', '杀', 'heart', 'basic', undefined, 'fire');
    attacker.hand = [fireSha];
    tengjia.equips.armor = makeCard('tengjia', '藤甲', 'club', 'equip', 'armor');
    const option = shaOption(game, attacker, fireSha);
    expect(option?.validTargets).toEqual(expect.arrayContaining([tengjia.id, other.id]));
    expect(option?.invalidTargets?.[tengjia.id]).toBeUndefined();
  });

  it('黑色杀对仁王盾显示仁王盾，红杀不受影响', () => {
    const game = makeGame(3);
    const [attacker, renwang, other] = game.state.players;
    const black = makeCard('sha-black', '杀', 'club');
    const red = makeCard('sha-red', '杀', 'heart');
    attacker.hand = [black, red];
    renwang.equips.armor = makeCard('renwang', '仁王盾', 'club', 'equip', 'armor');
    const blackOption = shaOption(game, attacker, black);
    const redOption = shaOption(game, attacker, red);
    expect(blackOption?.invalidTargets?.[renwang.id]).toBe('仁王盾');
    expect(redOption?.validTargets).toContain(renwang.id);
    expect(blackOption?.validTargets).toContain(other.id);
  });

  it('青釭剑无视防具时藤甲与仁王盾都不再拦截', () => {
    const game = makeGame(3);
    const [attacker, tengjia] = game.state.players;
    const black = makeCard('sha-black', '杀', 'club');
    attacker.hand = [black];
    attacker.equips.weapon = makeCard('qinggang', '青釭剑', 'spade', 'equip', 'weapon');
    tengjia.equips.armor = makeCard('renwang', '仁王盾', 'club', 'equip', 'armor');
    const option = shaOption(game, attacker, black);
    expect(option?.validTargets).toContain(tengjia.id);
    expect(option?.invalidTargets?.[tengjia.id]).toBeUndefined();
  });

  it('空城角色对杀显示空城', () => {
    const game = makeGame(3);
    const [attacker, empty] = game.state.players;
    const sha = makeCard('sha', '杀', 'spade');
    attacker.hand = [sha];
    empty.extraSkills = ['kongcheng'];
    empty.hand = [];
    const option = shaOption(game, attacker, sha);
    expect(option?.invalidTargets?.[empty.id]).toBe('空城');
  });

  it('超出攻击范围显示距离不足', () => {
    const game = makeGame(5);
    const [attacker, , , far] = game.state.players;
    const sha = makeCard('sha', '杀', 'spade');
    attacker.hand = [sha];
    const option = shaOption(game, attacker, sha);
    expect(option?.invalidTargets?.[far.id]).toBe('距离不足');
  });

  it('顺手牵羊对谦逊角色显示谦逊，乐不思蜀判定区重复显示已有', () => {
    const game = makeGame(3);
    const [attacker, target] = game.state.players;
    const shun = makeCard('shun', '顺手牵羊', 'spade', 'trick');
    attacker.hand = [shun];
    target.extraSkills = ['qianxun'];
    const shunOption = game.buildPlayOptions(attacker).find((item) => item.cardId === shun.id);
    expect(shunOption?.invalidTargets?.[target.id]).toBe('谦逊');

    const le = makeCard('le', '乐不思蜀', 'heart', 'delayed');
    attacker.hand = [le];
    target.judgeZone = [makeCard('le-old', '乐不思蜀', 'club', 'delayed')];
    const leOption = game.buildPlayOptions(attacker).find((item) => item.cardId === le.id);
    expect(leOption?.invalidTargets?.[target.id]).toBe('判定区已有');
  });
});
