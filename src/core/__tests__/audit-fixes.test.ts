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
  it('其他角色令法正回复体力后摸一张牌', () => {
    const game = makeGame(
      [
        { name: '法正', heroId: 'fazheng' },
        { name: '来源', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [fazheng, source] = game.state.players;
    fazheng.hp = fazheng.maxHp - 1;
    source.hand = [];
    game.heal(source, fazheng, 1, { reason: '测试' });
    expect(source.hand).toHaveLength(1);
  });

  it('受到伤害时来源须交出红桃手牌，否则失去体力', async () => {
    const game = makeGame(
      [
        { name: '法正', heroId: 'fazheng' },
        { name: '来源', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [fazheng, source] = game.state.players;
    source.hand = [card('heart', '闪', 'heart')];
    await game.damage(source, fazheng, 1, undefined, '测试');
    expect(fazheng.hand.some((item) => item.id === 'heart')).toBe(true);
    expect(source.hand).toHaveLength(0);

    source.hand = [card('club', '杀', 'club')];
    const hpBefore = source.hp;
    await game.damage(source, fazheng, 1, undefined, '测试');
    expect(source.hp).toBe(hpBefore - 1);
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

describe('集智与无懈', () => {
  it('黄月英使用无懈可击后触发集智摸一张牌', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'respond' && req.prompt.includes('无懈可击')) {
        const option = req.cardOptions?.find(
          (item) => item.as === '无懈可击' || item.cardId === 'wuxie',
        );
        return option
          ? { type: 'respondCard', cardId: option.cardId, as: option.as }
          : undefined;
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '黄月英', heroId: 'huangyueying' },
        { name: '刘备', heroId: 'liubei' },
      ],
      io,
    );
    const [yueying, liubei] = game.state.players;
    yueying.hand = [card('wuxie', '无懈可击', 'spade', 'trick')];
    liubei.hand = [card('wuzhong', '无中生有', 'heart', 'trick')];
    await game.useCard(liubei, liubei.hand[0], '无中生有', [liubei.id]);
    expect(yueying.hand.some((item) => item.name === '无懈可击')).toBe(false);
    expect(yueying.hand).toHaveLength(1);
    expect(game.state.log.some((entry) => entry.text.includes('集智'))).toBe(true);
  });
});

describe('再起', () => {
  it('按亮出牌中的红桃数量回复体力，并保留其余牌', async () => {
    const game = makeGame(
      [
        { name: '孟获', heroId: 'menghuo' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [menghuo] = game.state.players;
    menghuo.hp = 1;
    menghuo.hand = [];
    game.state.current = menghuo.id;
    game.state.deck.push(
      card('club', '杀', 'club'),
      card('heart1', '闪', 'heart'),
      card('heart2', '桃', 'heart'),
    );
    await game.trigger('drawPhase', { player: menghuo, data: {} });
    expect(menghuo.hp).toBe(3);
    expect(menghuo.hand.map((item) => item.id)).toEqual(['club']);
    expect(game.state.discard.some((item) => item.id === 'heart1')).toBe(true);
    expect(game.state.discard.some((item) => item.id === 'heart2')).toBe(true);
  });
});

describe('公孙瓒趫猛', () => {
  it('黑色杀造成伤害后可弃置目标坐骑并获得之', async () => {
    const game = makeGame(
      [
        { name: '公孙瓒', heroId: 'gongsunzan' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [gongsunzan, target] = game.state.players;
    gongsunzan.hand = [card('sha', '杀', 'spade')];
    target.hand = [];
    const horse: Card = { ...card('horse', '+1 马', 'club', 'equip'), equipSlot: 'horsePlus' };
    target.equips.horsePlus = horse;
    await game.useCard(gongsunzan, gongsunzan.hand[0], '杀', [target.id]);
    expect(target.equips.horsePlus).toBeUndefined();
    expect(gongsunzan.hand.some((item) => item.id === 'horse')).toBe(true);
  });
});

describe('马岱潜袭', () => {
  it('对距离为1的角色造成杀伤害时，非红桃判定防止伤害并减体力上限', async () => {
    const game = makeGame(
      [
        { name: '马岱', heroId: 'madai' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [madai, target] = game.state.players;
    madai.hand = [card('sha', '杀', 'spade')];
    target.hand = [];
    game.state.deck.push(card('judge', '闪', 'club'));
    await game.useCard(madai, madai.hand[0], '杀', [target.id]);
    expect(target.maxHp).toBe(3);
    expect(target.hp).toBe(3);
  });
});

describe('凌统旋风', () => {
  it('弃牌阶段弃置至少两张牌后可以弃置其他角色两张牌', async () => {
    const game = makeGame(
      [
        { name: '凌统', heroId: 'lingtong' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [lingtong, target] = game.state.players;
    target.hand = [card('a', '杀', 'spade'), card('b', '闪', 'heart')];
    await game.trigger('discardPhaseEnd', {
      player: lingtong,
      data: { cards: [card('x', '杀', 'club'), card('y', '闪', 'diamond')] },
    });
    expect(target.hand).toHaveLength(0);
  });
});

describe('李典恂恂', () => {
  it('只调整牌堆顶四张，不直接获得牌', async () => {
    const game = makeGame(
      [
        { name: '李典', heroId: 'lidian' },
        { name: '目标', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [lidian] = game.state.players;
    lidian.hand = [];
    game.state.current = lidian.id;
    game.state.deck = [
      card('a', '杀', 'spade'),
      card('b', '闪', 'heart'),
      card('c', '桃', 'diamond'),
      card('d', '杀', 'club'),
    ];
    await game.trigger('drawPhase', { player: lidian, data: {} });
    expect(lidian.hand).toHaveLength(0);
    expect(game.state.deck).toHaveLength(4);
    expect(game.state.log.some((entry) => entry.text.includes('恂恂'))).toBe(true);
  });
});

describe('曹彰将驰', () => {
  it('选择多摸一张后本回合不能使用杀', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'chooseOption' && req.prompt.includes('将驰')) {
        const option = req.options?.find((item) => item.id === 'draw');
        return option ? { type: 'chooseOption', optionId: option.id } : undefined;
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '曹彰', heroId: 'caozhang' },
        { name: '目标', heroId: 'liubei' },
      ],
      io,
    );
    const [caozhang] = game.state.players;
    caozhang.hand = [card('sha', '杀', 'spade')];
    game.state.current = caozhang.id;
    const data: Record<string, unknown> = { drawCount: 2, skip: false };
    await game.trigger('drawPhase', { player: caozhang, data });
    expect(data.drawCount).toBe(3);
    expect(game.buildPlayOptions(caozhang).some((item) => item.as === '杀')).toBe(false);
  });
});

describe('华雄耀武', () => {
  it('受到红杀伤害后令来源回复体力', async () => {
    const game = makeGame(
      [
        { name: '华雄', heroId: 'huaxiong' },
        { name: '来源', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [huaxiong, source] = game.state.players;
    source.hp = source.maxHp - 1;
    await game.damage(source, huaxiong, 1, card('sha', '杀', 'heart'), '杀');
    expect(source.hp).toBe(source.maxHp);
  });
});

describe('徐庶无言与举荐', () => {
  it('无言防止锦囊伤害', async () => {
    const game = makeGame(
      [
        { name: '徐庶', heroId: 'xushu' },
        { name: '来源', heroId: 'liubei' },
      ],
      new TestIO(),
    );
    const [xushu, source] = game.state.players;
    await game.damage(source, xushu, 1, card('duel', '决斗', 'spade', 'trick'), '决斗');
    expect(xushu.hp).toBe(xushu.maxHp);
  });

  it('举荐弃置非基本牌后令目标摸两张', async () => {
    const io = new TestIO((req) => {
      if (req.kind === 'chooseOption' && req.prompt.includes('举荐')) {
        const option = req.options?.find((item) => item.id === 'draw');
        return option ? { type: 'chooseOption', optionId: option.id } : undefined;
      }
      return undefined;
    });
    const game = makeGame(
      [
        { name: '徐庶', heroId: 'xushu' },
        { name: '目标', heroId: 'liubei' },
      ],
      io,
    );
    const [xushu, target] = game.state.players;
    const equip: Card = { ...card('equip', '青釭剑', 'spade', 'equip'), equipSlot: 'weapon' };
    xushu.hand = [equip];
    target.hand = [];
    await game.trigger('turnEnd', { player: xushu, data: {} });
    expect(target.hand).toHaveLength(2);
  });
});
