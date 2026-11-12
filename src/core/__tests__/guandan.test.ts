import { describe, expect, it } from 'vitest';
import {
  beats,
  buildGuandanDeck,
  detectCombo,
  isWild,
  rankValue,
  type GdCard,
} from '../guandan';

const C = (suit: GdCard['suit'], rank: number): GdCard => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
});
const J = (joker: 'small' | 'big'): GdCard => ({
  id: `joker-${joker}`,
  suit: 'joker',
  rank: joker === 'big' ? 17 : 16,
  joker,
});

describe('掼蛋牌与牌型内核', () => {
  it('两副牌共 108 张，含 4 张王', () => {
    const deck = buildGuandanDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter((c) => c.joker)).toHaveLength(4);
  });

  it('红桃级牌是逢人配，级牌单张大于 A', () => {
    expect(isWild(C('heart', 2), 2)).toBe(true);
    expect(isWild(C('spade', 2), 2)).toBe(false);
    expect(rankValue(C('spade', 2), 2)).toBe(15);
    expect(rankValue(C('spade', 1), 2)).toBe(14);
    expect(rankValue(J('big'), 2)).toBe(17);
  });

  it('识别单张、对子、三张、炸弹', () => {
    expect(detectCombo([C('spade', 5)], 2)?.type).toBe('single');
    expect(detectCombo([C('spade', 5), C('club', 5)], 2)?.type).toBe('pair');
    expect(detectCombo([C('spade', 5), C('club', 5), C('heart', 5)], 2)?.type).toBe('trio');
    expect(detectCombo([C('spade', 5), C('club', 5), C('diamond', 5), C('heart', 5)], 2)?.type).toBe('bomb');
  });

  it('识别顺子（A 可低可高）与同花顺', () => {
    const low = [C('spade', 1), C('club', 2), C('spade', 3), C('club', 4), C('spade', 5)];
    expect(detectCombo(low, 9)?.type).toBe('straight');
    expect(detectCombo(low, 9)?.rank).toBe(1);

    const high = [C('spade', 10), C('club', 11), C('spade', 12), C('club', 13), C('spade', 1)];
    expect(detectCombo(high, 9)?.type).toBe('straight');
    expect(detectCombo(high, 9)?.rank).toBe(10);

    const flush = [C('spade', 3), C('spade', 4), C('spade', 5), C('spade', 6), C('spade', 7)];
    expect(detectCombo(flush, 9)?.type).toBe('straightFlush');
  });

  it('识别连对与钢板、三带二', () => {
    const pairs = [C('spade', 3), C('club', 3), C('spade', 4), C('club', 4), C('spade', 5), C('club', 5)];
    expect(detectCombo(pairs, 9)?.type).toBe('doubleStraight');

    const triples = [C('spade', 7), C('club', 7), C('diamond', 7), C('spade', 8), C('club', 8), C('diamond', 8)];
    expect(detectCombo(triples, 9)?.type).toBe('tripleStraight');

    const trioPair = [C('spade', 9), C('club', 9), C('diamond', 9), C('spade', 4), C('club', 4)];
    expect(detectCombo(trioPair, 9)?.type).toBe('trioPair');
  });

  it('逢人配可以补牌型', () => {
    // 红桃 3 为级牌时是百搭，配一张 8 组成对子
    const pair = [C('spade', 8), C('heart', 3)];
    expect(detectCombo(pair, 3)?.type).toBe('pair');
    expect(detectCombo(pair, 3)?.rank).toBe(8);

    // 百搭补顺子：4、百搭、6、7、8
    const straight = [C('spade', 4), C('heart', 3), C('spade', 6), C('club', 7), C('spade', 8)];
    expect(detectCombo(straight, 3)?.type).toBe('straight');
    expect(detectCombo(straight, 3)?.rank).toBe(4);
  });

  it('大小关系：炸弹压普通牌型，四大天王压一切', () => {
    const single = detectCombo([C('spade', 13)], 2)!;
    const smallPair = detectCombo([C('spade', 3), C('club', 3)], 2)!;
    const bigPair = detectCombo([C('spade', 9), C('club', 9)], 2)!;
    const bomb = detectCombo(
      [C('spade', 4), C('club', 4), C('diamond', 4), C('heart', 4)],
      2,
    )!;
    const jokerBomb = detectCombo([J('small'), J('small'), J('big'), J('big')], 2)!;

    expect(beats(bigPair, smallPair)).toBe(true);
    // 不同牌型不能互压（炸弹除外）
    expect(beats(smallPair, single)).toBe(false);
    expect(beats(bomb, bigPair)).toBe(true);
    expect(beats(jokerBomb, bomb)).toBe(true);
    expect(beats(single, bigPair)).toBe(false);
  });
});
