import { buildGameDeck, HEROES, HERO_MAP, PLAYABLE_HEROES } from './deck';
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
  type AoeEntry,
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

export function buildRoles(count: number, mode: 'identity' | 'duel' | 'landlord' | 'guozhan' | '2v2'): Role[] {
  if (mode === 'duel') return ['lord', 'rebel'];
  if (mode === '2v2') return ['loyalist', 'rebel', 'rebel', 'loyalist'];
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
const SYNTH_ZHANGBA = '__zhangba__';
const SYNTH_GUHUO = '__guhuo__';

export const isRed = (suit: Suit) => suit === 'heart' || suit === 'diamond';
export const isBlack = (suit: Suit) => suit === 'spade' || suit === 'club';

export interface ResponseUse {
  card: Card | null;
  as: string;
  skillId?: string;
  virtual?: boolean;
}

export interface GameSetup {
  players: { name: string; heroId: string; heroIds?: string[]; isBot?: boolean }[];
  seed?: number;
  direction?: 1 | -1;
  lordSeat?: number;
  roles?: Role[];
  /** 先手座位：无主公的模式在选将前就随机确定，保证选将页与牌桌座次一致 */
  startPlayer?: number;
  rules?: Partial<CustomRules>;
}

export class Game {
  state: GameState;
  io: GameIO;
  private rngState: number;
  private limbo: Card[] = [];
  private askSeq = 0;
  private logSeq = 0;
  private stopped = false;
  private team2v2FirstDrawUsed = false;
  private wuxieWindowPending = false;
  private extraTurnPlayerId: number | null = null;

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
    if (mode === '2v2' && count !== 4) throw new Error('2v2 对局需要 4 名玩家');
    let roles: Role[];
    if (setup.roles?.length === count) {
      roles = setup.roles.slice();
    } else {
      roles = buildRoles(count, mode);
      if (mode !== '2v2') this.shuffle(roles);
    }

    const guozhanCounts: Record<string, number> = { wei: 0, shu: 0, wu: 0, qun: 0 };
    const usedHeroes = new Set<string>();
    const pickUnusedHero = (faction?: Faction, excludeId?: string): string | undefined => {
      const pool = PLAYABLE_HEROES.filter(
        (hero) =>
          !usedHeroes.has(hero.id) &&
          hero.id !== excludeId &&
          (!faction || hero.faction === faction),
      );
      return pool[Math.floor(this.random() * pool.length)]?.id;
    };
    const players: PlayerState[] = setup.players.map((p, i) => {
      const requested = (p.heroIds?.length ? p.heroIds : [p.heroId]).filter(Boolean);
      let primary = requested.find((id) => HERO_MAP.has(id) && !usedHeroes.has(id));
      let heroIds: string[] = [];
      if (mode === 'guozhan') {
        if (!primary) {
          const factions = ['wei', 'shu', 'wu', 'qun'] as const;
          const min = Math.min(...factions.map((f) => guozhanCounts[f]));
          const candidates = factions.filter((f) => guozhanCounts[f] === min);
          const faction = candidates[Math.floor(this.random() * candidates.length)];
          primary = pickUnusedHero(faction) ?? pickUnusedHero();
        }
        const primaryHero = primary ? HERO_MAP.get(primary) : undefined;
        const faction = primaryHero?.faction;
        let secondary = requested.find(
          (id) =>
            id !== primary &&
            !usedHeroes.has(id) &&
            HERO_MAP.get(id)?.faction === faction,
        );
        if (!secondary) secondary = pickUnusedHero(faction, primary) ?? pickUnusedHero(undefined, primary);
        heroIds = [primary, secondary].filter((id): id is string => !!id);
      } else {
        primary = primary ?? pickUnusedHero();
        heroIds = primary ? [primary] : [];
      }
      const primaryId = heroIds[0] ?? pickUnusedHero() ?? PLAYABLE_HEROES[0].id;
      if (!heroIds.length) heroIds = [primaryId];
      const heroes = heroIds.map((id) => HERO_MAP.get(id)).filter((hero): hero is NonNullable<typeof hero> => !!hero);
      const hero = heroes[0] ?? HERO_MAP.get(PLAYABLE_HEROES[0].id)!;
      for (const id of heroIds) usedHeroes.add(id);
      if (mode === 'guozhan') guozhanCounts[hero.faction] += 1;
      const isLandlord = mode === 'landlord' && roles[i] === 'lord';
      const isLord = roles[i] === 'lord' && mode !== 'duel' && mode !== 'landlord' && count > 2;
      const halfReward =
        heroes.length > 1 && heroes.reduce((sum, item) => sum + item.hp, 0) % 2 === 1;
      const baseHp = heroes.length > 1
        ? Math.floor(heroes.reduce((sum, item) => sum + item.hp, 0) / 2)
        : hero.hp;
      const maxHp = Math.max(1, baseHp + (isLord || isLandlord ? 1 : 0) + rules.hpModifier);
      const skills = rules.skillsEnabled
        ? [
            ...new Set(
              heroes.flatMap((item) => [
                ...item.skillIds,
                ...(isLord && item.lordSkillId ? [item.lordSkillId] : []),
              ]),
            ),
          ]
        : [];
      return {
        id: i,
        seat: i,
        name: p.name || `玩家${i + 1}`,
        heroId: hero.id,
        heroIds,
        heroName: heroes.map((item) => item.name).join('·') || hero.name,
        faction: hero.faction,
        gender: hero.gender,
        role: roles[i],
        roleRevealed: isLord || isLandlord || mode === 'landlord' || rules.revealRoles,
        maxHp,
        hp: maxHp,
        alive: true,
        hand: [],
        equips: {},
        judgeZone: [],
        flags: {},
        usedThisTurn: {},
        skipPhases: [],
        skills,
        extraSkills: [],
        fields: [],
        flipped: false,
        unyu: [],
        pojun: [],
        chained: false,
        isBot: p.isBot ?? false,
        generalSkills: mode === 'guozhan' ? heroes.map((item) => item.skillIds) : undefined,
        generalRevealed: mode === 'guozhan' ? heroes.map(() => false) : undefined,
        ambition: false,
      };
    });

    if (mode === 'landlord') {
      for (const p of players) {
        p.skills.push(p.role === 'lord' ? 'bahu' : 'gongku');
        if (p.role === 'lord') p.skills.push('feiyang');
      }
    }

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

    const initialCurrent =
      setup.startPlayer != null && setup.startPlayer >= 0 && setup.startPlayer < players.length
        ? setup.startPlayer
        : mode === '2v2'
          ? 0
          : mode === 'duel' || mode === 'guozhan'
            ? Math.floor(this.random() * players.length)
            : Math.max(0, players.findIndex((p) => p.role === 'lord'));
    this.state = {
      players,
      deck,
      discard: [],
      current: initialCurrent,
      startPlayer: initialCurrent,
      turn: 0,
      // 2v2 的队伍按号位划分，固定顺时针让号位与玩家顺序一一对应
      direction: mode === '2v2' ? 1 : setup.direction ?? -1,
      phase: 'prepare',
      over: false,
      winner: null,
      log: [],
      seed: this.rngState,
      rules,
    };

    for (const p of players) this.drawRaw(p, rules.initialHand);
    if (mode === '2v2' && players[3]) {
      this.drawRaw(players[3], 1);
      this.log(`【${players[3].name}】4号位开局额外摸一张牌（手牌 ${rules.initialHand + 1} 张）`, 'system');
    }
    for (const p of players) {
      if (p.heroIds && p.heroIds.length > 1) {
        const totalHp = p.heroIds.reduce((sum, id) => sum + (HERO_MAP.get(id)?.hp ?? 0), 0);
        if (totalHp % 2 === 1) {
          this.drawRaw(p, 1);
          this.log(`【${p.name}】国战半血奖励，摸一张牌`, 'system');
        }
      }
    }
    for (const p of players) {
      if (mode === 'duel' || count === 2) {
        this.log(`【${p.name}】选择了武将【${p.heroName}】`, 'system');
      } else if (mode === 'landlord') {
        this.log(`【${p.name}】以${p.role === 'lord' ? '地主' : '农民'}身份登场，选择武将【${p.heroName}】`, 'system');
      } else if (mode === '2v2') {
        this.log(`【${p.name}】以【${p.role === 'loyalist' ? '甲队' : '乙队'}】身份登场，选择武将【${p.heroName}】`, 'system');
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
    const n = this.players.length;
    if (n === 0) return [];
    const start = this.currentPlayer?.id ?? 0;
    const dir = this.state.direction;
    const out: PlayerState[] = [];
    for (let step = 0; step < n; step += 1) {
      const player = this.players[(start + step * dir + n * 1000) % n];
      if (player?.alive) out.push(player);
    }
    return out;
  }

  emit(ev: GameEvent): void {
    this.io.emit(ev);
  }

  /** 测试工具：向全场广播一条操作通报（联机时所有玩家都会收到弹窗与战报） */
  devAnnounce(playerId: number, text: string): void {
    const player = this.state.players[playerId];
    const name = player?.name ?? `座位 ${playerId}`;
    this.log(`【测试工具】${name}：${text}`, 'system');
    this.emit({ type: 'devNotice', playerId, name, text });
  }

  /** 测试工具：令指定角色阵亡 */
  async devKillPlayer(playerId: number): Promise<boolean> {
    const player = this.state.players[playerId];
    if (!player || !player.alive) return false;
    await this.kill(player);
    return true;
  }

  /** 测试工具：直接结束对局 */
  devEndGame(winner: 'loyalist' | 'rebel' | 'draw'): void {
    if (this.state.over) return;
    const text =
      winner === 'draw' ? '测试工具结束对局：平局' : winner === 'loyalist' ? '测试工具结束对局：甲队获胜' : '测试工具结束对局：乙队获胜';
    this.endGame(winner, text);
  }

  log(text: string, kind: 'info' | 'damage' | 'heal' | 'skill' | 'judge' | 'system' | 'death' = 'info'): void {
    this.logSeq += 1;
    this.state.log.push({ id: this.logSeq, text, kind });
    if (this.state.log.length > 300) this.state.log.shift();
    this.emit({ type: 'log', text, kind });
  }

  hasSkill(player: PlayerState, id: string): boolean {
    const equipped = Object.values(player.equips).some((c) => c && EQUIP_SKILL_ID[c.name] === id);
    if (equipped) return true;
    if (this.state.rules.mode === 'guozhan' && player.generalSkills) {
      const revealedSkill = player.generalSkills.some(
        (skills, index) => !!player.generalRevealed?.[index] && skills.includes(id),
      );
      const extra = !!player.generalRevealed?.some(Boolean) && player.extraSkills.includes(id);
      return revealedSkill || extra;
    }
    return player.skills.includes(id) || player.extraSkills.includes(id);
  }

  skillsOf(player: PlayerState): SkillDef[] {
    const ids = new Set<string>();
    if (this.state.rules.mode === 'guozhan' && player.generalSkills) {
      player.generalSkills.forEach((skills, index) => {
        if (player.generalRevealed?.[index]) for (const id of skills) ids.add(id);
      });
      if (player.generalRevealed?.some(Boolean)) {
        for (const id of player.extraSkills) ids.add(id);
      }
    } else {
      for (const id of player.skills) ids.add(id);
      for (const id of player.extraSkills) ids.add(id);
    }
    for (const c of Object.values(player.equips)) {
      if (c) {
        const sid = EQUIP_SKILL_ID[c.name];
        if (sid) ids.add(sid);
      }
    }
    return [...ids].map((id) => SKILL_MAP.get(id)).filter((s): s is SkillDef => !!s);
  }

  revealGeneral(player: PlayerState, index: number): boolean {
    if (this.state.rules.mode !== 'guozhan' || !player.alive) return false;
    if (!player.generalRevealed) return false;
    if (player.generalRevealed[index]) return false;
    player.generalRevealed[index] = true;
    const label = index === 0 ? '主将' : '副将';
    this.log(`【${player.name}】明置${label}，势力为【${FACTION_NAME[player.faction]}】`, 'skill');
    this.emit({ type: 'reveal', playerId: player.id, cards: [], label });
    this.checkAmbition(player);
    this.emit({ type: 'state' });
    return true;
  }

  private checkAmbition(owner: PlayerState): void {
    if (this.state.rules.mode !== 'guozhan') return;
    const revealed = this.players.filter(
      (p) => p.alive && p.faction === owner.faction && p.generalRevealed?.some(Boolean),
    ).length;
    if (revealed * 2 <= this.players.length) return;
    for (const player of this.players) {
      if (player.faction !== owner.faction || !player.alive || player.ambition) continue;
      player.ambition = true;
      this.log(`【${player.name}】成为野心家`, 'system');
    }
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
      if (skill.distanceFrom) d += skill.distanceFrom(this, from, to);
    }
    for (const skill of this.skillsOf(to)) {
      if (skill.distanceTo) d += skill.distanceTo(this, to, from);
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
    const wasLast = player.hand.length === 1;
    player.hand.splice(i, 1);
    if (wasLast) player.flags.handLostPending = 1;
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

  private async removeCardForUse(player: PlayerState, card: Card): Promise<'hand' | 'equip' | null> {
    if (this.removeFromHand(player, card)) return 'hand';
    if (this.removeFromEquip(player, card)) {
      this.emit({ type: 'equip', playerId: player.id, slot: card.equipSlot!, card: undefined });
      if (player.alive) {
        await this.trigger('equipLost', { player, card, data: {} });
        await this.trigger('cardLost', { player, card, data: { reason: '使用' } });
      }
      return 'equip';
    }
    return null;
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
    for (const card of real) {
      if (player.alive) {
        await this.trigger('cardLost', {
          player,
          card,
          data: { reason },
        });
      }
    }
    this.log(
      `【${player.name}】弃置了 ${real.map((c) => cardLabel(c)).join('、')}${reason && reason !== '弃置' ? `（${reason}）` : ''}`,
    );
    for (const c of lostEquips) {
      if (player.alive) await this.trigger('equipLost', { player, card: c, data: {} });
    }
    if (player.alive) await this.notifyHandLost(player);
  }

  gainFromDiscard(player: PlayerState, card: Card, isPublic = true, reason = '固政'): void {
    const index = this.state.discard.findIndex((item) => item.id === card.id);
    if (index < 0) return;
    this.state.discard.splice(index, 1);
    player.hand.push(card);
    this.emit({ type: 'gain', playerId: player.id, cards: [card], public: isPublic });
    this.log(
      `【${player.name}】${isPublic ? `获得了 ${cardLabel(card)}` : '获得了一张牌'}（${reason}）`,
      'skill',
    );
  }

  async gainCard(player: PlayerState, card: Card, from?: PlayerState, isPublic = true): Promise<void> {
    const fromHand = from ? this.removeFromHand(from, card) : false;
    let fromEquip = from ? this.removeFromEquip(from, card) : false;
    const fromJudge = from ? this.removeFromJudge(from, card) : false;
    let actualFrom = from;
    let lostEquip = fromEquip;
    if (from && !fromHand && !fromEquip && !fromJudge) {
      for (const p of this.players) {
        if (this.removeFromHand(p, card)) {
          actualFrom = p;
          break;
        }
        if (this.removeFromEquip(p, card)) {
          actualFrom = p;
          lostEquip = true;
          break;
        }
        if (this.removeFromJudge(p, card)) {
          actualFrom = p;
          break;
        }
      }
    }
    this.removeFromLimbo(card);
    player.hand.push(card);
    this.emit({ type: 'gain', playerId: player.id, cards: [card], from: actualFrom?.id, public: isPublic });
    this.log(`【${player.name}】获得了${isPublic ? ` ${cardLabel(card)}` : '一张牌'}`);
    if (actualFrom) {
      await this.trigger('cardLost', { player: actualFrom, card, data: { reason: 'gain' } });
      if (lostEquip) await this.trigger('equipLost', { player: actualFrom, card, data: {} });
      await this.notifyHandLost(actualFrom);
    }
  }

  async gainCards(player: PlayerState, cards: Card[], from?: PlayerState, isPublic = true): Promise<void> {
    for (const card of cards) await this.gainCard(player, card, from, isPublic);
    if (from && cards.length >= 2 && from.id !== player.id) {
      await this.trigger('cardGained', {
        player,
        source: from,
        data: { count: cards.length },
      });
    }
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

  reshuffle(): void {
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

  revealCards(playerId: number | undefined, cards: Card[], label?: string): void {
    this.emit({ type: 'reveal', playerId, cards, label });
  }

  drawRevealed(player: PlayerState, count: number, reason = '亮出牌'): Card[] {
    const cards = this.drawRaw(player, count);
    if (!cards.length) return cards;
    this.emit({ type: 'reveal', playerId: player.id, cards });
    this.log(`【${player.name}】${reason}：${cards.map((c) => cardLabel(c)).join('、')}`);
    return cards;
  }

  async pindianWithCards(
    initiator: PlayerState,
    target: PlayerState,
    reason: string,
  ): Promise<{ win: boolean; mine: Card; theirs: Card } | null> {
    if (!initiator.alive || !target.alive) return null;
    if (!initiator.hand.length || !target.hand.length) return null;
    const mine = await this.askCards(
      initiator,
      initiator.hand,
      1,
      1,
      `拼点（${reason}）：选择一张手牌`,
      undefined,
      false,
    );
    if (!mine.length) return null;
    const theirs = await this.askCards(
      target,
      target.hand,
      1,
      1,
      `拼点（${reason}）：选择一张手牌`,
      undefined,
      false,
    );
    if (!theirs.length) return null;
    const a = mine[0];
    const b = theirs[0];
    this.log(`【${initiator.name}】与【${target.name}】拼点：${cardLabel(a)} 对 ${cardLabel(b)}`, 'system');
    await this.discardCards(initiator, [a], '拼点');
    await this.discardCards(target, [b], '拼点');
    return { win: a.rank > b.rank, mine: a, theirs: b };
  }

  async pindian(initiator: PlayerState, target: PlayerState, reason: string): Promise<boolean> {
    const result = await this.pindianWithCards(initiator, target, reason);
    return result?.win ?? false;
  }

  async swapHands(a: PlayerState, b: PlayerState): Promise<void> {
    if (!a.alive || !b.alive) return;
    const tmp = a.hand;
    a.hand = b.hand;
    b.hand = tmp;
    this.log(`【${a.name}】与【${b.name}】交换了手牌`, 'skill');
    this.emit({ type: 'state' });
    if (a.hand.length >= 2) {
      await this.trigger('cardGained', { player: a, source: b, data: { count: a.hand.length } });
    }
    if (b.hand.length >= 2) {
      await this.trigger('cardGained', { player: b, source: a, data: { count: b.hand.length } });
    }
  }

  async judge(
    player: PlayerState,
    reason: string,
    opts?: { gainTo?: PlayerState; gainIf?: (card: Card) => boolean },
  ): Promise<Card> {
    if (this.state.deck.length === 0) this.reshuffle();
    let card = this.state.deck.pop();
    if (!card) throw new Error('牌堆与弃牌堆均为空');
    this.emit({ type: 'reveal', playerId: player.id, cards: [card], label: '判定牌' });
    this.log(`【${player.name}】进行${reason}判定，判定牌为 ${cardLabel(card)}`, 'judge');
    const ctx: SkillContext = {
      game: this,
      owner: player,
      player,
      card,
      data: { judgeCard: card, reason, gained: false },
    };
    await this.trigger('judgeBefore', ctx);
    const changedBy = typeof ctx.data.judgeSkill === 'string' ? ctx.data.judgeSkill : undefined;
    if (ctx.data.judgeCard && ctx.data.judgeCard.id !== card.id) {
      const old = card;
      card = ctx.data.judgeCard as Card;
      const changerId = typeof ctx.data.judgeSkillOwner === 'number' ? ctx.data.judgeSkillOwner : -1;
      if (changerId >= 0 && this.players[changerId] && this.hasSkill(this.players[changerId], 'guidao')) {
        await this.gainCard(this.players[changerId], old);
      } else {
        this.toDiscard(old);
      }
      this.emit({
        type: 'reveal',
        playerId: player.id,
        cards: [card],
        label: changedBy ? `${changedBy}·改判` : '改判',
      });
      this.log(
        `${changedBy ? `【${changedBy}】` : ''}判定牌被改为 ${cardLabel(card)}`,
        'judge',
      );
    }
    const success = this.judgeResult(card, reason, player);
    this.emit({
      type: 'judge',
      playerId: player.id,
      card,
      reason,
      success,
      changedBy,
      text: `${SUIT_CN[card.suit]}${rankLabel(card.rank)}`,
    });
    ctx.card = card;
    ctx.data.judgeCard = card;
    await this.trigger('judgeAfter', ctx);
    if (!this.cardOwner(card)) {
      if (opts?.gainTo && (!opts.gainIf || opts.gainIf(card))) await this.gainCard(opts.gainTo, card);
      else if (!ctx.data.gained) this.toDiscard(card);
    }
    return card;
  }

  private judgeResult(card: Card, reason: string, player?: PlayerState): boolean {
    if (reason.includes('闪电')) {
      // 烈火：判定闪电时，所有黑桃花色都视为命中
      if (player && this.hasSkill(player, 'hebao')) return card.suit === 'spade';
      return card.suit === 'spade' && card.rank >= 2 && card.rank <= 9;
    }
    if (reason.includes('乐不思蜀')) return card.suit !== 'heart';
    if (reason.includes('兵粮寸断')) return card.suit !== 'club';
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
            const triggerDetail =
              event === 'judgeBefore' && base.card
                ? `当前判定牌：${cardLabel(base.card)}${skill.desc ? `
${skill.desc}` : ''}`
                : skill.desc;
            const ok = await this.confirm(
              owner,
              (typeof trig.prompt === 'function' ? trig.prompt(ctx) : trig.prompt) ??
                `是否发动【${skill.name}】？`,
              triggerDetail,
            );
            if (!ok) continue;
          }
          if (trig.oncePerTurn) owner.usedThisTurn[skill.id] = 1;
          this.emit({ type: 'skill', playerId: owner.id, name: skill.name, skillId: skill.id });
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

  canUseShaNow(player: PlayerState): boolean {
    if (player.flags.tianyiFail || player.flags.xianzhenFail) return false;
    if (Number(player.flags.jiangchiNoSha ?? -1) === this.state.turn) return false;
    const unlimited = this.skillsOf(player).some((s) => s.unlimitedSha);
    const limit =
      1 +
      (player.flags.tianyi ? 1 : 0) +
      (Number(player.flags.jiangchiSha ?? -1) === this.state.turn ? 1 : 0) +
      (this.state.rules.mode === 'landlord' && player.role === 'lord' ? 1 : 0);
    return unlimited || (player.usedThisTurn.sha ?? 0) < limit;
  }

  private canUseName(player: PlayerState, name: string): boolean {
    if (name === '闪' || name === '无懈可击') return false;
    if (name === '桃') return player.hp < player.maxHp;
    if (name === '酒') return (player.usedThisTurn.jiu ?? 0) < 1;
    if (name === '杀') return this.canUseShaNow(player);
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
      const ignoreDistance =
        !!user.flags.tianyi || Number(user.flags.jiangchiSha ?? -1) === this.state.turn;
      const xianzhenTarget = Number(user.flags.xianzhenWin ?? -1);
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            (ignoreDistance ||
              p.id === xianzhenTarget ||
              this.distance(user, p) <= this.attackRange(user)),
        )
        .filter((p) => this.canBeTargeted(p, user, '杀'))
        .map((p) => p.id);
      const baseMax =
        isLastHand && !!user.equips.weapon && user.equips.weapon.name === '方天画戟' ? 3 : 1;
      const max =
        baseMax +
        (user.flags.tianyi ? 1 : 0) +
        (Number(user.flags.jiangchiSha ?? -1) === this.state.turn ? 1 : 0);
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
      const xianzhenTarget = Number(user.flags.xianzhenWin ?? -1);
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            this.hasCards(p) &&
            (ignoreDist || p.id === xianzhenTarget || this.distance(user, p) <= 1) &&
            this.canBeTargeted(p, user, name) &&
            !p.judgeZone.some((c) => c.name === name),
        )
        .map((p) => p.id);
      return { ids, min: ids.length ? 1 : 0, max: 1 };
    }
    if (name === '乐不思蜀') {
      const ids = this.players
        .filter((p) => p.alive && p.id !== user.id && this.canBeTargeted(p, user, name) && !p.judgeZone.some((c) => c.name === name))
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
      const xianzhenTarget = Number(user.flags.xianzhenWin ?? -1);
      const maxDistance = ignoreDist ? Infinity : this.hasSkill(user, 'duanliang') ? 2 : 1;
      const ids = this.players
        .filter(
          (p) =>
            p.alive &&
            p.id !== user.id &&
            (p.id === xianzhenTarget || this.distance(user, p) <= maxDistance) &&
            this.canBeTargeted(p, user, name) &&
            !p.judgeZone.some((c) => c.name === name),
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

  guhuoDeclarable(user: PlayerState, name: string): boolean {
    if (!this.canUseName(user, name)) return false;
    const needsTarget = ['杀', '决斗', '过河拆桥', '顺手牵羊', '借刀杀人', '火攻', '铁索连环'].includes(name);
    if (needsTarget) return this.targetInfo(user, name, false).ids.length > 0;
    if (name === '南蛮入侵' || name === '万箭齐发') {
      return this.players.some((p) => p.alive && p.id !== user.id);
    }
    return true;
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

  async stageAnyCard(player: PlayerState, card: Card): Promise<boolean> {
    if (!(await this.removeCardForUse(player, card))) return false;
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

  liangdaoVictims(target: PlayerState, user: PlayerState): PlayerState[] {
    return this.players.filter(
      (p) =>
        p.alive &&
        p.id !== target.id &&
        p.id !== user.id &&
        this.distance(target, p) <= this.attackRange(target) &&
        this.canBeTargeted(p, target, '杀'),
    );
  }

  private jiedaoTargets(user: PlayerState): Record<number, number[]> {
    const map: Record<number, number[]> = {};
    for (const holder of this.players) {
      if (!holder.alive || holder.id === user.id || !holder.equips.weapon) continue;
      const victims = this.liangdaoVictims(holder, user).map((player) => player.id);
      if (victims.length) map[holder.id] = victims;
    }
    return map;
  }

  isBlackCard(player: PlayerState, card: Card): boolean {
    if (!isBlack(card.suit)) return false;
    return !(this.hasSkill(player, 'hongyan') && card.suit === 'spade');
  }

  isRedCard(player: PlayerState, card: Card): boolean {
    if (isRed(card.suit)) return true;
    return this.hasSkill(player, 'hongyan') && card.suit === 'spade';
  }

  private qianxiBlocked(player: PlayerState, card: Card): boolean {
    const color = player.flags.qianxiColor;
    if (!color || player.flags.qianxiTurn !== this.state.turn) return false;
    return (color === 1) === this.isRedCard(player, card);
  }

  private targetBlockReason(
    user: PlayerState,
    as: string,
    target: PlayerState,
    card: Card,
    element?: Element,
  ): string | null {
    if (!target.alive) return '已阵亡';
    if (target.id === user.id) return '不能指定自己';
    const xianzhenTarget = Number(user.flags.xianzhenWin ?? -1);
    const ignoreArmor = user.equips.weapon?.name === '青釭剑' || xianzhenTarget === target.id;
    const trick = this.cardTypeOf(as) !== 'basic';
    if (as === '杀') {
      const ignoreDistance =
        !!user.flags.tianyi || Number(user.flags.jiangchiSha ?? -1) === this.state.turn;
      if (!ignoreDistance && target.id !== xianzhenTarget && this.distance(user, target) > this.attackRange(user)) {
        return '距离不足';
      }
      if (!ignoreArmor && target.equips.armor?.name === '仁王盾' && this.isBlackCard(user, card)) {
        return '仁王盾';
      }
      if (!ignoreArmor && target.equips.armor?.name === '藤甲' && !element) {
        return '藤甲';
      }
    }
    if (as === '顺手牵羊' || as === '兵粮寸断') {
      const ignoreDistance = this.hasSkill(user, 'qicai');
      const maxDistance =
        as === '兵粮寸断' ? (this.hasSkill(user, 'duanliang') ? 2 : 1) : 1;
      if (!ignoreDistance && target.id !== xianzhenTarget && this.distance(user, target) > maxDistance) {
        return '距离不足';
      }
      if (target.judgeZone.some((c) => c.name === as)) return '判定区已有';
      if (as === '顺手牵羊' && !this.hasCards(target)) return '没有可获得的牌';
    }
    if (as === '过河拆桥' && !this.hasCards(target)) return '没有可弃置的牌';
    if (as === '乐不思蜀' && target.judgeZone.some((c) => c.name === as)) return '判定区已有';
    if (as === '火攻' && target.hand.length === 0) return '没有手牌';
    if (as === '借刀杀人') {
      if (!target.equips.weapon) return '未装备武器';
      if (this.liangdaoVictims(target, user).length === 0) return '没有合法目标';
    }
    if (!this.canBeTargeted(target, user, as)) {
      if (this.hasSkill(target, 'kongcheng') && target.hand.length === 0) return '空城';
      if (this.hasSkill(target, 'qianxun')) return '谦逊';
      return '不可指定';
    }
    if (trick && this.isBlackCard(user, card) && this.hasSkill(target, 'weimu')) return '帷幕';
    if (trick && this.hasSkill(target, 'zhichi') && target.flags.zhichi === this.state.turn) return '智迟';
    return null;
  }

  private cardOptionFor(
    user: PlayerState,
    card: Card,
    as: string,
    skillId?: string,
    isLastHand = false,
    effectiveElement?: Element,
  ): CardOption | null {
    if (!this.canUseName(user, as)) return null;
    if (as === '闪电' && user.judgeZone.some((c) => c.name === '闪电')) return null;
    const info = this.targetInfo(user, as, isLastHand);
    const element = as === '杀' ? effectiveElement ?? card.element : undefined;
    let validTargets =
      as === '杀'
        ? info.ids.filter((id) => {
            const armor = this.players[id]?.equips.armor?.name;
            const ignoreArmor =
              user.equips.weapon?.name === '青釭剑' ||
              Number(user.flags.xianzhenWin ?? -1) === id;
            if (!ignoreArmor && armor === '仁王盾' && this.isBlackCard(user, card)) return false;
            if (!ignoreArmor && armor === '藤甲' && !element) return false;
            return true;
          })
        : info.ids;
    if (as !== '杀' && this.cardTypeOf(as) !== 'basic' && this.isBlackCard(user, card)) {
      validTargets = validTargets.filter((id) => !this.hasSkill(this.players[id], 'weimu'));
    }
    if (as !== '杀' && this.cardTypeOf(as) !== 'basic') {
      validTargets = validTargets.filter(
        (id) => !(this.hasSkill(this.players[id], 'zhichi') && this.players[id].flags.zhichi === this.state.turn),
      );
    }
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
    if (needsTarget && validTargets.length === 0) return null;
    const invalidTargets: Record<number, string> = {};
    if (needsTarget) {
      for (const p of this.players) {
        if (!p.alive || validTargets.includes(p.id)) continue;
        const reason = this.targetBlockReason(user, as, p, card, element);
        if (reason) invalidTargets[p.id] = reason;
      }
    }
    const jiedao = as === '借刀杀人';
    return {
      cardId: card.id,
      as,
      skillId,
      element,
      validTargets,
      invalidTargets: Object.keys(invalidTargets).length ? invalidTargets : undefined,
      ignoreDistance: false,
      targetMin: needsTarget ? (jiedao ? 2 : info.min) : 0,
      targetMax: needsTarget ? (jiedao ? 2 : info.max) : 0,
      targetAfter: jiedao ? this.jiedaoTargets(user) : undefined,
    };
  }

  buildPlayOptions(player: PlayerState): CardOption[] {
    const out: CardOption[] = [];
    const seen = new Set<string>();
    for (const card of player.hand) {
      if (this.qianxiBlocked(player, card)) continue;
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
      if (!(card.name === '酒' && this.hasSkill(player, 'jinjiu'))) add(card.name);
      if (card.name === '杀' && player.flags.xianzhenWin !== undefined && !this.canUseName(player, '杀')) {
        const target = this.players[player.flags.xianzhenWin];
        if (target?.alive) {
          out.push({
            cardId: card.id,
            as: '杀',
            skillId: 'xianzhen',
            label: '陷阵',
            validTargets: [target.id],
            targetMin: 1,
            targetMax: 1,
          });
        }
      }
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
        const base = this.cardOptionFor(player, card, '杀', 'zhuque', isLast, 'fire');
        if (base) out.push({ ...base, element: 'fire', label: '朱雀羽扇·火杀' });
      }
      for (const rule of this.viewAsRules(player, 'play')) {
        if (rule.as === card.name) continue;
        if (!this.viewAsValid(player, card, rule.as, rule.skillId)) continue;
        add(rule.as, rule.skillId);
        if (rule.skillId === 'lianhuan' && rule.as === '铁索连环') {
          const key = `${card.id}|recast-lianhuan`;
          if (!seen.has(key)) {
            seen.add(key);
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
        }
      }
    }
    for (const card of Object.values(player.equips)) {
      if (!card) continue;
      for (const rule of this.viewAsRules(player, 'play')) {
        const ruleDef = SKILL_MAP.get(rule.skillId)?.viewAs?.find((item) => item.as === rule.as);
        if (!ruleDef?.fromEquip) continue;
        if (rule.as === card.name) continue;
        if (!this.viewAsValid(player, card, rule.as, rule.skillId)) continue;
        const key = `${card.id}|${rule.as}|${rule.skillId}`;
        if (seen.has(key)) continue;
        const opt = this.cardOptionFor(player, card, rule.as, rule.skillId, false);
        if (!opt) continue;
        seen.add(key);
        out.push(opt);
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
    // 转化技：点击后高亮可转化的牌
    for (const skill of this.skillsOf(player)) {
      for (const rule of skill.viewAs ?? []) {
        if (rule.usage !== 'play' && rule.usage !== 'both') continue;
        if (rule.condition && !rule.condition(this, player)) continue;
        const eligibleCardIds: string[] = [];
        for (const card of player.hand) {
          if (this.viewAsValid(player, card, rule.as, skill.id)) eligibleCardIds.push(card.id);
        }
        for (const card of Object.values(player.equips)) {
          if (card && rule.fromEquip && this.viewAsValid(player, card, rule.as, skill.id)) {
            eligibleCardIds.push(card.id);
          }
        }
        if (eligibleCardIds.length === 0) continue;
        out.push({
          id: skill.id,
          name: skill.name,
          desc: skill.desc,
          viewAs: rule.as,
          eligibleCardIds,
        });
      }
    }
    return out;
  }

  /**
   * 放权：只在出牌阶段开始的这一刻询问一次。
   * 跳过出牌阶段，回合结束时再结算「弃一张手牌换额外回合」。
   */
  private async offerFangquan(player: PlayerState): Promise<boolean> {
    if (!this.skillsOf(player).some((skill) => skill.id === 'fangquan')) return false;
    if (player.hand.length === 0) return false;
    const ok = await this.confirm(
      player,
      '出牌阶段开始：是否发动【放权】？',
      '跳过本回合的出牌阶段；回合结束时弃置一张手牌，令一名其他角色获得一个额外回合。',
    );
    if (!ok) return false;
    player.flags.fangquanPending = 1;
    this.log(`【${player.name}】发动【放权】，跳过出牌阶段`, 'skill');
    return true;
  }

  private async playPhase(player: PlayerState): Promise<void> {
    if (await this.offerFangquan(player)) return;
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
        if (player.flags.fangquanSkip) {
          player.flags.fangquanSkip = 0;
          return;
        }
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
    const targetsOk = (option: CardOption): boolean => {
      if (action.targets.length < option.targetMin || action.targets.length > option.targetMax) {
        return false;
      }
      const [first, ...rest] = action.targets;
      if (first === undefined) return option.targetMin === 0;
      if (!option.validTargets.includes(first)) return false;
      if (option.targetAfter) {
        const follow = option.targetAfter[first] ?? [];
        return rest.every((id) => follow.includes(id));
      }
      return rest.every((id) => option.validTargets.includes(id));
    };
    const match = opts.find(
      (o) =>
        o.cardId === card.id &&
        o.as === as &&
        (o.skillId ?? '') === (action.skillId ?? '') &&
        (o.element ?? '') === (action.element ?? '') &&
        targetsOk(o),
    );
    if (!match) return false;
    await this.useCard(player, card, as, action.targets, action.skillId, action.extraCardIds, action.element);
    return true;
  }

  private skillSignature(): string {
    return [
      this.state.deck.map((card) => card.id).join(','),
      this.state.discard.map((card) => card.id).join(','),
      ...this.players.map((player) =>
        [
          player.hp,
          player.maxHp,
          player.alive ? 1 : 0,
          player.hand.map((card) => card.id).join(','),
          Object.entries(player.equips)
            .map(([slot, card]) => `${slot}:${card?.id ?? ''}`)
            .join(','),
          player.judgeZone.map((card) => card.id).join(','),
          JSON.stringify(player.flags),
        ].join('|'),
      ),
    ].join(';');
  }

  async activateSkill(player: PlayerState, skillId: string): Promise<void> {
    const skill = SKILL_MAP.get(skillId);
    if (!skill?.active) return;
    if (skill.active.oncePerTurn && (player.usedThisTurn[skillId] ?? 0) > 0) return;
    const before = this.skillSignature();
    await skill.active.run(this, player);
    if (this.skillSignature() === before) return;
    if (skill.active.oncePerTurn) {
      player.usedThisTurn[skillId] = (player.usedThisTurn[skillId] ?? 0) + 1;
    }
    this.emit({ type: 'skill', playerId: player.id, name: skill.name, skillId: skill.id });
    this.log(`【${player.name}】发动【${skill.name}】`, 'skill');
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
    if (!(await this.removeCardForUse(user, card))) return;
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
    if ((cardType === 'trick' || cardType === 'delayed') && asName !== '无懈可击' && skillId !== 'recast') {
      this.wuxieWindowPending = true;
    }
    if (skillId !== 'recast') {
      await this.trigger('cardUsed', { player: user, card, data: { as: asName } });
    }

    if ((cardType === 'trick' || cardType === 'delayed') && this.isBlackCard(user, card) && !asName.includes('无懈可击')) {
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
    if (cardType === 'trick' || cardType === 'delayed') {
      const blocked = targets.filter(
        (id) => this.hasSkill(this.players[id], 'zhichi') && this.players[id].flags.zhichi === this.state.turn,
      );
      if (blocked.length > 0) {
        for (const id of blocked) this.log(`【${this.players[id].name}】的智迟生效，不受此锦囊影响`, 'skill');
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
      if (!(await this.askWuxie('无中生有', user, user, `【${user.name}】使用无中生有`))) {
        this.drawCards(user, 2, '使用无中生有');
      } else {
        this.log('无中生有被无懈可击抵消', 'skill');
      }
    } else if (asName === '决斗') {
      const target = this.players[targets[0]];
      if (target && target.alive && !(await this.askWuxie('决斗', target, user, `【${user.name}】对【${target.name}】使用决斗`))) {
        await this.trigger('cardTargeted', { player: target, source: user, target, card, data: { as: asName } });
        await this.resolveDuel(user, target, card);
      }
    } else if (asName === '过河拆桥') {
      await this.resolveGuohe(user, card, this.players[targets[0]]);
    } else if (asName === '顺手牵羊') {
      await this.resolveShunshou(user, card, this.players[targets[0]]);
    } else if (asName === '万箭齐发') {
      await this.resolveAoe(user, card, '闪', asName);
    } else if (asName === '南蛮入侵') {
      await this.resolveAoe(user, card, '杀', asName);
    } else if (asName === '桃园结义') {
      await this.resolvePeachGarden(user, card);
    } else if (asName === '五谷丰登') {
      await this.resolveHarvest(user, card);
    } else if (asName === '借刀杀人') {
      await this.resolveJiedao(
        user,
        card,
        this.players[targets[0]],
        targets[1] !== undefined ? this.players[targets[1]] : undefined,
      );
    } else if (asName === '乐不思蜀') {
      const target = this.players[targets[0]];
      if (target && target.alive) {
        const delayed = card.name === asName
          ? card
          : { ...card, name: asName, type: 'delayed' as const, element: undefined, equipSlot: undefined, range: undefined };
        target.judgeZone.push(delayed);
        this.removeFromLimbo(card);
        this.log(`【${target.name}】的判定区被放置了 ${cardLabel(delayed)}`);
      }
    } else if (asName === '闪电') {
      const delayed = card.name === asName
          ? card
          : { ...card, name: asName, type: 'delayed' as const, element: undefined, equipSlot: undefined, range: undefined };
      user.judgeZone.push(delayed);
      this.removeFromLimbo(card);
      this.log(`【${user.name}】的判定区被放置了 ${cardLabel(delayed)}`);
    } else if (asName === '酒') {
      user.flags.jiu = 1;
      user.usedThisTurn.jiu = (user.usedThisTurn.jiu ?? 0) + 1;
      this.log(`【${user.name}】使用酒，下一张杀伤害 +1`);
    } else if (asName === '铁索连环' && skillId === 'recast') {
      this.drawCards(user, 1, '重铸');
      this.log(`【${user.name}】重铸铁索连环，摸一张牌`);
    } else if (asName === '铁索连环') {
      for (const tid of targets) {
        const target = this.players[tid];
        if (!target?.alive) continue;
        const nullified = await this.askWuxie(
          '铁索连环',
          target,
          user,
          `【${user.name}】对【${target.name}】使用铁索连环`,
        );
        if (nullified) continue;
        target.chained = !target.chained;
        this.log(`【${target.name}】${target.chained ? '横置' : '重置'}`, 'skill');
      }
    } else if (asName === '火攻') {
      await this.resolveFireAttack(user, card, this.players[targets[0]]);
    } else if (asName === '兵粮寸断') {
      const target = this.players[targets[0]];
      if (target?.alive) {
        const delayed = card.name === asName
          ? card
          : { ...card, name: asName, type: 'delayed' as const, element: undefined, equipSlot: undefined, range: undefined };
        target.judgeZone.push(delayed);
        this.removeFromLimbo(card);
        this.log(`【${target.name}】的判定区被放置了 ${cardLabel(delayed)}`);
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
    this.emit({ type: 'reveal', playerId: target.id, cards: revealed, label: '火攻' });
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

  moveEquipment(source: PlayerState, target: PlayerState, card: Card): boolean {
    const slot = card.equipSlot;
    if (!slot || source.equips[slot]?.id !== card.id || target.equips[slot]) return false;
    source.equips[slot] = undefined;
    if (card.name === '白银狮子' && source.alive) {
      this.heal(source, source, 1, { reason: '白银狮子' });
    }
    target.equips[slot] = card;
    this.emit({ type: 'equip', playerId: source.id, slot, card: undefined });
    this.emit({ type: 'equip', playerId: target.id, slot, card });
    this.log(
      `【${source.name}】的【${card.name}】被移动到【${target.name}】的装备区`,
      'skill',
    );
    return true;
  }

  async equipFromHandTo(owner: PlayerState, target: PlayerState, card: Card): Promise<boolean> {
    const slot = card.equipSlot;
    if (!slot || target.equips[slot]) return false;
    if (!this.removeFromHand(owner, card)) return false;
    target.equips[slot] = card;
    this.emit({ type: 'equip', playerId: target.id, slot, card });
    this.log(`【${owner.name}】将 ${cardLabel(card)} 置于【${target.name}】的装备区`, 'skill');
    if (owner.alive) await this.notifyHandLost(owner);
    return true;
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
    if (player.hand.length === 0 && player.alive && player.flags.handLostPending) {
      player.flags.handLostPending = 0;
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

      const liuli = { newTarget: null as number | null, as: '杀' };
      await this.trigger('cardTargeted', { player: target, source: user, target, card, data: liuli });
      if (liuli.newTarget !== null) {
        const nt = this.players[liuli.newTarget];
        if (nt && nt.alive) {
          this.log(`【${target.name}】将杀转移给了【${nt.name}】`, 'skill');
          target = nt;
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
    if (this.hasSkill(target, 'zhichi') && target.flags.zhichi === this.state.turn) {
      this.log(`【${target.name}】的智迟生效，此【杀】无效`, 'skill');
      return;
    }
    const ignoreArmor =
      user.equips.weapon?.name === '青釭剑' ||
      Number(user.flags.xianzhenWin ?? -1) === target.id;
    const renwang =
      !ignoreArmor && target.equips.armor?.name === '仁王盾' && this.isBlackCard(user, card);
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
      let need = this.hasSkill(user, 'wushuang') ? 2 : 1;
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

    const targetCardCount =
      target.hand.length +
      Object.values(target.equips).filter((c) => !!c).length +
      target.judgeZone.length;
    if (user.equips.weapon?.name === '寒冰剑' && targetCardCount > 0) {
      const want = Math.min(2, targetCardCount);
      const ok = await this.confirm(
        user,
        `是否发动【寒冰剑】？防止此伤害，改为弃置【${target.name}】${want} 张牌`,
        '寒冰剑',
      );
      if (ok) {
        let discarded = 0;
        for (let i = 0; i < want; i += 1) {
          const c = await this.pickCardFrom(target, user, '寒冰剑：弃置一张牌');
          if (!c) break;
          await this.discardCards(target, [c], '寒冰剑');
          discarded += 1;
        }
        if (discarded > 0) {
          this.log(`【${user.name}】发动【寒冰剑】，弃置【${target.name}】${discarded} 张牌并防止伤害`, 'skill');
          return;
        }
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
    if (picked) {
      this.log(`【${user.name}】拆掉了【${target.name}】的 ${cardLabel(picked)}`, 'system');
      await this.discardCards(target, [picked], '过河拆桥');
    }
  }

  private async resolveShunshou(user: PlayerState, card: Card, target?: PlayerState): Promise<void> {
    if (!target?.alive || !this.hasCards(target)) return;
    if (await this.askWuxie('顺手牵羊', target, user, `【${user.name}】对【${target.name}】使用顺手牵羊`)) return;
    const picked = await this.pickCardFrom(target, user, '顺手牵羊：选择要获得的牌');
    if (picked) {
      const slot = picked.equipSlot;
      const isPublic = !!slot || target.judgeZone.some((c) => c.id === picked.id);
      await this.gainCard(user, picked, target, isPublic);
      if (slot) {
        this.emit({ type: 'equip', playerId: target.id, slot, card: undefined });
      }
      this.log(
        `【${user.name}】获得了【${target.name}】的 ${isPublic ? cardLabel(picked) : '一张手牌'}`,
        'system',
      );
    }
  }

  private async resolveAoe(
    user: PlayerState,
    card: Card,
    responseName: '杀' | '闪',
    cardName = card.name,
  ): Promise<void> {
    const targets = this.turnOrder().filter((p) => p.id !== user.id && p.alive);
    const entries: AoeEntry[] = targets.map((p) => ({ playerId: p.id, result: 'pending' }));
    const entryOf = (playerId: number) => entries.find((entry) => entry.playerId === playerId);
    const emitAoe = (done = false, activeId?: number, timeoutMs?: number) =>
      this.emit({
        type: 'aoe',
        cardName: cardName,
        sourceId: user.id,
        entries: entries.map((entry) => ({ ...entry })),
        activeId,
        timeoutMs,
        done,
      });
    emitAoe();
    const huoshou =
      cardName === '南蛮入侵'
        ? this.players.find(
            (p) => p.alive && p.id !== user.id && this.hasSkill(p, 'huoshou'),
          )
        : undefined;
    const note = (playerId: number, patch: Partial<AoeEntry>) => {
      const entry = entryOf(playerId);
      if (entry) Object.assign(entry, patch);
    };
    for (const target of targets) {
      if (this.state.over) break;
      if (!target.alive) {
        note(target.id, { result: 'dead', hp: 0 });
        emitAoe();
        continue;
      }
      if (this.isBlackCard(user, card) && this.hasSkill(target, 'weimu')) {
        this.log(`【${target.name}】的帷幕生效，不受黑色${cardName}影响`, 'skill');
        note(target.id, { result: 'immune', note: '帷幕', hp: target.hp });
        emitAoe();
        continue;
      }
      if (this.hasSkill(target, 'zhichi') && target.flags.zhichi === this.state.turn) {
        this.log(`【${target.name}】的智迟生效，不受${cardName}影响`, 'skill');
        note(target.id, { result: 'immune', note: '智迟', hp: target.hp });
        emitAoe();
        continue;
      }
      if (
        cardName === '南蛮入侵' &&
        (this.hasSkill(target, 'huoshou') || this.hasSkill(target, 'juxiang'))
      ) {
        this.log(`【${target.name}】不受南蛮入侵影响`, 'skill');
        note(target.id, { result: 'immune', note: '巨象/祸首', hp: target.hp });
        emitAoe();
        continue;
      }
      if (target.equips.armor?.name === '藤甲' && (cardName === '南蛮入侵' || cardName === '万箭齐发')) {
        this.log(`【${target.name}】的藤甲生效，${cardName}无效`, 'skill');
        note(target.id, { result: 'immune', note: '藤甲', hp: target.hp });
        emitAoe();
        continue;
      }
      emitAoe(false, target.id, 6000);
      await this.io.delay(500 + Math.random() * 700);
      if (await this.askWuxie(cardName, target, user, `【${target.name}】受到${cardName}影响`)) {
        note(target.id, { result: 'wuxie', hp: target.hp });
        emitAoe();
        continue;
      }
      const resp = responseName === '闪'
        ? await this.askRespond(target, '闪', { prompt: '万箭齐发：请打出一张闪', canCancel: true, timeout: 6000 })
        : await this.askRespond(target, '杀', { prompt: '南蛮入侵：请打出一张杀', canCancel: true, timeout: 6000 });
      if (resp) {
        note(target.id, {
          result: 'answered',
          as: resp.as,
          card: resp.card ?? undefined,
          skillId: resp.skillId,
          hp: target.hp,
        });
        emitAoe();
        continue;
      }
      await this.damage(huoshou ?? user, target, 1, card, cardName);
      note(target.id, { result: 'damage', hp: Math.max(0, target.hp) });
      emitAoe();
    }
    if (cardName === '南蛮入侵') {
      const juxiang = this.players.find(
        (p) => p.alive && p.id !== user.id && this.hasSkill(p, 'juxiang'),
      );
      if (juxiang && this.isInLimbo(card)) {
        await this.gainCard(juxiang, card, undefined, true);
        this.log(`【${juxiang.name}】的巨象获得了南蛮入侵`, 'skill');
      }
    }
    emitAoe(true);
  }

  private async resolvePeachGarden(user: PlayerState, card: Card): Promise<void> {
    for (const p of this.turnOrder()) {
      if (!p.alive) continue;
      if (this.isBlackCard(user, card) && this.hasSkill(p, 'weimu')) {
        this.log(`【${p.name}】的帷幕生效，不受黑色桃园结义影响`, 'skill');
        continue;
      }
      if (this.hasSkill(p, 'zhichi') && p.flags.zhichi === this.state.turn) continue;
      if (await this.askWuxie('桃园结义', p, user, `【${p.name}】受到桃园结义影响`)) continue;
      this.heal(user, p, 1, { card, reason: '桃园结义' });
    }
  }

  private async resolveHarvest(user: PlayerState, card: Card): Promise<void> {
    const alive = this.alivePlayers();
    if (this.state.deck.length < alive.length) this.reshuffle();
    const revealed = this.state.deck.splice(Math.max(0, this.state.deck.length - alive.length));
    revealed.reverse();
    const allCards = revealed.slice();
    const picks: { playerId: number; card: Card }[] = [];
    this.emit({ type: 'reveal', cards: revealed });
    this.emit({ type: 'harvest', cards: allCards, picks: [] });
    this.log(`五谷丰登亮出：${revealed.map((c) => cardLabel(c)).join('、')}`, 'system');
    for (const p of this.turnOrder()) {
      if (!p.alive || revealed.length === 0) continue;
      if (this.isBlackCard(user, card) && this.hasSkill(p, 'weimu')) {
        this.log(`【${p.name}】的帷幕生效，不受黑色五谷丰登影响`, 'skill');
        continue;
      }
      if (this.hasSkill(p, 'zhichi') && p.flags.zhichi === this.state.turn) continue;
      this.emit({ type: 'harvest', cards: allCards, picks: picks.slice(), chooserId: p.id });
      if (await this.askWuxie('五谷丰登', p, user, `【${p.name}】受到五谷丰登影响`, true)) continue;
      const picked = await this.askCards(p, revealed.slice(), 1, 1, '五谷丰登：选择一张牌获得', undefined, false);
      const got = picked[0] ?? revealed[revealed.length - 1];
      const idx = revealed.findIndex((c) => c.id === got.id);
      if (idx >= 0) revealed.splice(idx, 1);
      picks.push({ playerId: p.id, card: got });
      await this.gainCard(p, got, undefined, true);
      this.log(`【${p.name}】从五谷丰登获得 ${cardLabel(got)}`);
      this.emit({ type: 'harvest', cards: allCards, picks: picks.slice() });
    }
    for (const c of revealed) this.toDiscard(c);
    this.emit({ type: 'harvest', cards: allCards, picks: picks.slice(), done: true });
  }

  private async resolveJiedao(
    user: PlayerState,
    card: Card,
    target?: PlayerState,
    victim?: PlayerState,
  ): Promise<void> {
    if (!target?.alive || !target.equips.weapon) return;
    const victims = this.liangdaoVictims(target, user);
    if (!victims.length) return;
    if (await this.askWuxie('借刀杀人', target, user, `【${user.name}】对【${target.name}】使用借刀杀人`)) return;
    const chosen = victim && victims.some((player) => player.id === victim.id) ? victim : undefined;
    const hasSha = this.buildRespondOptions(target, '杀').length > 0;
    if (hasSha) {
      const victimTarget =
        chosen ??
        (await this.askPlayer(
          target,
          victims,
          '借刀杀人：选择一名角色，对其使用一张杀',
          '也可以取消，将武器交给使用者',
        ));
      if (victimTarget) {
        const used = await this.useShaOn(target, victimTarget, '借刀杀人');
        if (used) return;
      }
    } else {
      this.log(`【${target.name}】没有可用的杀，直接交出武器`, 'system');
    }
    const weapon = target.equips.weapon;
    if (weapon) {
      await this.gainCard(user, weapon, target, true);
      this.emit({ type: 'equip', playerId: target.id, slot: 'weapon', card: undefined });
      this.log(`【${target.name}】将武器交给了【${user.name}】`);
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
    if (name === '杀' && Number(player.flags.jiangchiNoSha ?? -1) === this.state.turn) return out;
    const seen = new Set<string>();
    for (const card of player.hand) {
      if (this.qianxiBlocked(player, card)) continue;
      if (card.name === name && !(name === '酒' && this.hasSkill(player, 'jinjiu'))) {
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
    for (const card of Object.values(player.equips)) {
      if (!card) continue;
      for (const rule of this.viewAsRules(player, 'respond')) {
        if (rule.as !== name) continue;
        const ruleDef = SKILL_MAP.get(rule.skillId)?.viewAs?.find((item) => item.as === rule.as);
        if (!ruleDef?.fromEquip) continue;
        if (!this.viewAsValid(player, card, rule.as, rule.skillId)) continue;
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
    if (name === '杀' && this.hasSkill(player, 'zhangba') && player.hand.length >= 2) {
      out.push({
        cardId: SYNTH_ZHANGBA,
        as: '杀',
        skillId: 'zhangba',
        label: '丈八蛇矛',
        validTargets: [],
        targetMin: 0,
        targetMax: 0,
      });
    }
    if (
      this.hasSkill(player, 'guhuo') &&
      player.hand.length > 0 &&
      ['杀', '闪', '桃', '酒', '无懈可击'].includes(name)
    ) {
      out.push({
        cardId: SYNTH_GUHUO,
        as: name,
        skillId: 'guhuo',
        label: '蛊惑',
        validTargets: [],
        targetMin: 0,
        targetMax: 0,
      });
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
    opts: { prompt: string; detail?: string; canCancel?: boolean; ignoreArmor?: boolean; forcedTarget?: number; targetId?: number; timeout?: number; windowMs?: number },
  ): Promise<ResponseUse | null> {
    if (!player.alive || this.state.over) return null;
    let ignoreArmor = opts.ignoreArmor ?? false;
    const excluded = new Set<string>();
    const responseWindow =
      !player.isBot && name !== '无懈可击' ? Math.max(opts.windowMs ?? 0, 6000) : 0;
    let windowShown = false;
    for (let guard = 0; guard < 8; guard += 1) {
      const options = this.buildRespondOptions(player, name, ignoreArmor).filter(
        (o) => !excluded.has(o.cardId),
      );
      if (options.length === 0) {
        if (!player.isBot && opts.canCancel !== false) {
          // 人类玩家：即使没有可响应的牌，也弹出响应框，可立即「不出」，计时在下方手牌区
          await this.io.ask({
            id: this.askId(),
            playerId: player.id,
            kind: 'respond',
            prompt: opts.prompt,
            detail: opts.detail,
            respondName: name,
            cardOptions: [],
            canCancel: true,
            targetId: opts.targetId,
            timeout: responseWindow || opts.timeout,
            deadline: responseWindow
              ? Date.now() + responseWindow
              : opts.timeout
                ? Date.now() + opts.timeout
                : undefined,
          });
          return null;
        }
        if (responseWindow > 0 && player.hand.length > 0) {
          if (!windowShown) {
            windowShown = true;
            this.emit({
              type: 'responseWindow',
              playerId: player.id,
              name,
              ms: responseWindow,
              until: Date.now() + responseWindow,
            });
          }
          await this.io.delay(responseWindow);
        }
        return null;
      }
      if (responseWindow > 0 && !windowShown) {
        windowShown = true;
        this.emit({
          type: 'responseWindow',
          playerId: player.id,
          name,
          ms: responseWindow,
          until: Date.now() + responseWindow,
        });
      }
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
        timeout: responseWindow || opts.timeout,
        deadline: responseWindow
          ? Date.now() + responseWindow
          : opts.timeout
            ? Date.now() + opts.timeout
            : undefined,
      });
      if (res.type === 'cancel') return null;
      if (res.type !== 'respondCard') continue;

      if (res.cardId === SYNTH_GUHUO) {
        const picked = await this.askCards(
          player,
          player.hand,
          1,
          1,
          `蛊惑：选择一张手牌声明为【${name}】`,
          undefined,
          true,
        );
        if (!picked.length) return null;
        const card = picked[0];
        this.emit({ type: 'skill', playerId: player.id, name: '蛊惑', text: `声明为【${name}】`, skillId: 'guhuo' });
        this.log(`【${player.name}】发动蛊惑，声明为【${name}】`, 'skill');
        const questioners: PlayerState[] = [];
        for (const other of this.players) {
          if (!other.alive || other.id === player.id) continue;
          const yes = await this.confirm(
            other,
            `【${player.name}】发动蛊惑，声明为【${name}】`,
            `是否质疑？若此牌为真，质疑者失去 1 点体力；若为假，质疑者摸一张牌。`,
          );
          if (yes) questioners.push(other);
        }
        let resolves = true;
        if (questioners.length) {
          this.revealCards(player.id, [card], '蛊惑质疑');
          this.log(
            `【${player.name}】展示蛊惑牌【${card.name}】（${SUIT_CN[card.suit]}）`,
            'judge',
          );
          if (card.name === name) {
            for (const other of questioners) {
              if (other.alive) await this.loseHp(other, 1, player);
            }
            this.log('蛊惑为真，质疑者各失去 1 点体力', 'skill');
            resolves = card.suit === 'heart';
            if (resolves) this.log('蛊惑牌为红桃，仍按声明结算', 'skill');
          } else {
            for (const other of questioners) {
              if (other.alive) this.drawCards(other, 1, '蛊惑');
            }
            this.log('蛊惑为假，质疑者各摸一张牌，此牌作废', 'skill');
            resolves = false;
          }
        }
        if (!resolves) {
          this.removeFromHand(player, card);
          this.toDiscard(card);
          await this.notifyHandLost(player);
          return null;
        }
        this.removeFromHand(player, card);
        this.toDiscard(card);
        this.emit({
          type: 'respond',
          playerId: player.id,
          card,
          as: name,
          skillId: 'guhuo',
        });
        this.log(`${player.name}发动蛊惑，视为打出【${name}】`);
        if (name === '杀') player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
        await this.notifyHandLost(player);
        return { card, as: name, skillId: 'guhuo', virtual: true };
      }
      if (res.cardId === SYNTH_ZHANGBA) {
        const picked = await this.askCards(
          player,
          player.hand,
          2,
          2,
          '丈八蛇矛：选择两张手牌当【杀】打出',
          undefined,
          true,
        );
        if (picked.length !== 2) return null;
        for (const card of picked) {
          this.removeFromHand(player, card);
          this.toDiscard(card);
        }
        this.emit({
          type: 'respond',
          playerId: player.id,
          card: picked[0],
          cards: picked,
          as: '杀',
          skillId: 'zhangba',
        });
        this.log(`【${player.name}】发动丈八蛇矛，将 ${cardLabel(picked[0])}、${cardLabel(picked[1])} 当【杀】打出`);
        player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
        await this.notifyHandLost(player);
        return { card: null, as: '杀', skillId: 'zhangba', virtual: true };
      }
      if (res.cardId === SYNTH_BAGUA || res.cardId === SYNTH_BAZHEN) {
        const isBazhen = res.cardId === SYNTH_BAZHEN;
        const card = await this.judge(player, isBazhen ? '八阵' : '八卦阵');
        if (isRed(card.suit)) {
          this.log(`【${player.name}】的${isBazhen ? '八阵' : '八卦阵'}判定为红色，视为打出一张闪`, 'skill');
          await this.trigger('shanUsed', { player, data: {} });
          return { card: null, as: '闪', skillId: isBazhen ? 'bazhen' : 'bagua', virtual: true };
        }
        this.log(`【${player.name}】的${isBazhen ? '八阵' : '八卦阵'}判定失败`, 'judge');
        excluded.add(res.cardId);
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
      const card =
        player.hand.find((c) => c.id === res.cardId) ??
        Object.values(player.equips).find((c): c is Card => !!c && c.id === res.cardId);
      if (!card) continue;
      const as = res.as || card.name;
      const skillId = res.skillId;
      if (as !== name) continue;
      if (!(await this.removeCardForUse(player, card))) continue;
      this.toDiscard(card);
      await this.trigger('cardLost', {
        player,
        card,
        data: { reason: '响应' },
      });
      this.emit({ type: 'respond', playerId: player.id, card, as, skillId });
      this.log(`【${player.name}】打出了${as === card.name ? ` ${cardLabel(card)}` : ` ${cardLabel(card)} 视为【${as}】`}`);
      if (as === '杀') player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
      await this.notifyHandLost(player);
      if (as === '闪') await this.trigger('shanUsed', { player, card, data: {} });
      return { card, as, skillId, virtual: as !== card.name };
    }
    return null;
  }

  async useJijiang(player: PlayerState, targetId: number): Promise<boolean> {
    if (!player.alive || !this.hasSkill(player, 'jijiang')) return false;
    const target = this.players[targetId];
    if (!target?.alive) return false;
    const allies = this.players.filter(
      (p) => p.alive && p.id !== player.id && p.faction === 'shu' && p.hand.length > 0,
    );
    for (const ally of allies) {
      const resp = await this.askRespond(ally, '杀', {
        prompt: `【${player.name}】发动激将，是否替其打出一张【杀】？`,
        canCancel: true,
      });
      if (!resp) continue;
      const card =
        resp.card ??
        ({ id: `__jijiang_${this.askSeq}`, name: '杀', suit: 'spade', rank: 1, type: 'basic' } as Card);
      this.emit({
        type: 'playCard',
        playerId: player.id,
        card,
        as: '杀',
        targets: [target.id],
        skillId: 'jijiang',
      });
      this.log(`【${player.name}】通过激将获得一张【杀】，目标：${target.name}`, 'skill');
      player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
      await this.trigger('cardUsed', { player, card, data: { as: '杀' } });
      await this.useSha(player, card, [target.id]);
      return true;
    }
    return false;
  }

  hasShaForResponse(player: PlayerState): boolean {
    const handIds = new Set(player.hand.map((card) => card.id));
    for (const card of [...player.hand, ...Object.values(player.equips).filter((c): c is Card => !!c)]) {
      if (this.qianxiBlocked(player, card)) continue;
      if (card.name === '杀') return true;
      for (const rule of this.viewAsRules(player, 'play')) {
        if (rule.as !== '杀') continue;
        const ruleDef = SKILL_MAP.get(rule.skillId)?.viewAs?.find((item) => item.as === '杀');
        if (!handIds.has(card.id) && !ruleDef?.fromEquip) continue;
        if (this.viewAsValid(player, card, '杀', rule.skillId)) return true;
      }
    }
    return this.hasSkill(player, 'zhangba') && player.hand.length >= 2;
  }

  async useShaOn(
    player: PlayerState,
    victim: PlayerState,
    reason: string,
    countSha = true,
    promptOverride?: string,
  ): Promise<boolean> {
    const options: CardOption[] = [];
    for (const card of [...player.hand, ...Object.values(player.equips).filter((c): c is Card => !!c)]) {
      if (this.qianxiBlocked(player, card)) continue;
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
        const ruleDef = SKILL_MAP.get(rule.skillId)?.viewAs?.find((item) => item.as === '杀');
        if (!player.hand.some((item) => item.id === card.id) && !ruleDef?.fromEquip) continue;
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
    if (this.hasSkill(player, 'zhangba') && player.hand.length >= 2) {
      options.push({
        cardId: SYNTH_ZHANGBA,
        as: '杀',
        skillId: 'zhangba',
        label: '丈八蛇矛',
        validTargets: [victim.id],
        targetMin: 1,
        targetMax: 1,
      });
    }
    if (!options.length) return false;
    const res = await this.io.ask({
      id: this.askId(),
      playerId: player.id,
      kind: 'respond',
      prompt:
        promptOverride ??
        `${reason}：对【${victim.name}】使用一张杀${reason === '借刀杀人' ? '，否则将武器交给使用者' : '，否则令其弃置你一张牌'}`,
      respondName: '杀',
      cardOptions: options,
      canCancel: true,
    });
    if (res.type !== 'respondCard') return false;
    if (res.cardId === SYNTH_ZHANGBA) {
      const picked = await this.askCards(
        player,
        player.hand,
        2,
        2,
        '丈八蛇矛：选择两张手牌当杀',
        undefined,
        true,
      );
      if (picked.length !== 2) return false;
      for (const item of picked) this.removeFromHand(player, item);
      this.limbo.push(...picked);
      this.emit({
        type: 'playCard',
        playerId: player.id,
        card: picked[0],
        as: '杀',
        targets: [victim.id],
        skillId: 'zhangba',
      });
      this.log(`【${player.name}】发动丈八蛇矛，将两张手牌当【杀】对【${victim.name}】使用`, 'info');
      player.flags.lastShaTurn = this.state.turn;
      if (countSha) player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
      await this.notifyHandLost(player);
      await this.useSha(player, picked[0], [victim.id], picked[0].element);
      this.cleanupLimbo(picked[0], picked.slice(1));
      return true;
    }
    const card =
      player.hand.find((c) => c.id === res.cardId) ??
      Object.values(player.equips).find((c): c is Card => !!c && c.id === res.cardId);
    if (!card) return false;
    const as = res.as || '杀';
    if (as !== '杀') return false;
    if (!(await this.removeCardForUse(player, card))) return false;
    this.limbo.push(card);
    this.emit({ type: 'playCard', playerId: player.id, card, as: '杀', targets: [victim.id], skillId: res.skillId });
    this.log(`【${player.name}】对【${victim.name}】使用了杀`, 'info');
    player.flags.lastShaTurn = this.state.turn;
    if (countSha) player.usedThisTurn.sha = (player.usedThisTurn.sha ?? 0) + 1;
    await this.notifyHandLost(player);
    await this.useSha(player, card, [victim.id], card.element);
    this.cleanupLimbo(card);
    return true;
  }

  private async askWuxie(
    cardName: string,
    target: PlayerState,
    user: PlayerState,
    desc: string,
    forceWindow = false,
  ): Promise<boolean> {
    if (this.wuxieWindowPending || forceWindow) {
      this.wuxieWindowPending = false;
      const ms = 3000;
      this.emit({ type: 'wuxieWindow', ms, until: Date.now() + ms });
      await this.io.delay(ms);
    }
    let nullified = false;
    for (let guard = 0; guard < 8; guard += 1) {
      let played = false;
      for (const p of this.turnOrder()) {
        if (!p.alive) continue;
        if (this.buildRespondOptions(p, '无懈可击').length === 0) continue;
        const resp = await this.askRespond(p, '无懈可击', {
          prompt: `${desc}，是否使用无懈可击？`,
          canCancel: true,
          targetId: target.id,
          timeout: p.isBot ? 3000 : 5000,
        });
        if (resp) {
          nullified = !nullified;
          played = true;
          await this.trigger('cardUsed', {
            player: p,
            card: resp.card ?? undefined,
            data: { as: '无懈可击' },
          });
          this.log(`【${p.name}】使用了无懈可击${nullified ? '，效果被抵消' : '，抵消了无懈可击'}`, 'skill');
          break;
        }
      }
      if (!played) break;
    }
    return nullified;
  }

  // ---------- 选择目标卡牌 ----------

  stagePojun(target: PlayerState, card: Card): boolean {
    const fromHand = this.removeFromHand(target, card);
    const fromEquip = !fromHand && this.removeFromEquip(target, card);
    const fromJudge = !fromHand && !fromEquip && this.removeFromJudge(target, card);
    if (!fromHand && !fromEquip && !fromJudge) return false;
    target.pojun = [...(target.pojun ?? []), card];
    if (fromEquip) {
      this.emit({ type: 'equip', playerId: target.id, slot: card.equipSlot!, card: undefined });
    }
    return true;
  }

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
    const before: Record<string, unknown> = { amount, cancel: false, element: dmgElement };
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
      reason,
    });
    this.log(
      `${source ? `【${source.name}】对` : ''}【${target.name}】造成 ${amount} 点${dmgElement === 'fire' ? '火焰' : dmgElement === 'thunder' ? '雷电' : ''}伤害${reason ? `（${reason}）` : ''}，体力 ${Math.max(0, target.hp)}/${target.maxHp}`,
      'damage',
    );
    if (!this.state.over && target.hp <= 0 && target.alive) {
      await this.dying(target, source ?? undefined);
    }
    await this.trigger('damageDone', {
      player: target,
      source: source ?? undefined,
      target,
      card,
      data: { amount, element: dmgElement, reason },
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
  }

  async changeMaxHp(player: PlayerState, delta: number): Promise<void> {
    const before = player.maxHp;
    player.maxHp = Math.max(1, player.maxHp + delta);
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    if (before === player.maxHp) return;
    this.emit({ type: 'state' });
    await this.trigger('maxHpChanged', { player, data: { before, after: player.maxHp } });
  }

  heal(source: PlayerState | null, target: PlayerState, amount: number, opts?: { card?: Card; reason?: string }): void {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp === before) return;
    this.emit({
      type: 'heal',
      sourceId: source?.id,
      targetId: target.id,
      amount: target.hp - before,
      hp: target.hp,
      reason: opts?.reason,
    });
    this.log(
      `${source && source.id !== target.id ? `【${source.name}】令` : ''}【${target.name}】回复 ${target.hp - before} 点体力（${opts?.reason ?? '回复'}），体力 ${target.hp}/${target.maxHp}`,
      'heal',
    );
    const healed = target.hp - before;
    if (source && source.id !== target.id && healed > 0 && this.hasSkill(target, 'enyuan')) {
      for (let i = 0; i < healed; i += 1) this.drawCards(source, 1, '恩怨');
    }
  }

  async loseHp(
    player: PlayerState,
    amount: number,
    source?: PlayerState,
    opts?: { deferDying?: boolean },
  ): Promise<void> {
    if (!player.alive || amount <= 0) return;
    player.hp -= amount;
    this.emit({ type: 'loseHp', targetId: player.id, amount, hp: player.hp });
    this.log(`【${player.name}】失去 ${amount} 点体力，体力 ${Math.max(0, player.hp)}/${player.maxHp}`, 'damage');
    if (player.hp <= 0 && !opts?.deferDying) await this.dying(player, source);
  }

  async dying(player: PlayerState, killer?: PlayerState): Promise<void> {
    if (!player.alive || this.state.over) return;
    this.emit({ type: 'dying', playerId: player.id });
    this.log(`【${player.name}】进入濒死状态`, 'damage');
    await this.trigger('dying', { player, target: player, source: killer, data: {} });
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
        !!this.currentPlayer?.alive &&
        this.hasSkill(this.currentPlayer, 'wansha');
      if (wansha) this.log(`【${this.currentPlayer.name}】的完杀生效，只有你和濒死角色可以使用桃`, 'skill');
      for (const saver of this.turnOrder()) {
        if (!saver.alive) continue;
        if (
          wansha &&
          saver.id !== player.id &&
          saver.id !== this.currentPlayer?.id
        ) {
          continue;
        }
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
      ...(player.pojun ?? []),
    ];
    player.hand = [];
    player.equips = {};
    player.judgeZone = [];
    player.unyu = [];
    player.fields = [];
    player.pojun = [];
    for (const c of cards) this.toDiscard(c);
    this.emit({ type: 'death', playerId: player.id, role: player.role });

    // 2v2：阵亡后提示队伍态势，方便队友判断
    if (this.state.rules.mode === '2v2') {
      const teamName = player.role === 'loyalist' ? '甲队' : '乙队';
      const mates = this.players.filter(
        (p) => p.alive && p.role === player.role && p.id !== player.id,
      );
      if (mates.length === 1) {
        this.log(`【${player.name}】阵亡，${teamName}只剩【${mates[0].name}】一人`, 'system');
      } else if (mates.length === 0) {
        this.log(`【${player.name}】阵亡，${teamName}已无人在场`, 'system');
      }
    }
    const deathRole =
      this.state.rules.mode === 'landlord'
        ? player.role === 'lord'
          ? '地主'
          : '农民'
        : ROLE_NAME[player.role];
    this.log(`【${player.name}】阵亡，身份是【${deathRole}】`, 'death');

    if (this.state.rules.mode === 'landlord' && player.role === 'rebel') {
      const teammate = this.players.find((p) => p.alive && p.role === 'rebel' && p.id !== player.id);
      if (teammate && !teammate.flags.gongku) {
        const choice = await this.askOption(
          teammate,
          '共苦：队友阵亡，选择回复 1 点体力或摸两张牌',
          [
            { id: 'heal', label: '回复 1 点体力' },
            { id: 'draw', label: '摸两张牌' },
          ],
          undefined,
          true,
        );
        if (choice === 'heal') {
          teammate.flags.gongku = 1;
          this.heal(teammate, teammate, 1, { reason: '共苦' });
        } else if (choice === 'draw') {
          teammate.flags.gongku = 1;
          this.drawCards(teammate, 2, '共苦');
        }
      }
    }

    if (killer && killer.alive && this.state.rules.mode === 'identity') {
      if (player.role === 'rebel') {
        this.drawCards(killer, 3, '击杀反贼奖励');
      } else if (player.role === 'loyalist' && killer.role === 'lord') {
        const all = [...killer.hand, ...Object.values(killer.equips).filter((c): c is Card => !!c)];
        await this.discardCards(killer, all, '误杀忠臣');
      }
    }
    if (killer && killer.alive && this.state.rules.mode === 'guozhan' && killer.ambition) {
      this.drawCards(killer, 3, '野心家击杀奖励');
    }
    this.checkWin();
  }

  private checkWin(): void {
    if (this.state.over) return;
    const alive = this.alivePlayers();
    if (this.state.rules.mode === 'guozhan') {
      if (alive.length === 0) {
        this.endGame('draw', '同归于尽，天下未定。');
        return;
      }
      if (alive.length === 1) {
        const winner = alive[0];
        this.endGame(winner.faction, `【${winner.name}】成为最后的生还者，取得了国战的胜利！`);
        return;
      }
      const normal = alive.filter((p) => !p.ambition);
      if (normal.length === 0) return;
      const factions = [...new Set(normal.map((p) => p.faction))];
      if (normal.length === alive.length && factions.length === 1) {
        const winner = factions[0];
        this.endGame(winner, `${FACTION_NAME[winner]}势力扫平群雄，取得了国战的胜利！`);
      }
      return;
    }
    if (this.state.rules.mode === '2v2') {
      const teamA = alive.filter((p) => p.role === 'loyalist').length;
      const teamB = alive.filter((p) => p.role === 'rebel').length;
      if (teamA === 0 && teamB === 0) this.endGame('draw', '同归于尽，不分胜负。');
      else if (teamB === 0) this.endGame('loyalist', '乙队全员阵亡，甲队（1、4号位）取得胜利！');
      else if (teamA === 0) this.endGame('rebel', '甲队全员阵亡，乙队（2、3号位）取得胜利！');
      return;
    }
    if (this.state.rules.mode === 'duel' || this.state.players.length === 2) {
      if (alive.length === 0) this.endGame('draw', '两败俱伤，单挑不分胜负。');
      else if (alive.length === 1) {
        const winner = alive[0];
        this.endGame(winner.role === 'lord' ? 'lord' : 'rebel', `【${winner.name}】取得了单挑胜利！`);
      }
      return;
    }
    if (this.state.rules.mode === 'landlord') {
      const landlord = this.players.find((p) => p.role === 'lord');
      const farmers = alive.filter((p) => p.role === 'rebel');
      if (!landlord?.alive) {
        this.endGame('rebel', '地主阵亡，农民取得胜利！');
      } else if (farmers.length === 0) {
        this.endGame('lord', '两名农民均已阵亡，地主取得胜利！');
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

  private async feiyang(player: PlayerState): Promise<void> {
    if (
      this.state.rules.mode !== 'landlord' ||
      player.role !== 'lord' ||
      !player.judgeZone.length ||
      player.flags.feiyang
    ) {
      return;
    }
    const handAndEquips = [...player.hand, ...Object.values(player.equips).filter((c): c is Card => !!c)];
    if (handAndEquips.length < 2) return;
    const ok = await this.confirm(
      player,
      '是否发动【飞扬】？',
      '弃置两张牌，再弃置自己判定区的一张牌',
    );
    if (!ok) return;
    const judgePick = await this.askCards(
      player,
      player.judgeZone,
      1,
      1,
      '飞扬：选择一张判定牌弃置',
      undefined,
      false,
    );
    if (!judgePick.length) return;
    const picked = await this.askCards(player, handAndEquips, 2, 2, '飞扬：选择两张牌弃置');
    if (picked.length !== 2) return;
    player.flags.feiyang = 1;
    this.log(`【${player.name}】发动【飞扬】`, 'skill');
    await this.discardCards(player, [...picked, ...judgePick], '飞扬');
  }

  private async judgePhase(player: PlayerState): Promise<void> {
    await this.feiyang(player);
    while (player.judgeZone.length > 0 && player.alive && !this.state.over) {
      const card = player.judgeZone.pop()!;
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
        if (this.judgeResult(judged, '闪电', player)) {
          this.log(`【${player.name}】被闪电击中！`, 'judge');
          if (this.hasSkill(player, 'hebao')) {
            this.log(`【${player.name}】发动【烈火】，弃置所有手牌并令全场受到闪电命中`, 'skill');
            const hand = [...player.hand];
            if (hand.length) await this.discardCards(player, hand, '烈火');
            const targets = this.players.filter((p) => p.alive);
            for (const t of targets) {
              if (this.state.over) break;
              await this.damage(null, t, 3, card, '闪电', 'thunder');
            }
          } else {
            await this.damage(null, player, 3, card, '闪电', 'thunder');
          }
          this.toDiscard(card);
        } else {
          let target = this.nextAlive(player);
          const aliveOthers = this.players.filter((p) => p.alive && p.id !== player.id).length;
          let hops = 0;
          while (target && target.judgeZone.some((c) => c.name === '闪电') && hops < aliveOthers) {
            target = this.nextAlive(target);
            hops += 1;
          }
          if (target && !target.judgeZone.some((c) => c.name === '闪电')) {
            target.judgeZone.push(card);
            this.removeFromLimbo(card);
            this.log(`闪电移动到【${target.name}】的判定区`);
          } else {
            this.toDiscard(card);
            this.log('闪电无人可传，置入弃牌堆');
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
    const dir = this.state.direction;
    for (let i = 1; i <= n; i += 1) {
      const p = this.players[(from.seat + i * dir + n * 1000) % n];
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
    let count = Number(data.drawCount ?? 2);
    if (
      this.state.rules.mode === '2v2' &&
      player.id === 0 &&
      this.state.turn === 1 &&
      !this.team2v2FirstDrawUsed
    ) {
      count = Math.min(count, 1);
      this.team2v2FirstDrawUsed = true;
      this.log(`【${player.name}】1号位首回合摸牌阶段只摸一张牌`, 'system');
    }
    if (count > 0) this.drawCards(player, count, '摸牌阶段');
  }

  private async discardPhase(player: PlayerState): Promise<void> {
    const limit = this.handLimit(player);
    if (player.hand.length <= limit) {
      await this.trigger('discardPhaseEnd', { player, data: { cards: [] } });
      return;
    }
    const need = player.hand.length - limit;
    const picked = await this.askCards(player, player.hand, need, need, `弃牌阶段：请弃置 ${need} 张手牌`, undefined, false);
    const discarded = picked.length ? picked : player.hand.slice(0, need);
    await this.discardCards(player, discarded, '弃牌阶段');
    await this.trigger('discardPhaseEnd', { player, data: { cards: discarded } });
  }

  private resetTurnFlags(player: PlayerState): void {
    const persistent = new Set([
      'niepan',
      'luanwu',
      'zaoxian',
      'ruoyu',
      'hunzi',
      'huashen',
      'zhiji',
      'gongku',
      'laishengUsed',
      'laishengArmed',
    ]);
    for (const key of Object.keys(player.flags)) {
      if (!persistent.has(key)) delete player.flags[key];
    }
  }

  private async runTurn(player: PlayerState): Promise<void> {
    this.state.turn += 1;
    player.usedThisTurn = {};
    this.resetTurnFlags(player);
    player.skipPhases = [];
    if (this.state.rules.mode === 'guozhan' && player.isBot && player.generalRevealed) {
      const hidden = player.generalRevealed.findIndex((value) => !value);
      if (hidden >= 0) this.revealGeneral(player, hidden);
    }
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
      } else if (phase === 'prepare' && this.state.rules.mode === 'landlord' && player.role === 'lord') {
        this.drawCards(player, 1, '跋扈');
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
    await this.resolveFangquan(player);
    await this.trigger('turnEnd', { player, data: {} });
    for (const owner of this.players) {
      if (!owner.pojun?.length) continue;
      const cards = owner.pojun.splice(0);
      owner.hand.push(...cards);
      this.emit({ type: 'gain', playerId: owner.id, cards, public: false });
      this.log(`【${owner.name}】收回了破军牌`, 'system');
    }
    for (const owner of this.players) this.resetTurnFlags(owner);
  }

  /** 放权：回合末弃一张手牌，令其他角色获得额外回合 */
  private async resolveFangquan(player: PlayerState): Promise<void> {
    if (!player.flags.fangquanPending) return;
    player.flags.fangquanPending = 0;
    if (!player.alive) return;
    if (player.hand.length === 0) {
      this.log(`【${player.name}】无手牌可弃，放权未能授予额外回合`, 'skill');
      return;
    }
    const cost = await this.askCards(player, player.hand, 1, 1, '放权：弃置一张手牌', undefined, true);
    if (!cost.length) return;
    const target = await this.askPlayer(
      player,
      this.players.filter((p) => p.alive && p.id !== player.id),
      '放权：选择一名其他角色获得额外回合',
    );
    if (!target) return;
    await this.discardCards(player, cost, '放权');
    this.grantExtraTurn(target);
    this.log(`【${player.name}】放权，弃置一张手牌，令【${target.name}】获得一个额外回合`, 'skill');
  }

  grantExtraTurn(player: PlayerState): void {
    if (player.alive) this.extraTurnPlayerId = player.id;
  }

  private advance(): void {
    const n = this.players.length;
    const dir = this.state.direction;
    for (let i = 1; i <= n; i += 1) {
      const idx = (this.state.current + i * dir + n * 1000) % n;
      if (this.players[idx].alive || this.players[idx].flags.laishengArmed) {
        this.state.current = idx;
        return;
      }
    }
  }

  async begin(): Promise<void> {
    this.emit({ type: 'state' });
    try {
      await this.trigger('gameStart', { data: {} });
      while (!this.state.over && !this.stopped) {
        const player = this.currentPlayer;
        if (!player?.alive) {
          if (player?.flags.laishengArmed) {
            player.flags.laishengArmed = 0;
            player.alive = true;
            player.hp = 1;
            player.flipped = false;
            player.chained = false;
            this.emit({ type: 'revive', playerId: player.id, hp: 1 });
            this.log(`【${player.name}】残躯生效，复活并摸两张牌`, 'skill');
            this.drawCards(player, 2, '残躯');
          } else {
            this.advance();
            continue;
          }
        }
        if (player.flipped) {
          player.flipped = false;
          this.resetTurnFlags(player);
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
        if (this.extraTurnPlayerId != null) {
          const extraId = this.extraTurnPlayerId;
          this.extraTurnPlayerId = null;
          const extra = this.players[extraId];
          if (extra?.alive && !this.state.over) {
            const previous = this.state.current;
            this.state.current = extra.id;
            await this.runTurn(extra);
            this.state.current = previous;
          }
        }
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
  const name = card.name === '杀' && card.element === 'fire'
    ? '火杀'
    : card.name === '杀' && card.element === 'thunder'
      ? '雷杀'
      : card.name;
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
