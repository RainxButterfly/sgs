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
): Card {
  return { id, name, suit, rank: 7, type, equipSlot };
}

function makeGame(count: number, io: GameIO) {
  return new Game(
    {
      players: Array.from({ length: count }, (_, i) => ({
        name: `玩家${i + 1}`,
        heroId: ['liubei', 'caocao', 'sunquan', 'guanyu'][i] ?? 'liubei',
        isBot: false,
      })),
      seed: 20261202,
      rules: { skillsEnabled: true },
    },
    io,
  );
}

describe('武器审核', () => {
  it('青釭剑可以无视仁王盾选择并命中目标', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('qinggang', '青釭剑', 'spade', 'equip', 'weapon');
    target.equips.armor = makeCard('renwang', '仁王盾', 'club', 'equip', 'armor');
    attacker.hand = [makeCard('sha', '杀', 'spade')];
    const option = game.buildPlayOptions(attacker).find((item) => item.as === '杀');
    expect(option?.validTargets).toContain(target.id);
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.hp).toBe(target.maxHp - 1);
  });

  it('寒冰剑只在目标至少有两张牌时可发动，并防止伤害', async () => {
    const io = new TestIO((req) =>
      req.kind === 'chooseOption'
        ? {
            type: 'chooseOption',
            optionId: req.prompt.includes('寒冰剑')
              ? req.prompt.includes('是否发动')
                ? 'yes'
                : req.options?.[0]?.id ?? 'no'
              : 'no',
          }
        : undefined,
    );
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('hanbing', '寒冰剑', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'spade')];
    target.hand = [makeCard('only', '闪', 'heart')];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.hp).toBe(target.maxHp - 1);
    expect(target.hand).toHaveLength(1);
    expect(io.asked.some((req) => req.prompt.includes('寒冰剑'))).toBe(false);

    const io2 = new TestIO((req) =>
      req.kind === 'chooseOption'
        ? {
            type: 'chooseOption',
            optionId: req.prompt.includes('寒冰剑')
              ? req.prompt.includes('是否发动')
                ? 'yes'
                : req.options?.[0]?.id ?? 'no'
              : 'no',
          }
        : undefined,
    );
    const game2 = makeGame(2, io2);
    const [attacker2, target2] = game2.state.players;
    attacker2.equips.weapon = makeCard('hanbing2', '寒冰剑', 'spade', 'equip', 'weapon');
    attacker2.hand = [makeCard('sha2', '杀', 'spade')];
    target2.hand = [makeCard('a', '闪', 'heart'), makeCard('b', '桃', 'heart')];
    await game2.useCard(attacker2, attacker2.hand[0], '杀', [target2.id]);
    expect(target2.hp).toBe(target2.maxHp);
    expect(target2.hand).toHaveLength(0);
  });

  it('麒麟弓在双坐骑时让使用者选择一张弃置', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('qilin', '麒麟弓', 'heart', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'spade')];
    target.hp = target.maxHp;
    target.equips.horsePlus = makeCard('plus', '的卢', 'club', 'equip', 'horsePlus');
    target.equips.horseMinus = makeCard('minus', '赤兔', 'heart', 'equip', 'horseMinus');
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.equips.horsePlus).toBeUndefined();
    expect(target.equips.horseMinus).toBeDefined();
  });

  it('古锭刀在目标空手牌时额外造成 1 点伤害', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('guding', '古锭刀', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'spade')];
    target.hand = [];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.hp).toBe(target.maxHp - 2);
  });

  it('白银狮子受伤至多 1 点，失去时回复 1 点体力', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    const armor = makeCard('baiyin', '白银狮子', 'club', 'equip', 'armor');
    target.equips.armor = armor;
    await game.damage(attacker, target, 3, undefined, '测试');
    expect(target.hp).toBe(target.maxHp - 1);
    await game.discardCards(target, [armor], '测试');
    expect(target.hp).toBe(target.maxHp);
  });

  it('朱雀羽扇提供普通杀转化为火杀的选项', () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker] = game.state.players;
    attacker.equips.weapon = makeCard('zhuque', '朱雀羽扇', 'diamond', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'club')];
    const option = game.buildPlayOptions(attacker).find((item) => item.skillId === 'zhuque');
    expect(option?.element).toBe('fire');
  });

  it('方天画戟在最后一张手牌杀时可以指定至多三个目标', () => {
    const io = new TestIO();
    const game = makeGame(4, io);
    const [attacker] = game.state.players;
    attacker.equips.weapon = makeCard('fangtian', '方天画戟', 'diamond', 'equip', 'weapon');
    attacker.hand = [makeCard('sha', '杀', 'diamond')];
    const option = game.buildPlayOptions(attacker).find((item) => item.as === '杀');
    expect(option?.targetMax).toBe(3);
  });
});

describe('+1 马距离', () => {
  it('双方都有 +1 马时，攻击范围 2 的武器仍可攻击', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('range2', '青釭剑', 'spade', 'equip', 'weapon');
    attacker.equips.weapon.range = 2;
    attacker.equips.horsePlus = makeCard('plus1', '的卢', 'club', 'equip', 'horsePlus');
    target.equips.horsePlus = makeCard('plus2', '绝影', 'spade', 'equip', 'horsePlus');
    attacker.hand = [makeCard('sha', '杀', 'spade')];

    expect(game.distance(attacker, target)).toBe(2);
    expect(game.attackRange(attacker)).toBe(2);
    const option = game.buildPlayOptions(attacker).find((item) => item.as === '杀');
    expect(option?.validTargets).toContain(target.id);
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.hp).toBe(target.maxHp - 1);
  });
});

describe('+1 马距离（八人局）', () => {
  it('相邻座位双方都有 +1 马时，攻击范围 2 仍可命中', async () => {
    const io = new TestIO();
    const game = makeGame(8, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('range2b', '雌雄双股剑', 'spade', 'equip', 'weapon');
    attacker.equips.weapon.range = 2;
    attacker.equips.horsePlus = makeCard('plus3', '的卢', 'club', 'equip', 'horsePlus');
    target.equips.horsePlus = makeCard('plus4', '绝影', 'spade', 'equip', 'horsePlus');
    attacker.hand = [makeCard('sha3', '杀', 'spade')];
    expect(game.distance(attacker, target)).toBe(2);
    const option = game.buildPlayOptions(attacker).find((item) => item.as === '杀');
    expect(option?.validTargets).toContain(target.id);
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(target.hp).toBe(target.maxHp - 1);
  });
});

describe('丈八蛇矛', () => {
  it('装备后可以主动用两张手牌当杀并造成伤害', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = makeCard('zhangba', '丈八蛇矛', 'spade', 'equip', 'weapon');
    attacker.hand = [makeCard('z1', '桃', 'heart'), makeCard('z2', '闪', 'diamond')];
    await game.activateSkill(attacker, 'zhangba');
    expect(attacker.hand).toHaveLength(0);
    expect(target.hp).toBe(target.maxHp - 1);
  });
});
