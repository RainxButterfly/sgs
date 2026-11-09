import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { EQUIP_SKILL_ID } from '../equipment';
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
  it('公孙瓒计算别人距离-1，别人计算公孙瓒距离+1', () => {
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
    expect(game.distance(gongsun, second)).toBeLessThanOrEqual(game.distance(third, second) + 1);
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


describe('左慈化身', () => {
  it('化身不会获得装备技能', async () => {
    const game = new Game(
      {
        players: [
          { name: '左慈', heroId: 'zuoci', isBot: false },
          { name: '甲', heroId: 'liubei', isBot: false },
          { name: '乙', heroId: 'caocao', isBot: false },
          { name: '丙', heroId: 'sunquan', isBot: false },
        ],
        seed: 20261120,
        rules: { skillsEnabled: true, mode: 'identity' },
      },
      new SkillIO(),
    );
    await (game as unknown as { trigger: (event: string, base: { data: object }) => Promise<void> }).trigger('gameStart', { data: {} });
    const equipment = new Set(Object.values(EQUIP_SKILL_ID));
    expect(game.state.players[0].extraSkills.length).toBe(2);
    expect(game.state.players[0].extraSkills.some((id) => equipment.has(id))).toBe(false);
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
