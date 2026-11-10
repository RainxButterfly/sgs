import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class SkillIO implements GameIO {
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      const yes = req.options?.find((option) => option.id === 'yes');
      return Promise.resolve(
        yes && /流离|铁骑/.test(req.prompt)
          ? { type: 'chooseOption', optionId: 'yes' }
          : { type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' },
      );
    }
    if (req.kind === 'choosePlayer') {
      return Promise.resolve({
        type: 'choosePlayers',
        playerIds: [req.players?.find((id) => id === 2) ?? req.players?.[0] ?? 0],
      });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
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

function card(id: string, name: string, suit: Card['suit']): Card {
  return { id, name, suit, rank: 7, type: name === '杀' ? 'basic' : 'trick' };
}

describe('技能触发链', () => {
  it('马超铁骑与大乔流离可以连续触发', async () => {
    const io = new SkillIO();
    const game = new Game(
      {
        players: [
          { name: '马超', heroId: 'machao', isBot: false },
          { name: '大乔', heroId: 'daqiao', isBot: false },
          { name: '刘备', heroId: 'liubei', isBot: false },
        ],
        seed: 20261115,
        rules: { skillsEnabled: true },
      },
      io,
    );
    const [machao, daqiao, liubei] = game.state.players;
    machao.hand = [card('sha', '杀', 'spade')];
    daqiao.hand = [card('cost', '闪', 'heart')];
    liubei.hand = [];
    const before = liubei.hp;
    await game.useCard(machao, machao.hand[0], '杀', [daqiao.id]);
    expect(daqiao.hp).toBe(daqiao.maxHp);
    expect(liubei.hp).toBe(before - 1);
  });
});

class WuxieIO extends SkillIO {
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'respond' && req.respondName === '无懈可击' && req.playerId === 1) {
      const option = (req.cardOptions ?? []).find((item) => !item.cardId.startsWith('__'));
      return Promise.resolve(option ? { type: 'respondCard', cardId: option.cardId, as: option.as } : { type: 'cancel' });
    }
    return super.ask(req);
  }
}

describe('无懈可击', () => {
  it('无中生有可以被无懈可击抵消', async () => {
    const io = new WuxieIO();
    const game = new Game(
      {
        players: [
          { name: '使用者', heroId: 'liubei', isBot: false },
          { name: '无懈者', heroId: 'simayi', isBot: false },
          { name: '旁观者', heroId: 'caocao', isBot: false },
        ],
        seed: 20261116,
        rules: { skillsEnabled: false },
      },
      io,
    );
    const [user, wuxie] = game.state.players;
    user.hand = [{ id: 'wuzhong', name: '无中生有', suit: 'heart', rank: 7, type: 'trick' }];
    wuxie.hand = [{ id: 'wuxie', name: '无懈可击', suit: 'spade', rank: 2, type: 'trick' }];
    const before = user.hand.length;
    await game.useCard(user, user.hand[0], '无中生有', []);
    expect(user.hand).toHaveLength(before - 1);
    expect(wuxie.hand).toHaveLength(0);
    expect(game.state.log.some((entry) => entry.text.includes('无中生有被无懈可击抵消'))).toBe(true);
  });
});

describe('义从距离', () => {
  it('体力大于 2 时计算别人距离-1，体力不大于 2 时别人计算公孙瓒距离+1', () => {
    const game = new Game(
      {
        players: [
          { name: '公孙瓒', heroId: 'gongsunzan', isBot: false },
          { name: '甲', heroId: 'liubei', isBot: false },
          { name: '乙', heroId: 'caocao', isBot: false },
          { name: '丙', heroId: 'sunquan', isBot: false },
        ],
        seed: 20261118,
        rules: { skillsEnabled: true },
      },
      new SkillIO(),
    );
    const [gongsun, first, second, third] = game.state.players;
    expect(game.distance(gongsun, first)).toBe(1);
    expect(game.distance(gongsun, second)).toBe(1);
    expect(game.distance(third, gongsun)).toBe(1);
    expect(game.distance(first, gongsun)).toBe(1);
    gongsun.hp = 2;
    expect(game.distance(gongsun, second)).toBe(2);
    expect(game.distance(third, gongsun)).toBe(2);
    expect(game.distance(first, gongsun)).toBe(2);
  });
});

describe('铁索连环与无懈', () => {
  it('无懈只抵消第一个目标，第二个目标仍然横置', async () => {
    const io = new WuxieIO();
    const game = new Game(
      {
        players: [
          { name: '使用者', heroId: 'liubei', isBot: false },
          { name: '目标一', heroId: 'daqiao', isBot: false },
          { name: '目标二', heroId: 'caocao', isBot: false },
        ],
        seed: 20261119,
        rules: { skillsEnabled: false },
      },
      io,
    );
    const [user, first, second] = game.state.players;
    user.hand = [{ id: 'tiesuo', name: '铁索连环', suit: 'club', rank: 6, type: 'trick' }];
    first.hand = [{ id: 'wuxie', name: '无懈可击', suit: 'spade', rank: 2, type: 'trick' }];
    second.hand = [];
    await game.useCard(user, user.hand[0], '铁索连环', [first.id, second.id]);
    expect(first.chained).toBe(false);
    expect(second.chained).toBe(true);
  });
});


class BazhenIO extends SkillIO {
  count = 0;
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'respond' && req.respondName === '闪') {
      this.count += 1;
      const option = (req.cardOptions ?? []).find((item) => item.cardId.startsWith('__'));
      return Promise.resolve(option ? { type: 'respondCard', cardId: option.cardId, as: option.as, skillId: option.skillId } : { type: 'cancel' });
    }
    return super.ask(req);
  }
}

describe('八阵判定', () => {
  it('判定失败后不会无限重复询问同一个八阵', async () => {
    const io = new BazhenIO();
    const game = new Game(
      {
        players: [
          { name: '卧龙', heroId: 'wolong', isBot: false },
          { name: '甲', heroId: 'liubei', isBot: false },
          { name: '乙', heroId: 'caocao', isBot: false },
        ],
        seed: 20261121,
        rules: { skillsEnabled: true },
      },
      io,
    );
    await (game as unknown as { askRespond: (player: unknown, name: string, opts: object) => Promise<unknown> }).askRespond(
      game.state.players[0],
      '闪',
      { prompt: '请打出一张闪', canCancel: true },
    );
    expect(io.count).toBe(1);
  });
});

class GuhuoIO extends SkillIO {
  constructor(private readonly questioners: number[]) {
    super();
  }

  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'respond' && req.playerId === 0 && req.respondName === '闪') {
      const option = (req.cardOptions ?? []).find((item) => item.cardId === '__guhuo__');
      if (option) {
        return Promise.resolve({ type: 'respondCard', cardId: option.cardId, as: option.as, skillId: option.skillId });
      }
    }
    if (req.kind === 'chooseCards' && req.playerId === 0 && req.prompt.includes('蛊惑')) {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
    }
    if (req.kind === 'chooseOption' && req.prompt.includes('质疑')) {
      return Promise.resolve({
        type: 'chooseOption',
        optionId: this.questioners.includes(req.playerId) ? 'yes' : 'no',
      });
    }
    return super.ask(req);
  }
}

describe('蛊惑响应', () => {
  function setup(io: GuhuoIO, yujiCard: Card) {
    const game = new Game(
      {
        players: [
          { name: '于吉', heroId: 'yuji', isBot: false },
          { name: '攻击者', heroId: 'liubei', isBot: false },
          { name: '旁观者', heroId: 'caocao', isBot: false },
        ],
        seed: 20261122,
        rules: { skillsEnabled: true },
      },
      io,
    );
    const [yuji, attacker, bystander] = game.state.players;
    attacker.hand = [card('sha', '杀', 'spade')];
    yuji.hand = [yujiCard];
    bystander.hand = [];
    return { game, yuji, attacker, bystander };
  }

  it('黑色假闪被质疑后质疑者摸牌，闪不生效', async () => {
    const { game, yuji, attacker, bystander } = setup(new GuhuoIO([1, 2]), card('fake', '桃', 'spade'));
    const before = yuji.hp;
    await game.useCard(attacker, attacker.hand[0], '杀', [yuji.id]);
    expect(yuji.hp).toBe(before - 1);
    expect(attacker.hp).toBe(attacker.maxHp);
    expect(bystander.hp).toBe(bystander.maxHp);
    expect(attacker.hand).toHaveLength(1);
    expect(bystander.hand).toHaveLength(1);
    expect(game.state.discard.some((item) => item.id === 'fake')).toBe(true);
  });

  it('红色假闪同样作废，质疑者摸牌', async () => {
    const { game, yuji, attacker, bystander } = setup(new GuhuoIO([1, 2]), card('red', '桃', 'heart'));
    const before = yuji.hp;
    await game.useCard(attacker, attacker.hand[0], '杀', [yuji.id]);
    expect(yuji.hp).toBe(before - 1);
    expect(attacker.hp).toBe(attacker.maxHp);
    expect(bystander.hp).toBe(bystander.maxHp);
    expect(attacker.hand).toHaveLength(1);
    expect(bystander.hand).toHaveLength(1);
  });

  it('红桃真闪质疑者失去体力且闪生效', async () => {
    const { game, yuji, attacker, bystander } = setup(new GuhuoIO([1, 2]), card('true', '闪', 'heart'));
    const before = yuji.hp;
    await game.useCard(attacker, attacker.hand[0], '杀', [yuji.id]);
    expect(yuji.hp).toBe(before);
    expect(attacker.hp).toBe(attacker.maxHp - 1);
    expect(bystander.hp).toBe(bystander.maxHp - 1);
    expect(attacker.hand).toHaveLength(0);
  });

  it('非红桃真闪质疑者失去体力，但闪不结算', async () => {
    const { game, yuji, attacker, bystander } = setup(new GuhuoIO([1, 2]), card('true2', '闪', 'diamond'));
    const before = yuji.hp;
    await game.useCard(attacker, attacker.hand[0], '杀', [yuji.id]);
    expect(yuji.hp).toBe(before - 1);
    expect(attacker.hp).toBe(attacker.maxHp - 1);
    expect(bystander.hp).toBe(bystander.maxHp - 1);
  });
});

class CixiongIO extends SkillIO {
  targetPrompts = 0;

  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption' && req.playerId === 1 && req.prompt.includes('雌雄双股剑')) {
      this.targetPrompts += 1;
    }
    return super.ask(req);
  }
}

describe('技能结算修正', () => {
  it('雌雄双股剑每次杀只询问目标一次', async () => {
    const io = new CixiongIO();
    const game = new Game(
      {
        players: [
          { name: '攻击者', heroId: 'guanyu', isBot: false },
          { name: '小乔', heroId: 'xiaoqiao', isBot: false },
          { name: '旁观者', heroId: 'caocao', isBot: false },
        ],
        seed: 20261123,
        rules: { skillsEnabled: true },
      },
      io,
    );
    const [attacker, target] = game.state.players;
    attacker.equips.weapon = {
      id: 'cixiong',
      name: '雌雄双股剑',
      suit: 'spade',
      rank: 2,
      type: 'equip',
      equipSlot: 'weapon',
      range: 2,
    };
    attacker.hand = [card('sha', '杀', 'spade')];
    target.hand = [card('a', '闪', 'heart'), card('b', '桃', 'heart')];
    await game.useCard(attacker, attacker.hand[0], '杀', [target.id]);
    expect(io.targetPrompts).toBe(1);
  });

  it('潜袭禁止目标使用判定颜色的牌', () => {
    const game = new Game(
      {
        players: [
          { name: '马岱', heroId: 'madai', isBot: false },
          { name: '目标', heroId: 'liubei', isBot: false },
        ],
        seed: 20261124,
        rules: { skillsEnabled: true },
      },
      new SkillIO(),
    );
    const target = game.state.players[1];
    target.hand = [card('red', '杀', 'heart'), card('black', '杀', 'spade')];
    target.flags.qianxiColor = 1;
    target.flags.qianxiTurn = game.state.turn;
    let ids = game.buildPlayOptions(target).map((option) => option.cardId);
    expect(ids).not.toContain('red');
    expect(ids).toContain('black');
    target.flags.qianxiColor = 2;
    ids = game.buildPlayOptions(target).map((option) => option.cardId);
    expect(ids).toContain('red');
    expect(ids).not.toContain('black');
  });

  it('黑色延时锦囊不能指定帷幕角色', async () => {
    const game = new Game(
      {
        players: [
          { name: '使用者', heroId: 'liubei', isBot: false },
          { name: '贾诩', heroId: 'jiaxu', isBot: false },
        ],
        seed: 20261125,
        rules: { skillsEnabled: true },
      },
      new SkillIO(),
    );
    const [user, jiaxu] = game.state.players;
    const le = { id: 'le', name: '乐不思蜀', suit: 'spade' as const, rank: 6, type: 'delayed' as const };
    user.hand = [le];
    await game.useCard(user, le, '乐不思蜀', [jiaxu.id]);
    expect(jiaxu.judgeZone).toHaveLength(0);
    expect(game.state.discard.some((item) => item.id === 'le')).toBe(true);
  });

  it('断肠同时清空觉醒与化身技能', async () => {
    const game = new Game(
      {
        players: [
          { name: '来源', heroId: 'caocao', isBot: false },
          { name: '蔡文姬', heroId: 'caiwenji', isBot: false },
          { name: '旁观者', heroId: 'liubei', isBot: false },
        ],
        seed: 20261126,
        rules: { skillsEnabled: true },
      },
      new SkillIO(),
    );
    const [source, cai] = game.state.players;
    source.extraSkills = ['yingzi'];
    cai.hp = 1;
    await game.damage(source, cai, 1, undefined, '测试');
    expect(source.skills).toEqual([]);
    expect(source.extraSkills).toEqual([]);
  });

  it('马岱与庞德拥有马术', () => {
    const game = new Game(
      {
        players: [
          { name: '马岱', heroId: 'madai', isBot: false },
          { name: '甲', heroId: 'liubei', isBot: false },
          { name: '乙', heroId: 'caocao', isBot: false },
          { name: '丙', heroId: 'sunquan', isBot: false },
        ],
        seed: 20261127,
        rules: { skillsEnabled: true },
      },
      new SkillIO(),
    );
    const [madai] = game.state.players;
    const third = game.state.players[2];
    expect(game.distance(madai, third)).toBe(1);
  });
});
