/**
 * 掼蛋（2v2，完整规则）— 牌与牌型内核
 *
 * 这一层只处理「牌」「级牌」「逢人配」「牌型识别与比大小」，
 * 不含发牌流程与界面，便于单测。
 */

export type GdSuit = 'spade' | 'heart' | 'club' | 'diamond';

export interface GdCard {
  id: string;
  suit: GdSuit | 'joker';
  /** A=1 … K=13；大小王为 16 / 17 */
  rank: number;
  joker?: 'small' | 'big';
}

export type GdComboType =
  | 'single'
  | 'pair'
  | 'trio'
  | 'trioPair'
  | 'straight'
  | 'doubleStraight'
  | 'tripleStraight'
  | 'straightFlush'
  | 'bomb'
  | 'jokerBomb';

export interface GdCombo {
  type: GdComboType;
  /** 主牌点数（用于同型比较） */
  rank: number;
  /** 张数 */
  size: number;
  cards: GdCard[];
}

const SUITS: GdSuit[] = ['spade', 'heart', 'club', 'diamond'];

/** 两副牌：4 花色 × 13 点数 × 2 + 大小王各 2 = 108 张 */
export function buildGuandanDeck(): GdCard[] {
  const deck: GdCard[] = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({ id: `${suit}-${rank}-${copy}`, suit, rank });
      }
    }
    deck.push({ id: `joker-small-${copy}`, suit: 'joker', rank: 16, joker: 'small' });
    deck.push({ id: `joker-big-${copy}`, suit: 'joker', rank: 17, joker: 'big' });
  }
  return deck;
}

/** 逢人配：红桃级牌 */
export function isWild(card: GdCard, level: number): boolean {
  return card.suit === 'heart' && card.rank === level;
}

/** 单张比较用的点数：级牌 > A > K … > 2；小王 16、大王 17 */
export function rankValue(card: GdCard, level: number): number {
  if (card.joker) return card.rank;
  if (card.rank === level) return 15;
  if (card.rank === 1) return 14;
  return card.rank;
}

/** 牌型之间的强弱：返回 true 表示 a 能压 b */
export function beats(a: GdCombo, b: GdCombo): boolean {
  const bombPower = (combo: GdCombo): number => {
    if (combo.type === 'jokerBomb') return 100;
    if (combo.type === 'bomb') return 40 + combo.size; // 4 张=44 … 10 张=50
    if (combo.type === 'straightFlush') return 42; // 同花顺：大于 5 张炸弹以外的炸弹按张数比较
    return 0;
  };

  const aPower = bombPower(a);
  const bPower = bombPower(b);

  if (aPower && bPower) {
    if (aPower !== bPower) return aPower > bPower;
    return a.rank > b.rank;
  }
  if (aPower) return true;
  if (bPower) return false;

  if (a.type !== b.type || a.size !== b.size) return false;
  return a.rank > b.rank;
}

/** 识别牌型；含逢人配时按最合理的组合尝试 */
export function detectCombo(cards: GdCard[], level: number): GdCombo | null {
  if (!cards.length) return null;
  const wilds = cards.filter((c) => isWild(c, level));
  const solid = cards.filter((c) => !isWild(c, level));
  const w = wilds.length;
  const n = cards.length;

  const jokers = solid.filter((c) => c.joker);
  const plain = solid.filter((c) => !c.joker);

  // 王只能单独成牌型，且不能与普通牌、逢人配混用
  if (jokers.length) {
    if (w > 0 || jokers.length !== n) return null;
    const smalls = jokers.filter((c) => c.joker === 'small').length;
    const bigs = jokers.filter((c) => c.joker === 'big').length;
    if (n === 1) return { type: 'single', rank: jokers[0].rank, size: 1, cards };
    if (n === 2 && (smalls === 2 || bigs === 2)) {
      return { type: 'pair', rank: jokers[0].rank, size: 2, cards };
    }
    // 四大天王：两小王 + 两大王
    if (n === 4 && smalls === 2 && bigs === 2) {
      return { type: 'jokerBomb', rank: 17, size: 4, cards };
    }
    return null;
  }

  // 同点数（对子 / 三张 / 炸弹）
  const byRank = new Map<number, GdCard[]>();
  for (const c of plain) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  const rankCounts = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length);

  if (rankCounts.length <= 1) {
    const rank = rankCounts[0]?.[0] ?? (w ? level : 0);
    if (!rank) return null;
    const value = rank === level ? 15 : rank === 1 ? 14 : rank;
    if (n === 1) return { type: 'single', rank: value, size: 1, cards };
    if (n === 2) return { type: 'pair', rank: value, size: 2, cards };
    if (n === 3) return { type: 'trio', rank: value, size: 3, cards };
    if (n >= 4 && n <= 10) return { type: 'bomb', rank: value, size: n, cards };
    return null;
  }

  // 三带二
  if (n === 5 && rankCounts.length === 2) {
    const [r1, arr1] = rankCounts[0];
    const [r2, arr2] = rankCounts[1];
    const c1 = arr1.length;
    const c2 = arr2.length;
    const trioRank = c1 + w >= 3 ? r1 : c2 + w >= 3 ? r2 : null;
    if (trioRank !== null) {
      const pairCount = trioRank === r1 ? c2 : c1;
      if (pairCount + w >= 2) {
        const value = trioRank === level ? 15 : trioRank === 1 ? 14 : trioRank;
        return { type: 'trioPair', rank: value, size: 5, cards };
      }
    }
  }

  const sameSuit =
    w === 0 && plain.length === n && plain.every((c) => c.suit === plain[0].suit);

  // 顺子 / 同花顺（5 张连续）
  if (n === 5) {
    const seq = findSequence(plain, w, 5, 1);
    if (seq !== null) {
      return {
        type: sameSuit ? 'straightFlush' : 'straight',
        rank: seq,
        size: 5,
        cards,
      };
    }
  }

  // 连对（3 连对）与钢板（2 个三张）
  if (n === 6) {
    const pairs = findSequence(plain, w, 3, 2);
    if (pairs !== null) return { type: 'doubleStraight', rank: pairs, size: 6, cards };
    const triples = findSequence(plain, w, 2, 3);
    if (triples !== null) return { type: 'tripleStraight', rank: triples, size: 6, cards };
  }

  return null;
}

/**
 * 在 solid 牌 + w 张百搭里，找出长度为 len、每点重复 repeat 次的连续牌型。
 * 返回起始点数（A 作 1 时最小，10-J-Q-K-A 时 A 作 14）；找不到返回 null。
 */
function findSequence(solid: GdCard[], w: number, len: number, repeat: number): number | null {
  const counts = new Map<number, number>();
  for (const c of solid) {
    if (c.joker) return null;
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }

  for (let start = 1; start <= 14 - len + 1; start += 1) {
    let need = 0;
    let used = 0;
    let ok = true;
    for (let i = 0; i < len; i += 1) {
      const rank = start + i;
      const key = rank === 14 ? 1 : rank; // A 作 14 时，实牌仍是 rank 1
      const have = counts.get(key) ?? 0;
      if (have > repeat) { ok = false; break; }
      used += have;
      need += repeat - have;
    }
    if (!ok) continue;
    if (used !== solid.length) continue; // 多出来的实牌不属于这个顺子
    if (need !== w) continue; // 百搭必须刚好补齐
    return start;
  }
  return null;
}

/**
 * 手牌里所有能出的牌型（用于提示与机器人）。
 * 只做「够用」的枚举：同点数组、顺子族、同花顺、四大天王；
 * 结果过一遍 detectCombo，保证一定是合法牌型。
 */
export function enumerateCombos(hand: GdCard[], level: number): GdCombo[] {
  const wilds = hand.filter((c) => isWild(c, level));
  const solid = hand.filter((c) => !isWild(c, level));
  const groups = new Map<number, GdCard[]>();
  for (const c of solid) {
    if (c.joker) continue;
    groups.set(c.rank, [...(groups.get(c.rank) ?? []), c]);
  }

  const seen = new Set<string>();
  const out: GdCombo[] = [];
  const add = (cards: GdCard[]) => {
    if (!cards.length) return;
    const key = cards
      .map((c) => c.id)
      .sort()
      .join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const combo = detectCombo(cards, level);
    if (combo) out.push(combo);
  };

  // 单张：同点数只取一张，王各取一张
  for (const [, cards] of groups) add([cards[0]]);
  const smallJoker = solid.find((c) => c.joker === 'small');
  const bigJoker = solid.find((c) => c.joker === 'big');
  if (smallJoker) add([smallJoker]);
  if (bigJoker) add([bigJoker]);

  // 对子 / 三张 / 炸弹
  for (const [rank, cards] of groups) {
    for (let size = 2; size <= 6; size += 1) {
      if (cards.length >= size) {
        add(cards.slice(0, size));
      }
      const missing = size - cards.length;
      if (missing > 0 && missing <= wilds.length) {
        add([...cards, ...wilds.slice(0, missing)]);
      }
      void rank;
    }
  }

  // 王的对子与四大天王
  if (solid.filter((c) => c.joker === 'small').length >= 2) {
    add(solid.filter((c) => c.joker === 'small').slice(0, 2));
  }
  if (solid.filter((c) => c.joker === 'big').length >= 2) {
    add(solid.filter((c) => c.joker === 'big').slice(0, 2));
  }
  if (
    solid.filter((c) => c.joker === 'small').length >= 2 &&
    solid.filter((c) => c.joker === 'big').length >= 2
  ) {
    add([...solid.filter((c) => c.joker === 'small').slice(0, 2), ...solid.filter((c) => c.joker === 'big').slice(0, 2)]);
  }

  // 三带二
  const trios = [...groups.entries()].filter(([, cs]) => cs.length >= 3);
  const pairs = [...groups.entries()].filter(([, cs]) => cs.length >= 2);
  for (const [tr, tcards] of trios) {
    for (const [pr, pcards] of pairs) {
      if (tr === pr) continue;
      add([...tcards.slice(0, 3), ...pcards.slice(0, 2)]);
    }
  }

  const seqRanks = (start: number, len: number): number[] =>
    Array.from({ length: len }, (_, i) => {
      const r = start + i;
      return r === 14 ? 1 : r;
    });

  const buildSeq = (start: number, len: number, repeat: number, suit?: GdSuit): GdCard[] | null => {
    const ranks = seqRanks(start, len);
    const picked: GdCard[] = [];
    let needWild = 0;
    for (const r of ranks) {
      const pool = (groups.get(r) ?? []).filter((c) => !suit || c.suit === suit);
      const take = Math.min(repeat, pool.length);
      picked.push(...pool.slice(0, take));
      needWild += repeat - take;
    }
    if (needWild > wilds.length) return null;
    return [...picked, ...wilds.slice(0, needWild)];
  };

  // 顺子 / 同花顺
  for (let start = 1; start <= 10; start += 1) {
    const seq = buildSeq(start, 5, 1);
    if (seq) add(seq);
    for (const suit of SUITS) {
      const flush = buildSeq(start, 5, 1, suit);
      if (flush) add(flush);
    }
  }

  // 连对（3 连对）与钢板（2 个三张）
  for (let start = 1; start <= 12; start += 1) {
    const ds = buildSeq(start, 3, 2);
    if (ds) add(ds);
  }
  for (let start = 1; start <= 13; start += 1) {
    const ts = buildSeq(start, 2, 3);
    if (ts) add(ts);
  }

  return out;
}
