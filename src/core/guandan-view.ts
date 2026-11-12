/**
 * 掼蛋的对局视图：进网络前按视角脱敏，界面只认这一层。
 * 自己的手牌可见，其余只给张数；出过的牌、名次、进贡信息都是公开的。
 */

import type { GdCard, GdCombo } from './guandan';
import type { GdPhase, GdRoundResult, GuandanMatch } from './guandan-match';

export interface GdSeatView {
  seat: number;
  name: string;
  team: 0 | 1;
  count: number;
  place: number | null;
}

export interface GdTributeView {
  from: number;
  to: number;
  resisted: boolean;
  card: string | null;
}

export interface GdView {
  seats: GdSeatView[];
  /** 只有自己的手牌 */
  hand: GdCard[];
  yourSeat: number;
  turn: number;
  trick: GdCombo | null;
  trickOwner: number | null;
  phase: GdPhase;
  levels: [number, number];
  roundLevel: number;
  round: number;
  log: string[];
  lastResult: GdRoundResult | null;
  tributes: GdTributeView[];
  matchWinner: 0 | 1 | null;
  /** 当前是否轮到自己，且可以过牌 */
  canPass: boolean;
}

/** 从对局状态生成某个视角的视图；viewer 传 -1 表示观战 */
export function buildGdView(match: GuandanMatch, viewer: number): GdView {
  const me = viewer >= 0 ? match.seats[viewer] : null;
  const hand = me ? me.hand.map((card) => ({ ...card })) : [];
  const trick = match.trick
    ? {
        ...match.trick,
        cards: match.trick.cards.map((card) => ({ ...card })),
      }
    : null;

  return {
    seats: match.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      team: seat.team,
      count: seat.hand.length,
      place: seat.place,
    })),
    hand,
    yourSeat: viewer,
    turn: match.turn,
    trick,
    trickOwner: match.trickOwner,
    phase: match.phase,
    levels: [match.levels[0], match.levels[1]],
    roundLevel: match.roundLevel,
    round: match.round,
    log: match.log.slice(-24),
    lastResult: match.lastResult
      ? { ...match.lastResult, places: [...match.lastResult.places] }
      : null,
    tributes: match.tributes.map((t) => ({
      from: t.from,
      to: t.to,
      resisted: !!t.resisted,
      card: t.card
        ? `${({ spade: '♠', heart: '♥', club: '♣', diamond: '♦' } as Record<string, string>)[t.card.suit] ?? ''}${
            t.card.joker
              ? t.card.joker === 'big'
                ? '大王'
                : '小王'
              : t.card.rank === 1
                ? 'A'
                : t.card.rank <= 10
                  ? String(t.card.rank)
                  : ['J', 'Q', 'K'][t.card.rank - 11]
          }`
        : null,
    })),
    matchWinner: match.matchWinner,
    canPass: match.phase === 'play' && match.turn === viewer && !!trick,
  };
}
