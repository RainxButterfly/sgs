import { describe, expect, it } from 'vitest';
import { buildGameDeck, buildMilitaryDeck, buildStandardDeck } from '../deck';

const SUIT_NAME: Record<string, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };

function countByName(deck: { name: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const card of deck) out[card.name] = (out[card.name] ?? 0) + 1;
  return out;
}

function suitRankGroups(deck: { suit: string; rank: number }[]) {
  const map = new Map<string, number>();
  for (const card of deck) {
    const key = `${card.suit}${card.rank}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

describe('牌堆构成固定', () => {
  it('标准包共 108 张，牌名与张数完全固定', () => {
    const deck = buildStandardDeck();
    expect(deck).toHaveLength(108);
    expect(countByName(deck)).toEqual({
      杀: 30,
      闪: 15,
      桃: 8,
      决斗: 3,
      过河拆桥: 6,
      顺手牵羊: 5,
      万箭齐发: 1,
      桃园结义: 1,
      五谷丰登: 2,
      南蛮入侵: 3,
      借刀杀人: 2,
      无中生有: 4,
      无懈可击: 4,
      乐不思蜀: 3,
      闪电: 2,
      诸葛连弩: 2,
      青釭剑: 1,
      雌雄双股剑: 1,
      寒冰剑: 1,
      贯石斧: 1,
      青龙偃月刀: 1,
      丈八蛇矛: 1,
      方天画戟: 1,
      麒麟弓: 1,
      八卦阵: 2,
      仁王盾: 1,
      的卢: 1,
      绝影: 1,
      爪黄飞电: 1,
      赤兔: 1,
      大宛: 1,
      紫骍: 1,
    });
  });

  it('标准包每种花色各 27 张，同花色点数最多 3 张（EX 牌）', () => {
    const deck = buildStandardDeck();
    const bySuit: Record<string, number> = {};
    for (const card of deck) bySuit[card.suit] = (bySuit[card.suit] ?? 0) + 1;
    expect(bySuit).toEqual({ spade: 27, heart: 27, club: 27, diamond: 27 });

    const groups = suitRankGroups(deck);
    const over = [...groups.entries()].filter(([, count]) => count > 3);
    expect(over).toEqual([]);
    const exKeys = [...groups.entries()].filter(([, count]) => count === 3).map(([key]) => key).sort();
    expect(exKeys).toEqual(['club2', 'diamond12', 'heart12', 'spade2']);
  });

  it('标准包每张牌的花色点数与官方一致', () => {
    const deck = buildStandardDeck();
    const label = (card: { suit: string; rank: number }) =>
      `${SUIT_NAME[card.suit]}${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card.rank - 1]}`;
    const pick = (name: string) =>
      deck
        .filter((card) => card.name === name)
        .map((card) => label(card))
        .sort();
    expect(pick('杀')).toEqual(
      [
        '♠7', '♠8', '♠8', '♠9', '♠9', '♠10', '♠10',
        '♥10', '♥10', '♥J',
        '♦6', '♦7', '♦8', '♦9', '♦10', '♦K',
        '♣2', '♣3', '♣4', '♣5', '♣6', '♣7', '♣8', '♣8', '♣9', '♣9', '♣10', '♣10', '♣J', '♣J',
      ].sort(),
    );
    expect(pick('闪')).toEqual(
      ['♥2', '♥2', '♥K', '♦2', '♦2', '♦3', '♦4', '♦5', '♦6', '♦7', '♦8', '♦9', '♦10', '♦J', '♦J'].sort(),
    );
    expect(pick('桃')).toEqual(['♥3', '♥4', '♥6', '♥7', '♥8', '♥9', '♥Q', '♦Q'].sort());
    expect(pick('过河拆桥')).toEqual(['♠3', '♠4', '♠Q', '♣3', '♣4', '♥Q'].sort());
    expect(pick('无懈可击')).toEqual(['♠J', '♣Q', '♣K', '♦Q'].sort());
    expect(pick('五谷丰登')).toEqual(['♥3', '♥4'].sort());
    expect(pick('乐不思蜀')).toEqual(['♠6', '♣6', '♥6'].sort());
    expect(pick('闪电')).toEqual(['♠A', '♥Q'].sort());
    expect(pick('麒麟弓')).toEqual(['♥5']);
    expect(pick('赤兔')).toEqual(['♥5']);
  });

  it('军争包共 52 张，单副牌同一花色点数不重复', () => {
    const deck = buildMilitaryDeck();
    expect(deck).toHaveLength(52);
    const groups = suitRankGroups(deck);
    expect([...groups.entries()].filter(([, count]) => count > 1)).toEqual([]);
    const bySuit: Record<string, number> = {};
    for (const card of deck) bySuit[card.suit] = (bySuit[card.suit] ?? 0) + 1;
    expect(bySuit).toEqual({ spade: 13, heart: 13, club: 13, diamond: 13 });
  });

  it('开启军争后总数为 160 张', () => {
    expect(buildGameDeck(false)).toHaveLength(108);
    expect(buildGameDeck(true)).toHaveLength(160);
  });
});
