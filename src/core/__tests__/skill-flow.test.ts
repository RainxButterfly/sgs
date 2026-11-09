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
