import { create } from 'zustand';
import { Game, buildRoles } from '../core/game';
import { HEROES } from '../core/deck';
import { botAction } from '../core/bot';
import { smartBotAction } from '../core/smartBot';
import { LanClientManager, LanHostManager, createRoomInfo, isAndroidApp, isTauri, parseAddress } from '../net/lan';
import type { LobbyState, RoomInfo } from '../net/protocol';
import {
  checkAndroidUpdate,
  checkAppUpdate,
  installAndroidUpdate,
  installAppUpdate,
  type AppUpdateInfo,
} from './update';
import { loadBackgroundSettings, saveBackgroundSettings } from './background';
import { scheduleDataSnapshot } from './dataStorage';
import { addMatchRecord, localDateKey } from './history';
import type {
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

type Screen = 'menu' | 'setup' | 'pick' | 'lan' | 'lobby' | 'gallery' | 'game' | 'result';

interface PreGame {
  count: number;
  rules?: Partial<CustomRules>;
  candidates: string[];
  bots: { name: string; heroId: string }[];
  roles: Role[];
  lordIndex: number;
  lordHeroId: string | null;
}

interface SavedLanSession {
  address: string;
  code: string;
  name: string;
}

const LAN_SESSION_KEY = 'sgk-lan-session';

export function loadSavedLanSession(): SavedLanSession | null {
  try {
    const raw = localStorage.getItem(LAN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedLanSession>;
    if (!parsed.address || !parsed.code || !parsed.name) return null;
    return { address: parsed.address, code: parsed.code, name: parsed.name };
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

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'latest' | 'error';

export interface GameLike {
  state: GameState;
  stop?: () => void;
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
}

interface FlashEvent {
  id: number;
  playerId: number;
  kind: 'damage' | 'heal';
  amount: number;
}

interface CardHistoryEntry {
  id: number;
  kind: 'play' | 'respond' | 'discard' | 'reveal' | 'judge' | 'gain';
  playerId?: number;
  cards: Card[];
  label: string;
  as?: string;
  targets?: number[];
}

interface GameStore {
  screen: Screen;
  game: GameLike | null;
  preGame: PreGame | null;
  humanId: number;
  version: number;
  pending: AskRequest | null;
  result: { text: string; winner: string } | null;
  lastPlay: PlayEvent | null;
  lastJudge: JudgeEvent | null;
  cardHistory: CardHistoryEntry[];
  flash: FlashEvent | null;
  error: string | null;
  lanRole: 'host' | 'client' | null;
  lanHost: LanHostManager | null;
  lanClient: LanClientManager | null;
  room: RoomInfo | null;
  lobby: LobbyState | null;
  netError: string | null;
  lanPlayerId: number;
  lanConnId: number;
  joinPreset: { address: string; code: string } | null;
  suspended: boolean;
  savedLanSession: SavedLanSession | null;
  appVersion: string;
  updateInfo: AppUpdateInfo | null;
  updateState: UpdateState;
  updateProgress: { downloaded: number; total: number };
  updateError: string | null;
  updateModalOpen: boolean;
  bgImage: string | null;
  bgDim: number;
  settingsOpen: boolean;
  historyOpen: boolean;
  firstPlayerId: number | null;

  selected: { cardId: string; as: string; skillId?: string; element?: 'fire' | 'thunder' } | null;
  selectedTargets: number[];
  asChooser: AsChooser | null;
  cardChoices: string[];
  reorderTop: string[];
  modalMinimized: boolean;

  initLocal: (count: number, heroId: string, rules?: Partial<CustomRules>) => void;
  prepareLocal: (count: number, rules?: Partial<CustomRules>, excludeHeroIds?: string[]) => void;
  confirmLocalPick: (heroId: string) => void;
  backToMenu: () => void;
  restart: () => void;
  createLanRoom: (name: string) => Promise<void>;
  joinLanRoom: (address: string, code: string, name: string) => Promise<void>;
  startLanGame: (count: number) => void;
  startLanPick: (count: number) => void;
  cancelLanPick: () => void;
  setLanRules: (mode: 'standard' | 'custom', rules: CustomRules) => void;
  pickLanHero: (heroId: string) => void;
  leaveLan: () => void;
  suspendGame: () => void;
  resumeGame: () => void;
  quitSuspendedGame: () => void;
  resumeSavedLanSession: () => Promise<void>;
  dismissSavedLanSession: () => void;
  checkUpdate: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  setBgImage: (image: string | null) => void;
  setBgDim: (dim: number) => void;
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
  toggleCardChoice: (cardId: string) => void;
  confirmCards: () => void;
  toggleReorder: (cardId: string) => void;
  confirmReorder: () => void;
  chooseOption: (optionId: string) => void;
  closeAsChooser: () => void;
  toggleModalMinimized: () => void;
}

let resolveAsk: ((action: GameAction) => void) | null = null;
let eventSeq = 0;
let recordedGame: GameLike | null = null;
const initialBackground = loadBackgroundSettings();

const io: GameIO = {
  emit: (ev) => useGameStore.getState().event(ev),
  ask: (req) => {
    const state = useGameStore.getState();
    if (req.playerId === state.humanId) return state.ask(req);
    return new Promise((resolve) => {
      const wait = 260 + Math.random() * 420;
      const gameState = useGameStore.getState().game?.state;
      setTimeout(() => resolve(gameState ? smartBotAction(gameState, req) : botAction(req)), wait);
    });
  },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  game: null,
  preGame: null,
  humanId: 0,
  version: 0,
  pending: null,
  result: null,
  lastPlay: null,
  lastJudge: null,
  cardHistory: [],
  flash: null,
  error: null,
  lanRole: null,
  lanHost: null,
  lanClient: null,
  room: null,
  lobby: null,
  netError: null,
  lanPlayerId: 0,
  lanConnId: -1,
  joinPreset: null,
  suspended: false,
  savedLanSession: loadSavedLanSession(),
  appVersion: APP_VERSION,
  updateInfo: null,
  updateState: 'idle',
  updateProgress: { downloaded: 0, total: 0 },
  updateError: null,
  updateModalOpen: false,
  bgImage: initialBackground.image,
  bgDim: initialBackground.dim,
  settingsOpen: false,
  historyOpen: false,
  firstPlayerId: null,
  selected: null,
  selectedTargets: [],
  asChooser: null,
  cardChoices: [],
  reorderTop: [],
  modalMinimized: false,

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
      { players, seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0, rules },
      io,
    );
    set({
      screen: 'game',
      game,
      preGame: null,
      suspended: false,
      humanId: 0,
      firstPlayerId: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      pending: null,
      result: null,
      lastPlay: null,
      lastJudge: null,
      cardHistory: [],
      flash: null,
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
    const pool = HEROES.map((hero) => hero.id).filter((id) => !excluded.has(id));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const bots = Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
      name: botNames[i % botNames.length],
      heroId: pool.pop()!,
    }));
    const mode = rules?.mode ?? 'identity';
    const roles = buildRoles(count, mode);
    roles.sort(() => Math.random() - 0.5);
    const visibleLordIndex =
      count > 2 && (mode === 'identity' || mode === 'landlord') ? roles.indexOf('lord') : -1;
    const lordIndex = visibleLordIndex;
    const lordHeroId = lordIndex > 0 ? bots[lordIndex - 1].heroId : null;
    set({
      screen: 'pick',
      game: null,
      suspended: false,
      preGame: { count, rules, candidates: pool.slice(0, 5), bots, roles, lordIndex, lordHeroId },
      humanId: 0,
      firstPlayerId: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      pending: null,
      result: null,
      lastPlay: null,
      lastJudge: null,
      cardHistory: [],
      flash: null,
      error: null,
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      version: get().version + 1,
    });
  },

  confirmLocalPick: (heroId) => {
    const preGame = get().preGame;
    if (!preGame || !preGame.candidates.includes(heroId)) return;
    const players = [
      { name: '你', heroId, isBot: false },
      ...preGame.bots.map((bot) => ({ ...bot, isBot: true })),
    ];
    const game = new Game(
      {
        players,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        roles: preGame.roles,
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
      lastPlay: null,
      lastJudge: null,
      cardHistory: [],
      flash: null,
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
        set({ error: `对局异常：${(err as Error).message}` });
      });
    }, 0);
  },

  backToMenu: () => {
    get().game?.stop?.();
    get().lanHost?.close();
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    set({
      savedLanSession: null,
      screen: 'menu',
      game: null,
      preGame: null,
      pending: null,
      result: null,
      error: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      lastPlay: null,
      lastJudge: null,
      cardHistory: [],
      flash: null,
    });
    set({ suspended: false });
  },

  restart: () => {
    const { lanRole, lanHost, lanClient, game } = get();
    if (lanRole === 'host') {
      lanHost?.returnToLobby();
      set({
        screen: 'lobby',
        game: null,
        result: null,
        pending: null,
        lastPlay: null,
        lastJudge: null,
        cardHistory: [],
        flash: null,
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
        cardHistory: [],
        flash: null,
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

  createLanRoom: async (name) => {
    try {
      const info = await createRoomInfo();
      const hostName = name.trim() || '房主';
      const host = new LanHostManager(info, hostName, {
        askHost: (request) => get().ask(request),
        emitHost: (event) => get().event(event),
        onLobby: (lobby) => set({ lobby, version: get().version + 1 }),
        onGame: (game) =>
          set({
            game,
            screen: 'game',
            humanId: 0,
            firstPlayerId: null,
            lanPlayerId: 0,
            pending: null,
            result: null,
            lastPlay: null,
            lastJudge: null,
            cardHistory: [],
            flash: null,
            selected: null,
            selectedTargets: [],
            asChooser: null,
            cardChoices: [],
            reorderTop: [],
            version: get().version + 1,
          }),
        onError: (message) => set({ netError: message }),
        onClosed: () => set({ netError: '房间连接已断开，请返回重试', lanHost: null }),
      });
      clearSavedLanSession();
      set({
        savedLanSession: null,
        lanRole: 'host',
        lanHost: host,
        lanClient: null,
        lanConnId: 0,
        room: info,
        lobby: host.lobby,
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

  joinLanRoom: async (address, code, name) => {
    const { ip, port } = parseAddress(address);
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      set({ netError: '请输入房间码' });
      return;
    }
    const playerName = name.trim() || '玩家';
    const client = new LanClientManager(ip, port, cleanCode, playerName, {
      onWelcome: (connId) => set({ lanConnId: connId }),
      onLobby: (lobby) =>
        set({
          lobby,
          screen: 'lobby',
          result: null,
          pending: null,
          game: null,
          lastPlay: null,
          lastJudge: null,
          cardHistory: [],
          flash: null,
          version: get().version + 1,
        }),
      onStart: (playerId) =>
        set({
          humanId: playerId,
          lanPlayerId: playerId,
          screen: 'game',
          pending: null,
          result: null,
          game: null,
          lastPlay: null,
          lastJudge: null,
          cardHistory: [],
          flash: null,
          version: get().version + 1,
        }),
      onState: (state) => set({ game: { state }, version: get().version + 1 }),
      onAsk: (request, state) =>
        set({
          game: { state },
          pending: request,
          screen: 'game',
          selected: null,
          selectedTargets: [],
          asChooser: null,
          cardChoices: [],
          reorderTop: [],
          version: get().version + 1,
        }),
      onEvent: (event) => get().event(event),
      onEnd: (text, winner) => {
        if (get().result) return;
        clearSavedLanSession();
        set({ result: { text, winner }, savedLanSession: null });
        setTimeout(() => {
          if (get().result) set({ screen: 'result' });
        }, 1400);
      },
      onError: (message) => set({ netError: message }),
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
    });
    const session: SavedLanSession = { address: `${ip}:${port}`, code: cleanCode, name: playerName };
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
      version: get().version + 1,
    });
  },

  startLanGame: (count) => {
    get().lanHost?.startGame(count);
  },

  startLanPick: (count) => {
    get().lanHost?.beginPicking(count);
  },

  cancelLanPick: () => {
    get().lanHost?.cancelPicking();
  },

  setLanRules: (mode, rules) => {
    get().lanHost?.setRules(mode, rules);
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
      const info = await withTimeout(
        isAndroidApp() ? checkAndroidUpdate() : checkAppUpdate(),
        12000,
        '检查更新超时，请稍后重试',
      );
      if (info) {
        set({
          updateInfo: info,
          updateState: 'available',
          updateModalOpen: manual || get().screen === 'menu',
        });
      } else {
        set({ updateInfo: null, updateState: 'latest', updateModalOpen: manual });
      }
    } catch (error) {
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
      updateError: null,
      updateModalOpen: true,
    });
    try {
      if (info.android) {
        await installAndroidUpdate(info, (downloaded, total) =>
          set({ updateProgress: { downloaded, total } }),
        );
        set({ updateState: 'latest', updateInfo: null, updateModalOpen: false });
        return;
      }
      await installAppUpdate(info, (downloaded, total) =>
        set({ updateProgress: { downloaded, total } }),
      );
      set({ updateState: 'installing' });
    } catch (error) {
      set({
        updateState: 'error',
        updateError: `更新失败：${(error as Error).message}`,
        updateModalOpen: true,
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
  setBgImage: (image) => {
    set({ bgImage: image });
    saveBackgroundSettings({ image, dim: get().bgDim });
  },
  setBgDim: (dim) => {
    const next = Math.min(90, Math.max(0, Math.round(dim)));
    set({ bgDim: next });
    saveBackgroundSettings({ image: get().bgImage, dim: next });
  },

  leaveLan: () => {
    get().lanHost?.close();
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    set({
      savedLanSession: null,
      screen: 'menu',
      game: null,
      preGame: null,
      pending: null,
      result: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lanConnId: -1,
      lastPlay: null,
      lastJudge: null,
      cardHistory: [],
      flash: null,
      suspended: false,
    });
  },

  suspendGame: () => {
    const { lanRole, game } = get();
    if (lanRole !== 'client' || !game || game.state.over) return;
    set({ screen: 'menu', suspended: true });
  },

  resumeGame: () => {
    const { suspended, game } = get();
    if (!suspended || !game) return;
    set({ screen: game.state.over ? 'result' : 'game', suspended: false });
  },

  resumeSavedLanSession: async () => {
    const saved = get().savedLanSession;
    if (!saved) return;
    await get().joinLanRoom(saved.address, saved.code, saved.name);
  },

  dismissSavedLanSession: () => {
    clearSavedLanSession();
    set({ savedLanSession: null });
  },

  quitSuspendedGame: () => {
    get().lanClient?.leave();
    clearSavedLanSession();
    resolveAsk = null;
    set({
      savedLanSession: null,
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
      cardHistory: [],
      flash: null,
    });
  },

  event: (ev) => {
    const state = get();
    const patch: Partial<GameStore> = { version: state.version + 1 };
    if (ev.type === 'turn' && state.firstPlayerId === null) {
      patch.firstPlayerId = ev.playerId;
    }
    if (ev.type === 'playCard' || ev.type === 'respond') {
      eventSeq += 1;
      const isResponse = ev.type === 'respond';
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
          cards: [ev.card],
          label: isResponse ? '打出' : '使用',
          as: ev.as,
          targets: ev.type === 'playCard' ? ev.targets : [],
        },
      ].slice(-5);
    } else if (ev.type === 'judge') {
      eventSeq += 1;
      patch.lastJudge = {
        id: eventSeq,
        playerId: ev.playerId,
        card: ev.card,
        success: ev.success,
        text: ev.text,
        reason: ev.reason,
      };
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
        { id: eventSeq, kind: 'judge' as const, playerId: ev.playerId, cards: [ev.card], label: ev.reason },
      ].slice(-5);
    } else if (ev.type === 'discard' && ev.cards.length > 0) {
      eventSeq += 1;
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: 'discard' as const,
          playerId: ev.playerId,
          cards: ev.cards,
          label: ev.reason ?? '弃置',
        },
      ].slice(-5);
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
        },
      ].slice(-5);
    } else if (ev.type === 'reveal' && ev.cards.length > 0) {
      eventSeq += 1;
      patch.cardHistory = [
        ...state.cardHistory,
        {
          id: eventSeq,
          kind: 'reveal' as const,
          playerId: ev.playerId,
          cards: ev.cards,
          label: '展示',
        },
      ].slice(-5);
    } else if (ev.type === 'damage' || ev.type === 'heal') {
      eventSeq += 1;
      patch.flash = {
        id: eventSeq,
        playerId: ev.targetId,
        kind: ev.type,
        amount: ev.type === 'damage' ? ev.amount : ev.amount,
      };
      const id = eventSeq;
      setTimeout(() => {
        if (get().flash?.id === id) set({ flash: null });
      }, 900);
    } else if (ev.type === 'gameOver') {
      patch.result = { text: ev.text, winner: ev.winner };
      setTimeout(() => {
        if (get().result) set({ screen: 'result' });
      }, 1400);
      const finished = state.game;
      if (state.lanRole === null && finished && recordedGame !== finished) {
        recordedGame = finished;
        setTimeout(() => {
          const current = get();
          if (current.game !== finished) return;
          const finishedState = finished.state;
          const human = finishedState.players[current.humanId];
          if (!human) return;
          const mode: 'identity' | 'duel' | 'landlord' | 'guozhan' =
            finishedState.players.length === 2 ? 'duel' : finishedState.rules.mode;
          const humanWon =
            mode === 'guozhan'
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
                  : '身份场';
          const firstPlayer =
            current.firstPlayerId !== null ? finishedState.players[current.firstPlayerId] : undefined;
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
            })),
            log: finishedState.log.slice(-400),
          });
        }, 0);
      }
    }
    set(patch);
  },

  ask: (req) =>
    new Promise<GameAction>((resolve) => {
      resolveAsk = resolve;
      set({
        pending: req,
        selected: null,
        selectedTargets: [],
        asChooser: null,
        cardChoices: [],
        reorderTop: [],
        modalMinimized: false,
        version: get().version + 1,
      });
    }),

  submit: (action) => {
    const { lanRole, lanClient } = get();
    if (lanRole === 'client') {
      lanClient?.sendAction(action);
      set({
        pending: null,
        selected: null,
        selectedTargets: [],
        asChooser: null,
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
      selected: null,
      selectedTargets: [],
      asChooser: null,
      cardChoices: [],
      reorderTop: [],
      modalMinimized: false,
      version: get().version + 1,
    });
    resolve?.(action);
  },

  selectCard: (cardId) => {
    const { pending, selected, asChooser } = get();
    if (!pending?.cardOptions) return;
    if (selected?.cardId === cardId || asChooser?.cardId === cardId) {
      set({ selected: null, selectedTargets: [], asChooser: null });
      return;
    }
    const options = pending.cardOptions.filter((o) => o.cardId === cardId);
    if (!options.length) return;
    if (options.length === 1) {
      const option = options[0];
      if (pending.kind === 'respond') {
        get().submit({ type: 'respondCard', cardId, as: option.as, skillId: option.skillId });
        return;
      }
      set({
        selected: { cardId, as: option.as, skillId: option.skillId, element: option.element },
        selectedTargets: [],
        asChooser: null,
      });
      return;
    }
    set({ asChooser: { cardId, options } });
  },

  chooseAs: (as, skillId) => {
    const { asChooser, pending } = get();
    if (!asChooser) return;
    if (pending?.kind === 'respond') {
      get().submit({ type: 'respondCard', cardId: asChooser.cardId, as, skillId });
      return;
    }
    const option = asChooser.options.find((o) => o.as === as && (o.skillId ?? '') === (skillId ?? ''));
    set({
      selected: { cardId: asChooser.cardId, as, skillId: option?.skillId, element: option?.element },
      asChooser: null,
      selectedTargets: [],
    });
  },

  closeAsChooser: () => set({ asChooser: null }),

  clearSelection: () => set({ selected: null, selectedTargets: [], asChooser: null }),

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
      if (!option || !option.validTargets.includes(playerId)) return;
      if (selectedTargets.includes(playerId)) {
        set({ selectedTargets: selectedTargets.filter((id) => id !== playerId) });
      } else if (selectedTargets.length < option.targetMax) {
        set({ selectedTargets: [...selectedTargets, playerId] });
      } else if (option.targetMax === 1) {
        set({ selectedTargets: [playerId] });
      }
    }
  },

  confirmPlay: () => {
    const { pending, selected, selectedTargets } = get();
    if (!pending || !selected || pending.kind !== 'play') return;
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

  toggleCardChoice: (cardId) => {
    const { pending, cardChoices } = get();
    if (!pending) return;
    const max = pending.max ?? 1;
    if (cardChoices.includes(cardId)) {
      set({ cardChoices: cardChoices.filter((id) => id !== cardId) });
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
}));

export function randomHeroChoices(n: number): string[] {
  const pool = [...HEROES];
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0].id);
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
