import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class TestIO implements GameIO {
  constructor(private readonly handler?: (req: AskRequest) => GameAction | undefined) {}

  ask(req: AskRequest): Promise<GameAction> {
    const handled = this.handler?.(req);
    if (handled) return Promise.resolve(handled);
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    if (req.kind === 'choosePlayer') {
      return Promise.resolve({ type: 'choosePlayers', playerIds: [req.players?.[0] ?? 0] });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: (req.cards ?? []).slice(0, req.min ?? 1).map((card) => card.id) });
    }
    if (req.kind === 'respond') return Promise.resolve({ type: 'cancel' });
    if (req.kind === 'play') return Promise.resolve({ type: 'endPlay' });
    return Promise.resolve({ type: 'cancel' });
  }

  emit(_event: GameEvent): void {}
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function card(id: string, name: string, suit: Card['suit'], type: Card['type'] = 'basic'): Card {
  return { id, name, suit, rank: 7, type };
}

function makeGame(players: { name: string; heroId: string }[], io: GameIO) {
  return new Game(
    {
      players: players.map((player) => ({ ...player, isBot: false })),
      seed: 20261201,
      rules: { skillsEnabled: true },
    },
    io,
  );
}

describe('雷击', () => {
  it('由被指定的角色判定，黑桃对其造成 2 点雷电伤害', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'choosePlayer' && req.prompt.includes('雷击')) {
        return { type: 'choosePlayers', playerIds: [1] };
      }
      if (req.kind === 'chooseOption' && req.prompt.includes('鬼道')) {
        return { type: 'chooseOption', optionId: 'no' };
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '张角', heroId: 'zhangjiao' },
        { name: '目标', heroId: 'liubei' },
      ],
      io,
    );
    const [zhangjiao, target] = game.state.players;
    game.state.deck.push(card('judge', '杀', 'spade'));
    await game.trigger('shanUsed', { player: zhangjiao, data: {} });
    expect(target.hp).toBe(target.maxHp - 2);
  });
});

describe('智迟', () => {
  it('回合外受伤后，本回合杀和普通锦囊无效', async () => {
    const game = makeGame(
      [
        { name: '陈宫', heroId: 'chengong' },
        { name: '攻击者', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [chengong, attacker] = game.state.players;
    chengong.flags.zhichi = game.state.turn;
    attacker.hand = [card('sha', '杀', 'spade')];
    await game.useCard(attacker, attacker.hand[0], '杀', [chengong.id]);
    expect(chengong.hp).toBe(chengong.maxHp);
    const duel = card('duel', '决斗', 'spade', 'trick');
    attacker.hand = [duel];
    await game.useCard(attacker, duel, '决斗', [chengong.id]);
    expect(chengong.hp).toBe(chengong.maxHp);
    expect(game.state.log.some((entry) => entry.text.includes('智迟生效'))).toBe(true);
  });
});

describe('禁酒', () => {
  it('高顺的酒只能当杀使用', () => {
    const game = makeGame(
      [
        { name: '高顺', heroId: 'gaoshun' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [gaoshun] = game.state.players;
    gaoshun.hand = [card('wine', '酒', 'spade')];
    const options = game.buildPlayOptions(gaoshun);
    expect(options.some((option) => option.cardId === 'wine' && option.as === '酒')).toBe(false);
    expect(options.some((option) => option.cardId === 'wine' && option.as === '杀' && option.skillId === 'jinjiu')).toBe(true);
  });
});

describe('装备区转化', () => {
  it('武圣可以把装备区的红牌当杀使用', async () => {
    const game = makeGame(
      [
        { name: '关羽', heroId: 'guanyu' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [guanyu, target] = game.state.players;
    guanyu.hand = [];
    const redWeapon = card('redWeapon', '青龙偃月刀', 'heart', 'equip');
    redWeapon.equipSlot = 'weapon';
    redWeapon.range = 3;
    guanyu.equips.weapon = redWeapon;
    const option = game
      .buildPlayOptions(guanyu)
      .find((item) => item.cardId === 'redWeapon' && item.as === '杀');
    expect(option).toBeTruthy();
    await game.useCard(guanyu, redWeapon, '杀', [target.id]);
    expect(guanyu.equips.weapon).toBeUndefined();
    expect(target.hp).toBe(target.maxHp - 1);
  });
});

describe('激将', () => {
  it('刘备出牌阶段可以让蜀势力角色代为出杀', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'choosePlayer' && req.prompt.includes('激将')) {
        return { type: 'choosePlayers', playerIds: [1] };
      }
      if (req.kind === 'respond' && req.playerId === 2 && req.respondName === '杀') {
        const option = (req.cardOptions ?? []).find((item) => item.cardId === 'allySha');
        return option ? { type: 'respondCard', cardId: option.cardId, as: option.as } : undefined;
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '刘备', heroId: 'liubei' },
        { name: '目标', heroId: 'caocao' },
        { name: '关羽', heroId: 'guanyu' },
      ],
      io,
    );
    const [liubei, target, ally] = game.state.players;
    liubei.skills.push('jijiang');
    liubei.hand = [];
    ally.hand = [card('allySha', '杀', 'spade')];
    await game.activateSkill(liubei, 'jijiang');
    expect(target.hp).toBe(target.maxHp - 1);
    expect(ally.hand).toHaveLength(0);
  });
});

describe('恩怨', () => {
  it('一次获得其他角色至少两张牌后令其摸一张', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'chooseOption' && req.prompt.includes('恩怨')) {
        return { type: 'chooseOption', optionId: 'yes' };
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '法正', heroId: 'fazheng' },
        { name: '来源', heroId: 'liubei' },
      ],
      io,
    );
    const [fazheng, source] = game.state.players;
    fazheng.hand = [];
    source.hand = [card('a', '杀', 'spade'), card('b', '闪', 'heart')];
    await game.gainCards(fazheng, source.hand.slice(), source, true);
    expect(fazheng.hand).toHaveLength(2);
    expect(source.hand).toHaveLength(1);
  });
});

describe('完杀', () => {
  it('贾诩回合内其他人不能对濒死角色使用桃', async () => {
    const asked: number[] = [];
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.respondName === '桃') asked.push(req.playerId);
      return undefined;
    });
    const game = makeGame(
      [
        { name: '贾诩', heroId: 'jiaxu' },
        { name: '盟友', heroId: 'liubei' },
        { name: '濒死者', heroId: 'caocao' },
      ],
      io,
    );
    const [jiaxu, ally, dying] = game.state.players;
    game.state.current = jiaxu.id;
    ally.hand = [card('peach', '桃', 'heart')];
    dying.hp = 0;
    await game.dying(dying, jiaxu);
    expect(asked).not.toContain(ally.id);
  });
});

describe('眩惑', () => {
  it('交给红桃手牌后获得目标一张牌', async () => {
    const game = makeGame(
      [
        { name: '法正', heroId: 'fazheng' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [fazheng, target] = game.state.players;
    fazheng.hand = [card('heartCard', '闪', 'heart')];
    target.hand = [card('targetCard', '杀', 'spade')];
    await game.activateSkill(fazheng, 'xuanhuo');
    expect(fazheng.hand.map((item) => item.id)).toContain('targetCard');
    expect(target.hand.map((item) => item.id)).toContain('heartCard');
  });
});

describe('解烦', () => {
  it('攻击范围内含有目标的角色选择令其摸牌', async () => {
    const game = makeGame(
      [
        { name: '韩当', heroId: 'handang' },
        { name: '目标', heroId: 'liubei' },
        { name: '攻击者', heroId: 'caocao' },
      ],
      new TestIO((req) => {
        if (req.kind === 'choosePlayer' && req.prompt.includes('解烦')) {
          return { type: 'choosePlayers', playerIds: [1] };
        }
        return undefined;
      }),
    );
    const [handang, target, attacker] = game.state.players;
    target.hand = [];
    const weapon = card('weapon', '贯石斧', 'diamond', 'equip');
    weapon.equipSlot = 'weapon';
    weapon.range = 3;
    attacker.equips.weapon = weapon;
    await game.activateSkill(handang, 'jiefan');
    expect(target.hand).toHaveLength(2);
    expect(handang.flags.jiefan).toBe(1);
  });
});

describe('诸葛诞', () => {
  it('举义觉醒后获得崩坏与威重', async () => {
    const game = makeGame(
      [
        { name: '诸葛诞', heroId: 'zhugedan' },
        { name: '甲', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [zhugedan] = game.state.players;
    game.state.current = zhugedan.id;
    zhugedan.hp = 3;
    game.state.phase = 'prepare';
    zhugedan.hand = [];
    await game.trigger('phaseStart', { player: zhugedan, data: { phase: 'prepare' } });
    expect(zhugedan.hand).toHaveLength(4);
    expect(zhugedan.extraSkills).toEqual(expect.arrayContaining(['benghuai', 'weizhong']));
  });
});

describe('出牌方向', () => {
  it('逆时针局的座次顺序和下一家按反方向', () => {
    const game = new Game(
      {
        players: [
          { name: '甲', heroId: 'liubei', isBot: false },
          { name: '乙', heroId: 'caocao', isBot: false },
          { name: '丙', heroId: 'sunquan', isBot: false },
          { name: '丁', heroId: 'guanyu', isBot: false },
        ],
        seed: 20261202,
        direction: -1,
        rules: { skillsEnabled: true },
      },
      new TestIO(),
    );
    game.state.current = 0;
    const order = (game as unknown as { turnOrder: () => { id: number }[] }).turnOrder();
    expect(order.map((player) => player.id)).toEqual([0, 3, 2, 1]);
    (game as unknown as { advance: () => void }).advance();
    expect(game.state.current).toBe(3);
  });
});

describe('韩当弓骑', () => {
  it('弃置一张牌后本回合攻击范围无限，弃置装备牌还能拆一名其他角色一张牌', async () => {
    const equipCard: Card = {
      ...card('handEquip', '青龙偃月刀', 'spade', 'equip'),
      equipSlot: 'weapon',
    };
    const io = new TestIO();
    const game = makeGame(
      [
        { name: '韩当', heroId: 'handang' },
        { name: '目标', heroId: 'liubei' },
        { name: '旁观', heroId: 'caocao' },
      ],
      io,
    );
    const [handang, target] = game.state.players;
    handang.hand = [equipCard];
    target.hand = [card('targetCard', '闪', 'heart')];
    await game.activateSkill(handang, 'gongqi');
    expect(handang.hand).toHaveLength(0);
    expect(handang.flags.gongqi).toBe(game.state.turn);
    expect(game.attackRange(handang)).toBeGreaterThanOrEqual(99);
    expect(target.hand).toHaveLength(0);
  });

  it('只弃置非装备牌时不会额外拆牌', async () => {
    const io = new TestIO();
    const game = makeGame(
      [
        { name: '韩当', heroId: 'handang' },
        { name: '目标', heroId: 'liubei' },
      ],
      io,
    );
    const [handang, target] = game.state.players;
    handang.hand = [card('h1', '闪', 'heart')];
    target.hand = [card('t1', '杀', 'spade')];
    await game.activateSkill(handang, 'gongqi');
    expect(game.attackRange(handang)).toBeGreaterThanOrEqual(99);
    expect(target.hand).toHaveLength(1);
  });
});

describe('青龙偃月刀', () => {
  it('追击的杀不计入本回合出杀次数', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.prompt.includes('青龙偃月刀')) {
        const first = req.cardOptions?.[0];
        return first ? { type: 'respondCard', cardId: first.cardId, as: first.as } : undefined;
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '关羽', heroId: 'guanyu' },
        { name: '目标', heroId: 'liubei' },
      ],
      io,
    );
    const [guanyu, target] = game.state.players;
    guanyu.equips.weapon = {
      id: 'qinglong',
      name: '青龙偃月刀',
      suit: 'spade',
      rank: 5,
      type: 'equip',
      equipSlot: 'weapon',
      range: 3,
    };
    guanyu.hand = [card('sha2', '杀', 'club')];
    guanyu.usedThisTurn.sha = 1;
    target.hand = [];
    await game.trigger('shaDodged', {
      player: guanyu,
      source: guanyu,
      target,
      card: card('sha1', '杀', 'spade'),
      data: { forcedHit: false },
    });
    expect(guanyu.usedThisTurn.sha).toBe(1);
    expect(guanyu.hand).toHaveLength(0);
    expect(target.hp).toBe(target.maxHp - 1);
  });
});

describe('谦逊与断肠', () => {
  it('谦逊不能成为顺手牵羊和乐不思蜀的目标', () => {
    const game = makeGame(
      [
        { name: '使用者', heroId: 'liubei' },
        { name: '谦逊', heroId: 'luxun' },
      ],
      new TestIO(),
    );
    const [user, luxun] = game.state.players;
    expect(game.canBeTargeted(luxun, user, '顺手牵羊')).toBe(false);
    expect(game.canBeTargeted(luxun, user, '乐不思蜀')).toBe(false);
    expect(game.canBeTargeted(luxun, user, '杀')).toBe(true);
  });

  it('断肠让杀死蔡文姬的角色失去所有技能', async () => {
    const game = makeGame(
      [
        { name: '蔡文姬', heroId: 'caiwenji' },
        { name: '击杀者', heroId: 'guanyu' },
      ],
      new TestIO(),
    );
    const [caiwenji, killer] = game.state.players;
    expect(killer.skills.length).toBeGreaterThan(0);
    await game.trigger('death', {
      player: caiwenji,
      source: killer,
      target: caiwenji,
      data: {},
    });
    expect(killer.skills).toHaveLength(0);
    expect(killer.extraSkills).toHaveLength(0);
  });
});
