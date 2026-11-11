import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class TestIO implements GameIO {
  asked: AskRequest[] = [];
  constructor(private readonly handler?: (req: AskRequest) => GameAction | undefined) {}
  ask(req: AskRequest): Promise<GameAction> {
    this.asked.push(req);
    const handled = this.handler?.(req);
    if (handled) return Promise.resolve(handled);
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    if (req.kind === 'choosePlayer') {
      return Promise.resolve({ type: 'choosePlayers', playerIds: [req.players?.[0] ?? 0] });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({
        type: 'chooseCards',
        cardIds: (req.cards ?? []).slice(0, req.min ?? 1).map((card) => card.id),
      });
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

function makeGame(count: number, io: GameIO, heroes?: string[]) {
  return new Game(
    {
      players: Array.from({ length: count }, (_, i) => ({
        name: `玩家${i + 1}`,
        heroId: heroes?.[i] ?? 'liubei',
        isBot: false,
      })),
      seed: 20261111,
      rules: { skillsEnabled: false },
    },
    io,
  );
}

const alwaysYes = (req: AskRequest): GameAction | undefined => {
  if (req.kind === 'chooseOption') {
    const yes = req.options?.find((option) => option.id === 'yes');
    if (yes) return { type: 'chooseOption', optionId: 'yes' };
  }
  return undefined;
};

describe('武器完整流程', () => {
  it('贯石斧在杀被闪避后弃两张牌强制命中', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.respondName === '闪') {
        const shan = req.cardOptions?.[0];
        return shan ? { type: 'respondCard', cardId: shan.cardId, as: '闪' } : { type: 'cancel' };
      }
      return alwaysYes(req);
    });
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('guanshi', '贯石斧', 'diamond', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀'), makeCard('a', '桃', 'heart'), makeCard('b', '闪', 'diamond')];
    target.hand = [makeCard('shan', '闪', 'heart')];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(io.asked.some((req) => req.prompt.includes('贯石斧'))).toBe(true);
    expect(target.hp).toBe(target.maxHp - 1);
  });

  it('青龙偃月刀在杀被闪避后可以再使用一张杀', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.respondName === '闪') {
        const shan = req.cardOptions?.[0];
        return shan ? { type: 'respondCard', cardId: shan.cardId, as: '闪' } : { type: 'cancel' };
      }
      if (req.kind === 'respond' && req.respondName === '杀') {
        const sha = req.cardOptions?.[0];
        return sha ? { type: 'respondCard', cardId: sha.cardId, as: '杀' } : { type: 'cancel' };
      }
      return alwaysYes(req);
    });
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('qinglong', '青龙偃月刀', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('sha1', '杀'), makeCard('sha2', '杀')];
    target.hand = [makeCard('shan', '闪', 'heart')];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(io.asked.some((req) => req.prompt.includes('青龙偃月刀'))).toBe(true);
    expect(target.hp).toBe(target.maxHp - 1);
    expect(attacker.hand).toHaveLength(0);
  });

  it('雌雄双股剑对异性目标触发弃牌或摸牌', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'chooseOption' && req.options?.some((option) => option.id === 'discard')) {
        return { type: 'chooseOption', optionId: 'discard' };
      }
      return alwaysYes(req);
    });
    const game = makeGame(2, io, ['liubei', 'sunshangxiang']);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('cixiong', '雌雄双股剑', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀')];
    target.hand = [makeCard('a', '桃', 'heart'), makeCard('b', '桃', 'heart')];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(io.asked.some((req) => req.prompt.includes('雌雄双股剑'))).toBe(true);
    expect(target.hand.length).toBe(1);
  });

  it('方天画戟最后一张杀可以实际命中三个目标', async () => {
    const io = new TestIO();
    const game = makeGame(4, io);
    const [attacker, t1, t2, t3] = game.state.players;
    attacker.equips.weapon = makeCard('fangtian', '方天画戟', 'diamond', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀')];
    const option = game.buildPlayOptions(attacker).find((item) => item.as === '杀');
    expect(option?.targetMax).toBe(3);
    await game.useCard(attacker, attacker.hand[0], '杀', [t1.id, t2.id, t3.id]);
    expect([t1.hp, t2.hp, t3.hp]).toEqual([t1.maxHp - 1, t2.maxHp - 1, t3.maxHp - 1]);
  });

  it('朱雀羽扇火杀可以命中藤甲且火伤加一', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('zhuque', '朱雀羽扇', 'diamond', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'club')];
    target.equips.armor = makeCard('tengjia', '藤甲', 'club', 'equip', 'armor');
    const option = game.buildPlayOptions(attacker).find((item) => item.skillId === 'zhuque');
    expect(option).toBeTruthy();
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id], 'zhuque', undefined, 'fire');
    expect(target.hp).toBe(target.maxHp - 2);
  });

  it('诸葛连弩允许一个出牌阶段连续使用多张杀', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('zhuge', '诸葛连弩', 'club', 'equip', 'weapon');
    attacker.hand = [makeCard('s1', '杀'), makeCard('s2', '杀'), makeCard('s3', '杀')];
    for (const card of [...attacker.hand]) {
      const option = game.buildPlayOptions(attacker).find((item) => item.cardId === card.id && item.as === '杀');
      expect(option).toBeTruthy();
      await game.useCard(attacker, card, '杀', [target.id]);
    }
    expect(target.hp).toBe(target.maxHp - 3);
  });

  it('丈八蛇矛可以把两张手牌当杀响应南蛮入侵', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.respondName === '杀') {
        const synth = req.cardOptions?.find((option) => option.skillId === 'zhangba');
        if (synth) return { type: 'respondCard', cardId: synth.cardId, as: '杀' };
      }
      return undefined;
    });
    const game = makeGame(2, io);
    const [user, target] = game.state.players;
    target.equips.weapon = makeCard('zhangba', '丈八蛇矛', 'spade', 'equip', 'weapon');
    target.hand = [makeCard('a', '桃', 'heart'), makeCard('b', '桃', 'heart')];
    await game.askRespond(target, '杀', { prompt: '南蛮入侵：请打出一张杀' });
    expect(io.asked.some((req) => req.respondName === '杀')).toBe(true);
    expect(target.hand).toHaveLength(0);
  });

  it('丈八蛇矛遵守天义提供的额外杀次数', () => {
    const game = makeGame(2, new TestIO());
    const [attacker] = game.state.players;
    attacker.equips.weapon = makeCard('zhangba-limit', '丈八蛇矛', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('a', '桃', 'heart'), makeCard('b', '桃', 'heart')];
    attacker.usedThisTurn.sha = 1;
    expect(game.activeSkillOptions(attacker).some((skill) => skill.id === 'zhangba')).toBe(false);
    attacker.flags.tianyi = 1;
    expect(game.activeSkillOptions(attacker).some((skill) => skill.id === 'zhangba')).toBe(true);
  });

  it('借刀杀人可以让丈八蛇矛把两张手牌当杀打出', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.respondName === '杀') {
        const synth = req.cardOptions?.find((option) => option.skillId === 'zhangba');
        if (synth) return { type: 'respondCard', cardId: synth.cardId, as: '杀' };
      }
      return undefined;
    });
    const game = makeGame(3, io);
    const [user, holder, victim] = game.state.players;
    holder.equips.weapon = makeCard('zhangba-jd', '丈八蛇矛', 'spade', 'equip', 'weapon');
    holder.hand = [makeCard('a', '桃', 'heart'), makeCard('b', '桃', 'heart')];
    const jiedao = makeCard('jiedao', '借刀杀人', 'spade', 'trick');
    user.hand = [jiedao];
    await game.useCard(user, jiedao, '借刀杀人', [holder.id, victim.id]);
    expect(holder.hand).toHaveLength(0);
    expect(victim.hp).toBe(victim.maxHp - 1);
  });
});
