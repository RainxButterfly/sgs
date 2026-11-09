import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class CancelIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: req.options?.[0]?.id ?? 'no' });
    }
    if (req.kind === 'choosePlayer') {
      return Promise.resolve({ type: 'cancel' });
    }
    if (req.kind === 'respond') return Promise.resolve({ type: 'cancel' });
    if (req.kind === 'play') return Promise.resolve({ type: 'endPlay' });
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function trick(id: string, name: string, suit: Card['suit']): Card {
  return { id, name, suit, rank: 7, type: 'trick' };
}

function weapon(id: string): Card {
  return {
    id,
    name: '贯石斧',
    suit: 'diamond',
    rank: 5,
    type: 'equip',
    equipSlot: 'weapon',
    range: 3,
  };
}

describe('借刀杀人', () => {
  it('需要依次指定持武器角色和其攻击范围内的目标', async () => {
    const game = new Game(
      {
        players: [
          { name: '使用者', heroId: 'liubei', isBot: false },
          { name: '持刀者', heroId: 'caocao', isBot: false },
          { name: '被杀者', heroId: 'sunquan', isBot: false },
        ],
        seed: 20261109,
        rules: { skillsEnabled: false },
      },
      new CancelIO(),
    );
    const [user, holder, victim] = game.state.players;
    const card = trick('jd', '借刀杀人', 'club');
    user.hand = [card];
    holder.hand = [{ id: 'sha', name: '杀', suit: 'spade', rank: 7, type: 'basic' }];
    holder.equips.weapon = weapon('w1');
    victim.hand = [];

    const option = game.buildPlayOptions(user).find((item) => item.as === '借刀杀人');
    expect(option).toBeTruthy();
    expect(option!.targetMin).toBe(2);
    expect(option!.targetMax).toBe(2);
    expect(option!.validTargets).toEqual([holder.id]);
    expect(option!.targetAfter?.[holder.id]).toContain(victim.id);

    const tryUseCard = (
      game as unknown as {
        tryUseCard: (player: unknown, action: GameAction) => Promise<boolean>;
      }
    ).tryUseCard.bind(game);

    const bad = await tryUseCard(user, {
      type: 'useCard',
      cardId: card.id,
      as: '借刀杀人',
      targets: [holder.id, holder.id],
    });
    expect(bad).toBe(false);

    const ok = await tryUseCard(user, {
      type: 'useCard',
      cardId: card.id,
      as: '借刀杀人',
      targets: [holder.id, victim.id],
    });
    expect(ok).toBe(true);
    expect(user.hand.some((item) => item.id === 'w1')).toBe(true);
    expect(holder.equips.weapon).toBeUndefined();
  });
});
