import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, Card, GameAction, GameEvent, GameIO, PlayerState } from '../types';

class TestIO implements GameIO {
  asked: AskRequest[] = [];
  events: GameEvent[] = [];
  timeline: string[] = [];
  constructor(private readonly handler?: (req: AskRequest) => GameAction | undefined) {}
  ask(req: AskRequest): Promise<GameAction> {
    this.asked.push(req);
    if (req.kind === 'respond') this.timeline.push(`ask:${req.respondName}`);
    const handled = this.handler?.(req);
    if (handled) return Promise.resolve(handled);
    return Promise.resolve({ type: 'cancel' });
  }
  emit(event: GameEvent): void {
    this.events.push(event);
    if (event.type === 'judge' || event.type === 'reveal') this.timeline.push(`event:${event.type}`);
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeCard(
  id: string,
  name: string,
  suit: Card['suit'] = 'spade',
  type: Card['type'] = 'basic',
): Card {
  return { id, name, suit, rank: 7, type };
}

function makeGame(count: number, io: GameIO) {
  return new Game(
    {
      players: Array.from({ length: count }, (_, i) => ({
        name: `玩家${i + 1}`,
        heroId: 'liubei',
        isBot: false,
      })),
      seed: 20261111,
      rules: { skillsEnabled: false },
    },
    io,
  );
}

type JudgePhaseGame = { judgePhase: (player: PlayerState) => Promise<void> };

const playWuxie = (req: AskRequest): GameAction | undefined => {
  if (req.kind === 'respond' && req.respondName === '无懈可击') {
    const option = req.cardOptions?.[0];
    if (option) return { type: 'respondCard', cardId: option.cardId, as: '无懈可击' };
  }
  return undefined;
};

describe('延时锦囊无懈时机', () => {
  it('乐不思蜀与兵粮寸断使用时不询问无懈，直接放入判定区', async () => {
    for (const name of ['乐不思蜀', '兵粮寸断'] as const) {
      const io = new TestIO();
      const game = makeGame(2, io);
      const [user, target] = game.state.players;
      user.hand = [makeCard('d1', name, 'spade', 'delayed')];
      target.hand = [makeCard('w1', '无懈可击', 'club', 'trick')];
      await game.useCard(user, user.hand[0], name, [target.id]);
      expect(target.judgeZone.map((card) => card.name)).toEqual([name]);
      expect(io.asked.some((req) => req.respondName === '无懈可击')).toBe(false);
    }
  });

  it('乐不思蜀判定前只问一次无懈，抵消后不再判定', async () => {
    const io = new TestIO(playWuxie);
    const game = makeGame(2, io);
    const [, target] = game.state.players;
    target.hand = [makeCard('w1', '无懈可击', 'club', 'trick')];
    target.judgeZone = [makeCard('le1', '乐不思蜀', 'spade', 'delayed')];
    await (game as unknown as JudgePhaseGame).judgePhase(target);
    const asks = io.asked.filter((req) => req.respondName === '无懈可击');
    expect(asks).toHaveLength(1);
    expect(asks[0].prompt).toContain('判定区');
    expect(io.events.some((event) => event.type === 'judge')).toBe(false);
    expect(target.judgeZone).toHaveLength(0);
    expect(target.hand).toHaveLength(0);
    expect(target.skipPhases).not.toContain('play');
  });

  it('兵粮寸断判定前无懈抵消后跳过摸牌不生效', async () => {
    const io = new TestIO(playWuxie);
    const game = makeGame(2, io);
    const [, target] = game.state.players;
    target.hand = [makeCard('w1', '无懈可击', 'club', 'trick')];
    target.judgeZone = [makeCard('bl1', '兵粮寸断', 'club', 'delayed')];
    await (game as unknown as JudgePhaseGame).judgePhase(target);
    expect(io.asked.filter((req) => req.respondName === '无懈可击')).toHaveLength(1);
    expect(io.events.some((event) => event.type === 'judge')).toBe(false);
    expect(target.skipPhases).not.toContain('draw');
  });

  it('无人无懈时先询问后判定，红桃乐不思蜀失效', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [, target] = game.state.players;
    target.hand = [makeCard('w1', '无懈可击', 'club', 'trick')];
    target.judgeZone = [makeCard('le1', '乐不思蜀', 'spade', 'delayed')];
    game.state.deck = [makeCard('j1', '闪', 'heart')];
    await (game as unknown as JudgePhaseGame).judgePhase(target);
    expect(io.asked.filter((req) => req.respondName === '无懈可击')).toHaveLength(1);
    expect(io.events.some((event) => event.type === 'judge')).toBe(true);
    expect(io.timeline.indexOf('ask:无懈可击')).toBeLessThan(io.timeline.indexOf('event:judge'));
    expect(target.skipPhases).not.toContain('play');
  });

  it('非红桃判定跳过出牌阶段，且询问仍在判定之前', async () => {
    const io = new TestIO();
    const game = makeGame(2, io);
    const [, target] = game.state.players;
    target.judgeZone = [makeCard('le1', '乐不思蜀', 'spade', 'delayed')];
    game.state.deck = [makeCard('j1', '闪', 'spade')];
    await (game as unknown as JudgePhaseGame).judgePhase(target);
    expect(io.timeline.indexOf('ask:无懈可击')).toBeLessThan(io.timeline.indexOf('event:judge'));
    expect(target.skipPhases).toContain('play');
  });

  it('判定前无懈可以被另一张无懈反抵消，判定继续', async () => {
    const io = new TestIO(playWuxie);
    const game = makeGame(2, io);
    const [user, target] = game.state.players;
    user.hand = [makeCard('w0', '无懈可击', 'heart', 'trick')];
    target.hand = [makeCard('w1', '无懈可击', 'club', 'trick')];
    target.judgeZone = [makeCard('le1', '乐不思蜀', 'spade', 'delayed')];
    game.state.deck = [makeCard('j1', '闪', 'heart')];
    await (game as unknown as JudgePhaseGame).judgePhase(target);
    expect(io.asked.filter((req) => req.respondName === '无懈可击')).toHaveLength(2);
    expect(io.events.some((event) => event.type === 'judge')).toBe(true);
  });
});