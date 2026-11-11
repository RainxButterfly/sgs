import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO } from '../types';

function card(id: string, name: string, suit: Card['suit'], rank: number): Card {
  return { id, name, suit, rank, type: name === '桃' || name === '杀' || name === '闪' || name === '酒' ? 'basic' : 'trick' };
}

class GuhuoIO implements GameIO {
  events: GameEvent[] = [];
  emit(event: GameEvent): void {
    this.events.push(event);
  }
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'respond') {
      const guhuo = req.cardOptions?.find((o) => o.cardId === '__guhuo__');
      if (guhuo) return Promise.resolve({ type: 'respondCard', cardId: '__guhuo__', as: guhuo.as });
      return Promise.resolve({ type: 'cancel' });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
    }
    if (req.kind === 'chooseOption') {
      return Promise.resolve({ type: 'chooseOption', optionId: 'no' });
    }
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeGame() {
  const io = new GuhuoIO();
  const game = new Game(
    {
      players: [
        { name: '于吉', heroId: 'yuji', isBot: false },
        { name: '刘备', heroId: 'liubei', isBot: false },
      ],
      seed: 20261115,
      rules: { skillsEnabled: true },
    },
    io,
  );
  return { game, io };
}

describe('于吉蛊惑响应', () => {
  it('他人濒死时可蛊惑声明桃救人', async () => {
    const { game } = makeGame();
    const [yuji, liubei] = game.state.players;
    yuji.hand = [card('shan', '闪', 'heart', 2)];
    liubei.hand = [];
    liubei.hp = 0;
    await game.dying(liubei);
    expect(liubei.alive).toBe(true);
    expect(liubei.hp).toBeGreaterThan(0);
  });

  it('可用蛊惑声明杀响应南蛮入侵', async () => {
    const { game } = makeGame();
    const [yuji] = game.state.players;
    yuji.hand = [card('shan', '闪', 'spade', 5)];
    const resp = await game.askRespond(yuji, '杀', { prompt: '南蛮入侵：请打出一张杀' });
    expect(resp).toBeTruthy();
    expect(resp?.as).toBe('杀');
    expect(resp?.skillId).toBe('guhuo');
  });

  it('他人锦囊需要无懈时可蛊惑声明无懈可击', async () => {
    const { game } = makeGame();
    const [yuji, liubei] = game.state.players;
    yuji.hand = [card('sha', '杀', 'spade', 5)];
    liubei.hand = [];
    const nullified = await (
      game as unknown as {
        askWuxie: (a: string, b: unknown, c: unknown, d: string, e?: boolean) => Promise<boolean>;
      }
    ).askWuxie('过河拆桥', liubei, liubei, '测试锦囊', true);
    expect(nullified).toBe(true);
  });
});