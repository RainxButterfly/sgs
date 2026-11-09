import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

class GuicaiIO implements GameIO {
  events: GameEvent[] = [];
  emit(event: GameEvent): void {
    this.events.push(event);
  }
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      const yes = /鬼才/.test(req.prompt);
      return Promise.resolve({ type: 'chooseOption', optionId: yes ? 'yes' : 'no' });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function card(id: string, name: string, suit: Card['suit'], rank: number): Card {
  return { id, name, suit, rank, type: name === '桃' || name === '杀' ? 'basic' : 'trick' };
}

describe('改判提示', () => {
  it('判定事件会记录发动改判的技能名', async () => {
    const io = new GuicaiIO();
    const game = new Game(
      {
        players: [
          { name: '司马懿', heroId: 'simayi', isBot: false },
          { name: '目标', heroId: 'liubei', isBot: false },
        ],
        seed: 20261112,
        rules: { skillsEnabled: true },
      },
      io,
    );
    const [simayi, target] = game.state.players;
    const replacement = card('replacement', '桃', 'heart', 5);
    simayi.hand = [replacement];
    game.state.deck.push(card('top', '杀', 'spade', 7));

    const judged = await game.judge(target, '测试判定');
    expect(judged.id).toBe(replacement.id);

    const judgeEvent = io.events
      .filter((event): event is Extract<GameEvent, { type: 'judge' }> => event.type === 'judge')
      .pop();
    expect(judgeEvent?.changedBy).toBe('鬼才');
  });
});
