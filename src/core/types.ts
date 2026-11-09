export type Suit = 'spade' | 'heart' | 'club' | 'diamond';
export type CardType = 'basic' | 'trick' | 'delayed' | 'equip';
export type EquipSlot = 'weapon' | 'armor' | 'horsePlus' | 'horseMinus';
export type Gender = 'male' | 'female';
export type Faction = 'wei' | 'shu' | 'wu' | 'qun';
export type Role = 'lord' | 'loyalist' | 'rebel' | 'traitor';
export type GameMode = 'identity' | 'duel' | 'landlord' | 'guozhan';
export type Element = 'fire' | 'thunder';
export type Phase = 'prepare' | 'judge' | 'draw' | 'play' | 'discard' | 'finish';

export const PHASES: Phase[] = ['prepare', 'judge', 'draw', 'play', 'discard', 'finish'];
export const PHASE_NAME: Record<Phase, string> = {
  prepare: '准备阶段',
  judge: '判定阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  finish: '结束阶段',
};

export const ROLE_NAME: Record<Role, string> = {
  lord: '主公',
  loyalist: '忠臣',
  rebel: '反贼',
  traitor: '内奸',
};

export const FACTION_NAME: Record<Faction, string> = {
  wei: '魏',
  shu: '蜀',
  wu: '吴',
  qun: '群',
};

export const SUIT_NAME: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

export const SUIT_CN: Record<Suit, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

export interface Card {
  id: string;
  name: string;
  suit: Suit;
  rank: number;
  type: CardType;
  equipSlot?: EquipSlot;
  range?: number;
  element?: Element;
}

export interface PlayerState {
  id: number;
  seat: number;
  name: string;
  heroId: string;
  heroName: string;
  heroIds?: string[];
  faction: Faction;
  gender: Gender;
  role: Role;
  roleRevealed: boolean;
  maxHp: number;
  hp: number;
  alive: boolean;
  hand: Card[];
  equips: Partial<Record<EquipSlot, Card>>;
  judgeZone: Card[];
  flags: Record<string, number>;
  usedThisTurn: Record<string, number>;
  skipPhases: Phase[];
  skills: string[];
  extraSkills: string[];
  fields: Card[];
  flipped: boolean;
  unyu: Card[];
  pojun?: Card[];
  chained: boolean;
  isBot: boolean;
  /** 国战双将各自的技能与明置状态 */
  generalSkills?: string[][];
  generalRevealed?: boolean[];
  ambition?: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'info' | 'damage' | 'heal' | 'skill' | 'judge' | 'system' | 'death';
}

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  current: number;
  /** 本局第一位行动者，用于计算一、二、三号桌位 */
  startPlayer: number;
  turn: number;
  /** 1 顺时针，-1 逆时针；每局开始时随机 */
  direction: 1 | -1;
  phase: Phase;
  over: boolean;
  winner: Role | Faction | 'draw' | null;
  log: LogEntry[];
  seed: number;
  deckCount?: number;
  discardCount?: number;
  roleCounts?: Record<Role, number>;
  rules: CustomRules;
}

export interface CustomRules {
  mode: GameMode;
  initialHand: number;
  drawCount: number;
  hpModifier: number;
  handLimitModifier: number;
  revealRoles: boolean;
  skillsEnabled: boolean;
  allowDelayed: boolean;
  allowNullification: boolean;
  allowEquipment: boolean;
  military: boolean;
}

export const DEFAULT_RULES: CustomRules = {
  mode: 'identity',
  initialHand: 4,
  drawCount: 2,
  hpModifier: 0,
  handLimitModifier: 0,
  revealRoles: false,
  skillsEnabled: true,
  allowDelayed: true,
  allowNullification: true,
  allowEquipment: true,
  military: true,
};

export interface CardOption {
  cardId: string;
  as: string;
  skillId?: string;
  label?: string;
  extraCardIds?: string[];
  element?: Element;
  validTargets: number[];
  targetMin: number;
  targetMax: number;
  /** 此选项不受距离限制（如弓骑） */
  ignoreDistance?: boolean;
  /** 两段式目标：键为第一个目标，值为该目标可选中的后续目标 */
  targetAfter?: Record<number, number[]>;
}

export interface SkillOption {
  id: string;
  name: string;
  desc: string;
}

export interface AskRequest {
  id: number;
  playerId: number;
  kind: 'play' | 'respond' | 'discard' | 'chooseCards' | 'choosePlayer' | 'chooseOption' | 'reorder';
  prompt: string;
  detail?: string;
  cardOptions?: CardOption[];
  skillOptions?: SkillOption[];
  cards?: Card[];
  min?: number;
  max?: number;
  players?: number[];
  options?: { id: string; label: string; desc?: string }[];
  canCancel?: boolean;
  canEnd?: boolean;
  respondName?: string;
  targetId?: number;
  timeout?: number;
  /** 统一截止时间（毫秒时间戳），用于多端同步倒计时 */
  deadline?: number;
}

export type GameAction =
  | {
      type: 'useCard';
      cardId: string;
      as: string;
      targets: number[];
      skillId?: string;
      extraCardIds?: string[];
      element?: Element;
    }
  | {
      type: 'respondCard';
      cardId: string;
      as: string;
      skillId?: string;
      extraCardIds?: string[];
    }
  | { type: 'chooseCards'; cardIds: string[] }
  | { type: 'choosePlayers'; playerIds: number[] }
  | { type: 'chooseOption'; optionId: string }
  | { type: 'activateSkill'; skillId: string }
  | { type: 'endPlay' }
  | { type: 'cancel' };

export interface AoeEntry {
  playerId: number;
  result: 'pending' | 'answered' | 'damage' | 'immune' | 'wuxie' | 'dead';
  card?: Card;
  as?: string;
  skillId?: string;
  hp?: number;
  note?: string;
}

export type GameEvent =
  | { type: 'log'; text: string; kind?: LogEntry['kind'] }
  | { type: 'turn'; playerId: number; turn: number }
  | { type: 'phase'; playerId: number; phase: Phase }
  | { type: 'playCard'; playerId: number; card: Card; as: string; targets: number[]; skillId?: string }
  | { type: 'respond'; playerId: number; card: Card; as: string; skillId?: string }
  | { type: 'draw'; playerId: number; count: number; cardIds: string[] }
  | { type: 'gain'; playerId: number; cards: Card[]; from?: number; public: boolean }
  | { type: 'discard'; playerId: number; cards: Card[]; reason?: string }
  | {
      type: 'damage';
      sourceId?: number;
      targetId: number;
      amount: number;
      hp: number;
      card?: Card;
      element?: Element;
      reason?: string;
    }
  | { type: 'heal'; sourceId?: number; targetId: number; amount: number; hp: number; reason?: string }
  | { type: 'loseHp'; targetId: number; amount: number; hp: number }
  | { type: 'judge'; playerId: number; card: Card; text: string; reason: string; success: boolean; changedBy?: string }
  | { type: 'dying'; playerId: number }
  | { type: 'death'; playerId: number; role: Role }
  | { type: 'equip'; playerId: number; slot: EquipSlot; card?: Card }
  | { type: 'skill'; playerId: number; name: string; text?: string }
  | { type: 'wuxieWindow'; ms: number; until?: number }
  | { type: 'reveal'; playerId?: number; cards: Card[]; label?: string }
  | {
      type: 'harvest';
      cards: Card[];
      picks: { playerId: number; card: Card }[];
      chooserId?: number;
      done?: boolean;
    }
  | {
      type: 'aoe';
      cardName: string;
      sourceId: number;
      entries: AoeEntry[];
      activeId?: number;
      timeoutMs?: number;
      done?: boolean;
    }
  | { type: 'gameOver'; text: string; winner: Role | Faction | 'draw' }
  | { type: 'state' };

export interface GameIO {
  emit(ev: GameEvent): void;
  ask(req: AskRequest): Promise<GameAction>;
  delay(ms: number): Promise<void>;
}

export interface HeroData {
  id: string;
  disabled?: boolean;
  name: string;
  faction: Faction;
  gender: Gender;
  hp: number;
  title: string;
  skillIds: string[];
  lordSkillId?: string;
  quote?: string;
}
