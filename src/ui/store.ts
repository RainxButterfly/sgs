import { create } from 'zustand';
import { Game, buildRoles } from '../core/game';
import { HEROES, HERO_MAP, PLAYABLE_HEROES } from '../core/deck';
import { planBotFactions, takeFactionPair } from '../core/guozhan';
import { getDevPickPool } from '../dev/bridge';
import { safeBotAction } from '../core/smartBot';
import { endGameSession, markGameSession, recordDiagnostic } from './diagnostics';
import { LanClientManager, LanHostManager, createRoomInfo, initPlatform, isAndroidApp, isTauri, parseAddress } from '../net/lan';
import type { ChatMessage, LobbyState, PropMessage, RoomInfo, SpectatorInfo } from '../net/protocol';
import {
  checkAndroidUpdate,
  checkAndroidUpdateFromWeb,
  installAndroidUpdateFromWeb,
  checkAppUpdate,
  checkAppUpdateFromWeb,
  installAndroidUpdate,
  installAppUpdate,
  type AppUpdateInfo,
} from './update';
import { loadBackgroundSettings, saveBackgroundSettings, loadBackgroundVideo, clearBackgroundVideo, type BackgroundScope } from './background';
import type { GdView } from '../core/guandan-view';
import { applySoundSettings, getSoundSettings, getVibrationEnabled, playSound, setVibrationEnabled, vibrate } from './sound';
import { syncBgm } from './bgm';
import { playCardVoice, playDieVoice, playSkillVoice } from './voice';
import { cardVoicePinyin } from './cardArt';
import { applyMatchXp, loadProfile, normalizePlayerName, saveProfile, type PlayerProfile, type XpGain } from './profile';
import { scheduleDataSnapshot } from './dataStorage';
import { addMatchRecord, localDateKey } from './history';
import type {
  AoeEntry,
  AskRequest,
  Card,
  CardOption,
  CustomRules,
  GameAction,
  GameEvent,
  GameIO,
  GameState,
  Role,
} from '../core/types';

type Screen = 'menu' | 'setup' | 'pick' | 'lan' | 'lobby' | 'gallery' | 'game' | 'result' | 'guandan';

interface PreGame {
  count: number;
  rules?: Partial<CustomRules>;
  candidates: string[];
  candidatePairs?: { primary: string; secondary: string }[];
  bots: { name: string; heroId: string; heroIds?: string[] }[];
  roles: Role[];
  lordIndex: number;
  /** 先手座位：身份场为主公，其余模式在选将前随机确定 */
  firstPlayer: number;
  lordHeroId: string | null;
  bid?: {
    highest: number;
    highestBidder: number;
    bids: (number | null)[];
    done: boolean;
  };
}

interface SavedLanSession {
  address: string;
  code: string;
  name: string;
  spectate?: boolean;
}

const LAN_SESSION_KEY = 'sgk-lan-session';
const AI_SPEED_KEY = 'sgs-ai-speed';
const SELF_CARD_SIDE_KEY = 'sgs-self-card-side';
const UI_THEME_KEY = 'sgs-ui-theme';
const UI_PALETTE_KEY = 'sgs-ui-palette';

function loadAiSpeed(): number {
  try {
    const raw = localStorage.getItem(AI_SPEED_KEY);
    if (raw === null) return 420;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1200, value)) : 420;
  } catch {
    return 420;
  }
}

function loadSelfCardSide(): 'left' | 'right' {
  try {
    return localStorage.getItem(SELF_CARD_SIDE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

function loadUiTheme(): 'classic' | 'magic' {
  try {
    return localStorage.getItem(UI_THEME_KEY) === 'classic' ? 'classic' : 'magic';
  } catch {
    return 'magic';
  }
}

function saveUiTheme(value: 'classic' | 'magic'): void {
  try {
    localStorage.setItem(UI_THEME_KEY, value);
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

export type UiPalette = 'rainbow' | 'rock' | 'magic';

function loadUiPalette(): UiPalette {
  try {
    const raw = localStorage.getItem(UI_PALETTE_KEY);
    if (raw === 'rock' || raw === 'magic') return raw;
    return 'rainbow';
  } catch {
    return 'rainbow';
  }
}

function saveUiPalette(value: UiPalette): void {
  try {
    localStorage.setItem(UI_PALETTE_KEY, value);
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

function saveSelfCardSide(value: 'left' | 'right'): void {
  try {
    localStorage.setItem(SELF_CARD_SIDE_KEY, value);
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

function saveAiSpeed(value: number): void {
  try {
    localStorage.setItem(AI_SPEED_KEY, String(value));
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

export function loadSavedLanSession(): SavedLanSession | null {
  try {
    const raw = localStorage.getItem(LAN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedLanSession>;
    if (!parsed.address || !parsed.code || !parsed.name) return null;
    return {
      address: parsed.address,
      code: parsed.code,
      name: parsed.name,
      spectate: parsed.spectate === true,
    };
  } catch {
    return null;
  }
}

function saveLanSession(session: SavedLanSession): void {
  try {
    localStorage.setItem(LAN_SESSION_KEY, JSON.stringify(session));
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

function clearSavedLanSession(): void {
  try {
    localStorage.removeItem(LAN_SESSION_KEY);
    scheduleDataSnapshot();
  } catch {
    // ignore storage failures
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function firstUpdateResult(
  tasks: Promise<AppUpdateInfo | null>[],
): Promise<{ info: AppUpdateInfo | null; success: boolean; errors: string[] }> {
  return new Promise((resolve) => {
    let remaining = tasks.length;
    let success = false;
    let done = false;
    const errors: string[] = [];
    const finish = (info: AppUpdateInfo | null) => {
      if (done) return;
      done = true;
      resolve({ info, success, errors });
    };
    tasks.forEach((task) => {
      task.then(
        (value) => {
          success = true;
          if (value) finish(value);
          else {
            remaining -= 1;
            if (remaining === 0) finish(null);
          }
        },
        (error) => {
          errors.push((error as Error)?.message || String(error));
          remaining -= 1;
          if (remaining === 0) finish(null);
        },
      );
    });
  });
}

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'latest' | 'error';

export interface GameLike {
  state: GameState;
  stop?: () => void;
  revealGeneral?: (player: import('../core/types').PlayerState, index: number) => boolean;
  buildPlayOptions?: (player: import('../core/types').PlayerState) => CardOption[];
  activeSkillOptions?: (player: import('../core/types').PlayerState) => import('../core/types').SkillOption[];
  attackRange?: (player: import('../core/types').PlayerState) => number;
  distance?: (from: import('../core/types').PlayerState, to: import('../core/types').PlayerState) => number;
}

interface AsChooser {
  cardId: string;
  options: CardOption[];
}

interface PlayEvent {
  id: number;
  playerId: number;
  card: Card;
  as: string;
  targets: number[];
  isResponse?: boolean;
}

interface JudgeEvent {
  id: number;
  playerId: number;
  card: Card;
  success: boolean;
  text: string;
  reason: string;
  changedBy?: string;
}

interface DiscardEvent {
  id: number;
  playerId: number;
  cards: Card[];
  reason?: string;
}

interface FlashEvent {
  id: number;
  playerId: number;
  kind: 'damage' | 'heal';
  amount: number;
  sourceId?: number;
  reason?: string;
  card?: Card;
}

interface SpeechBubble {
  id: number;
  playerId: number;
  name: string;
  text: string;
}

interface PropThrow {
  id: number;
  fromId: number;
  fromName: string;
  targetId: number;
  prop: string;
}

interface SkillNotice {
  id: number;
  playerId: number;
  name: string;
  text?: string;
}

interface RevealNotice {
  id: number;
  playerId?: number;
  cards: Card[];
  label?: string;
}

interface DamageNotice {
  id: number;
  kind: 'damage' | 'heal';
  sourceId?: number;
  targetId: number;
  amount: number;
  hp: number;
  reason?: string;
  card?: Card;
}

interface CardHistoryEntry {
  id: number;
  kind: 'play' | 'respond' | 'discard' | 'reveal' | 'judge' | 'gain' | 'skill';
  playerId?: number;
  cards: Card[];
  label: string;
  as?: string;
  targets?: number[];
  turn?: number;
}

interface HarvestState {
  cards: Card[];
  picks: { playerId: number; card: Card }[];
  chooserId?: number;
  done?: boolean;
}

interface AoeState {
  cardName: string;
  sourceId: number;
  entries: AoeEntry[];
  activeId?: number;
  timeoutMs?: number;
  done?: boolean;
}

interface GameStore {
  screen: Screen;
  /** 图鉴的返回目标：从房间进来时返回房间，其余回主菜单 */
  galleryFrom: 'menu' | 'lobby';
  game: GameLike | null;
  preGame: PreGame | null;
  humanId: number;
  version: number;
  pending: AskRequest | null;
  skipWuxie: boolean;
  autoPlay: boolean;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  chatUnread: number;
  result: { text: string; winner: string } | null;
  lastPlay: PlayEvent | null;
  lastJudge: JudgeEvent | null;
  lastDiscard: DiscardEvent | null;
  cardHistory: CardHistoryEntry[];
  discardOrigins: Record<string, { playerId: number; reason?: string }>;
  harvest: HarvestState | null;
  aoe: AoeState | null;
  flash: FlashEvent | null;
  flashes: FlashEvent[];
  damageNotice: DamageNotice | null;
  revealNotice: RevealNotice | null;
  lastSkill: SkillNotice | null;
  wuxieWindow: boolean;
  wuxieDeadline: number | null;
  responseWindow: { playerId: number; name: string; ms: number; until: number } | null;
  promptDeadline: number | null;
  speechBubbles: SpeechBubble[];
  propThrows: PropThrow[];
  protectionUntil: number | null;
  error: string | null;
  lanRole: 'host' | 'client' | null;
  lanHost: LanHostManager | null;
  lanClient: LanClientManager | null;
  room: RoomInfo | null;
  lobby: LobbyState | null;
  netError: string | null;
  lanPlayerId: number;
  lanConnId: number;
  spectate: boolean;
  spectateAsk: AskRequest | null;
  spectators: SpectatorInfo[];
  joinPreset: { address: string; code: string } | null;
  suspended: boolean;
  savedLanSession: SavedLanSession | null;
  appVersion: string;
  devStatus: 'off' | 'active' | 'blocked';
  devMessage: string;
  devBatch: string;
  devTainted: boolean;
  /** 联机中被别人使用测试工具时的通报 */
  devNotice: { id: number; name: string; text: string } | null;
  updateInfo: AppUpdateInfo | null;
  updateState: UpdateState;
  updateProgress: { downloaded: number; total: number };
  updateMirror: { index: number; total: number } | null;
  updateError: string | null;
  updateModalOpen: boolean;
  bgImage: string | null;
  bgDim: number;
  bgScope: BackgroundScope;
  /** 当前壁纸类型：静态图或动态视频 */
  bgKind: 'image' | 'video';
  /** 动态壁纸播放地址（IndexedDB 里的视频） */
  bgVideoUrl: string | null;
  selfCardSide: 'left' | 'right';
  uiTheme: 'classic' | 'magic';
  uiPalette: UiPalette;
  settingsOpen: boolean;
  historyOpen: boolean;
  changelogOpen: boolean;
  aboutOpen: boolean;
  tutorialOpen: boolean;
  aiSpeed: number;
  soundEnabled: boolean;
  soundVolume: number;
  voiceVolume: number;
  bgmVolume: number;
  bgmEnabled: boolean;
  vibrationEnabled: boolean;
  myRole: Role | null;
  firstPlayerId: number | null;
  profile: PlayerProfile;
  xpGain: XpGain | null;

  selected: { cardId: string; as: string; skillId?: string; element?: 'fire' | 'thunder' } | null;
  selectedTargets: number[];
  identityMarks: Partial<Record<number, Role>>;
  markingPlayerId: number | null;
  openIdentityMark: (playerId: number) => void;
  closeIdentityMark: () => void;
  setIdentityMark: (role: Role | null) => void;
  asChooser: AsChooser | null;
  cardChoices: string[];
  reorderTop: string[];
  modalMinimized: boolean;
  /** 点击转化技按钮后进入的「选牌」态：只高亮可转化的牌 */
  viewAsFilter: { skillId: string; as: string; eligibleCardIds: string[] } | null;
  selectViewAsSkill: (skillId: string, as: string, eligibleCardIds: string[]) => void;

  initLocal: (count: number, heroId: string, rules?: Partial<CustomRules>) => void;
  prepareLocal: (count: number, rules?: Partial<CustomRules>, excludeHeroIds?: string[]) => void;
  confirmLocalPick: (heroId: string, secondaryId?: string) => void;
  bidLocal: (score: number) => void;
  backToMenu: () => void;
  restart: () => void;
  createLanRoom: (name: string, kind?: 'sgs' | 'guandan') => Promise<void>;
  joinLanRoom: (address: string, code: string, name: string, spectate?: boolean) => Promise<void>;
  startLanGame: (count: number) => void;
  beginLanGuandan: () => void;
  guandanView: GdView | null;
  gdPlay: (ids: string[]) => void;
  gdPass: () => void;
  gdNextRound: (restart: boolean) => void;
  startLanPick: (count: number) => void;
  setLanCount: (count: number) => void;
  cancelLanPick: () => void;
  setLanRules: (mode: 'standard' | 'custom', rules: CustomRules) => void;
  pickLanHero: (heroId: string) => void;
  bidLan: (score: number) => void;
  revealGeneral: (index: number) => void;
  requestSeat: () => void;
  requestToSpectate: () => void;
  leaveLan: () => void;
  suspendGame: () => void;
  resumeGame: () => void;
  quitSuspendedGame: () => void;
  resumeSavedLanSession: () => Promise<void>;
  dismissSavedLanSession: () => void;
  returnToLobby: () => void;
  checkUpdate: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openChangelog: () => void;
  closeChangelog: () => void;
  openAbout: () => void;
  closeAbout: () => void;
  openTutorial: () => void;
  closeTutorial: () => void;
  setAiSpeed: (value: number) => void;
  setSoundEnabled: (value: boolean) => void;
  setSoundVolume: (value: number) => void;
  setVoiceVolume: (value: number) => void;
  setBgmVolume: (value: number) => void;
  setBgmEnabled: (value: boolean) => void;
  setVibrationEnabled: (value: boolean) => void;
  closeDevNotice: () => void;
  setBgImage: (image: string | null) => void;
  setBgVideo: () => void;
  setBgDim: (dim: number) => void;
  setBgScope: (scope: BackgroundScope) => void;
  setSelfCardSide: (side: 'left' | 'right') => void;
  setUiTheme: (theme: 'classic' | 'magic') => void;
  setUiPalette: (palette: UiPalette) => void;
  setProfileName: (name: string) => void;
  event: (ev: GameEvent) => void;
  ask: (req: AskRequest) => Promise<GameAction>;
  submit: (action: GameAction) => void;

  selectCard: (cardId: string) => void;
  chooseAs: (as: string, skillId?: string) => void;
  clearSelection: () => void;
  seatClick: (playerId: number) => void;
  confirmPlay: () => void;
  endPlay: () => void;
  activateSkill: (skillId: string) => void;
  cancelPrompt: () => void;
  cancelAllWuxie: () => void;
  receiveChat: (message: ChatMessage) => void;
  sendChat: (text: string) => void;
  receiveProp: (message: PropMessage) => void;
  sendProp: (targetId: number, prop: string) => void;
  openChat: () => void;
  closeChat: () => void;
  dismissHarvest: () => void;
  dismissAoe: () => void;
  toggleCardChoice: (cardId: string) => void;
  confirmCards: () => void;
  toggleReorder: (cardId: string) => void;
  confirmReorder: () => void;
  chooseOption: (optionId: string) => void;
  closeAsChooser: () => void;
  toggleModalMinimized: () => void;
  setAutoPlay: (value?: boolean) => void;
}

let resolveAsk: ((action: GameAction) => void) | null = null;
let askTimer: number | null = null;
function clearAskTimer(): void {
  if (askTimer !== null) {
    window.clearTimeout(askTimer);
    askTimer = null;
  }
}
let autoPlayTimer: number | null = null;
function clearAutoPlayTimer(): void {
  if (autoPlayTimer !== null) {
    window.clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }
}
function scheduleAutoPlay(): void {
  clearAutoPlayTimer();
  const state = useGameStore.getState();
  if (!state.autoPlay) return;
  const pending = state.pending;
  if (!pending || pending.playerId !== state.humanId) return;
  const delay = Math.max(600, state.aiSpeed);
  autoPlayTimer = window.setTimeout(() => {
    autoPlayTimer = null;
    const now = useGameStore.getState();
    if (!now.autoPlay || !now.pending || now.pending.id !== pending.id) return;
    const action = safeBotAction(now.game?.state, now.pending, (error) => {
      recordDiagnostic('error', `托管决策失败：${(error as Error)?.message ?? error}`, (error as Error)?.stack);
    });
    now.submit(action);
  }, delay);
}
let eventSeq = 0;
let recordedGame: GameLike | null = null;
let xpRecordedGame: GameLike | null = null;
let sessionMarked = false;
const initialBackground = loadBackgroundSettings();

const io: GameIO = {
  emit: (ev) => useGameStore.getState().event(ev),
  ask: (req) => {
    const state = useGameStore.getState();
    if (req.playerId === state.humanId) {
      const waiting = state.ask(req);
      if (state.autoPlay) scheduleAutoPlay();
      return waiting;
    }
    return new Promise((resolve) => {
      const speed = useGameStore.getState().aiSpeed;
      const wait = speed <= 0 ? 0 : speed + Math.random() * speed * 0.6;
      setTimeout(() => {
        const gameState = useGameStore.getState().game?.state;
        resolve(
          safeBotAction(gameState, req, (error) => {
            recordDiagnostic(
              'error',
              `电脑决策失败：${(error as Error)?.message ?? error}`,
              (error as Error)?.stack,
            );
          }),
        );
      }, wait);
    });
  },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  galleryFrom: 'menu',
  guandanView: null,
  game: null,
  preGame: null,
  humanId: 0,
  version: 0,
  pending: null,
  skipWuxie: false,
  autoPlay: false,
  chatMessages: [],
  chatOpen: false,
  chatUnread: 0,
  result: null,
  lastPlay: null,
  lastJudge: null,
  lastDiscard: null,
  cardHistory: [],
  discardOrigins: {},
  harvest: null,
  aoe: null,
  flash: null,
  flashes: [],
  damageNotice: null,
  revealNotice: null,
  lastSkill: null,
  wuxieWindow: false,
  wuxieDeadline: null,
  responseWindow: null,
  promptDeadline: null,
  speechBubbles: [],
  propThrows: [],
  protectionUntil: null,
  error: null,
  lanRole: null,
  lanHost: null,
  lanClient: null,
  room: null,
  lobby: null,
  netError: null,
  lanPlayerId: 0,
  lanConnId: -1,
  spectate: false,
  spectateAsk: null,
  spectators: [],
  joinPreset: null,
  suspended: false,
  savedLanSession: loadSavedLanSession(),
  appVersion: APP_VERSION,
  devStatus: 'off',
  devMessage: '',
  devBatch: '',
  devTainted: false,
  devNotice: null,
  updateInfo: null,
  updateState: 'idle',
  updateProgress: { downloaded: 0, total: 0 },
  updateMirror: null,
  updateError: null,
  updateModalOpen: false,
  bgImage: initialBackground.image,
  bgDim: initialBackground.dim,
  bgScope: initialBackground.scope,
  bgKind: initialBackground.kind ?? 'image',
  bgVideoUrl: null,
  selfCardSide: loadSelfCardSide(),
  uiTheme: loadUiTheme(),
  uiPalette: loadUiPalette(),
  settingsOpen: false,
  historyOpen: false,
  changelogOpen: false,
  aboutOpen: false,
  tutorialOpen: false,
  aiSpeed: loadAiSpeed(),
  soundEnabled: getSoundSettings().enabled,
  soundVolume: getSoundSettings().volume,
  voiceVolume: getSoundSettings().voiceVolume,
  bgmVolume: getSoundSettings().bgmVolume,
  bgmEnabled: getSoundSettings().bgmEnabled,
  vibrationEnabled: getVibrationEnabled(),
  myRole: null,
  firstPlayerId: null,
  profile: loadProfile(),
  xpGain: null,
  selected: null,
  selectedTargets: [],
  identityMarks: {},
  markingPlayerId: null,
  asChooser: null,
  cardChoices: [],
  reorderTop: [],
  modalMinimized: false,
  viewAsFilter: null,

  initLocal: (count, heroId, rules) => {
    if (get().game) get().game?.stop?.();
    get().lanHost?.close();
    get().lanClient?.close();
    resolveAsk = null;
    const botNames = ['电脑·孟德', '电脑·玄德', '电脑·仲谋', '电脑·奉孝', '电脑·子龙', '电脑·公瑾', '电脑·翼德'];
    const players = [
      { name: '你', heroId, isBot: false },
      ...Array.from({ length: count - 1 }, (_, i) => ({
        name: botNames[i % botNames.length],
        heroId: '',
        isBot: true,
      })),
    ];
    const game = new Game(
      {
        players,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        direction: rules?.turnDirection ?? -1,
        rules,
      },
      io,
    );
    set({
      screen: 'game',
      game,
      preGame: null,
      suspended: false,
      humanId: 0,
      firstPlayerId: null,
      devTainted: false,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      myRole: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      pending: null,
      result: null,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      flash: null,
      flashes: [],
      damageNotice: null,
      error: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      version: get().version + 1,
    });
    setTimeout(() => {
      game.begin().catch((err) => {
        recordDiagnostic('error', `对局异常：${(err as Error).message}`, (err as Error).stack);
        set({ error: `对局异常：${(err as Error).message}` });
      });
    }, 0);
  },

  prepareLocal: (count, rules, excludeHeroIds) => {
    if (get().game) get().game?.stop?.();
    get().lanHost?.close();
    get().lanClient?.close();
    resolveAsk = null;
    const botNames = ['电脑·孟德', '电脑·玄德', '电脑·仲谋', '电脑·奉孝', '电脑·子龙', '电脑·公瑾', '电脑·翼德'];
    const excluded = new Set(excludeHeroIds ?? []);
    const pool = PLAYABLE_HEROES.map((hero) => hero.id).filter((id) => !excluded.has(id));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const mode = rules?.mode ?? 'identity';
    const roles = buildRoles(count, mode);
    if (mode === 'landlord') {
      // 地主身份由叫分决定，先全部按农民占位
      roles.fill('rebel');
    } else if (mode !== '2v2') {
      for (let i = roles.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
      }
    }
    let bots: { name: string; heroId: string; heroIds?: string[] }[];
    let candidates: string[];
    let candidatePairs: { primary: string; secondary: string }[] | undefined;
    const visibleLordIndex = count > 2 && mode === 'identity' ? roles.indexOf('lord') : -1;
    const humanIsLord = visibleLordIndex === 0;
    const lordHeroIds = new Set(
      PLAYABLE_HEROES.filter((hero) => hero.lordSkillId).map((hero) => hero.id),
    );
    if (mode === 'guozhan') {
      const available = new Set(pool);
      bots = Array.from({ length: Math.max(0, count - 1) }, (_, i) => {
        const pair = takeHeroPair(available);
        return {
          name: botNames[i % botNames.length],
          heroId: pair?.primary ?? [...available][0] ?? PLAYABLE_HEROES[0].id,
          heroIds: pair ? [pair.primary, pair.secondary] : undefined,
        };
      });
      candidatePairs = randomHeroPairs(5, available);
      candidates = candidatePairs.map((pair) => pair.primary);
    } else {
      bots = Array.from({ length: Math.max(0, count - 1) }, (_, i) => {
        if (visibleLordIndex === i + 1) {
          const lordIndex = pool.findIndex((id) => lordHeroIds.has(id));
          if (lordIndex >= 0) {
            const [lordHero] = pool.splice(lordIndex, 1);
            return { name: botNames[i % botNames.length], heroId: lordHero };
          }
        }
        let pickIdx = pool.length - 1;
        if (humanIsLord) {
          while (pickIdx >= 0 && lordHeroIds.has(pool[pickIdx])) pickIdx -= 1;
          if (pickIdx < 0) pickIdx = pool.length - 1;
        }
        const [heroId] = pool.splice(pickIdx, 1);
        return { name: botNames[i % botNames.length], heroId };
      });
      if (humanIsLord) {
        const backupCount = rules?.lordBackupCount ?? 3;
        const lordPicks = pool.filter((id) => lordHeroIds.has(id));
        const others = pool.filter((id) => !lordHeroIds.has(id));
        candidates = [...lordPicks, ...others.slice(0, backupCount)];
      } else {
        candidates = pool.slice(0, 5);
      }
      const devPool = getDevPickPool();
      if (devPool?.length) {
        const forced = devPool.filter((id) => HERO_MAP.has(id) && !bots.some((bot) => bot.heroId === id));
        if (forced.length) candidates = forced;
      }
    }
    if (mode !== 'landlord' && bots.length > 1) {
      const paired = bots.map((bot, i) => ({ bot, role: roles[i + 1] }));
      for (let i = paired.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [paired[i], paired[j]] = [paired[j], paired[i]];
      }
      bots = paired.map((p) => p.bot);
      paired.forEach((p, i) => {
        roles[i + 1] = p.role;
      });
    }
    const lordIndex = count > 2 && mode === 'identity' ? roles.indexOf('lord') : -1;
    const lordHeroId = lordIndex > 0 ? bots[lordIndex - 1].heroId : null;
    // 座次在选将前就定下来：有主公时以主公为先手，其余模式随机先手
    const firstPlayer =
      lordIndex >= 0 ? lordIndex : mode === '2v2' ? 0 : Math.floor(Math.random() * count);
    const bid =
      mode === 'landlord'
        ? { highest: 0, highestBidder: -1, bids: [null, null, null], done: false }
        : undefined;
    set({
      screen: 'pick',
      game: null,
      suspended: false,
      preGame: { count, rules, candidates, candidatePairs, bots, roles, lordIndex, firstPlayer, lordHeroId, bid },
      humanId: 0,
      firstPlayerId: null,
      devTainted: false,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      myRole: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      pending: null,
      result: null,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      flash: null,
      flashes: [],
      damageNotice: null,
      error: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      version: get().version + 1,
    });
  },

  bidLocal: (score) => {
    const preGame = get().preGame;
    if (!preGame?.bid || preGame.bid.done || preGame.rules?.mode !== 'landlord') return;
    const value = Math.max(0, Math.min(3, Math.round(score)));
    const bids: (number | null)[] = [value, null, null];
    let highest = value;
    let highestBidder = value > 0 ? 0 : -1;
    if (value < 3) {
      for (let index = 1; index < 3; index += 1) {
        const canRaise = highest < 3 && Math.random() < 0.55;
        const next = canRaise ? Math.min(3, highest + 1) : 0;
        bids[index] = next;
        if (next > highest) {
          highest = next;
          highestBidder = index;
          if (highest === 3) break;
        }
      }
    }
    if (highestBidder < 0) highestBidder = 0;
    const roles: Role[] = ['rebel', 'rebel', 'rebel'];
    roles[highestBidder] = 'lord';
    const lordHeroId =
      highestBidder > 0 ? preGame.bots[highestBidder - 1]?.heroId ?? null : null;
    set({
      preGame: {
        ...preGame,
        roles,
        lordIndex: highestBidder,
        lordHeroId,
        bid: { highest, highestBidder, bids, done: true },
      },
      version: get().version + 1,
    });
  },

  confirmLocalPick: (heroId, secondaryId) => {
    const preGame = get().preGame;
    if (!preGame || !preGame.candidates.includes(heroId)) return;
    if (preGame.bid && !preGame.bid.done) return;
    const pair = preGame.candidatePairs?.find(
      (item) => item.primary === heroId && item.secondary === secondaryId,
    );
    const players = [
      {
        name: '你',
        heroId,
        heroIds: pair ? [pair.primary, pair.secondary] : undefined,
        isBot: false,
      },
      ...preGame.bots.map((bot) => ({ ...bot, isBot: true })),
    ];
    if (preGame.rules?.mode === 'guozhan' && pair) {
      const humanFaction = HERO_MAP.get(pair.primary)?.faction;
      if (humanFaction) {
        const botFactions = planBotFactions(players.length, [humanFaction]);
        const available = new Set(
          PLAYABLE_HEROES.map((hero) => hero.id).filter(
            (id) => id !== pair.primary && id !== pair.secondary,
          ),
        );
        players.forEach((player, index) => {
          if (index === 0) return;
          const picked = takeFactionPair(available, botFactions[index - 1]);
          if (picked) {
            player.heroId = picked.primary;
            player.heroIds = [picked.primary, picked.secondary];
          }
        });
      }
    }
    const game = new Game(
      {
        players,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        direction: preGame.rules?.turnDirection ?? -1,
        roles: preGame.roles,
        // 斗地主的先手由地主决定，其余模式用选将前定好的座位
        startPlayer: preGame.rules?.mode === 'landlord' ? undefined : preGame.firstPlayer,
        rules: preGame.rules,
      },
      io,
    );
    set({
      screen: 'game',
      game,
      preGame: null,
      suspended: false,
      humanId: 0,
      firstPlayerId: null,
      pending: null,
      result: null,
      protectionUntil: Date.now() + 3000,
      devTainted: !!getDevPickPool()?.length,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      flash: null,
      flashes: [],
      damageNotice: null,
      error: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      version: get().version + 1,
    });
    setTimeout(() => {
      game.begin().catch((err) => {
        recordDiagnostic('error', `对局异常：${(err as Error).message}`, (err as Error).stack);
        set({ error: `对局异常：${(err as Error).message}` });
      });
    }, 3000);
  },

  backToMenu: () => {
    sessionMarked = false;
    endGameSession();
    get().game?.stop?.();
    get().lanHost?.close();
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    clearAutoPlayTimer();
    set({
      savedLanSession: null,
      autoPlay: false,
      chatMessages: [],
      chatOpen: false,
      chatUnread: 0,
      screen: 'menu',
      game: null,
      preGame: null,
      pending: null,
      result: null,
      error: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      myRole: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      spectate: false,
      spectators: [],
      identityMarks: {},
      markingPlayerId: null,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      harvest: null,
      aoe: null,
      flash: null,
      flashes: [],
      damageNotice: null,
      revealNotice: null,
      responseWindow: null,
      wuxieWindow: false,
      wuxieDeadline: null,
      lastSkill: null,
      spectateAsk: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      promptDeadline: null,
      skipWuxie: false,
      modalMinimized: false,
    });
    set({ suspended: false });
  },

  restart: () => {
    const { lanRole, lanHost, lanClient, game } = get();
    clearAutoPlayTimer();
    set({ autoPlay: false });
    if (lanRole === 'host') {
      lanHost?.returnToLobby();
      set({
        screen: 'lobby',
        game: null,
        result: null,
        pending: null,
        lastPlay: null,
        lastJudge: null,
        lastDiscard: null,
        cardHistory: [],
        discardOrigins: {},
        flash: null,
        flashes: [],
        damageNotice: null,
        selected: null,
        selectedTargets: [],
        asChooser: null,
        cardChoices: [],
        reorderTop: [],
        version: get().version + 1,
      });
      return;
    }
    if (lanRole === 'client') {
      set({
        screen: 'lobby',
        game: null,
        result: null,
        pending: null,
        lastPlay: null,
        lastJudge: null,
        lastDiscard: null,
        cardHistory: [],
        discardOrigins: {},
        flash: null,
        flashes: [],
        damageNotice: null,
        version: get().version + 1,
      });
      return;
    }
    if (game) {
      const snapshot = game.state;
      const previousHeroes = snapshot.players.map((player) => player.heroId);
      game.stop?.();
      get().prepareLocal(snapshot.players.length, snapshot.rules, previousHeroes);
      return;
    }
    set({ screen: 'setup', game: null, preGame: null, result: null, pending: null, version: get().version + 1 });
  },

  createLanRoom: async (name, kind = 'sgs') => {
    get().lanClient?.close();
    get().lanHost?.close();
    sessionMarked = false;
    endGameSession();
    try {
      const info = await createRoomInfo();
      const hostName = name.trim() || get().profile.name || '房主';
      get().setProfileName(hostName);
      try {
        localStorage.setItem('sgk-name', hostName);
      } catch {
        // ignore storage failures
      }
      const host = new LanHostManager(info, hostName, {
        askHost: (request) => get().ask(request),
        emitHost: (event) => get().event(event),
        onLobby: (lobby) => set({ lobby, version: get().version + 1 }),
        onChat: (message) => get().receiveChat(message),
        onProp: (message) => get().receiveProp(message),
        onSpectators: (spectators) => set({
          spectators,
          lobby: get().lobby ? { ...get().lobby!, spectators } : null,
          version: get().version + 1,
        }),
        onGuandan: (view) =>
          set({
            guandanView: view,
            screen: 'guandan',
            lobby: null,
            pending: null,
            result: null,
            version: get().version + 1,
          }),
        onGame: (game) =>
          set({
            game,
            screen: 'game',
            humanId: 0,
            firstPlayerId: null,
            lanPlayerId: 0,
            devTainted: false,
            pending: null,
            result: null,
            protectionUntil: Date.now() + 3000,
            lastPlay: null,
            lastJudge: null,
            lastDiscard: null,
            cardHistory: [],
            discardOrigins: {},
            flash: null,
            flashes: [],
            damageNotice: null,
            selected: null,
            selectedTargets: [],
            asChooser: null,
            cardChoices: [],
            reorderTop: [],
            version: get().version + 1,
          }),
        onError: (message) => set({ netError: message }),
        onClosed: () => set({ netError: '房间连接已断开，请返回重试', lanHost: null }),
      }, get().aiSpeed, get().profile.level, kind);
      clearSavedLanSession();
      set({
        savedLanSession: null,
        chatMessages: [],
        chatOpen: false,
        chatUnread: 0,
        lanRole: 'host',
        lanHost: host,
        lanClient: null,
        lanConnId: 0,
        room: info,
        lobby: host.lobby,
        spectate: false,
        spectators: [],
        screen: 'lobby',
        netError: null,
        game: null,
        result: null,
        pending: null,
        version: get().version + 1,
      });
    } catch (error) {
      set({ netError: `创建房间失败：${(error as Error).message}` });
    }
  },

  joinLanRoom: async (address, code, name, spectate = false) => {
    get().lanClient?.close();
    get().lanHost?.close();
    sessionMarked = false;
    endGameSession();
    const { ip, port } = parseAddress(address);
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      set({ netError: '请输入房间码' });
      return;
    }
    const playerName = name.trim() || get().profile.name || '玩家';
    get().setProfileName(playerName);
    try {
      localStorage.setItem('sgk-name', playerName);
    } catch {
      // ignore storage failures
    }
    const client = new LanClientManager(ip, port, cleanCode, playerName, {      onWelcome: (connId) => set({ lanConnId: connId }),
      onLobby: (lobby) =>
        set({
          lobby,
          spectators: lobby.spectators ?? [],
          screen: get().guandanView ? 'guandan' : 'lobby',
          result: null,
          pending: null,
          game: null,
          lastPlay: null,
          lastJudge: null,
          lastDiscard: null,
          cardHistory: [],
          discardOrigins: {},
          flash: null,
          flashes: [],
          damageNotice: null,
          version: get().version + 1,
        }),
      onStart: (playerId) =>
        set({
          humanId: playerId,
          lanPlayerId: playerId,
          spectate: false,
          screen: 'game',
          devTainted: false,
          pending: null,
          result: null,
          protectionUntil: Date.now() + 3000,
          game: null,
          lastPlay: null,
          lastJudge: null,
          lastDiscard: null,
          cardHistory: [],
          discardOrigins: {},
          flash: null,
          flashes: [],
          damageNotice: null,
          version: get().version + 1,
        }),
      onGuandan: (view) =>
        set({
          guandanView: view,
          screen: 'guandan',
          result: null,
          pending: null,
          version: get().version + 1,
        }),
      onRole: (role) => set({ myRole: role }),
      onSpectate: () =>
        set({
          humanId: -1,
          lanPlayerId: -1,
          spectate: true,
          screen: 'lobby',
          pending: null,
          result: null,
          lastPlay: null,
          lastJudge: null,
          lastDiscard: null,
          cardHistory: [],
          discardOrigins: {},
          flash: null,
          flashes: [],
          damageNotice: null,
          selected: null,
          selectedTargets: [],
          asChooser: null,
          cardChoices: [],
          reorderTop: [],
          version: get().version + 1,
        }),
      onSeat: () =>
        set({
          spectate: false,
          screen: 'lobby',
          version: get().version + 1,
        }),
      onSpectators: (spectators) =>
        set({
          spectators,
          lobby: get().lobby ? { ...get().lobby!, spectators } : null,
          version: get().version + 1,
        }),
      onState: (state) =>
        set({
          game: { state },
          screen: get().spectate ? 'game' : get().screen,
          version: get().version + 1,
        }),
      onAsk: (request, state) => {
        clearAskTimer();
        set({
          game: { state },
          pending: request,
          promptDeadline:
            request.timeout && request.timeout > 0
              ? request.deadline ?? Date.now() + request.timeout
              : null,
          screen: 'game',
          selected: null,
          selectedTargets: [],
          asChooser: null,
          cardChoices: [],
          reorderTop: [],
          version: get().version + 1,
        });
        if (request.timeout && request.timeout > 0) {
          askTimer = window.setTimeout(() => {
            if (get().pending?.id !== request.id) return;
            get().submit({ type: 'cancel' });
          }, request.timeout);
        }
        if (get().autoPlay) scheduleAutoPlay();
      },
      onSpectateAsk: (request) => set({ spectateAsk: request, version: get().version + 1 }),
      onEvent: (event) => get().event(event),
      onChat: (message) => get().receiveChat(message),
      onProp: (message) => get().receiveProp(message),
      onEnd: (text, winner) => {
        if (get().result) return;
        clearSavedLanSession();
        set({ result: { text, winner }, savedLanSession: null, spectateAsk: null });
        setTimeout(() => {
          if (get().result && !get().spectate) set({ screen: 'result' });
        }, 1400);
      },
      onError: (message) => set({ netError: message }),
      onKicked: (reason) => {
        clearSavedLanSession();
        set({
          netError: reason,
          lanClient: null,
          lanRole: null,
          lanConnId: -1,
          game: null,
          pending: null,
          lobby: null,
          room: null,
          screen: 'menu',
          spectate: false,
          spectators: [],
          suspended: false,
          savedLanSession: null,
          chatMessages: [],
          result: null,
        });
      },
      onVersionMismatch: (message) => {
        clearSavedLanSession();
        set({
          netError: message,
          lanClient: null,
          lanRole: null,
          lanConnId: -1,
          game: null,
          pending: null,
          lobby: null,
          room: null,
          screen: 'menu',
          spectate: false,
          spectators: [],
          suspended: false,
          savedLanSession: null,
          chatMessages: [],
          result: null,
        });
      },
      onConnectTimeout: () => {
        clearSavedLanSession();
        set({
          netError: '连接失败：目标房间可能已关闭，或房主地址不可达。',
          lanClient: null,
          lanRole: null,
          lanConnId: -1,
          game: null,
          pending: null,
          lobby: null,
          room: null,
          screen: 'menu',
          spectate: false,
          spectators: [],
          suspended: false,
          savedLanSession: null,
          chatMessages: [],
          result: null,
        });
      },
      onClosed: () =>
        set({
          netError: '连接已断开，可以尝试回归房间',
          lanClient: null,
          lanRole: null,
          game: null,
          pending: null,
          screen: 'menu',
          suspended: false,
        }),
    }, spectate, get().profile.level);
    const session: SavedLanSession = {
      address: `${ip}:${port}`,
      code: cleanCode,
      name: playerName,
      spectate,
    };
    saveLanSession(session);
    set({
      lanRole: 'client',
      lanClient: client,
      lanHost: null,
      lanConnId: -1,
      room: { ip, port, code: cleanCode, secret: '' },
      lobby: null,
      screen: 'lobby',
      netError: null,
      game: null,
      result: null,
      pending: null,
      suspended: false,
      savedLanSession: session,
      spectate: false,
      spectators: [],
      chatMessages: [],
      chatOpen: false,
      chatUnread: 0,
      version: get().version + 1,
    });
  },

  startLanGame: (count) => {
    get().lanHost?.startGame(count);
  },

  beginLanGuandan: () => {
    get().lanHost?.beginGuandan();
  },

  gdPlay: (ids) => {
    const { lanRole, lanHost, lanClient } = get();
    if (lanRole === 'host') lanHost?.hostGdPlay(ids);
    else lanClient?.sendGdAction('play', ids);
  },

  gdPass: () => {
    const { lanRole, lanHost, lanClient } = get();
    if (lanRole === 'host') lanHost?.hostGdPass();
    else lanClient?.sendGdAction('pass');
  },

  gdNextRound: (restart) => {
    get().lanHost?.hostGdNext(restart);
  },

  startLanPick: (count) => {
    const host = get().lanHost;
    if (!host) return;
    host.beginPicking(count);
    set({ myRole: host.roles?.[0] ?? null });
  },

  setLanCount: (count) => {
    get().lanHost?.setPlannedCount(count);
  },

  cancelLanPick: () => {
    get().lanHost?.cancelPicking();
  },

  setLanRules: (mode, rules) => {
    get().lanHost?.setRules(mode, rules);
  },

  revealGeneral: (index) => {
    const { lanRole, lanClient, lanHost, game, humanId, pending } = get();
    if (lanRole === 'client') {
      lanClient?.revealGeneral(index);
      return;
    }
    if (!game) return;
    const player = game.state.players[humanId];
    if (!player) return;
    const changed = game.revealGeneral?.(player, index) ?? false;
    lanHost?.sendStates();
    if (
      changed &&
      pending?.kind === 'play' &&
      pending.playerId === humanId &&
      game.buildPlayOptions &&
      game.activeSkillOptions
    ) {
      set({
        pending: {
          ...pending,
          cardOptions: game.buildPlayOptions(player),
          skillOptions: game.activeSkillOptions(player),
        },
        version: get().version + 1,
      });
      return;
    }
    set({ version: get().version + 1 });
  },

  bidLan: (score) => {
    const { lanRole, lanHost, lanClient } = get();
    if (lanRole === 'host') lanHost?.submitBid(0, score);
    else if (lanRole === 'client') lanClient?.submitBid(score);
  },
  requestSeat: () => {
    const { lanRole, lanHost, lanClient, lanConnId } = get();
    if (lanRole === 'host') lanHost?.seatSpectator(lanConnId);
    else if (lanRole === 'client') lanClient?.requestSeat();
  },

  requestToSpectate: () => {
    const { lanRole, lanClient } = get();
    if (lanRole === 'client') lanClient?.requestSpectate();
  },

  pickLanHero: (heroId) => {
    const { lanRole, lanHost, lanClient } = get();
    if (lanRole === 'host') lanHost?.pickHostHero(heroId);
    else if (lanRole === 'client') lanClient?.pickHero(heroId);
  },

  checkUpdate: async (manual = false) => {
    if (!isTauri()) {
      if (manual) {
        set({
          updateState: 'error',
          updateError: '自动更新仅在桌面版可用。',
          updateModalOpen: true,
        });
      }
      return;
    }
    const current = get();
    if (
      current.updateState === 'checking' ||
      current.updateState === 'downloading' ||
      current.updateState === 'installing'
    ) {
      return;
    }
    set({ updateState: 'checking', updateError: null });
    try {
      await initPlatform();
      const web = isAndroidApp() ? checkAndroidUpdateFromWeb() : checkAppUpdateFromWeb();
      const native = isAndroidApp() ? checkAndroidUpdate() : checkAppUpdate();
      const result = await firstUpdateResult([
        withTimeout(web, 16000, '网页通道检查超时'),
        withTimeout(native, 16000, '原生通道检查超时'),
      ]);
      if (result.info) {
        set({
          updateInfo: result.info,
          updateState: 'available',
          updateModalOpen: manual || get().screen === 'menu',
        });
      } else if (result.success) {
        set({ updateInfo: null, updateState: 'latest', updateModalOpen: manual });
      } else {
        throw new Error(result.errors.join('；') || '所有更新通道均不可用');
      }
    } catch (error) {
      recordDiagnostic(
        'error',
        `检查更新失败：${(error as Error).message}`,
        (error as Error).stack,
      );
      set({
        updateState: 'error',
        updateError: `检查更新失败：${(error as Error).message}`,
        updateModalOpen: manual,
      });
    }
  },

  installUpdate: async () => {
    const info = get().updateInfo;
    if (!info) return;
    set({
      updateState: 'downloading',
      updateProgress: { downloaded: 0, total: 0 },
      updateMirror: null,
      updateError: null,
      updateModalOpen: true,
    });
    try {
      if (info.android) {
        try {
          await installAndroidUpdateFromWeb(
            info,
            (downloaded, total) => set({ updateProgress: { downloaded, total } }),
            (mirror) => set({ updateMirror: mirror }),
          );
          set({ updateState: 'latest', updateInfo: null, updateModalOpen: false, updateMirror: null });
          return;
        } catch (error) {
          recordDiagnostic(
            'error',
            `网页通道更新失败：${(error as Error).message}`,
            (error as Error).stack,
          );
        }
        set({ updateProgress: { downloaded: 0, total: 0 }, updateMirror: null });
        await installAndroidUpdate(
          info,
          (downloaded, total) => set({ updateProgress: { downloaded, total } }),
          (mirror) => set({ updateMirror: mirror }),
        );
        set({ updateState: 'latest', updateInfo: null, updateModalOpen: false, updateMirror: null });
        return;
      }
      await installAppUpdate(
        info,
        (downloaded, total) => set({ updateProgress: { downloaded, total } }),
        (mirror) => set({ updateMirror: mirror }),
      );
      set({ updateState: 'installing', updateMirror: null });
    } catch (error) {
      set({
        updateState: 'error',
        updateError: `更新失败：${(error as Error).message}`,
        updateModalOpen: true,
        updateMirror: null,
      });
    }
  },

  openUpdateModal: () => {
    set({ updateModalOpen: true });
    const state = get();
    if (state.updateState === 'idle' || state.updateState === 'error') {
      void state.checkUpdate(true);
    }
  },

  closeUpdateModal: () => set({ updateModalOpen: false }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  openChangelog: () => set({ changelogOpen: true }),
  closeChangelog: () => set({ changelogOpen: false }),
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
  openTutorial: () => set({ tutorialOpen: true }),
  closeTutorial: () => set({ tutorialOpen: false }),
  setAiSpeed: (value) => {
    const next = Math.max(0, Math.min(1200, Math.round(value)));
    saveAiSpeed(next);
    get().lanHost?.setAiSpeed(next);
    set({ aiSpeed: next });
  },
  setSoundEnabled: (value) => {
    applySoundSettings({ ...getSoundSettings(), enabled: value });
    set({ soundEnabled: value });
  },
  setSoundVolume: (value) => {
    const volume = Math.max(0, Math.min(1, value));
    applySoundSettings({ ...getSoundSettings(), volume });
    set({ soundVolume: volume });
  },
  setVoiceVolume: (value) => {
    const voiceVolume = Math.max(0, Math.min(1, value));
    applySoundSettings({ ...getSoundSettings(), voiceVolume });
    set({ voiceVolume });
  },
  setBgmVolume: (value) => {
    const bgmVolume = Math.max(0, Math.min(1, value));
    applySoundSettings({ ...getSoundSettings(), bgmVolume });
    set({ bgmVolume });
  },
  setBgmEnabled: (value) => {
    applySoundSettings({ ...getSoundSettings(), bgmEnabled: value });
    set({ bgmEnabled: value });
    syncBgm();
  },
  closeDevNotice: () => set({ devNotice: null }),
  setVibrationEnabled: (value) => {
    setVibrationEnabled(value);
    set({ vibrationEnabled: value });
  },
  setBgImage: (image) => {
    set({ bgImage: image, bgKind: 'image', bgVideoUrl: null });
    void clearBackgroundVideo();
    saveBackgroundSettings({ image, dim: get().bgDim, scope: get().bgScope, kind: 'image' });
  },
  setBgVideo: () => {
    void loadBackgroundVideo().then((blob) => {
      if (!blob) return;
      set({ bgImage: null, bgKind: 'video', bgVideoUrl: URL.createObjectURL(blob) });
      saveBackgroundSettings({ image: null, dim: get().bgDim, scope: get().bgScope, kind: 'video' });
    });
  },
  setBgDim: (dim) => {
    const next = Math.min(90, Math.max(0, Math.round(dim)));
    set({ bgDim: next });
    saveBackgroundSettings({
      image: get().bgImage,
      dim: next,
      scope: get().bgScope,
      kind: get().bgKind,
    });
  },
  setBgScope: (scope) => {
    set({ bgScope: scope });
    saveBackgroundSettings({
      image: get().bgImage,
      dim: get().bgDim,
      scope,
      kind: get().bgKind,
    });
  },
  setSelfCardSide: (side) => {
    saveSelfCardSide(side);
    set({ selfCardSide: side });
  },
  setUiTheme: (theme) => {
    saveUiTheme(theme);
    set({ uiTheme: theme });
  },
  setUiPalette: (palette) => {
    saveUiPalette(palette);
    set({ uiPalette: palette });
  },

  setProfileName: (name) => {
    const profile: PlayerProfile = { ...get().profile, name: normalizePlayerName(name) };
    saveProfile(profile);
    try {
      localStorage.setItem('sgk-name', profile.name);
    } catch {
      // ignore storage failures
    }
    set({ profile });
  },

  leaveLan: () => {
    get().lanHost?.close();
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    set({
      guandanView: null,
      savedLanSession: null,
      chatMessages: [],
      chatOpen: false,
      chatUnread: 0,
      screen: 'menu',
      game: null,
      preGame: null,
      pending: null,
      result: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      myRole: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      spectate: false,
      spectators: [],
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      harvest: null,
      aoe: null,
      flash: null,
      flashes: [],
      damageNotice: null,
      suspended: false,
    });
  },

  suspendGame: () => {
    const { lanRole, game, lanClient } = get();
    if (lanRole !== 'client' || !game || game.state.over) return;
    lanClient?.leave();
    resolveAsk = null;
    set({
      screen: 'menu',
      suspended: true,
      lanClient: null,
      pending: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      harvest: null,
      aoe: null,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      flash: null,
      flashes: [],
      damageNotice: null,
    });
  },

  resumeGame: async () => {
    const { suspended, game, savedLanSession } = get();
    if (!suspended) return;
    set({ suspended: false });
    if (savedLanSession) {
      await get().joinLanRoom(
        savedLanSession.address,
        savedLanSession.code,
        savedLanSession.name,
        savedLanSession.spectate === true,
      );
      return;
    }
    if (game) set({ screen: game.state.over ? 'result' : 'game' });
  },

  resumeSavedLanSession: async () => {
    const saved = get().savedLanSession;
    if (!saved) return;
    await get().joinLanRoom(saved.address, saved.code, saved.name, saved.spectate === true);
  },

  dismissSavedLanSession: () => {
    clearSavedLanSession();
    set({ savedLanSession: null });
  },
  returnToLobby: () => {
    const { lanRole, lobby } = get();
    if (!lobby || lanRole !== 'client') {
      get().leaveLan();
      return;
    }
    get().game?.stop?.();
    clearAutoPlayTimer();
    set({
      screen: 'lobby',
      autoPlay: false,
      game: null,
      result: null,
      pending: null,
      promptDeadline: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      flash: null,
      flashes: [],
      damageNotice: null,
      revealNotice: null,
      lastSkill: null,
      responseWindow: null,
      spectateAsk: null,
      version: get().version + 1,
    });
  },

  quitSuspendedGame: () => {
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    set({
      savedLanSession: null,
      chatMessages: [],
      chatOpen: false,
      chatUnread: 0,
      screen: 'menu',
      game: null,
      preGame: null,
      pending: null,
      result: null,
      suspended: false,
      lanRole: null,
      lanClient: null,
      lanHost: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      lastPlay: null,
      lastJudge: null,
      lastDiscard: null,
      cardHistory: [],
      discardOrigins: {},
      harvest: null,
      aoe: null,
      flash: null,
      flashes: [],
      damageNotice: null,
      revealNotice: null,
      responseWindow: null,
      wuxieWindow: false,
      wuxieDeadline: null,
      lastSkill: null,
      spectateAsk: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      promptDeadline: null,
      skipWuxie: false,
      modalMinimized: false,
    });
  },

  event: (ev) => {
    const state = get();
    const turn = state.game?.state.turn ?? 0;
    const patch: Partial<GameStore> = { version: state.version + 1 };
    if (ev.type === 'playCard') playSound('play');
    else if (ev.type === 'respond') playSound('respond');
    else if (ev.type === 'damage') playSound('damage');
    else if (ev.type === 'heal') playSound('heal');
    else if (ev.type === 'discard') playSound('discard');
    else if (ev.type === 'gain') playSound('draw');
    else if (ev.type === 'judge') playSound('judge');
    else if (ev.type === 'skill') playSound('skill');
    else if (ev.type === 'turn' && ev.playerId === state.humanId) playSound('turn');
    else if (ev.type === 'dying') playSound('dying');
    else if (ev.type === 'revive') playSound('heal');
    if (getVibrationEnabled()) {
      if (ev.type === 'damage' && ev.targetId === state.humanId) vibrate([40, 30, 40]);
      else if (ev.type === 'dying' && ev.playerId === state.humanId) vibrate(200);
    }
    // 默认语音包：技能语音 / 卡牌语音 / 阵亡语音
    if (ev.type === 'skill') {
      playSkillVoice(ev.skillId);
    } else if (ev.type === 'playCard' || ev.type === 'respond') {
      const actor = state.game?.state.players[ev.playerId];
      // 转化牌按变化后的牌名播语音，没有对应语音时回退到原牌
      const asPinyin = ev.as && ev.as !== ev.card.name ? cardVoicePinyin(ev.as) : null;
      playCardVoice((asPinyin ?? cardVoicePinyin(ev.card.name)) ?? undefined, actor?.gender === 'female' ? 'female' : 'male');
    } else if (ev.type === 'death') {
      const actor = state.game?.state.players[ev.playerId];
      playDieVoice(actor?.heroId);
    }
    if (ev.type === 'devNotice') {
      patch.devNotice = { id: Date.now(), name: ev.name, text: ev.text };
    }
    if (ev.type === 'harvest') {
      patch.harvest = {
        cards: ev.cards,
        picks: ev.picks,
        chooserId: ev.chooserId,
        done: ev.done,
      };
    }
    if (ev.type === 'aoe') {
      patch.aoe = {
        cardName: ev.cardName,
        sourceId: ev.sourceId,
        entries: ev.entries,
        activeId: ev.activeId,
        timeoutMs: ev.timeoutMs,
        done: ev.done,
      };
    }
    if (!sessionMarked && (ev.type === 'turn' || ev.type === 'playCard' || ev.type === 'respond')) {
      sessionMarked = true;
      const current = state.game?.state;
      markGameSession(
        `模式：${current?.rules.mode ?? 'identity'}，人数：${current?.players.length ?? '?'}，回合：${current?.turn ?? 0}`,
      );
    }
    if (ev.type === 'turn' && ev.turn === 1) {
      patch.aoe = null;
      patch.harvest = null;
      patch.identityMarks = {};
      patch.markingPlayerId = null;
    }
    if (ev.type === 'turn' || ev.type === 'playCard') {
      patch.skipWuxie = false;
    }
    if (ev.type === 'turn' && state.firstPlayerId === null) {
      patch.firstPlayerId = ev.playerId;
    }
    if (ev.type === 'playCard' || ev.type === 'respond') {
      eventSeq += 1;
      const isResponse = ev.type === 'respond';
      if (isResponse && ev.as === '无懈可击') patch.skipWuxie = false;
      patch.lastPlay = {
        id: eventSeq,
        playerId: ev.playerId,
        card: ev.card,
        as: ev.as,
        targets: ev.type === 'playCard' ? ev.targets : [],
        isResponse,
      };
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: isResponse ? ('respond' as const) : ('play' as const),
          playerId: ev.playerId,
          cards: ev.type === 'respond' && ev.cards ? ev.cards : [ev.card],
          label: isResponse ? '打出' : '使用',
          as: ev.as,
          targets: ev.type === 'playCard' ? ev.targets : [],
          turn,
        },
      ].slice(-40);
    } else if (ev.type === 'judge') {
      eventSeq += 1;
      patch.lastJudge = {
        id: eventSeq,
        playerId: ev.playerId,
        card: ev.card,
        success: ev.success,
        text: ev.text,
        reason: ev.reason,
        changedBy: ev.changedBy,
      };
      const judgeId = eventSeq;
      setTimeout(() => {
        if (get().lastJudge?.id === judgeId) set({ lastJudge: null });
      }, 3600);
      const lastHistory = state.cardHistory[state.cardHistory.length - 1];
      const baseHistory =
        lastHistory?.kind === 'reveal' &&
        lastHistory.playerId === ev.playerId &&
        lastHistory.cards.length === 1 &&
        lastHistory.cards[0]?.id === ev.card.id
          ? state.cardHistory.slice(0, -1)
          : state.cardHistory;
      patch.cardHistory = [
        ...baseHistory,
        { id: eventSeq, kind: 'judge' as const, playerId: ev.playerId, cards: [ev.card], label: ev.reason, turn },
      ].slice(-40);
    } else if (ev.type === 'discard' && ev.cards.length > 0) {
      eventSeq += 1;
      patch.lastDiscard = {
        id: eventSeq,
        playerId: ev.playerId,
        cards: ev.cards,
        reason: ev.reason,
      };
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: 'discard' as const,
          playerId: ev.playerId,
          cards: ev.cards,
          label: ev.reason ?? '弃置',
          turn,
        },
      ].slice(-40);
      const discardOrigins = { ...state.discardOrigins };
      for (const card of ev.cards) {
        discardOrigins[card.id] = { playerId: ev.playerId, reason: ev.reason };
      }
      patch.discardOrigins = discardOrigins;
    } else if (ev.type === 'gain' && ev.cards.length > 0) {
      eventSeq += 1;
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: 'gain' as const,
          playerId: ev.playerId,
          cards: ev.cards,
          label: ev.public ? '获得' : '获得一张牌',
          turn,
        },
      ].slice(-40);
    } else if (ev.type === 'wuxieWindow') {
      patch.wuxieWindow = true;
      patch.wuxieDeadline = ev.until ?? Date.now() + ev.ms;
      setTimeout(() => set({ wuxieWindow: false, wuxieDeadline: null }), ev.ms);
    } else if (ev.type === 'responseWindow') {
      const until = ev.until ?? Date.now() + ev.ms;
      patch.responseWindow = { playerId: ev.playerId, name: ev.name, ms: ev.ms, until };
      setTimeout(() => {
        if (get().responseWindow?.until === until) set({ responseWindow: null });
      }, ev.ms);
      patch.version = state.version + 1;
    } else if (ev.type === 'skill') {
      eventSeq += 1;
      patch.lastSkill = {
        id: eventSeq,
        playerId: ev.playerId,
        name: ev.name,
        text: ev.text,
      };
      patch.cardHistory = [
        ...(patch.cardHistory ?? state.cardHistory),
        {
          id: eventSeq,
          kind: 'skill' as const,
          playerId: ev.playerId,
          cards: [],
          label: '发动',
          as: ev.text ? `${ev.name}·${ev.text}` : ev.name,
          turn: state.game?.state.turn,
        },
      ].slice(-40);
      const skillId = eventSeq;
      setTimeout(() => {
        if (get().lastSkill?.id === skillId) set({ lastSkill: null });
      }, 6000);
    } else if (ev.type === 'reveal' && ev.cards.length > 0) {
      eventSeq += 1;
      if (ev.label) {
        patch.revealNotice = {
          id: eventSeq,
          playerId: ev.playerId,
          cards: ev.cards,
          label: ev.label,
        };
        const revealId = eventSeq;
        setTimeout(() => {
          if (get().revealNotice?.id === revealId) set({ revealNotice: null });
        }, 2800);
      }
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: 'reveal' as const,
          playerId: ev.playerId,
          cards: ev.cards,
          label: '展示',
          turn,
        },
      ].slice(-40);
    } else if (ev.type === 'damage' || ev.type === 'heal') {
      eventSeq += 1;
      const nextFlash: FlashEvent = {
        id: eventSeq,
        playerId: ev.targetId,
        kind: ev.type,
        amount: ev.amount,
        sourceId: ev.sourceId,
        reason: ev.reason,
        card: ev.type === 'damage' ? ev.card : undefined,
      };
      patch.flash = nextFlash;
      patch.flashes = [...state.flashes, nextFlash].slice(-12);
      patch.damageNotice = {
        id: eventSeq,
        kind: ev.type,
        sourceId: ev.sourceId,
        targetId: ev.targetId,
        amount: ev.amount,
        hp: ev.hp,
        reason: ev.reason,
        card: ev.type === 'damage' ? ev.card : undefined,
      };
      const id = eventSeq;
      setTimeout(() => {
        const current = get();
        set({
          flashes: current.flashes.filter((flash) => flash.id !== id),
          flash: current.flash?.id === id ? null : current.flash,
          damageNotice: current.damageNotice?.id === id ? null : current.damageNotice,
        });
      }, 1600);
    } else if (ev.type === 'gameOver') {
      sessionMarked = false;
      endGameSession();
      patch.result = { text: ev.text, winner: ev.winner };
      setTimeout(() => {
        if (get().result && !get().spectate) set({ screen: 'result' });
      }, 1400);
      const finished = state.game;
      if (!state.spectate && finished && recordedGame !== finished) {
        recordedGame = finished;
        const delay = state.lanRole === 'client' ? 220 : 0;
        setTimeout(() => {
          const current = get();
          const finishedState = current.game?.state ?? finished.state;
          const human = finishedState.players[current.humanId];
          if (!human) return;
          const mode: 'identity' | 'duel' | 'landlord' | 'guozhan' | '2v2' =
            finishedState.players.length === 2 ? 'duel' : finishedState.rules.mode;
          const humanWon =
            mode === '2v2'
              ? ev.winner === 'draw'
                ? false
                : ev.winner === human.role
              : mode === 'guozhan'
              ? ev.winner === human.faction
              : mode === 'landlord'
                ? (ev.winner === 'lord' && human.role === 'lord') ||
                  (ev.winner === 'rebel' && human.role !== 'lord')
                : mode === 'duel'
                  ? ev.winner === human.role
                  : (ev.winner === 'lord' &&
                      (human.role === 'lord' || human.role === 'loyalist')) ||
                    (ev.winner === 'rebel' && human.role === 'rebel') ||
                    (ev.winner === 'traitor' && human.role === 'traitor');
          const result: 'win' | 'lose' | 'draw' =
            ev.winner === 'draw' ? 'draw' : humanWon ? 'win' : 'lose';
          const modeLabel =
            mode === 'duel'
              ? '1v1 单挑'
              : mode === 'landlord'
                ? '斗地主'
                : mode === 'guozhan'
                  ? '国战'
                  : mode === '2v2'
                    ? '2v2 竞技'
                    : '身份场';
          const firstPlayer =
            current.firstPlayerId !== null ? finishedState.players[current.firstPlayerId] : undefined;
          const lobbyLevels = new Map<number, number>();
          for (const p of current.lobby?.players ?? []) {
            if (typeof p.level === 'number') lobbyLevels.set(p.playerId, p.level);
          }
          addMatchRecord({
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            dateKey: localDateKey(),
            playedAt: new Date().toISOString(),
            mode,
            modeLabel,
            playerCount: finishedState.players.length,
            result,
            winner: String(ev.winner),
            humanHeroName: human.heroName,
            firstPlayerName: firstPlayer?.name ?? '',
            players: finishedState.players.map((player) => ({
              name: player.name,
              heroId: player.heroId,
              heroName: player.heroName,
              faction: player.faction,
              role: player.role,
              isBot: player.isBot,
              alive: player.alive,
              level: player.id === current.humanId ? current.profile.level : lobbyLevels.get(player.id),
            })),
            log: finishedState.log.slice(-400),
          });
          if (xpRecordedGame !== finished) {
            xpRecordedGame = finished;
            if (current.devTainted) {
              set({ xpGain: null });
            } else {
              const realPlayers = finishedState.players.filter((player) => !player.isBot).length;
              const awarded = applyMatchXp(current.profile, mode, result, realPlayers);
              set({ profile: awarded.profile, xpGain: awarded.gain });
            }
          }
        }, delay);
      }
    }
    set(patch);
  },

  ask: (req) =>
    new Promise<GameAction>((resolve) => {
      if (
        req.kind === 'respond' &&
        req.respondName === '无懈可击' &&
        get().skipWuxie
      ) {
        resolve({ type: 'cancel' });
        return;
      }
      const autoOption =
        req.kind === 'respond'
          ? (req.cardOptions ?? []).find((option) => !option.cardId.startsWith('__'))
          : undefined;
      clearAskTimer();
      resolveAsk = resolve;
      if (req.timeout && req.timeout > 0) {
        const askId = req.id;
        askTimer = window.setTimeout(() => {
          if (get().pending?.id !== askId) return;
          const finish = resolveAsk;
          resolveAsk = null;
          clearAskTimer();
          set({
            pending: null,
            promptDeadline: null,
            selected: null,
            selectedTargets: [],
            asChooser: null,
            viewAsFilter: null,
            cardChoices: [],
            reorderTop: [],
            modalMinimized: false,
            version: get().version + 1,
          });
          finish?.({ type: 'cancel' });
        }, req.timeout);
      }
      set({
        pending: req,
        promptDeadline:
          req.timeout && req.timeout > 0 ? req.deadline ?? Date.now() + req.timeout : null,
        selected: autoOption
          ? {
              cardId: autoOption.cardId,
              as: autoOption.as,
              skillId: autoOption.skillId,
              element: autoOption.element,
            }
          : null,
        selectedTargets: [],
        asChooser: null,
        viewAsFilter: null,
        cardChoices: [],
        reorderTop: [],
        modalMinimized: false,
        version: get().version + 1,
      });
    }),

  submit: (action) => {
    clearAskTimer();
    clearAutoPlayTimer();
    const { lanRole, lanClient } = get();
    if (lanRole === 'client') {
      lanClient?.sendAction(action);
      set({
        pending: null,
        promptDeadline: null,
        selected: null,
        selectedTargets: [],
        asChooser: null,
        viewAsFilter: null,
        cardChoices: [],
        reorderTop: [],
        modalMinimized: false,
        version: get().version + 1,
      });
      return;
    }
    const resolve = resolveAsk;
    resolveAsk = null;
    set({
      pending: null,
      promptDeadline: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      viewAsFilter: null,
      cardChoices: [],
      reorderTop: [],
      modalMinimized: false,
      version: get().version + 1,
    });
    resolve?.(action);
  },

  openIdentityMark: (playerId) => set({ markingPlayerId: playerId }),

  closeIdentityMark: () => set({ markingPlayerId: null }),

  setIdentityMark: (role) => {
    const { markingPlayerId, identityMarks } = get();
    if (markingPlayerId == null) return;
    const next = { ...identityMarks };
    if (role) next[markingPlayerId] = role;
    else delete next[markingPlayerId];
    set({
      identityMarks: next,
      markingPlayerId: null,
      version: get().version + 1,
    });
  },

  selectCard: (cardId) => {
    const { pending, selected, asChooser, viewAsFilter } = get();
    if (!pending?.cardOptions) return;
    if (selected?.cardId === cardId || asChooser?.cardId === cardId) {
      set({ selected: null, selectedTargets: [], asChooser: null });
      return;
    }
    let options = pending.cardOptions.filter((o) => o.cardId === cardId);
    if (!options.length) return;
    // 处于「转化技选牌」态时，直接命中该技能对应的转化选项
    if (viewAsFilter) {
      const hit = options.find(
        (o) => o.skillId === viewAsFilter.skillId && o.as === viewAsFilter.as,
      );
      if (hit) options = [hit];
    }
    if (options.length === 1) {
      const option = options[0];
      set({
        selected: { cardId, as: option.as, skillId: option.skillId, element: option.element },
        selectedTargets: [],
        asChooser: null,
      });
      return;
    }
    set({ asChooser: { cardId, options }, selected: null, selectedTargets: [] });
  },

  selectViewAsSkill: (skillId, as, eligibleCardIds) => {
    set({
      viewAsFilter: { skillId, as, eligibleCardIds },
      selected: null,
      selectedTargets: [],
      asChooser: null,
    });
  },

  chooseAs: (as, skillId) => {
    const { asChooser, pending } = get();
    if (!asChooser) return;
    const option = asChooser.options.find((o) => o.as === as && (o.skillId ?? '') === (skillId ?? ''));
    set({
      selected: { cardId: asChooser.cardId, as, skillId: option?.skillId, element: option?.element },
      asChooser: null,
      selectedTargets: [],
    });
  },

  closeAsChooser: () => set({ asChooser: null, selected: null, selectedTargets: [], viewAsFilter: null }),

  clearSelection: () => set({ selected: null, selectedTargets: [], asChooser: null, viewAsFilter: null }),

  seatClick: (playerId) => {
    const { pending, selected, selectedTargets } = get();
    if (!pending) return;
    if (pending.kind === 'choosePlayer') {
      if (pending.players?.includes(playerId)) set({ selectedTargets: [playerId] });
      return;
    }
    if (pending.kind === 'play' && selected) {
      const option = pending.cardOptions?.find(
        (o) =>
          o.cardId === selected.cardId &&
          o.as === selected.as &&
          (o.skillId ?? '') === (selected.skillId ?? ''),
      );
      if (!option) return;
      // 两段式目标（如借刀杀人）：点击另一个「第一段目标」时，替换第一个目标
      if (
        option.targetAfter &&
        option.validTargets.includes(playerId) &&
        selectedTargets.length > 0 &&
        selectedTargets[0] !== playerId
      ) {
        set({ selectedTargets: [playerId] });
        return;
      }
      const follow = option.targetAfter
        ? selectedTargets.length === 0
          ? option.validTargets
          : option.targetAfter[selectedTargets[0]] ?? []
        : option.validTargets;
      const allowed = option.targetAfter ? [...new Set([...follow, ...selectedTargets])] : follow;
      if (!allowed.includes(playerId)) return;
      if (selectedTargets.includes(playerId)) {
        set({
          selectedTargets:
            selectedTargets[0] === playerId
              ? []
              : selectedTargets.filter((id) => id !== playerId),
        });
      } else if (selectedTargets.length < option.targetMax) {
        set({ selectedTargets: [...selectedTargets, playerId] });
      } else if (option.targetMax === 1) {
        set({ selectedTargets: [playerId] });
      }
    }
  },

  confirmPlay: () => {
    const { pending, selected, selectedTargets, asChooser } = get();
    if (asChooser || !pending || !selected || pending.kind !== 'play') return;
    const option = pending.cardOptions?.find(
      (o) =>
        o.cardId === selected.cardId &&
        o.as === selected.as &&
        (o.skillId ?? '') === (selected.skillId ?? ''),
    );
    if (!option) return;
    if (selectedTargets.length < option.targetMin || selectedTargets.length > option.targetMax) return;
    get().submit({
      type: 'useCard',
      cardId: option.cardId,
      as: option.as,
      targets: selectedTargets,
      skillId: option.skillId,
      element: selected.element,
    });
  },

  endPlay: () => get().submit({ type: 'endPlay' }),

  activateSkill: (skillId) => get().submit({ type: 'activateSkill', skillId }),

  cancelPrompt: () => get().submit({ type: 'cancel' }),

  cancelAllWuxie: () => {
    const pending = get().pending;
    if (pending?.kind !== 'respond' || pending.respondName !== '无懈可击') return;
    set({ skipWuxie: true });
    get().submit({ type: 'cancel' });
  },

  receiveChat: (message) => {
    const state = get();
    const bubble =
      message.playerId !== undefined
        ? {
            id: message.id,
            playerId: message.playerId,
            name: message.name,
            text: message.text,
          }
        : null;
    set({
      chatMessages: [...state.chatMessages, message].slice(-100),
      chatUnread: state.chatOpen ? 0 : state.chatUnread + 1,
      speechBubbles: bubble ? [...state.speechBubbles, bubble].slice(-8) : state.speechBubbles,
    });
    if (bubble) {
      setTimeout(() => {
        set({
          speechBubbles: get().speechBubbles.filter((item) => item.id !== bubble.id),
        });
      }, 5200);
    }
  },

  sendChat: (text) => {
    const value = text.trim();
    if (!value) return;
    const state = get();
    if (state.lanRole === 'host') state.lanHost?.sendChat(value);
    else if (state.lanRole === 'client') state.lanClient?.sendChat(value);
  },

  receiveProp: (message) => {
    const state = get();
    const item: PropThrow = {
      id: message.id,
      fromId: message.fromId,
      fromName: message.fromName,
      targetId: message.targetId,
      prop: message.prop,
    };
    set({ propThrows: [...state.propThrows, item].slice(-12) });
    playSound(message.prop === 'flower' ? 'flower' : 'egg');
    setTimeout(() => {
      set({ propThrows: get().propThrows.filter((p) => p.id !== item.id) });
    }, 2600);
  },

  sendProp: (targetId, prop) => {
    const state = get();
    const kind = prop === 'flower' ? 'flower' : 'egg';
    if (state.lanRole === 'host') {
      state.lanHost?.sendProp(targetId, kind);
    } else if (state.lanRole === 'client') {
      state.lanClient?.sendProp(targetId, kind);
    } else {
      const human = state.game?.state.players[state.humanId];
      get().receiveProp({
        id: Date.now(),
        fromId: state.humanId,
        fromName: human?.name ?? '你',
        targetId,
        prop: kind,
        at: Date.now(),
      });
    }
  },

  openChat: () => set({ chatOpen: true, chatUnread: 0 }),
  closeChat: () => set({ chatOpen: false }),

  dismissHarvest: () => set({ harvest: null, version: get().version + 1 }),
  dismissAoe: () => set({ aoe: null, version: get().version + 1 }),

  toggleCardChoice: (cardId) => {
    const { pending, cardChoices } = get();
    if (!pending) return;
    const max = pending.max ?? 1;
    if (cardChoices.includes(cardId)) {
      set({ cardChoices: cardChoices.filter((id) => id !== cardId) });
    } else if (max <= 1) {
      set({ cardChoices: [cardId] });
    } else if (cardChoices.length < max) {
      set({ cardChoices: [...cardChoices, cardId] });
    }
  },

  confirmCards: () => {
    const { pending, cardChoices } = get();
    if (!pending) return;
    const min = pending.min ?? 0;
    if (cardChoices.length < min) return;
    get().submit({ type: 'chooseCards', cardIds: cardChoices });
  },

  toggleReorder: (cardId) => {
    const { reorderTop } = get();
    if (reorderTop.includes(cardId)) set({ reorderTop: reorderTop.filter((id) => id !== cardId) });
    else set({ reorderTop: [...reorderTop, cardId] });
  },

  confirmReorder: () => {
    const { reorderTop } = get();
    get().submit({ type: 'chooseCards', cardIds: reorderTop });
  },

  chooseOption: (optionId) => get().submit({ type: 'chooseOption', optionId }),

  toggleModalMinimized: () => set({ modalMinimized: !get().modalMinimized }),

  setAutoPlay: (value) => {
    const next = value ?? !get().autoPlay;
    clearAutoPlayTimer();
    set({ autoPlay: next, version: get().version + 1 });
    if (next) scheduleAutoPlay();
  },
}));

export function randomHeroChoices(n: number): string[] {
  const pool = [...PLAYABLE_HEROES];
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0].id);
  }
  return out;
}

export function takeHeroPair(available: Set<string>): { primary: string; secondary: string } | null {
  return takeFactionPair(available);
}

export function randomHeroPairs(n: number, available: Set<string>): { primary: string; secondary: string }[] {
  const out: { primary: string; secondary: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const pair = takeHeroPair(available);
    if (!pair) break;
    out.push(pair);
  }
  return out;
}

export function useGameSnapshot() {
  useGameStore((s) => s.version);
  const game = useGameStore((s) => s.game);
  return { game };
}

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const isDesktop = '__TAURI_INTERNALS__' in window;
  if (room && !isDesktop) {
    useGameStore.setState({
      screen: 'lan',
      joinPreset: { address: window.location.host, code: room.toUpperCase() },
    });
  }
}

// 动态壁纸：启动时从 IndexedDB 取回视频并生成播放地址
if (typeof window !== 'undefined' && useGameStore.getState().bgKind === 'video') {
  void loadBackgroundVideo().then((blob) => {
    if (blob) useGameStore.setState({ bgVideoUrl: URL.createObjectURL(blob) });
  }); // bgVideoUrl 水合
}
