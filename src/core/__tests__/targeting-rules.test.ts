import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class QuietIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function basic(id: string, name: string, suit: Card['suit']): Card {
  return { id, name, suit, rank: 7, type: 'basic' };
}

function trick(id: string, name: string, suit: Card['suit']): Card {
  return { id, name, suit, rank: 8, type: 'trick' };
}

function armor(id: string, name: string): Card {
  return { id, name, suit: 'club', rank: 2, type: 'equip', equipSlot: 'armor' };
}

describe('目标选择与官方限制', () => {
  it('火攻不能选择自己，仁王盾与藤甲会从杀的候选中排除', () => {
    const game = new Game(
      {
        players: [
          { name: '使用者', heroId: 'liubei', isBot: false },
          { name: '仁王盾', heroId: 'caocao', isBot: false },
          { name: '藤甲', heroId: 'sunquan', isBot: false },
          { name: '普通', heroId: 'guanyu', isBot: false },
        ],
        seed: 20261111,
        rules: { skillsEnabled: false },
      },
      new QuietIO(),
    );
    const [user, renwang, tengjia, normal] = game.state.players;
    const blackSha = basic('sha-black', '杀', 'spade');
    const redSha = basic('sha-red', '杀', 'heart');
    const fireAttack = trick('huogong', '火攻', 'heart');
    const chains = trick('tiesuo', '铁索连环', 'club');
    user.hand = [blackSha, redSha, fireAttack, chains];
    renwang.hand = [basic('r1', '闪', 'diamond')];
    tengjia.hand = [basic('t1', '闪', 'diamond')];
    normal.hand = [basic('n1', '闪', 'diamond')];
    renwang.equips.armor = armor('renwang', '仁王盾');
    tengjia.equips.armor = armor('tengjia', '藤甲');

    const options = game.buildPlayOptions(user);
    const black = options.find((option) => option.cardId === blackSha.id);
    const red = options.find((option) => option.cardId === redSha.id);
    const fire = options.find((option) => option.as === '火攻');
    const chain = options.find((option) => option.as === '铁索连环');

    expect(black?.validTargets).toEqual([normal.id]);
    expect(red?.validTargets.sort()).toEqual([renwang.id, normal.id].sort());
    expect(fire?.validTargets).not.toContain(user.id);
    expect(fire?.validTargets.sort()).toEqual([renwang.id, tengjia.id, normal.id].sort());
    expect(chain?.validTargets).toContain(user.id);
  });
});
