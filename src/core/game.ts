import { buildGameDeck, HEROES, HERO_MAP } from './deck';
import { EQUIP_SKILL_ID } from './equipment';
import { SKILL_MAP } from './skills';
import type { SkillContext, SkillDef, SkillEvent } from './skills';
import {
  DEFAULT_RULES,
  FACTION_NAME,
  PHASES,
  ROLE_NAME,
  SUIT_CN,
  type AskRequest,
  type Card,
  type CardType,
  type CardOption,
  type CustomRules,
  type Element,
  type EquipSlot,
  type Faction,
  type GameAction,
  type GameEvent,
  type GameIO,
  type GameState,
  type Phase,
  type PlayerState,
  type Role,
  type SkillOption,
  type Suit,
} from './types';

const ROLE_DIST: Record<number, Role[]> = {
  2: ['lord', 'rebel'],
  3: ['lord', 'loyalist', 'rebel'],
  4: ['lord', 'loyalist', 'rebel', 'rebel'],
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'traitor'],
  6: ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
  7: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor'],
};

export function buildRoles(count: number, mode: 'identity' | 'duel' | 'landlord' | 'guozhan'): Role[] {
  if (mode === 'duel') return ['lord', 'rebel'];
  if (mode === 'landlord') return ['lord', 'rebel', 'rebel'];
  if (mode === 'guozhan') return Array.from({ length: count }, () => 'rebel' as Role);
  return (ROLE_DIST[count] ?? ROLE_DIST[8]).slice();
}

const CARD_TYPE: Record<string, CardType> = {
  杀: 'basic',
  闪: 'basic',
  桃: 'basic',
  决斗: 'trick',
  过河拆桥: 'trick',
  顺手牵羊: 'trick',
  万箭齐发: 'trick',
  南蛮入侵: 'trick',
  桃园结义: 'trick',
  五谷丰登: 'trick',
  借刀杀人: 'trick',
  无中生有: 'trick',
  无懈可击: 'trick',
  火攻: 'trick',
  铁索连环: 'trick',
  兵粮寸断: 'delayed',
  酒: 'basic',
  乐不思蜀: 'delayed',
  闪电: 'delayed',
};

const SYNTH_BAGUA = '__bagua__';
const SYNTH_BAZHEN = '__bazhen__';
const SYNTH_JIJIANG = '__jijiang__';
const SYNTH_HUJIA = '__hujia__';

export const isRed = (suit: Suit) => suit === 'heart' || suit === 'diamond';
export const isBlack = (suit: Suit) => suit === 'spade' || suit === 'club';

export interface ResponseUse {
  card: Card | null;
  as: string;
  skillId?: string;
  virtual?: boolean;
}

export interface GameSetup {
  players: { name: string; heroId: string; isBot?: boolean }[];
  seed?: number;
  lordSeat?: number;
  roles?: Role[];
  rules?: Partial<CustomRules>;
}

export class Game {
  state: GameState;
  io: GameIO;
  private rngState: number;
  private limbo: Card[] = [];
  private askSeq = 0;
  private stopped = false;

  constructor(setup: GameSetup, io: GameIO) {
    this.io = io;
    this.rngState = (setup.seed ?? Date.now()) >>> 0;
    const count = setup.players.length;
    if (count < 2 || count > 8) throw new Error('对局需要 2-8 名玩家');
    const rules: CustomRules = { ...DEFAULT_RULES, ...(setup.rules ?? {}) };
    const mode = rules.mode;
    if (mode === 'duel' && count !== 2) throw new Error('1v1 对局需要 2 名玩家');
    if (mode === 'landlord' && count !== 3) throw new Error('斗地主需要 3 名玩家');
    if (mode === 'guozhan' && count < 4) throw new Error('国战需要至少 4 名玩家');
    let roles: Role[];
    if (setup.roles?.length === count) {
      roles = setup.roles.slice();
    } else {
      roles = buildRoles(count, mode);
      this.shuffle(roles);
    }

    const guozhanCounts: Record<string, number> = { wei: 0, shu: 0, wu: 0, qun: 0 };
    const usedHeroes = new Set<string>();
    const players: PlayerState[] = setup.players.map((p, i) => {
      let heroId = p.heroId;
      if (mode === 'guozhan' && (!heroId || usedHeroes.has(heroId))) {
        const factions = ['wei', 'shu', 'wu', 'qun'];
        const min = Math.min(...factions.map((f) => guozhanCounts[f]));
        const candidates = factions.filter((f) => guozhanCounts[f] === min);
        const faction = candidates[Math.floor(this.random() * candidates.length)];
        const pool = HEROES.filter((h) => h.faction === faction && !usedHeroes.has(h.id));
        if (pool.length) heroId = pool[Math.floor(this.random() * pool.length)].id;
      }
      if (!heroId || usedHeroes.has(heroId)) {
        const pool = [...HERO_MAP.keys()].filter((h) => !usedHeroes.has(h));
        heroId = pool[Math.floor(this.random() * pool.length)];
      }
      usedHeroes.add(heroId);
      const hero = HERO_MAP.get(heroId)!;
      if (mode === 'guozhan') guozhanCounts[hero.faction] += 1;
      const isLord = roles[i] === 'lord' && mode !== 'duel';
      const maxHp = Math.max(1, hero.hp + (isLord ? 1 : 0) + rules.hpModifier);
      return {
        id: i,
        seat: i,
        name: p.name || `玩家${i + 1}`,
        heroId,
        heroName: hero.name,
        faction: hero.faction,
        gender: hero.gender,
        role: roles[i],
        roleRevealed: isLord || rules.revealRoles,
        maxHp,
        hp: maxHp,
        alive: true,
        hand: [],
        equips: {},
        judgeZone: [],
        flags: {},
        usedThisTurn: {},
        skipPhases: [],
        skills: rules.skillsEnabled
          ? [...hero.skillIds, ...(isLord && hero.lordSkillId ? [hero.lordSkillId] : [])]
          : [],
        extraSkills: [],
        fields: [],
        flipped: false,
        unyu: [],
        chained: false,
        isBot: p.isBot ?? false,
      };
    });

    const lordHuangtian = players.some(
      (p) => p.role === 'lord' && p.skills.includes('huangtian'),
    );
    if (lordHuangtian) {
      for (const p of players) {
        if (p.faction === 'qun' && p.role !== 'lord' && !p.skills.includes('huangtian')) {
          p.skills.push('huangtian');
        }
      }
    }
    const lordZhiba = players.find((p) => p.role === 'lord' && p.skills.includes('zhiba'));
    if (lordZhiba) {
      for (const p of players) {
        if (p.faction === 'wu' && p.role !== 'lord' && !p.skills.includes('zhiba')) {
          p.skills.push('zhiba');
        }
      }
    }

    let deck = buildGameDeck(rules.military);
    if (!rules.allowDelayed) deck = deck.filter((card) => card.type !== 'delayed');
    if (!rules.allowNullification) deck = deck.filter((card) => card.name !== '无懈可击');
    if (!rules.allowEquipment) deck = deck.filter((card) => card.type !== 'equip');
    this.shuffle(deck);

    this.state = {
      players,
      deck,
      discard: [],
      current: players.findIndex((p) => p.role === 'lord'),
      turn: 0,
      phase: 'prepare',
      over: false,
      winner: null,
      log: [],
      seed: this.rngState,
      rules,
    };

    for (const p of players) this.drawRaw(p, rules.initialHand);
    for (const p of players) {
      if (mode === 'duel') {
        this.log(`【${p.name}】选择了武将【${p.heroName}】`, 'system');
      } else if (p.role === 'lord') {
        this.log(`【${p.name}】以主公身份登场，选择武将【${p.heroName}】`, 'system');
      } else if (rules.revealRoles) {
        this.log(`【${p.name}】以【${ROLE_NAME[p.role]}】身份登场，选择武将【${p.heroName}】`, 'system');
      } else {
        this.log(`【${p.name}】选择了武将【${p.heroName}】`, 'system');
      }
    }
    if (setup.rules) {
      if (!rules.skillsEnabled) this.log('自定义规则：未启用武将技能', 'system');
      if (rules.revealRoles) this.log('自定义规则：身份公开', 'system');
      else this.log('自定义规则：身份隐藏', 'system');
    }
  }

  // ---------- 基础工具 ----------

  private random(): number {
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  get players(): PlayerState[] {
    return this.state.players;
  }

  get currentPlayer(): PlayerState {
    return this.players[this.state.current];
  }

  getPlayer(id: number): PlayerState {
    return this.players[id];
  }

  alivePlayers(): PlayerState[] {
    return this.players.filter((p) => p.alive);
  }

  private turnOrder(): PlayerState[] {
    const alive = this.alivePlayers();
    if (alive.length === 0) return [];
    const start = alive.findIndex((p) => p.id === this.currentPlayer?.id);
    const idx = start >= 0 ? start : 0;
    return [...alive.slice(idx), ...alive.slice(0, idx)];
  }

  private emit(ev: GameEvent): void {
    this.io.emit(ev);
  }

  log(text: string, kind: 'info' | 'damage' | 'heal' | 'skill' | 'judge' | 'system' | 'death' = 'info'): void {
    this.state.log.push({ id: this.state.log.length + 1, text, kind });
    if (this.state.log.length > 300) this.state.log.shift();
    this.emit({ type: 'log', text, kind });
  }

  hasSkill(player: PlayerState, id: string): boolean {
    if (player.skills.includes(id) || player.extraSkills.includes(id)) return true;
    return Object.values(player.equips).some((c) => c && EQUIP_SKILL_ID[c.name] === id);
  }

  skillsOf(player: PlayerState): SkillDef[] {
    const ids = new Set<string>([...player.skills, ...player.extraSkills]);
    for (const c of Object.values(player.equips)) {
      if (c) {
        const sid = EQUIP_SKILL_ID[c.name];
        if (sid) ids.add(sid);
      }
    }
    return [...ids].map((id) => SKILL_MAP.get(id)).filter((s): s is SkillDef => !!s);
  }

  skillDef(id: string): SkillDef | undefined {
    return SKILL_MAP.get(id);
  }

  skillName(id: string): string {
    return SKILL_MAP.get(id)?.name ?? id;
  }

  flag(player: PlayerState, key: string): number {
    return player.flags[key] ?? 0;
  }

  setFlag(player: PlayerState, key: string, value: number): void {
    player.flags[key] = value;
  }

  private handSize(player: PlayerState): number {
    return player.hand.length;
  }

  // ---------- 距离 / 范围 ----------

  distance(from: PlayerState, to: PlayerState): number {
    if (from.id === to.id) return 0;
    const alive = this.alivePlayers();
    const ia = alive.findIndex((p) => p.id === from.id);
    const ib = alive.findIndex((p) => p.id === to.id);
    const n = alive.length;
    let d = Math.abs(ia - ib);
    d = Math.min(d, n - d);
    if (to.equips.horsePlus) d += 1;
    if (from.equips.horseMinus) d -= 1;
    for (const skill of this.skillsOf(from)) {
      if (skill.id === 'mashu') d -= 1;
    }
    return Math.max(1, d);
  }

  attackRange(player: PlayerState): number {
    let range = player.equips.weapon?.range ?? 1;
    for (const skill of this.skillsOf(player)) {
      if (skill.attackRange) range += skill.attackRange(this, player);
    }
    return range;
  }

  handLimit(player: PlayerState): number {
    let limit = Math.max(0, player.hp + this.state.rules.handLimitModifier);
    for (const skill of this.skillsOf(player)) {
      if (skill.handLimit) limit += skill.handLimit(this, player);
    }
    return limit;
  }

  // ---------- 卡牌区域 ----------

  private removeFromHand(player: PlayerState, card: Card): boolean {
    const i = player.hand.findIndex((c) => c.id === card.id);
    if (i < 0) return false;
    player.hand.splice(i, 1);
    return true;
  }

  private removeFromEquip(player: PlayerState, card: Card): boolean {
    for (const slot of Object.keys(player.equips) as EquipSlot[]) {
      if (player.equips[slot]?.id === card.id) {
        delete player.equips[slot];
        if (card.name === '白银狮子' && player.alive) this.heal(player, player, 1, { reason: '白银狮子' });
        return true;
      }
    }
    return false;
  }

  private removeFromJudge(player: PlayerState, card: Card): boolean {
    const i = player.judgeZone.findIndex((c) => c.id === card.id);
    if (i < 0) return false;
    player.judgeZone.splice(i, 1);
    return true;
  }

  private removeFromLimbo(card: Card): boolean {
    const i = this.limbo.findIndex((c) => c.id === card.id);
    if (i < 0) return false;
    this.limbo.splice(i, 1);
    return true;
  }

  cardOwner(card: Card): PlayerState | null {
    for (const p of this.players) {
      if (p.hand.some((c) => c.id === card.id)) return p;
      if (Object.values(p.equips).some((c) => c?.id === card.id)) return p;
      if (p.judgeZone.some((c) => c.id === card.id)) return p;
    }
    return null;
  }

  isInLimbo(card: Card): boolean {
    return this.limbo.some((c) => c.id === card.id);
  }

  private toDiscard(card: Card): void {
    this.removeFromLimbo(card);
    if (!this.state.discard.some((c) => c.id === card.id)) this.state.discard.push(card);
  }

  async discardCards(player: PlayerState, cards: Card[], reason = '弃置'): Promise<void> {
    const real: Card[] = [];
    const lostEquips: Card[] = [];
    for (const card of cards) {
      const fromHand = this.removeFromHand(player, card);
      const fromEquip = !fromHand && this.removeFromEquip(player, card);
      const fromJudge = !fromHand && !fromEquip && this.removeFromJudge(player, card);
      if (fromHand || fromEquip || fromJudge) {
        real.push(card);
        if (fromEquip) lostEquips.push(card);
        this.toDiscard(card);
      }
    }
    if (real.length === 0) return;
    this.emit({ type: 'discard', playerId: player.id, cards: real, reason });
    this.log(`【${player.name}】弃置了 ${real.map((c) => cardLabel(c)).join('、')}`);
    for (const c of lostEquips) {
      if (player.alive) await this.trigger('equipLost', { player, card: c, data: {} });
    }
    if (player.alive) await this.notifyHandLost(player);
  }

  gainCard(player: PlayerState, card: Card, from?: PlayerState, isPublic = true): void {
    const fromHand = from ? this.removeFromHand(from, card) : false;
    const fromEquip = from ? this.removeFromEquip(from, card) : false;
    const fromJudge = from ? this.removeFromJudge(from, card) : false;
    if (from && !fromHand && !fromEquip && !fromJudge) {
      for (const p of this.players) {
        if (this.removeFromHand(p, card) || this.removeFromEquip(p, card) || this.removeFromJudge(p, card)) break;
      }
    }
    this.removeFromLimbo(card);
    player.hand.push(card);
    this.emit({ type: 'gain', playerId: player.id, cards: [card], from: from?.id, public: isPublic });
    this.log(`【${player.name}】获得了${isPublic ? ` ${cardLabel(card)}` : '一张牌'}`);
  }

  /** 从玩家任意区域取一张牌移除（不进入弃牌堆），用于反馈等 */
  private takeCardFrom(target: PlayerState, card: Card): boolean {
    if (this.removeFromHand(target, card)) return true;
    if (this.removeFromEquip(target, card)) {
      this.emit({ type: 'equip', playerId: target.id, slot: card.equipSlot!, card: undefined });
      return true;
    }
    if (this.removeFromJudge(target, card)) return true;
    return false;
  }

  // ---------- 摸牌 / 判定 ----------

  private drawRaw(player: PlayerState, count: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < count; i += 1) {
      if (this.state.deck.length === 0) this.reshuffle();
      const card = this.state.deck.pop();
      if (!card) break;
      player.hand.push(card);
      out.push(card);
    }
    return out;
  }

  private reshuffle(): void {
    if (this.state.discard.length === 0) return;
    this.state.deck = this.shuffle(this.state.discard.slice());
    this.state.discard = [];
    this.log('牌堆已洗牌', 'system');
  }

  drawCards(player: PlayerState, count: number, reason = '摸牌'): Card[] {
    const cards = this.drawRaw(player, count);
    if (cards.length === 0) return cards;
    this.emit({ type: 'draw', playerId: player.id, count: cards.length, cardIds: cards.map((c) => c.id) });
    this.log(`【${player.name}】${reason}，摸了 ${cards.length} 张牌`);
    return cards;
  }

  revealCards(playerId: number | undefined, cards: Card[]): void {
    this.emit({ type: 'reveal', playerId, cards });
  }

  drawRevealed(player: PlayerState, count: number, reason = '亮出牌'): Card[] {
    const cards = this.drawRaw(player, count);
    if (!cards.length) return cards;
    this.emit({ type: 'reveal', playerId: player.id, cards });
    this.log(`【${player.name}】${reason}：${cards.map((c) => cardLabel(c)).join('、')}`);
    return cards;
  }

  async pindian(initiator: PlayerState, target: PlayerState, reason: string): Promise<boolean> {
    if (!initiator.alive || !target.alive) return false;
    if (!initiator.hand.length || !target.hand.length) return false;
    const mine = await this.askCards(
      initiator,
      initiator.hand,
      1,
      1,
      `拼点（${reason}）：选择一张手牌`,
      undefined,
      false,
    );
    if (!mine.length) return false;
    const theirs = await this.askCards(
      target,
      target.hand,
      1,
      1,
      `拼点（${reason}）：选择一张手牌`,
      undefined,
      false,
    );
    if (!theirs.length) return false;
    const a = mine[0];
    const b = theirs[0];
    this.log(`【${initiator.name}】与【${target.name}】拼点：${cardLabel(a)} 对 ${cardLabel(b)}`, 'system');
    await this.discardCards(initiator, [a], '拼点');
    await this.discardCards(target, [b], '拼点');
    return a.rank > b.rank;
  }

  swapHands(a: PlayerState, b: PlayerState): void {
    if (!a.alive || !b.alive) return;
    const tmp = a.hand;
    a.hand = b.hand;
    b.hand = tmp;
    this.log(`【${a.name}】与【${b.name}】交换了手牌`, 'skill');
    this.emit({ type: 'state' });
  }

  async judge(
    player: PlayerState,
    reason: string,
    opts?: { gainTo?: PlayerState; gainIf?: (card: Card) => boolean },
  ): Promise<Card> {
    if (this.state.deck.length === 0) this.reshuffle();
    let card = this.state.deck.pop();
    if (!card) throw new Error('牌堆与弃牌堆均为空');
    this.emit({ type: 'reveal', playerId: player.id, cards: [card] });
    this.log(`【${player.name}】进行${reason}判定，判定牌为 ${cardLabel(card)}`, 'judge');
    const ctx: SkillContext = {
      game: this,
      owner: player,
      player,
      card,
      data: { judgeCard: card, reason, gained: false },
    };
    await this.trigger('judgeBefore', ctx);
    if (ctx.data.judgeCard && ctx.data.judgeCard.id !== card.id) {
      const old = card;
      card = ctx.data.judgeCard as Card;
      this.toDiscard(old);
      this.emit({ type: 'reveal', playerId: player.id, cards: [card] });
      this.log(`判定牌被改为 ${cardLabel(card)}`, 'judge');
    }
    const success = this.judgeResult(card, reason);
    this.emit({
      type: 'judge',
      playerId: player.id,
      card,
      reason,
      success,
      text: `${SUIT_CN[card.suit]}${rankLabel(card.rank)}`,
    });
    ctx.card = card;
    ctx.data.judgeCard = card;
    await this.trigger('judgeAfter', ctx);
    if (!this.cardOwner(card)) {
      if (opts?.gainTo && (!opts.gainIf || opts.gainIf(card))) this.gainCard(opts.gainTo, card);
      else if (!ctx.data.gained) this.toDiscard(card);
    }
    return card;
  }

  private judgeResult(card: Card, reason: string): boolean {
    if (reason.includes('闪电')) return card.suit === 'spade' && card.rank >= 2 && card.rank <= 9;
    if (reason.includes('乐不思蜀')) return card.suit === 'heart';
    if (reason.includes('刚烈')) return card.suit === 'heart';
    if (reason.includes('铁骑')) return isRed(card.suit);
    if (reason.includes('八卦')) return isRed(card.suit);
    return isRed(card.suit);
  }

  // ---------- 触发器 ----------

  async trigger(event: SkillEvent, base: Partial<SkillContext> & { data?: Record<string, unknown> }): Promise<void> {
    if (this.state.over) return;
    const order = this.turnOrder();
    for (const owner of order) {
      if (!owner.alive) continue;
      for (const skill of this.skillsOf(owner)) {
        for (const trig of skill.triggers ?? []) {
          const events = Array.isArray(trig.event) ? trig.event : [trig.event];
          if (!events.includes(event)) continue;
          const ctx: SkillContext = {
            game: this,
            owner,
            player: base.player ?? owner,
            source: base.source,
            target: base.target,
            card: base.card,
            data: base.data ?? {},
          };
          if (trig.when && !trig.when(ctx)) continue;
          if (trig.oncePerTurn && (owner.usedThisTurn[skill.id] ?? 0) > 0) continue;
          if (trig.optional) {
            const ok = await this.confirm(owner, trig.prompt ?? `是否发动【${skill.name}】？`, skill.desc);
            if (!ok) continue;
          }
          if (trig.oncePerTurn) owner.usedThisTurn[skill.id] = 1;
          this.emit({ type: 'skill', playerId: owner.id, name: skill.name });
          this.log(`【${owner.name}】发动【${skill.name}】`, 'skill');
          await trig.effect(ctx);
          if (this.state.over) return;
        }
      }
    }
  }

  // ---------- 询问 ----------

  private askId(): number {
    this.askSeq += 1;
    return this.askSeq;
  }

  async confirm(player: PlayerState, prompt: string, detail?: string): Promise<boolean> {
    if (!player.alive || this.state.over) return false;
    const req: AskRequest = {
      id: this.askId(),
      playerId: player.id,
      kind: 'chooseOption',
      prompt,
      detail,
      options: [
        { id: 'yes', label: '发动' },
        { id: 'no', label: '取消' },
      ],
      canCancel: true,
    };
    const res = await this.io.ask(req);
    return res.type === 'chooseOption' && res.optionId === 'yes';
  }

  async askOption(
    player: PlayerState,
    prompt: string,
    options: { id: string; label: string; desc?: string }[],
    detail?: string,
    canCancel = false,
  ): Promise<string | null> {
    if (!player.alive || this.state.over) return null;
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'chooseOption',
      prompt,
      detail,
      options,
      canCancel,
    });
    if (res.type !== 'chooseOption') return null;
    return res.optionId;
  }

  async askCards(
    player: PlayerState,
    cards: Card[],
    min: number,
    max: number,
    prompt: string,
    detail?: string,
    canCancel = true,
  ): Promise<Card[]> {
    if (!player.alive || this.state.over || cards.length === 0) return [];
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'chooseCards',
      prompt,
      detail,
      cards,
      min,
      max,
      canCancel,
    });
    if (res.type !== 'chooseCards') return [];
    const ids = new Set(res.cardIds);
    const picked = cards.filter((c) => ids.has(c.id));
    if (picked.length < min || picked.length > max) return [];
    return picked;
  }

  async askPlayer(
    player: PlayerState,
    candidates: PlayerState[],
    prompt: string,
    detail?: string,
    canCancel = false,
  ): Promise<PlayerState | null> {
    const valid = candidates.filter((c) => c.alive);
    if (!player.alive || !valid.length || this.state.over) return null;
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'choosePlayer',
      prompt,
      detail,
      players: valid.map((p) => p.id),
      canCancel,
    });
    if (res.type !== 'choosePlayers' || res.playerIds.length !== 1) return null;
    const p = this.players[res.playerIds[0]];
    return p && p.alive ? p : null;
  }

  async askReorder(
    player: PlayerState,
    cards: Card[],
    prompt: string,
    detail?: string,
  ): Promise<{ top: Card[]; bottom: Card[] }> {
    if (!player.alive || cards.length === 0) return { top: [], bottom: [] };
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'reorder',
      prompt,
      detail,
      cards,
      min: 0,
      max: cards.length,
      canCancel: false,
    });
    if (res.type !== 'chooseCards') return { top: cards, bottom: [] };
    const top = res.cardIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
    const topIds = new Set(top.map((c) => c.id));
    const bottom = cards.filter((c) => !topIds.has(c.id));
    return { top, bottom };
  }

  // ---------- 使用牌 ----------

  private viewAsRules(player: PlayerState, mode: 'play' | 'respond') {
    const rules: { as: string; skillId: string }[] = [];
    for (const skill of this.skillsOf(player)) {
      for (const rule of skill.viewAs ?? []) {
        if (rule.usage === 'both' || rule.usage === mode) {
          rules.push({ as: rule.as, skillId: skill.id });
        }
      }
    }
    return rules;
  }

  private viewAsValid(player: PlayerState, card: Card, as: string, skillId: string): boolean {
    const skill = SKILL_MAP.get(skillId);
    if (!skill) return false;
    const rule = skill.viewAs?.find((r) => r.as === as);
    if (!rule) return false;
    if (rule.condition && !rule.condition(this, player)) return false;
    return rule.filter(this, player, card);
  }

  private cardTypeOf(name: string): CardType {
    return CARD_TYPE[name] ?? 'basic';
  }

  private canUseName(player: PlayerState, name: string): boolean {
    if (name === '闪' || name === '无懈可击') return false;
    if (name === '桃') return player.hp < player.maxHp;
    if (name === '酒') return (player.usedThisTurn.jiu ?? 0) < 1;
    if (name === '杀') {
      if (player.flags.tianyiFail) return false;
      const unlimited = this.skillsOf(player).some((s) => s.unlimitedSha);
      const limit = 1 + (player.flags.tianyi ? 1 : 0);
      return unlimited || (player.usedThisTurn.sha ?? 0) < limit;
    }
    return true;
  }

  canBeTargeted(target: PlayerState, source: PlayerState, cardName: string): boolean {
    for (const skill of this.skillsOf(target)) {
      if (skill.immortalTarget && skill.immortalTarget(this, target, source, cardName)) return false;
    }
    if (cardName === '杀' && this.hasSkill(target, 'kongcheng') && target.hand.length === 0) return false;
    if (cardName === '决斗' && this.hasSkill(target, 'kongcheng') && target.hand.length === 0) return false;
    return true;
  }

  private targetInfo(
    user: PlayerState,
    name: string,
    isLastHand: boolean,
  ): { ids: number[]; min: number; max: number } {
    if (name === '杀') {
      const ignoreDistance = !!user.flags.tianyi;
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            (ignoreDistance || this.distance(user, p) <= this.attackRange(user)),
        )
        .filter((p) => this.canBeTargeted(p, user, '杀'))
        .map((p) => p.id);
      const baseMax =
        isLastHand && !!user.equips.weapon && user.equips.weapon.name === '方天画戟' ? 3 : 1;
      const max = baseMax + (user.flags.tianyi ? 1 : 0);
      return { ids, min: ids.length ? 1 : 0, max };
    }
    if (name === '决斗') {
      return {
        ids: this.players.filter((p) => p.alive && p.id !== user.id && this.canBeTargeted(p, user, '决斗')).map((p) => p.id),
        min: 1,
        max: 1,
      };
    }
    if (name === '过河拆桥') {
      const ids = this.players
        .filter((p) => p.alive && p.id !== user.id && this.hasCards(p) && this.canBeTargeted(p, user, name))
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '顺手牵羊') {
      const ignoreDist = this.hasSkill(user, 'qicai');
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            this.hasCards(p) &&
            (ignoreDist || this.distance(user, p) <= 1) &&
            this.canBeTargeted(p, user, name),
        )
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '乐不思蜀') {
      const ids = this.players
        .filter((p) => p.alive && p.id !== user.id && this.canBeTargeted(p, user, name))
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '借刀杀人') {
      const ids = this.players
        .filter((p) => p.alive && p.id !== user.id && !!p.equips.weapon && this.liangdaoVictims(p, user).length > 0)
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '火攻') {
      const ids = this.players.filter((p) => p.alive && p.id !== user.id && p.hand.length > 0).map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '铁索连环') {
      const ids = this.players.filter((p) => p.alive).map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 2 };
    }
    if (name === '兵粮寸断') {
      const ignoreDist = this.hasSkill(user, 'qicai');
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            (ignoreDist || this.distance(user, p) <= 1) &&
            this.canBeTargeted(p, user, name),
        )
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    return { ids: [], min: 0, max: 0 };
  }

  private hasCards(player: PlayerState): boolean {
    return player.hand.length > 0 || Object.values(player.equips).some(Boolean) || player.judgeZone.length > 0;
  }

  hasAnyCard(player: PlayerState): boolean {
    return this.hasCards(player);
  }

  randomItem<T>(arr: T[]): T | null {
    if (!arr.length) return null;
    return arr[Math.floor(this.random() * arr.length)];
  }

  stageHandCard(player: PlayerState, card: Card): boolean {
    if (!this.removeFromHand(player, card)) return false;
    this.limbo.push(card);
    return true;
  }

  async afterHandChange(player: PlayerState): Promise<void> {
    if (player.alive) await this.notifyHandLost(player);
  }

  shaTargets(user: PlayerState): PlayerState[] {
    return this.players.filter(
      (p) =>
        p.alive &&
        p.id !== user.id &&
        this.distance(user, p) <= this.attackRange(user) &&
        this.canBeTargeted(p, user, '杀'),
    );
  }

  private liangdaoVictims(target: PlayerState, user: PlayerState): PlayerState[] {
    return this.players.filter(
      (p) => p.alive && p.id !== target.id && this.distance(target, p) <= this.attackRange(target),
    );
  }

  private cardOptionFor(
    user: PlayerState,
    card: Card,
    as: string,
    skillId?: string,
    isLastHand = false,
  ): CardOption | null {
    if (!this.canUseName(user, as)) return null;
    const info = this.targetInfo(user, as, isLastHand);
    const needsTarget = [
      '杀',
      '决斗',
      '过河拆桥',
      '顺手牵羊',
      '乐不思蜀',
      '借刀杀人',
      '火攻',
      '铁索连环',
      '兵粮寸断',
    ].includes(as);
    if (needsTarget && info.ids.length === 0) return null;
    return {
      cardId: card.id,
      as,
      skillId,
      element: as === '杀' ? card.element : undefined,
      validTargets: info.ids,
      targetMin: needsTarget ? info.min : 0,
      targetMax: needsTarget ? info.max : 0,
    };
  }

  buildPlayOptions(player: PlayerState): CardOption[] {
    const out: CardOption[] = [];
    const seen = new Set<string>();
    for (const card of player.hand) {
      const isLast = player.hand.length === 1;
      const add = (as: string, skillId?: string) => {
        const key = `${card.id}|${as}|${skillId ?? ''}`;
        if (seen.has(key)) return;
        const opt = this.cardOptionFor(player, card, as, skillId, isLast);
        if (opt) {
          seen.add(key);
          out.push(opt);
        }
      };
      add(card.name);
      if (card.name === '铁索连环') {
        out.push({
          cardId: card.id,
          as: '铁索连环',
          skillId: 'recast',
          label: '重铸',
          validTargets: [],
          targetMin: 0,
          targetMax: 0,
        });
      }
      if (card.name === '杀' && !card.element && player.equips.weapon?.name === '朱雀羽扇') {
        const base = this.cardOptionFor(player, card, '杀', 'zhuque', isLast);
        if (base) out.push({ ...base, element: 'fire', label: '朱雀羽扇·火杀' });
      }
      for (const rule of this.viewAsRules(player, 'play')) {
        if (rule.as === card.name) continue;
        if (!this.viewAsValid(player, card, rule.as, rule.skillId)) continue;
        add(rule.as, rule.skillId);
      }
    }
    return out;
  }

  activeSkillOptions(player: PlayerState): SkillOption[] {
    const out: SkillOption[] = [];
    for (const skill of this.skillsOf(player)) {
      if (!skill.active) continue;
      if (skill.active.oncePerTurn && (player.usedThisTurn[skill.id] ?? 0) > 0) continue;
      if (!skill.active.usable(this, player)) continue;
      out.push({ id: skill.id, name: skill.name, desc: skill.desc });
    }
    return out;
  }

  private async playPhase(player: PlayerState): Promise<void> {
    while (!this.state.over && player.alive) {
      const cardOptions = this.buildPlayOptions(player);
      const skillOptions = this.activeSkillOptions(player);
      const res = await this.io.ask({
        id: this.askId(),
        playerId: player.id,
        kind: 'play',
        prompt: '出牌阶段',
        cardOptions,
        skillOptions,
        canEnd: true,
      });
      if (res.type === 'endPlay' || res.type === 'cancel') return;
      if (res.type === 'activateSkill') {
        await this.activateSkill(player, res.skillId);
        continue;
      }
      if (res.type === 'useCard') {
        const ok = await this.tryUseCard(player, res);
        if (!ok) this.log('无效的出牌', 'system');
        continue;
      }
    }
  }

  private async tryUseCard(player: PlayerState, action: Extract<GameAction, { type: 'useCard' }>): Promise<boolean> {
    const card = player.hand.find((c) => c.id === action.cardId);
    if (!card) return false;
    const as = action.as;
    const opts = this.buildPlayOptions(player);
    const match = opts.find(
      (o) =>
        o.cardId === card.id &&
        o.as === as &&
        (o.skillId ?? '') === (action.skillId ?? '') &&
        (o.element ?? '') === (action.element ?? '') &&
        action.targets.length >= o.targetMin &&
        action.targets.length <= o.targetMax &&
        action.targets.every((t) => o.validTargets.includes(t)),
    );
    if (!match) return false;
    await this.useCard(player, card, as, action.targets, action.skillId, action.extraCardIds, action.element);
    return true;
  }

  async activateSkill(player: PlayerState, skillId: string): Promise<void> {
    const skill = SKILL_MAP.get(skillId);
    if (!skill?.active) return;
    if (skill.active.oncePerTurn && (player.usedThisTurn[skillId] ?? 0) > 0) return;
    player.usedThisTurn[skillId] = (player.usedThisTurn[skillId] ?? 0) + 1;
    this.emit({ type: 'skill', playerId: player.id, name: skill.name });
    this.log(`【${player.name}】发动【${skill.name}】`, 'skill');
    await skill.active.run(this, player);
  }

  async useCard(
    user: PlayerState,
    card: Card,
    asName: string,
    targets: number[],
    skillId?: string,
    extraCardIds?: string[],
    element?: Element,
  ): Promise<void> {
    if (!user.alive || this.state.over) return;
    const extras = (extraCardIds ?? [])
      .map((id) => user.hand.find((c) => c.id === id))
      .filter((c): c is Card => !!c);
    if (!this.removeFromHand(user, card)) return;
    for (const extra of extras) this.removeFromHand(user, extra);
    this.limbo.push(card, ...extras);
    this.emit({ type: 'playCard', playerId: user.id, card, as: asName, targets, skillId });
    this.log(`【${user.name}】使用${asName === card.name ? ` ${cardLabel(card)}` : ` ${cardLabel(card)} 视为【${asName}】`}${targets.length ? `，目标：${targets.map((t) => this.players[t].name).join('、')}` : ''}`);
    if (asName === '杀') {
      user.usedThisTurn.sha = (user.usedThisTurn.sha ?? 0) + 1;
      await this.notifyHandLost(user);
    } else {
      await this.notifyHandLost(user);
    }

    if (card.type === 'equip' && asName === card.name) {
      await this.equipCard(user, card);
      return;
    }

    const cardType = this.cardTypeOf(asName);
    if (cardType === 'trick' && skillId !== 'recast') {
      await this.trigger('cardUsed', { player: user, card, data: { as: asName } });
    }

    if (cardType === 'trick' && isBlack(card.suit) && !asName.includes('无懈可击')) {
      const blocked = targets.filter((id) => this.hasSkill(this.players[id], 'weimu'));
      if (blocked.length > 0) {
        for (const id of blocked) this.log(`【${this.players[id].name}】的帷幕生效，不能成为黑色锦囊的目标`, 'skill');
        targets = targets.filter((id) => !blocked.includes(id));
        if (targets.length === 0 && asName !== '万箭齐发' && asName !== '桃园结义' && asName !== '五谷丰登') {
          this.cleanupLimbo(card, extras);
          await this.notifyHandLost(user);
          return;
        }
      }
    }

    if (asName === '杀') {
      await this.useSha(user, card, targets, element);
    } else if (asName === '桃') {
      this.heal(user, user, 1, { card, reason: '桃' });
    } else if (asName === '无中生有') {
      this.drawCards(user, 2, '使用无中生有');
    } else if (asName === '决斗') {
      const target = this.players[targets[0]];
      if (target && target.alive && !(await this.askWuxie('决斗', target, user, `【${user.name}】对【${target.name}】使用决斗`))) {
        await this.resolveDuel(user, target, card);
      }
    } else if (asName === '过河拆桥') {
      await this.resolveGuohe(user, card, this.players[targets[0]]);
    } else if (asName === '顺手牵羊') {
      await this.resolveShunshou(user, card, this.players[targets[0]]);
    } else if (asName === '万箭齐发') {
      await this.resolveAoe(user, card, '闪');
    } else if (asName === '南蛮入侵') {
      await this.resolveAoe(user, card, '杀');
    } else if (asName === '桃园结义') {
      await this.resolvePeachGarden(user, card);
    } else if (asName === '五谷丰登') {
      await this.resolveHarvest(user, card);
    } else if (asName === '借刀杀人') {
      await this.resolveJiedao(user, card, this.players[targets[0]]);
    } else if (asName === '乐不思蜀') {
      const target = this.players[targets[0]];
      if (target && target.alive && !(await this.askWuxie('乐不思蜀', target, user, `【${user.name}】对【${target.name}】使用乐不思蜀`))) {
        target.judgeZone.push(card);
        this.removeFromLimbo(card);
        this.log(`【${target.name}】的判定区被放置了 ${cardLabel(card)}`);
      }
    } else if (asName === '闪电') {
      user.judgeZone.push(card);
      this.removeFromLimbo(card);
      this.log(`【${user.name}】的判定区被放置了 ${cardLabel(card)}`);
    } else if (asName === '酒') {
      user.flags.jiu = 1;
      user.usedThisTurn.jiu = (user.usedThisTurn.jiu ?? 0) + 1;
      this.log(`【${user.name}】使用酒，下一张杀伤害 +1`);
    } else if (asName === '铁索连环' && skillId === 'recast') {
      this.drawCards(user, 1, '重铸');
      this.log(`【${user.name}】重铸铁索连环，摸一张牌`);
    } else if (asName === '铁索连环') {
      const first = this.players[targets[0]] ?? user;
      if (!(await this.askWuxie('铁索连环', first, user, `【${user.name}】使用铁索连环`))) {
        for (const tid of targets) {
          const target = this.players[tid];
          if (!target?.alive) continue;
          target.chained = !target.chained;
          this.log(`【${target.name}】${target.chained ? '横置' : '重置'}`, 'skill');
        }
      }
    } else if (asName === '火攻') {
      await this.resolveFireAttack(user, card, this.players[targets[0]]);
    } else if (asName === '兵粮寸断') {
      const target = this.players[targets[0]];
      if (
        target?.alive &&
        !(await this.askWuxie('兵粮寸断', target, user, `【${user.name}】对【${target.name}】使用兵粮寸断`))
      ) {
        target.judgeZone.push(card);
        this.removeFromLimbo(card);
        this.log(`【${target.name}】的判定区被放置了 ${cardLabel(card)}`);
      }
    } else if (asName === '无懈可击') {
      // 只能响应时使用
    }

    this.cleanupLimbo(card, extras);
    await this.notifyHandLost(user);
  }

  private async resolveFireAttack(user: PlayerState, card: Card, target?: PlayerState): Promise<void> {
    if (!target?.alive || target.hand.length === 0) return;
    if (await this.askWuxie('火攻', target, user, `【${user.name}】对【${target.name}】使用火攻`)) return;
    const revealed = await this.askCards(target, target.hand, 1, 1, '火攻：展示一张手牌', undefined, false);
    if (!revealed.length) return;
    this.emit({ type: 'reveal', playerId: target.id, cards: revealed });
    this.log(`【${target.name}】展示了 ${cardLabel(revealed[0])}`);
    const suit = revealed[0].suit;
    const sameSuit = user.hand.filter((c) => c.suit === suit);
    if (!sameSuit.length) {
      this.log(`【${user.name}】没有${SUIT_CN[suit]}手牌，火攻无效`);
      return;
    }
    const discard = await this.askCards(
      user,
      sameSuit,
      1,
      1,
      `火攻：弃置一张${SUIT_CN[suit]}手牌，对目标造成 1 点火焰伤害`,
      '不弃置则火攻无效',
      true,
    );
    if (!discard.length) return;
    await this.discardCards(user, discard, '火攻');
    await this.damage(user, target, 1, card, '火攻', 'fire');
  }

  private cleanupLimbo(card: Card, extras: Card[] = []): void {
    for (const c of [card, ...extras]) {
      if (this.limbo.some((x) => x.id === c.id)) this.toDiscard(c);
    }
  }

  async useVirtualSha(user: PlayerState, targetIds: number[], skillId = 'shensu', label = '视为使用一张杀'): Promise<void> {
    if (!user.alive || this.state.over || targetIds.length === 0) return;
    const card: Card = {
      id: `virtual-sha-${++this.askSeq}`,
      name: '杀',
      suit: 'heart',
      rank: 1,
      type: 'basic',
    };
    this.emit({ type: 'playCard', playerId: user.id, card, as: '杀', targets: targetIds, skillId });
    this.log(
      `【${user.name}】${label}，目标：${targetIds.map((id) => this.players[id]?.name ?? '?').join('、')}`,
      'skill',
    );
    user.usedThisTurn.sha = (user.usedThisTurn.sha ?? 0) + 1;
    await this.useSha(user, card, targetIds);
  }

  private async equipCard(player: PlayerState, card: Card): Promise<void> {
    const slot = card.equipSlot;
    if (!slot) return;
    const old = player.equips[slot];
    if (old) {
      this.toDiscard(old);
      this.emit({ type: 'equip', playerId: player.id, slot, card: undefined });
      this.log(`【${player.name}】卸下了 ${cardLabel(old)}`);
      if (old.name === '白银狮子' && player.alive) this.heal(player, player, 1, { reason: '白银狮子' });
      await this.trigger('equipLost', { player, card: old, data: {} });
    }
    player.equips[slot] = card;
    this.removeFromLimbo(card);
    this.emit({ type: 'equip', playerId: player.id, slot, card });
    this.log(`【${player.name}】装备了 ${cardLabel(card)}`);
  }

  private async notifyHandLost(player: PlayerState): Promise<void> {
    if (player.hand.length === 0 && player.alive) {
      await this.trigger('handLost', { player, data: {} });
    }
  }

  // ---------- 杀 ----------

  private async useSha(
    user: PlayerState,
    card: Card,
    targetIds: number[],
    element?: Element,
  ): Promise<void> {
    const jiuBonus = user.flags.jiu ? 1 : 0;
    if (jiuBonus) {
      user.flags.jiu = 0;
      this.log(`【${user.name}】的酒生效，此杀伤害 +1`, 'skill');
    }
    const shaElement = element ?? card.element;
    const seen = new Set<number>();
    for (const tid of targetIds) {
      if (this.state.over) return;
      if (seen.has(tid)) continue;
      seen.add(tid);
      let target = this.players[tid];
      if (!target?.alive) continue;

      const liuli = { newTarget: null as number | null };
      await this.trigger('cardTargeted', { player: target, source: user, target, card, data: liuli });
      if (liuli.newTarget !== null) {
        const nt = this.players[liuli.newTarget];
        if (nt && nt.alive) {
          this.log(`【${target.name}】将杀转移给了【${nt.name}】`, 'skill');
          target = nt;
        }
      }

      const cixiong = user.equips.weapon?.name === '雌雄双股剑' && user.gender !== target.gender;
      if (cixiong) {
        const choice = await this.askOption(
          target,
          '雌雄双股剑：弃置一张手牌，或令使用者摸一张牌',
          [
            { id: 'discard', label: '弃置一张手牌' },
            { id: 'draw', label: '令其摸一张牌' },
          ],
          undefined,
          false,
        );
        if (choice === 'discard' && target.hand.length > 0) {
          const picked = await this.askCards(target, target.hand, 1, 1, '雌雄双股剑：选择一张手牌弃置', undefined, false);
          if (picked.length) await this.discardCards(target, picked, '雌雄双股剑');
        } else {
          this.drawCards(user, 1, '雌雄双股剑');
        }
      }

      const tieji = { noShan: false, cancel: false };
      await this.trigger('shaTargeted', { player: user, source: user, target, card, data: tieji });
      if (tieji.cancel) continue;
      await this.resolveShaOnTarget(user, card, target, tieji.noShan, jiuBonus, shaElement);
    }
  }

  private async resolveShaOnTarget(
    user: PlayerState,
    card: Card,
    target: PlayerState,
    noShan: boolean,
    jiuBonus = 0,
    element?: Element,
  ): Promise<void> {
    if (!target.alive || this.state.over) return;
    const ignoreArmor = user.equips.weapon?.name === '青釭剑';
    const renwang = !ignoreArmor && target.equips.armor?.name === '仁王盾' && isBlack(card.suit);
    if (renwang) {
      this.log(`【${target.name}】的仁王盾生效，黑色杀无效`, 'skill');
      return;
    }
    if (!ignoreArmor && target.equips.armor?.name === '藤甲' && !element) {
      this.log(`【${target.name}】的藤甲生效，普通杀无效`, 'skill');
      return;
    }

    const liegong =
      this.hasSkill(user, 'liegong') &&
      this.state.phase === 'play' &&
      this.currentPlayer.id === user.id &&
      (target.hand.length >= user.hp || target.hand.length <= this.attackRange(user));
    if (liegong) this.log(`【${user.name}】的烈弓生效，目标不能使用闪`, 'skill');

    let dodged = false;
    if (!noShan && !liegong) {
      let need = this.hasSkill(user, 'wushuang') || user.equips.weapon?.name === '无双' ? 2 : 1;
      if (this.hasSkill(user, 'roulin') && target.gender === 'female') need += 1;
      if (this.hasSkill(target, 'roulin') && user.gender === 'female') need += 1;
      dodged = true;
      for (let i = 0; i < need; i += 1) {
        const resp = await this.askRespond(target, '闪', {
          prompt: need > 1 ? `无双：请打出第 ${i + 1} 张闪` : '请打出一张闪',
          canCancel: true,
          ignoreArmor,
        });
        if (!resp) {
          dodged = false;
          break;
        }
      }
    }

    if (dodged) {
      this.log(`【${target.name}】闪避了此杀`);
      const dodgeData: Record<string, unknown> = { forcedHit: false };
      await this.trigger('shaDodged', { player: user, source: user, target, card, data: dodgeData });
      if (!dodgeData.forcedHit) return;
      this.log('【贯石斧】生效，此杀依然命中', 'skill');
    }

    if (user.equips.weapon?.name === '寒冰剑' && this.hasCards(target)) {
      const ok = await this.confirm(user, '是否发动【寒冰剑】？防止此伤害，改为弃置目标两张牌', '寒冰剑');
      if (ok) {
        for (let i = 0; i < 2; i += 1) {
          const c = await this.pickCardFrom(target, user, '寒冰剑：弃置一张牌');
          if (c) await this.discardCards(target, [c], '寒冰剑');
        }
        return;
      }
    }

    let bonus = (user.flags.luoyi ? 1 : 0) + jiuBonus;
    if (user.equips.weapon?.name === '古锭刀' && target.hand.length === 0) {
      bonus += 1;
      this.log(`【${user.name}】的古锭刀生效，此杀伤害 +1`, 'skill');
    }
    await this.damage(user, target, 1 + bonus, card, '杀', element, { ignoreArmor });
  }

  // ---------- 锦囊 ----------

  private async resolveGuohe(user: PlayerState, card: Card, target?: PlayerState): Promise<void> {
    if (!target?.alive || !this.hasCards(target)) return;
    if (await this.askWuxie('过河拆桥', target, user, `【${user.name}】对【${target.name}】使用过河拆桥`)) return;
    const picked = await this.pickCardFrom(target, user, '过河拆桥：选择要弃置的牌');
    if (picked) await this.discardCards(target, [picked], '过河拆桥');
  }

  private async resolveShunshou(user: PlayerState, card: Card, target?: PlayerState): Promise<void> {
    if (!target?.alive || !this.hasCards(target)) return;
    if (await this.askWuxie('顺手牵羊', target, user, `【${user.name}】对【${target.name}】使用顺手牵羊`)) return;
    const picked = await this.pickCardFrom(target, user, '顺手牵羊：选择要获得的牌');
    if (picked) {
      const slot = picked.equipSlot;
      const isPublic = !!slot || target.judgeZone.some((c) => c.id === picked.id);
      this.gainCard(user, picked, target, isPublic);
      if (slot) {
        this.emit({ type: 'equip', playerId: target.id, slot, card: undefined });
        if (target.alive) await this.trigger('equipLost', { player: target, card: picked, data: {} });
      }
      if (!slot) await this.afterHandChange(target);
      this.log(`【${user.name}】获得了【${target.name}】的一张牌`);
    }
  }

  private async resolveAoe(user: PlayerState, card: Card, responseName: '杀' | '闪'): Promise<void> {
    const targets = this.players.filter((p) => p.alive && p.id !== user.id);
    for (const target of targets) {
      if (this.state.over || !target.alive) continue;
      if (isBlack(card.suit) && this.hasSkill(target, 'weimu')) {
        this.log(`【${target.name}】的帷幕生效，不受黑色${card.name}影响`, 'skill');
        continue;
      }
      if (
        card.name === '南蛮入侵' &&
        (this.hasSkill(target, 'huoshou') || this.hasSkill(target, 'juxiang'))
      ) {
        this.log(`【${target.name}】不受南蛮入侵影响`, 'skill');
        continue;
      }
      if (target.equips.armor?.name === '藤甲' && (card.name === '南蛮入侵' || card.name === '万箭齐发')) {
        this.log(`【${target.name}】的藤甲生效，${card.name}无效`, 'skill');
        continue;
      }
      if (await this.askWuxie(card.name, target, user, `【${target.name}】受到${card.name}影响`)) continue;
      if (responseName === '闪') {
        const resp = await this.askRespond(target, '闪', { prompt: '万箭齐发：请打出一张闪', canCancel: true });
        if (resp) continue;
        await this.damage(user, target, 1, card, card.name);
      } else {
        const resp = await this.askRespond(target, '杀', { prompt: '南蛮入侵：请打出一张杀', canCancel: true });
        if (resp) continue;
        await this.damage(user, target, 1, card, card.name);
      }
    }
    if (card.name === '南蛮入侵') {
      const juxiang = this.players.find(
        (p) => p.alive && p.id !== user.id && this.hasSkill(p, 'juxiang'),
      );
      if (juxiang && this.isInLimbo(card)) {
        this.gainCard(juxiang, card, undefined, true);
        this.log(`【${juxiang.name}】的巨象获得了南蛮入侵`, 'skill');
      }
    }
  }

  private async resolvePeachGarden(user: PlayerState, card: Card): Promise<void> {
    for (const p of this.turnOrder()) {
      if (!p.alive) continue;
      if (isBlack(card.suit) && this.hasSkill(p, 'weimu')) {
        this.log(`【${p.name}】的帷幕生效，不受黑色桃园结义影响`, 'skill');
        continue;
      }
      if (await this.askWuxie('桃园结义', p, user, `【${p.name}】受到桃园结义影响`)) continue;
      this.heal(user, p, 1, { card, reason: '桃园结义' });
    }
  }

  private async resolveHarvest(user: PlayerState, card: Card): Promise<void> {
    const alive = this.alivePlayers();
    if (this.state.deck.length < alive.length) this.reshuffle();
    const revealed = this.state.deck.splice(Math.max(0, this.state.deck.length - alive.length));
    revealed.reverse();
    this.emit({ type: 'reveal', cards: revealed });
    this.log(`五谷丰登亮出：${revealed.map((c) => cardLabel(c)).join('、')}`, 'system');
    for (const p of this.turnOrder()) {
      if (!p.alive || revealed.length === 0) continue;
      if (isBlack(card.suit) && this.hasSkill(p, 'weimu')) {
        this.log(`【${p.name}】的帷幕生效，不受黑色五谷丰登影响`, 'skill');
        continue;
      }
      if (await this.askWuxie('五谷丰登', p, user, `【${p.name}】受到五谷丰登影响`)) continue;
      const picked = await this.askCards(p, revealed.slice(), 1, 1, '五谷丰登：选择一张牌获得', undefined, false);
      const got = picked[0] ?? revealed[revealed.length - 1];
      const idx = revealed.findIndex((c) => c.id === got.id);
      if (idx >= 0) revealed.splice(idx, 1);
      this.gainCard(p, got, undefined, true);
    }
    for (const c of revealed) this.toDiscard(c);
  }

  private async resolveJiedao(user: PlayerState, card: Card, target?: PlayerState): Promise<void> {
    if (!target?.alive || !target.equips.weapon) return;
    const victims = this.liangdaoVictims(target, user);
    if (!victims.length) return;
    if (await this.askWuxie('借刀杀人', target, user, `【${user.name}】对【${target.name}】使用借刀杀人`)) return;
    const victim = await this.askPlayer(target, victims, '借刀杀人：选择一名角色，对其使用一张杀', '否则将武器交给使用者');
    if (victim) {
      const used = await this.useShaOn(target, victim, '借刀杀人');
      if (used) return;
    }
    const weapon = target.equips.weapon;
    if (weapon) {
      this.gainCard(user, weapon, target, true);
      this.emit({ type: 'equip', playerId: target.id, slot: 'weapon', card: undefined });
      this.log(`【${target.name}】将武器交给了【${user.name}】`);
      await this.trigger('equipLost', { player: target, card: weapon, data: {} });
    }
  }

  async resolveDuel(user: PlayerState, target: PlayerState, card: Card | null): Promise<void> {
    let responder = target;
    let other = user;
    for (let round = 0; round < 50; round += 1) {
      if (!responder.alive || !other.alive || this.state.over) return;
      const need = this.hasSkill(other, 'wushuang') ? 2 : 1;
      let ok = true;
      for (let i = 0; i < need; i += 1) {
        const resp = await this.askRespond(responder, '杀', {
          prompt: need > 1 ? `决斗（无双）：请打出第 ${i + 1} 张杀` : '决斗：请打出一张杀',
          canCancel: true,
        });
        if (!resp) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        const bonus = other.flags.luoyi ? 1 : 0;
        await this.damage(other, responder, 1 + bonus, card ?? undefined, '决斗');
        return;
      }
      const tmp = responder;
      responder = other;
      other = tmp;
    }
  }

  // ---------- 响应 ----------

  private buildRespondOptions(player: PlayerState, name: string, ignoreArmor = false): CardOption[] {
    const out: CardOption[] = [];
    const seen = new Set<string>();
    for (const card of player.hand) {
      if (card.name === name) {
        const key = `${card.id}|self`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ cardId: card.id, as: name, validTargets: [], targetMin: 0, targetMax: 0 });
        }
      }
      for (const rule of this.viewAsRules(player, 'respond')) {
        if (rule.as !== name) continue;
        if (!this.viewAsValid(player, card, name, rule.skillId)) continue;
        const key = `${card.id}|${rule.skillId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          cardId: card.id,
          as: name,
          skillId: rule.skillId,
          label: this.skillName(rule.skillId),
          validTargets: [],
          targetMin: 0,
          targetMax: 0,
        });
      }
    }
    if (name === '闪' && !ignoreArmor && player.equips.armor?.name === '八卦阵') {
      out.push({ cardId: SYNTH_BAGUA, as: '闪', skillId: 'bagua', label: '八卦阵', validTargets: [], targetMin: 0, targetMax: 0 });
    }
    if (name === '杀' && this.hasSkill(player, 'jijiang')) {
      const allies = this.players.filter((p) => p.alive && p.id !== player.id && p.faction === 'shu');
      if (allies.some((p) => p.hand.length > 0)) {
        out.push({ cardId: SYNTH_JIJIANG, as: '杀', skillId: 'jijiang', label: '激将', validTargets: [], targetMin: 0, targetMax: 0 });
      }
    }
    if (name === '闪' && this.hasSkill(player, 'bazhen') && !player.equips.armor) {
      out.push({ cardId: SYNTH_BAZHEN, as: '闪', skillId: 'bazhen', label: '八阵', validTargets: [], targetMin: 0, targetMax: 0 });
    }
    if (name === '闪' && this.hasSkill(player, 'hujia')) {
      const allies = this.players.filter((p) => p.alive && p.id !== player.id && p.faction === 'wei');
      if (allies.some((p) => p.hand.length > 0)) {
        out.push({ cardId: SYNTH_HUJIA, as: '闪', skillId: 'hujia', label: '护驾', validTargets: [], targetMin: 0, targetMax: 0 });
      }
    }
    return out;
  }

  async askRespond(
    player: PlayerState,
    name: string,
    opts: { prompt: string; detail?: string; canCancel?: boolean; ignoreArmor?: boolean; forcedTarget?: number; targetId?: number },
  ): Promise<ResponseUse | null> {
    if (!player.alive || this.state.over) return null;
    let ignoreArmor = opts.ignoreArmor ?? false;
    const excluded = new Set<string>();
    for (let guard = 0; guard < 8; guard += 1) {
      const options = this.buildRespondOptions(player, name, ignoreArmor).filter(
        (o) => !excluded.has(o.cardId),
      );
      if (options.length === 0) return null;
      const res = await this.io.ask({
        id: this.askId(),
        playerId: player.id,
        kind: 'respond',
        prompt: opts.prompt,
        detail: opts.detail,
        respondName: name,
        cardOptions: options,
        canCancel: opts.canCancel ?? true,
        targetId: opts.targetId,
      });
      if (res.type === 'cancel') return null;
      if (res.type !== 'respondCard') continue;

      if (res.cardId === SYNTH_BAGUA || res.cardId === SYNTH_BAZHEN) {
        const isBazhen = res.cardId === SYNTH_BAZHEN;
        const card = await this.judge(player, isBazhen ? '八阵' : '八卦阵');
        if (isRed(card.suit)) {
          this.log(`【${player.name}】的${isBazhen ? '八阵' : '八卦阵'}判定为红色，视为打出一张闪`, 'skill');
          await this.trigger('shanUsed', { player, data: {} });
          return { card: null, as: '闪', skillId: isBazhen ? 'bazhen' : 'bagua', virtual: true };
        }
        this.log(`【${player.name}】的${isBazhen ? '八阵' : '八卦阵'}判定失败`, 'judge');
        ignoreArmor = true;
        continue;
      }

      if (res.cardId === SYNTH_JIJIANG || res.cardId === SYNTH_HUJIA) {
        const faction = res.cardId === SYNTH_JIJIANG ? 'shu' : 'wei';
        const allies = this.players.filter((p) => p.alive && p.id !== player.id && p.faction === faction);
        let provided = false;
        for (const ally of allies) {
          const resp = await this.askRespond(ally, name, {
            prompt: `【${player.name}】发动${res.cardId === SYNTH_JIJIANG ? '激将' : '护驾'}，是否替其打出一张${name}？`,
            canCancel: true,
          });
          if (resp) {
            provided = true;
            break;
          }
        }
        if (provided) {
          this.log(`【${player.name}】通过${res.cardId === SYNTH_JIJIANG ? '激将' : '护驾'}获得了${name}`, 'skill');
          if (name === '闪') await this.trigger('shanUsed', { player, data: {} });
          return { card: null, as: name, skillId: res.skillId, virtual: true };
        }
        excluded.add(res.cardId);
        ignoreArmor = true;
        continue;
      }

      const option = options.find(
        (o) => o.cardId === res.cardId && o.as === (res.as || name) && (o.skillId ?? '') === (res.skillId ?? ''),
      );
      if (!option) continue;
      const card = player.hand.find((c) => c.id === res.cardId);
      if (!card) continue;
      const as = res.as || card.name;
      const skillId = res.skillId;
      if (as !== name) continue;
      this.removeFromHand(player, card);
      this.toDiscard(card);
      this.emit({ type: 'respond', playerId: player.id, card, as, skillId });
      this.log(`【${player.name}】打出了${as === card.name ? ` ${cardLabel(card)}` : ` ${cardLabel(card)} 视为【${as}】`}`);
      if (as === '杀') player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
      await this.notifyHandLost(player);
      if (as === '闪') await this.trigger('shanUsed', { player, card, data: {} });
      return { card, as, skillId, virtual: as !== card.name };
    }
    return null;
  }

  async useShaOn(player: PlayerState, victim: PlayerState, reason: string): Promise<boolean> {
    const options: CardOption[] = [];
    for (const card of player.hand) {
      if (card.name === '杀') {
        options.push({
          cardId: card.id,
          as: '杀',
          validTargets: [victim.id],
          targetMin: 1,
          targetMax: 1,
        });
      }
      for (const rule of this.viewAsRules(player, 'play')) {
        if (rule.as !== '杀' || !this.viewAsValid(player, card, '杀', rule.skillId)) continue;
        options.push({
          cardId: card.id,
          as: '杀',
          skillId: rule.skillId,
          label: this.skillName(rule.skillId),
          validTargets: [victim.id],
          targetMin: 1,
          targetMax: 1,
        });
      }
    }
    if (!options.length) return false;
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'respond',
      prompt: `${reason}：对【${victim.name}】使用一张杀，否则将武器交给使用者`,
      respondName: '杀',
      cardOptions: options,
      canCancel: true,
    });
    if (res.type !== 'respondCard') return false;
    const card = player.hand.find((c) => c.id === res.cardId);
    if (!card) return false;
    const as = res.as || '杀';
    if (as !== '杀') return false;
    this.removeFromHand(player, card);
    this.limbo.push(card);
    this.emit({ type: 'playCard', playerId: player.id, card, as: '杀', targets: [victim.id], skillId: res.skillId });
    this.log(`【${player.name}】对【${victim.name}】使用了杀`, 'info');
    player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
    await this.notifyHandLost(player);
    await this.useSha(player, card, [victim.id], card.element);
    this.cleanupLimbo(card);
    return true;
  }

  private async askWuxie(cardName: string, target: PlayerState, user: PlayerState, desc: string): Promise<boolean> {
    let nullified = false;
    for (let guard = 0; guard < 8; guard += 1) {
      let played = false;
      for (const p of this.turnOrder()) {
        if (!p.alive) continue;
        const has = p.hand.some((c) => c.name === '无懈可击');
        if (!has) continue;
        const resp = await this.askRespond(p, '无懈可击', {
          prompt: `${desc}，是否使用无懈可击？`,
          canCancel: true,
          targetId: target.id,
        });
        if (resp) {
          nullified = !nullified;
          played = true;
          this.log(`【${p.name}】使用了无懈可击${nullified ? '，效果被抵消' : '，抵消了无懈可击'}`, 'skill');
          break;
        }
      }
      if (!played) break;
    }
    return nullified;
  }

  // ---------- 选择目标卡牌 ----------

  async pickCardFrom(target: PlayerState, chooser: PlayerState, prompt: string): Promise<Card | null> {
    if (!this.hasCards(target)) return null;
    const visible: { id: string; label: string; card?: Card }[] = [];
    for (const slot of Object.keys(target.equips) as EquipSlot[]) {
      const c = target.equips[slot];
      if (c) visible.push({ id: `equip:${c.id}`, label: `装备区 ${cardLabel(c)}`, card: c });
    }
    for (const c of target.judgeZone) {
      visible.push({ id: `judge:${c.id}`, label: `判定区 ${cardLabel(c)}`, card: c });
    }
    if (target.hand.length > 0) visible.push({ id: 'hand', label: `手牌（${target.hand.length} 张，随机）` });

    const choice = await this.askOption(chooser, prompt, visible.map((v) => ({ id: v.id, label: v.label })));
    if (!choice) return null;
    if (choice === 'hand') {
      return target.hand[Math.floor(this.random() * target.hand.length)] ?? null;
    }
    const entry = visible.find((v) => v.id === choice);
    return entry?.card ?? null;
  }

  // ---------- 伤害 / 回复 / 濒死 / 死亡 ----------

  async damage(
    source: PlayerState | null,
    target: PlayerState,
    amount: number,
    card?: Card,
    reason = '',
    element?: Element,
    opts?: { ignoreArmor?: boolean; skipChain?: boolean },
  ): Promise<void> {
    if (amount <= 0 || !target.alive || this.state.over) return;
    const dmgElement = element ?? card?.element;
    const before: Record<string, unknown> = { amount, cancel: false };
    await this.trigger('damageBefore', {
      player: target,
      source: source ?? undefined,
      target,
      card,
      data: before,
    });
    if (before.cancel) return;
    amount = Math.max(0, Number(before.amount ?? amount));
    if (amount <= 0 || !target.alive) return;
    if (!opts?.ignoreArmor && target.equips.armor?.name === '白银狮子' && amount > 1) {
      amount = 1;
      this.log(`【${target.name}】的白银狮子生效，伤害减至 1 点`, 'skill');
    }
    if (!opts?.ignoreArmor && target.equips.armor?.name === '藤甲' && dmgElement === 'fire') {
      amount += 1;
      this.log(`【${target.name}】的藤甲生效，火焰伤害 +1`, 'skill');
    }
    const incoming = amount;
    target.hp -= amount;
    this.emit({
      type: 'damage',
      sourceId: source?.id,
      targetId: target.id,
      amount,
      hp: target.hp,
      card,
      element: dmgElement,
    });
    this.log(
      `${source ? `【${source.name}】对` : ''}【${target.name}】造成 ${amount} 点${dmgElement === 'fire' ? '火焰' : dmgElement === 'thunder' ? '雷电' : ''}伤害${reason ? `（${reason}）` : ''}，体力 ${Math.max(0, target.hp)}/${target.maxHp}`,
      'damage',
    );
    await this.trigger('damageDone', {
      player: target,
      source: source ?? undefined,
      target,
      card,
      data: { amount, element: dmgElement },
    });

    if (dmgElement && !opts?.skipChain && target.chained && !this.state.over) {
      const chained = this.players.filter((p) => p.alive && p.chained);
      for (const p of chained) p.chained = false;
      for (const p of chained) {
        if (this.state.over) break;
        if (p.id === target.id) continue;
        await this.damage(source, p, incoming, card, reason, dmgElement, { skipChain: true });
      }
    }

    if (!this.state.over && target.hp <= 0 && target.alive) {
      await this.dying(target, source ?? undefined);
    }
  }

  heal(source: PlayerState | null, target: PlayerState, amount: number, opts?: { card?: Card; reason?: string }): void {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp === before) return;
    this.emit({ type: 'heal', sourceId: source?.id, targetId: target.id, amount: target.hp - before, hp: target.hp });
    this.log(
      `${source && source.id !== target.id ? `【${source.name}】令` : ''}【${target.name}】回复 ${target.hp - before} 点体力（${opts?.reason ?? '回复'}），体力 ${target.hp}/${target.maxHp}`,
      'heal',
    );
  }

  async loseHp(player: PlayerState, amount: number, source?: PlayerState): Promise<void> {
    if (!player.alive || amount <= 0) return;
    player.hp -= amount;
    this.emit({ type: 'loseHp', targetId: player.id, amount, hp: player.hp });
    this.log(`【${player.name}】失去 ${amount} 点体力，体力 ${Math.max(0, player.hp)}/${player.maxHp}`, 'damage');
    if (player.hp <= 0) await this.dying(player, source);
  }

  async dying(player: PlayerState, killer?: PlayerState): Promise<void> {
    if (!player.alive || this.state.over) return;
    this.emit({ type: 'dying', playerId: player.id });
    this.log(`【${player.name}】进入濒死状态`, 'damage');
    await this.trigger('dying', { player, target: player, data: {} });
    if (player.hp > 0 || !player.alive || this.state.over) return;
    if (this.hasSkill(player, 'bujue')) {
      let rescued = false;
      while (player.hp <= 0 && player.alive) {
        if (this.state.deck.length === 0) this.reshuffle();
        const card = this.state.deck.pop();
        if (!card) break;
        const duplicate = player.unyu.some((c) => c.rank === card.rank);
        player.unyu.push(card);
        this.emit({ type: 'reveal', playerId: player.id, cards: [card] });
        this.log(
          `【${player.name}】不屈：${cardLabel(card)}${duplicate ? '，点数重复' : '，点数唯一'}`,
          'skill',
        );
        if (duplicate) break;
        player.hp = 1;
        this.log(`【${player.name}】不屈生效，体力回复至 1 点`, 'skill');
        rescued = true;
        break;
      }
      if (rescued) return;
    }
    let guard = 0;
    while (player.hp <= 0 && player.alive && !this.state.over) {
      guard += 1;
      if (player.hand.some((card) => card.name === '酒')) {
        const wine = await this.askRespond(player, '酒', {
          prompt: '濒死：是否使用酒回复 1 点体力？',
          canCancel: true,
          targetId: player.id,
        });
        if (wine) {
          this.heal(player, player, 1, { reason: '酒' });
          continue;
        }
      }
      if (guard > 30) {
        await this.kill(player, killer);
        return;
      }
      let saved = false;
      const wansha =
        this.currentPlayer?.alive &&
        this.currentPlayer.id !== player.id &&
        this.hasSkill(this.currentPlayer, 'wansha');
      if (wansha) this.log(`【${this.currentPlayer.name}】的完杀生效，只有濒死角色可以使用桃`, 'skill');
      for (const saver of this.turnOrder()) {
        if (!saver.alive) continue;
        if (wansha && saver.id !== player.id) continue;
        if (!this.hasPeach(saver)) continue;
        const resp = await this.askRespond(saver, '桃', {
          prompt: `【${player.name}】濒死，是否使用一张桃？`,
          canCancel: true,
          targetId: player.id,
        });
        if (resp) {
          const source = saver;
          let amount = 1;
          const target = player;
          if (this.hasSkill(target, 'jiuyuan') && source.id !== target.id && source.faction === 'wu') {
            amount += 1;
            this.log('【救援】发动，额外回复 1 点体力', 'skill');
          }
          this.heal(source, target, amount, { reason: '桃' });
          saved = true;
          break;
        }
      }
      if (!saved) {
        await this.kill(player, killer);
        return;
      }
    }
  }

  private hasPeach(player: PlayerState): boolean {
    return this.buildRespondOptions(player, '桃').length > 0;
  }

  private async kill(player: PlayerState, killer?: PlayerState): Promise<void> {
    if (!player.alive) return;
    await this.trigger('death', { player, source: killer, target: player, data: {} });
    player.alive = false;
    player.roleRevealed = true;
    const cards = [
      ...player.hand,
      ...Object.values(player.equips).filter((c): c is Card => !!c),
      ...player.judgeZone,
      ...player.unyu,
      ...player.fields,
    ];
    player.hand = [];
    player.equips = {};
    player.judgeZone = [];
    player.unyu = [];
    player.fields = [];
    for (const c of cards) this.toDiscard(c);
    this.emit({ type: 'death', playerId: player.id, role: player.role });
    this.log(`【${player.name}】阵亡，身份是【${ROLE_NAME[player.role]}】`, 'death');

    if (killer && killer.alive && this.state.rules.mode === 'identity') {
      if (player.role === 'rebel') {
        this.drawCards(killer, 3, '击杀反贼奖励');
      } else if (player.role === 'loyalist' && killer.role === 'lord') {
        const all = [...killer.hand, ...Object.values(killer.equips).filter((c): c is Card => !!c)];
        await this.discardCards(killer, all, '误杀忠臣');
      }
    }
    this.checkWin();
  }

  private checkWin(): void {
    if (this.state.over) return;
    const alive = this.alivePlayers();
    if (this.state.rules.mode === 'guozhan') {
      const factions = [...new Set(alive.map((p) => p.faction))];
      if (factions.length === 0) {
        this.endGame('draw', '同归于尽，天下未定。');
      } else if (factions.length === 1) {
        const winner = factions[0];
        this.endGame(winner, `${FACTION_NAME[winner]}势力扫平群雄，取得了国战的胜利！`);
      }
      return;
    }
    if (this.state.rules.mode === 'duel') {
      if (alive.length === 0) this.endGame('draw', '两败俱伤，单挑不分胜负。');
      else if (alive.length === 1) {
        const winner = alive[0];
        this.endGame(winner.role === 'lord' ? 'lord' : 'rebel', `【${winner.name}】取得了单挑胜利！`);
      }
      return;
    }
    const lord = this.players.find((p) => p.role === 'lord');
    if (!lord || !lord.alive) {
      if (alive.length === 1 && alive[0].role === 'traitor') {
        this.endGame('traitor', '内奸笑到了最后，独揽天下！');
      } else {
        this.endGame('rebel', '主公陨落，反贼取得了胜利！');
      }
      return;
    }
    const enemies = alive.filter((p) => p.role === 'rebel' || p.role === 'traitor');
    if (enemies.length === 0) this.endGame('lord', '反贼尽灭，主公与忠臣守住了江山！');
  }

  private endGame(winner: Role | Faction | 'draw', text: string): void {
    if (this.state.over) return;
    this.state.over = true;
    this.state.winner = winner;
    this.emit({ type: 'gameOver', text, winner });
    this.log(text, 'system');
  }

  // ---------- 阶段 ----------

  private async judgePhase(player: PlayerState): Promise<void> {
    while (player.judgeZone.length > 0 && player.alive && !this.state.over) {
      const card = player.judgeZone.shift()!;
      if (card.name === '乐不思蜀') {
        this.limbo.push(card);
        const nullified = await this.askWuxie('乐不思蜀', player, player, `【${player.name}】判定区的乐不思蜀`);
        if (nullified) {
          this.toDiscard(card);
          this.log('乐不思蜀被无懈可击抵消', 'skill');
          continue;
        }
        const judged = await this.judge(player, '乐不思蜀');
        if (judged.suit !== 'heart') {
          player.skipPhases.push('play');
          this.log(`【${player.name}】判定不为红桃，跳过出牌阶段`, 'judge');
        } else {
          this.log(`【${player.name}】判定为红桃，乐不思蜀失效`, 'judge');
        }
        this.toDiscard(card);
      } else if (card.name === '闪电') {
        this.limbo.push(card);
        const nullified = await this.askWuxie('闪电', player, player, `【${player.name}】判定区的闪电`);
        if (nullified) {
          this.toDiscard(card);
          this.log('闪电被无懈可击抵消', 'skill');
          continue;
        }
        const judged = await this.judge(player, '闪电');
        if (judged.suit === 'spade' && judged.rank >= 2 && judged.rank <= 9) {
          this.log(`【${player.name}】被闪电击中！`, 'judge');
          await this.damage(null, player, 3, card, '闪电', 'thunder');
          this.toDiscard(card);
        } else {
          const next = this.nextAlive(player);
          if (next) {
            next.judgeZone.push(card);
            this.removeFromLimbo(card);
            this.log(`闪电移动到【${next.name}】的判定区`);
          } else {
            this.toDiscard(card);
          }
        }
      } else if (card.name === '兵粮寸断') {
        this.limbo.push(card);
        const nullified = await this.askWuxie('兵粮寸断', player, player, `【${player.name}】判定区的兵粮寸断`);
        if (nullified) {
          this.toDiscard(card);
          this.log('兵粮寸断被无懈可击抵消', 'skill');
          continue;
        }
        const judged = await this.judge(player, '兵粮寸断');
        if (judged.suit !== 'club') {
          player.skipPhases.push('draw');
          this.log(`【${player.name}】判定不为梅花，跳过摸牌阶段`, 'judge');
        } else {
          this.log(`【${player.name}】判定为梅花，兵粮寸断失效`, 'judge');
        }
        this.toDiscard(card);
      } else {
        this.toDiscard(card);
      }
    }
  }

  private nextAlive(from: PlayerState): PlayerState | null {
    const n = this.players.length;
    for (let i = 1; i <= n; i += 1) {
      const p = this.players[(from.seat + i) % n];
      if (p.alive && p.id !== from.id) return p;
    }
    return null;
  }

  private async drawPhase(player: PlayerState): Promise<void> {
    const data: Record<string, unknown> = {
      drawCount: this.state.rules.drawCount + (this.hasSkill(player, 'yingzi') ? 1 : 0),
      skip: false,
    };
    await this.trigger('drawPhase', { player, data });
    if (data.skip) return;
    const count = Number(data.drawCount ?? 2);
    if (count > 0) this.drawCards(player, count, '摸牌阶段');
  }

  private async discardPhase(player: PlayerState): Promise<void> {
    const limit = this.handLimit(player);
    if (player.hand.length <= limit) return;
    const need = player.hand.length - limit;
    const picked = await this.askCards(player, player.hand, need, need, `弃牌阶段：请弃置 ${need} 张手牌`, undefined, false);
    if (picked.length) await this.discardCards(player, picked, '弃牌阶段');
    else {
      const auto = player.hand.slice(0, need);
      await this.discardCards(player, auto, '弃牌阶段');
    }
  }

  private async runTurn(player: PlayerState): Promise<void> {
    this.state.turn += 1;
    player.usedThisTurn = {};
    player.flags = {};
    player.skipPhases = [];
    this.state.phase = 'prepare';
    this.emit({ type: 'turn', playerId: player.id, turn: this.state.turn });
    this.log(`—— 第 ${this.state.turn} 回合：${player.name} ——`, 'system');

    await this.trigger('turnStart', { player, data: {} });
    if (!player.alive) return;

    for (const phase of PHASES) {
      if (this.state.over || !player.alive) return;
      if (player.skipPhases.includes(phase)) {
        this.log(`【${player.name}】跳过${phaseName(phase)}`);
        continue;
      }
      this.state.phase = phase;
      this.emit({ type: 'phase', playerId: player.id, phase });
      const phaseData: Record<string, unknown> = { phase, skip: false };
      await this.trigger('phaseStart', { player, data: phaseData });
      if (phaseData.skip) {
        this.log(`【${player.name}】跳过了${phaseName(phase)}`);
      } else if (phase === 'judge') {
        await this.judgePhase(player);
      } else if (phase === 'draw') {
        await this.drawPhase(player);
      } else if (phase === 'play') {
        await this.playPhase(player);
      } else if (phase === 'discard') {
        await this.discardPhase(player);
      }
      await this.trigger('phaseEnd', { player, data: { phase } });
      if (this.state.over) return;
    }
    await this.trigger('turnEnd', { player, data: {} });
  }

  private advance(): void {
    const n = this.players.length;
    for (let i = 1; i <= n; i += 1) {
      const idx = (this.state.current + i) % n;
      if (this.players[idx].alive) {
        this.state.current = idx;
        return;
      }
    }
  }

  async begin(): Promise<void> {
    this.emit({ type: 'state' });
    try {
      while (!this.state.over && !this.stopped) {
        const player = this.currentPlayer;
        if (!player?.alive) {
          this.advance();
          continue;
        }
        if (player.flipped) {
          player.flipped = false;
          player.flags = {};
          player.usedThisTurn = {};
          player.skipPhases = [];
          this.state.turn += 1;
          this.emit({ type: 'turn', playerId: player.id, turn: this.state.turn });
          this.log(`【${player.name}】翻面，跳过本回合`, 'system');
          this.advance();
          continue;
        }
        await this.runTurn(player);
        if (this.state.over || this.stopped) break;
        this.advance();
      }
    } catch (err) {
      this.log(`对局异常：${(err as Error).message}`, 'system');
      throw err;
    }
  }

  stop(): void {
    this.stopped = true;
  }
}


export function cardLabel(card: Card): string {
  const rank =
    card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : String(card.rank);
  const name = card.element === 'fire' ? '火杀' : card.element === 'thunder' ? '雷杀' : card.name;
  return `【${name}】${SUIT_SYMBOL[card.suit]}${rank}`;
}

const SUIT_SYMBOL: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

function rankLabel(rank: number): string {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}

function phaseName(phase: Phase): string {
  const map: Record<Phase, string> = {
    prepare: '准备阶段',
    judge: '判定阶段',
    draw: '摸牌阶段',
    play: '出牌阶段',
    discard: '弃牌阶段',
    finish: '结束阶段',
  };
  return map[phase];
}
