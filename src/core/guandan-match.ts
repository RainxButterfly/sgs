/**
 * 掼蛋（2v2，完整规则）— 一局流程与对局流程
 *
 * 座次：0/2 为甲队，1/3 为乙队，对家即队友。
 * 本层负责：发牌、首出、轮流出牌与过牌、接风、名次、进贡还贡、升级、打 A 结束。
 */

import {
  beats,
  buildGuandanDeck,
  detectCombo,
  enumerateCombos,
  isWild,
  type GdCard,
  type GdCombo,
} from './guandan';

/** 级牌顺序：2 → 3 → … → K → A */
export const LEVEL_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];

export const LEVEL_NAME: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export type GdPhase = 'tribute' | 'return' | 'play' | 'roundOver' | 'matchOver';

export interface GdSeat {
  seat: number;
  name: string;
  team: 0 | 1;
  hand: GdCard[];
  /** 本局名次：1 头游 … 4 末游；未出完为 null */
  place: number | null;
}

export interface GdTribute {
  from: number;
  to: number;
  card: GdCard | null;
  returned?: GdCard | null;
  resisted?: boolean;
}

export interface GdRoundResult {
  /** 按名次排列的座次 */
  places: number[];
  winnerTeam: 0 | 1;
  up: number;
  doubleDown: boolean;
}

export interface GdMatchOptions {
  names?: string[];
  /** 首局级牌，默认 2 */
  firstLevel?: number;
  rng?: () => number;
}

const partnerOf = (seat: number) => (seat + 2) % 4;
const teamOf = (seat: number): 0 | 1 => (seat % 2 === 0 ? 0 : 1);
const teamName = (team: 0 | 1) => (team === 0 ? '甲队' : '乙队');

/** 升 n 级后的级牌 */
export function nextLevel(current: number, up: number): number {
  const i = LEVEL_ORDER.indexOf(current);
  const at = Math.min(LEVEL_ORDER.length - 1, i + up);
  return LEVEL_ORDER[at];
}

export class GuandanMatch {
  seats: GdSeat[];
  levels: [number, number];
  /** 本局级牌：全场统一，取上一局赢家队伍的级牌 */
  roundLevel = 2;
  phase: GdPhase = 'play';
  round = 0;
  turn = 0;
  trick: GdCombo | null = null;
  trickOwner: number | null = null;
  passes = 0;
  places: number[] = [];
  log: string[] = [];
  tributes: GdTribute[] = [];
  pendingReturns: { from: number; to: number; tribute: GdCard }[] = [];
  lastResult: GdRoundResult | null = null;
  matchWinner: 0 | 1 | null = null;
  /** 打 A 失败次数，满 3 次退回 2 */
  private failedA: [number, number] = [0, 0];
  private rng: () => number;

  constructor(options: GdMatchOptions = {}) {
    const names = options.names ?? ['玩家一', '玩家二', '玩家三', '玩家四'];
    this.levels = [options.firstLevel ?? 2, options.firstLevel ?? 2];
    this.rng = options.rng ?? Math.random;
    this.seats = Array.from({ length: 4 }, (_, seat) => ({
      seat,
      name: names[seat] ?? `玩家${seat + 1}`,
      team: teamOf(seat),
      hand: [],
      place: null,
    }));
    this.startRound(0);
  }

  /* ---------------- 基础查询 ---------------- */

  get level(): number {
    return this.roundLevel;
  }

  isActive(seat: number): boolean {
    const s = this.seats[seat];
    return !!s && s.place === null && s.hand.length > 0;
  }

  activeSeats(): number[] {
    return this.seats.filter((s) => s.place === null && s.hand.length > 0).map((s) => s.seat);
  }

  private shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  private note(text: string) {
    this.log.push(text);
    if (this.log.length > 200) this.log.shift();
  }

  /* ---------------- 一局开始 ---------------- */

  /** 洗牌发牌，重置一局内的状态（不决定首出） */
  private deal() {
    this.round += 1;
    this.places = [];
    this.trick = null;
    this.trickOwner = null;
    this.passes = 0;
    this.tributes = [];
    this.pendingReturns = [];

    // 本局级牌：上一局赢家队伍的级牌；首局按 2 起打
    this.roundLevel = this.lastResult
      ? this.levels[this.lastResult.winnerTeam]
      : this.levels[0];

    const deck = this.shuffle(buildGuandanDeck());
    for (const s of this.seats) {
      s.hand = [];
      s.place = null;
    }
    for (let i = 0; i < deck.length; i += 1) {
      this.seats[i % 4].hand.push(deck[i]);
    }
    for (const s of this.seats) {
      s.hand.sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
    }
  }

  /** 开一局（首局或外部指定首出） */
  startRound(firstSeat = 0) {
    this.deal();
    this.turn = firstSeat;
    this.phase = 'play';
    this.note(`第 ${this.round} 局开始，级牌 ${LEVEL_NAME[this.levels[0]]} / ${LEVEL_NAME[this.levels[1]]}`);
  }

  /* ---------------- 出牌 ---------------- */

  /** 校验一手牌，返回牌型或错误原因 */
  checkPlay(seat: number, cards: GdCard[]): { ok: true; combo: GdCombo } | { ok: false; reason: string } {
    if (this.phase !== 'play') return { ok: false, reason: '当前不是出牌阶段' };
    if (this.turn !== seat) return { ok: false, reason: '还没轮到你' };
    if (!cards.length) return { ok: false, reason: '没有选牌' };
    const hand = this.seats[seat].hand;
    const ids = new Set(hand.map((c) => c.id));
    if (cards.some((c) => !ids.has(c.id))) return { ok: false, reason: '手牌里没有这些牌' };
    if (new Set(cards.map((c) => c.id)).size !== cards.length) {
      return { ok: false, reason: '同一张牌重复使用' };
    }

    const level = this.roundLevel;
    const combo = detectCombo(cards, level);
    if (!combo) return { ok: false, reason: '不是合法牌型' };

    if (this.trick) {
      if (!beats(combo, this.trick)) return { ok: false, reason: '压不过上家' };
    }
    return { ok: true, combo };
  }

  /** 出牌；成功返回牌型 */
  play(seat: number, cards: GdCard[]): { ok: boolean; combo?: GdCombo; reason?: string } {
    const check = this.checkPlay(seat, cards);
    if (!check.ok) return { ok: false, reason: check.reason };
    const combo = check.combo;
    const hand = this.seats[seat].hand;
    const ids = new Set(cards.map((c) => c.id));
    this.seats[seat].hand = hand.filter((c) => !ids.has(c.id));

    const wasLead = this.trick === null;
    this.trick = combo;
    this.trickOwner = seat;
    this.passes = 0;
    this.note(
      `${this.seats[seat].name} ${wasLead ? '领出' : '压上'} ${comboLabel(combo)}`,
    );

    if (this.seats[seat].hand.length === 0) {
      this.seats[seat].place = this.places.length + 1;
      this.places.push(seat);
      this.note(`${this.seats[seat].name} 出完，第 ${this.seats[seat].place} 名`);
      if (this.shouldEndRound()) {
        this.endRound();
        return { ok: true, combo };
      }
      // 出完的人不再轮转，若此时其他人都已表态，直接结算这一轮
      if (this.allOthersPassed(seat)) {
        this.closeTrick();
        return { ok: true, combo };
      }
    }

    this.nextTurn();
    return { ok: true, combo };
  }

  pass(seat: number): { ok: boolean; reason?: string } {
    if (this.phase !== 'play') return { ok: false, reason: '当前不是出牌阶段' };
    if (this.turn !== seat) return { ok: false, reason: '还没轮到你' };
    if (!this.trick) return { ok: false, reason: '首家必须出牌' };
    this.passes += 1;
    this.note(`${this.seats[seat].name} 不要`);
    if (this.allOthersPassed(seat)) {
      this.closeTrick();
      return { ok: true };
    }
    this.nextTurn();
    return { ok: true };
  }

  /** 除 trickOwner 外，仍在场的其他人都已过牌？ */
  private allOthersPassed(_seat: number): boolean {
    const active = this.activeSeats();
    const ownerActive = this.trickOwner !== null && this.isActive(this.trickOwner);
    const need = ownerActive ? active.length - 1 : active.length;
    return need > 0 && this.passes >= need;
  }

  private nextTurn() {
    const active = this.activeSeats();
    if (!active.length) {
      this.endRound();
      return;
    }
    let next = (this.turn + 1) % 4;
    for (let i = 0; i < 4; i += 1) {
      if (this.isActive(next)) break;
      next = (next + 1) % 4;
    }
    this.turn = next;
  }

  /** 一轮结束：清空牌面，确定下一家（接风规则） */
  private closeTrick() {
    const owner = this.trickOwner;
    this.trick = null;
    this.trickOwner = null;
    this.passes = 0;
    if (owner === null) return;

    if (this.isActive(owner)) {
      this.turn = owner;
      return;
    }
    const mate = partnerOf(owner);
    if (this.isActive(mate)) {
      this.turn = mate;
      this.note(`${this.seats[owner].name} 已出完，由对家 ${this.seats[mate].name} 接风`);
      return;
    }
    let next = (owner + 1) % 4;
    for (let i = 0; i < 4 && !this.isActive(next); i += 1) next = (next + 1) % 4;
    this.turn = next;
    this.note(`无人接风，轮到 ${this.seats[next].name}`);
  }

  private shouldEndRound(): boolean {
    if (this.places.length >= 3) return true;
    // 双下：前两名同队，本局直接结束
    if (this.places.length === 2) {
      return this.seats[this.places[0]].team === this.seats[this.places[1]].team;
    }
    return false;
  }

  /* ---------------- 一局结算 ---------------- */

  private endRound() {
    // 补齐名次
    for (const s of this.seats) {
      if (s.place === null) {
        s.place = this.places.length + 1;
        this.places.push(s.seat);
      }
    }
    const [first, second] = this.places.map((seat) => this.seats[seat]);
    const winnerTeam = first.team;
    const doubleDown = second.team === winnerTeam;
    const matePlace = this.seats[partnerOf(first.seat)].place ?? 4;
    const up = matePlace === 2 ? 3 : matePlace === 3 ? 2 : 1;

    this.lastResult = { places: [...this.places], winnerTeam, up, doubleDown };
    this.note(
      `${teamName(winnerTeam)} 头游，队友第 ${matePlace} 名，升 ${up} 级`,
    );

    // 升级 / 打 A 判定
    const cur = this.levels[winnerTeam];
    if (cur === 1) {
      if (doubleDown) {
        this.matchWinner = winnerTeam;
        this.phase = 'matchOver';
        this.note(`${teamName(winnerTeam)} 打 A 双下成功，赢下整场`);
        return;
      }
      this.failedA[winnerTeam] += 1;
      if (this.failedA[winnerTeam] >= 3) {
        this.levels[winnerTeam] = 2;
        this.failedA[winnerTeam] = 0;
        this.note(`${teamName(winnerTeam)} 三次打 A 未过，退回 2 级重打`);
      } else {
        this.note(`${teamName(winnerTeam)} 打 A 未双下，继续打 A`);
      }
    } else {
      this.levels[winnerTeam] = nextLevel(cur, up);
    }

    // 进贡在下一局重新发牌之后进行，先记下名次
    this.phase = 'roundOver';
  }

  /* ---------------- 进贡 / 还贡 ---------------- */

  private planTribute() {
    const places = this.lastResult?.places ?? this.places;
    if (places.length < 4) return;
    const [p1, p2, p3, p4] = places;
    const plan: { from: number; to: number }[] = [];
    if (this.seats[p1].team === this.seats[p2].team) {
      // 双下：三游贡头游、末游贡二游
      plan.push({ from: p3, to: p1 });
      plan.push({ from: p4, to: p2 });
    } else {
      plan.push({ from: p4, to: p1 });
    }

    this.tributes = plan.map(({ from, to }) => {
      const payer = this.seats[from];
      const bigJokers = payer.hand.filter((c) => c.joker === 'big').length;
      if (bigJokers >= 2) {
        this.note(`${payer.name} 手执两张大王，抗贡`);
        return { from, to, card: null, resisted: true };
      }
      const card = this.pickTributeCard(from);
      if (!card) return { from, to, card: null, resisted: true };
      return { from, to, card, returned: null };
    });

    // 抗贡不还牌
    this.pendingReturns = this.tributes
      .filter((t) => t.card)
      .map((t) => ({ from: t.to, to: t.from, tribute: t.card as GdCard }));
  }

  /** 进贡要交手上最大的牌，红桃级牌（逢人配）除外 */
  private pickTributeCard(seat: number): GdCard | null {
    const level = this.roundLevel;
    const pool = this.seats[seat].hand.filter((c) => !isWild(c, level));
    if (!pool.length) return null;
    return pool.reduce((best, c) => (c.rank > best.rank ? c : best), pool[0]);
  }

  /** 执行进贡，并把牌交到收贡方手里 */
  applyTribute() {
    if (!this.tributes.length) return;
    for (const t of this.tributes) {
      if (!t.card) continue;
      const payer = this.seats[t.from];
      const taker = this.seats[t.to];
      payer.hand = payer.hand.filter((c) => c.id !== (t.card as GdCard).id);
      taker.hand.push(t.card);
      this.note(`${payer.name} 向 ${taker.name} 进贡 ${cardName(t.card)}`);
    }
  }

  /** 还贡：必须还 10 以下（含 10）的牌 */
  canReturn(seat: number, card: GdCard): boolean {
    if (card.rank > 10 && !card.joker) return false;
    return !card.joker;
  }

  returnCard(from: number, card: GdCard) {
    const idx = this.pendingReturns.findIndex((r) => r.from === from);
    if (idx < 0) return;
    const target = this.pendingReturns[idx];
    const payer = this.seats[from];
    const taker = this.seats[target.to];
    payer.hand = payer.hand.filter((c) => c.id !== card.id);
    taker.hand.push(card);
    const tribute = this.tributes.find((t) => t.from === target.to && t.to === from);
    if (tribute) tribute.returned = card;
    this.note(`${payer.name} 还贡 ${cardName(card)} 给 ${taker.name}`);
    this.pendingReturns.splice(idx, 1);
  }

  /** 自动还贡：挑最小的一张（不超过 10） */
  autoReturn() {
    while (this.pendingReturns.length) {
      const next = this.pendingReturns[0];
      const pool = this.seats[next.from].hand.filter((c) => !c.joker && c.rank <= 10);
      const card = pool.length
        ? pool.reduce((best, c) => (c.rank < best.rank ? c : best), pool[0])
        : this.seats[next.from].hand[0];
      if (!card) {
        this.pendingReturns.shift();
        continue;
      }
      this.returnCard(next.from, card);
    }
  }

  /* ---------------- 下一局 ---------------- */

  /** 结束上一局并开下一局；返回是否还能继续 */
  nextRound(): boolean {
    if (this.phase === 'matchOver') return false;
    if (this.phase !== 'roundOver') return false;

    const places = [...(this.lastResult?.places ?? this.places)];
    this.deal();
    // 进贡是拿新发的手牌去交
    this.planTribute();
    this.applyTribute();
    this.autoReturn();

    // 首出：有进贡则由进贡牌最大的那家先出；抗贡则头游先出
    const givers = this.tributes.filter((t) => t.card);
    let first = places[0] ?? 0;
    if (givers.length) {
      let best = givers[0];
      for (const t of givers) {
        if ((t.card as GdCard).rank > (best.card as GdCard).rank) best = t;
      }
      first = best.from;
      this.note(`由进贡方 ${this.seats[first].name} 先出`);
    } else if (this.tributes.some((t) => t.resisted)) {
      this.note(`抗贡，由头游 ${this.seats[first].name} 先出`);
    } else {
      this.note(`由头游 ${this.seats[first].name} 先出`);
    }

    this.turn = first;
    this.phase = 'play';
    return true;
  }

  /* ---------------- 叫牌 / 机器人 ---------------- */

  /** 生成当前座位所有可出的牌型 */
  candidates(seat: number): GdCombo[] {
    const level = this.roundLevel;
    return enumerateCombos(this.seats[seat].hand, level);
  }

  /** 机器人决策：返回要出的牌，或 null 表示 pass */
  botMove(seat: number): GdCard[] | null {
    if (this.turn !== seat || this.phase !== 'play') return null;
    const level = this.roundLevel;
    const hand = this.seats[seat].hand;
    const all = enumerateCombos(hand, level);

    if (!this.trick) {
      // 领出：优先出长牌型（顺子/连对/钢板），再出小单张小对子，留住炸弹
      const long = all
        .filter((c) => !isBombLike(c) && c.size >= 5)
        .sort((a, b) => a.rank - b.rank);
      if (long.length) return long[0].cards;
      const simple = all
        .filter((c) => !isBombLike(c))
        .sort((a, b) => a.rank - b.rank || a.size - b.size);
      if (simple.length) return simple[0].cards;
      return all.length ? all[0].cards : null;
    }

    // 队友出的牌不压
    if (this.trickOwner !== null && this.seats[this.trickOwner].team === this.seats[seat].team) {
      return null;
    }

    const trick = this.trick;
    const able = all.filter((c) => beats(c, trick));
    if (!able.length) return null;

    const plain = able.filter((c) => !isBombLike(c)).sort((a, b) => a.rank - b.rank);
    if (plain.length) return plain[0].cards;

    // 只能炸：对手快出完才炸，否则留着
    const opponentLow = [0, 1, 2, 3]
      .filter((s) => this.seats[s].team !== this.seats[seat].team)
      .some((s) => this.isActive(s) && this.seats[s].hand.length <= 6);
    if (opponentLow) {
      const bombs = able.filter(isBombLike).sort((a, b) => a.size - b.size || a.rank - b.rank);
      if (bombs.length) return bombs[0].cards;
    }
    return null;
  }

  /** 自动推进到当前座位可行动（机器人代打），最多 n 步 */
  autoPlay(steps = 1) {
    for (let i = 0; i < steps; i += 1) {
      if (this.phase !== 'play') return;
      const seat = this.turn;
      const move = this.botMove(seat);
      if (move) this.play(seat, move);
      else {
        const r = this.pass(seat);
        if (!r.ok) {
          // 首家无法 pass，兜底出一张最小单牌
          const card = this.seats[seat].hand[0];
          if (card) this.play(seat, [card]);
          else return;
        }
      }
    }
  }
}

function isBombLike(combo: GdCombo): boolean {
  return combo.type === 'bomb' || combo.type === 'jokerBomb' || combo.type === 'straightFlush';
}

const COMBO_NAME: Record<string, string> = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trioPair: '三带二',
  straight: '顺子',
  doubleStraight: '连对',
  tripleStraight: '钢板',
  straightFlush: '同花顺',
  bomb: '炸弹',
  jokerBomb: '四大天王',
};

const SUIT_NAME: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

export function cardName(card: GdCard): string {
  if (card.joker) return card.joker === 'big' ? '大王' : '小王';
  const rank = card.rank === 1 ? 'A' : card.rank <= 10 ? String(card.rank) : ['J', 'Q', 'K'][card.rank - 11];
  return `${SUIT_NAME[card.suit] ?? ''}${rank}`;
}

export function comboLabel(combo: GdCombo): string {
  const name = COMBO_NAME[combo.type] ?? combo.type;
  const cards = combo.cards.map(cardName).join(' ');
  return `${name}（${cards}）`;
}
