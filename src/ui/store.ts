import { create } from 'zustand';
import { Game } from '../core/game';
import { HEROES } from '../core/deck';
import { botAction } from '../core/bot';
import { smartBotAction } from '../core/smartBot';
import { LanClientManager, LanHostManager, createRoomInfo, isTauri, parseAddress } from '../net/lan';
import type { LobbyState, RoomInfo } from '../net/protocol';
import { checkAppUpdate, installAppUpdate, type AppUpdateInfo } from './update';
import type {
  AskRequest,
  Card,
  CardOption,
  CustomRules,
  GameAction,
  GameEvent,
  GameIO,
  GameState,
} from '../core/types';

type Screen = 'menu' | 'setup' | 'lan' | 'lobby' | 'gallery' | 'game' | 'result';

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

interface GameStore {
  screen: Screen;
  game: GameLike | null;
  humanId: number;
  version: number;
  pending: AskRequest | null;
  result: { text: string; winner: string } | null;
  lastPlay: PlayEvent | null;
  lastJudge: JudgeEvent | null;
  flash: FlashEvent | null;
  error: string | null;
  lanRole: 'host' | 'client' | null;
  lanHost: LanHostManager | null;
  lanClient: LanClientManager | null;
  room: RoomInfo | null;
  lobby: LobbyState | null;
  netError: string | null;
  lanPlayerId: number;
  joinPreset: { address: string; code: string } | null;
  appVersion: string;
  updateInfo: AppUpdateInfo | null;
  updateState: UpdateState;
  updateProgress: { downloaded: number; total: number };
  updateError: string | null;
  updateModalOpen: boolean;

  selected: { cardId: string; as: string; skillId?: string } | null;
  selectedTargets: number[];
  asChooser: AsChooser | null;
  cardChoices: string[];
  reorderTop: string[];

  initLocal: (count: number, heroId: string, rules?: Partial<CustomRules>) => void;
  backToMenu: () => void;
  restart: () => void;
  createLanRoom: (name: string) => Promise<void>;
  joinLanRoom: (address: string, code: string, name: string) => Promise<void>;
  startLanGame: (count: number) => void;
  setLanRules: (mode: 'standard' | 'custom', rules: CustomRules) => void;
  leaveLan: () => void;
  checkUpdate: (manual?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  openUpdateModal: () => void;
  closeUpdateModal: () => void;
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
}

let resolveAsk: ((action: GameAction) => void) | null = null;
let eventSeq = 0;

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
  humanId: 0,
  version: 0,
  pending: null,
  result: null,
  lastPlay: null,
  lastJudge: null,
  flash: null,
  error: null,
  lanRole: null,
  lanHost: null,
  lanClient: null,
  room: null,
  lobby: null,
  netError: null,
  lanPlayerId: 0,
  joinPreset: null,
  appVersion: APP_VERSION,
  updateInfo: null,
  updateState: 'idle',
  updateProgress: { downloaded: 0, total: 0 },
  updateError: null,
  updateModalOpen: false,
  selected: null,
  selectedTargets: [],
  asChooser: null,
  cardChoices: [],
  reorderTop: [],

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
      humanId: 0,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      pending: null,
      result: null,
      lastPlay: null,
      lastJudge: null,
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
    resolveAsk = null;
    set({
      screen: 'menu',
      game: null,
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
      lastPlay: null,
      lastJudge: null,
      flash: null,
    });
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
        flash: null,
        version: get().version + 1,
      });
      return;
    }
    game?.stop?.();
    set({ screen: 'setup', game: null, result: null, pending: null, version: get().version + 1 });
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
            lanPlayerId: 0,
            pending: null,
            result: null,
            lastPlay: null,
            lastJudge: null,
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
      set({
        lanRole: 'host',
        lanHost: host,
        lanClient: null,
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
    const client = new LanClientManager(ip, port, cleanCode, name.trim() || '玩家', {
      onLobby: (lobby) =>
        set({
          lobby,
          screen: 'lobby',
          result: null,
          pending: null,
          game: null,
          lastPlay: null,
          lastJudge: null,
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
        set({ result: { text, winner } });
        setTimeout(() => {
          if (get().result) set({ screen: 'result' });
        }, 1400);
      },
      onError: (message) => set({ netError: message }),
      onClosed: () =>
        set({
          netError: '连接已断开',
          lanClient: null,
          lanRole: null,
          game: null,
          pending: null,
          screen: 'lan',
        }),
    });
    set({
      lanRole: 'client',
      lanClient: client,
      lanHost: null,
      room: { ip, port, code: cleanCode, secret: '' },
      lobby: null,
      screen: 'lobby',
      netError: null,
      game: null,
      result: null,
      pending: null,
      version: get().version + 1,
    });
  },

  startLanGame: (count) => {
    get().lanHost?.startGame(count);
  },

  setLanRules: (mode, rules) => {
    get().lanHost?.setRules(mode, rules);
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
      const info = await checkAppUpdate();
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

  leaveLan: () => {
    get().lanHost?.close();
    get().lanClient?.leave();
    resolveAsk = null;
    set({
      screen: 'menu',
      game: null,
      pending: null,
      result: null,
      lanRole: null,
      lanHost: null,
      lanClient: null,
      room: null,
      lobby: null,
      netError: null,
      lanPlayerId: 0,
      lastPlay: null,
      lastJudge: null,
      flash: null,
    });
  },

  event: (ev) => {
    const state = get();
    const patch: Partial<GameStore> = { version: state.version + 1 };
    if (ev.type === 'playCard' || ev.type === 'respond') {
      eventSeq += 1;
      patch.lastPlay = {
        id: eventSeq,
        playerId: ev.playerId,
        card: ev.card,
        as: ev.as,
        targets: ev.type === 'playCard' ? ev.targets : [],
      };
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
      version: get().version + 1,
    });
    resolve?.(action);
  },

  selectCard: (cardId) => {
    const { pending, selectedTargets } = get();
    if (!pending?.cardOptions) return;
    const options = pending.cardOptions.filter((o) => o.cardId === cardId);
    if (!options.length) return;
    if (options.length === 1) {
      const option = options[0];
      if (pending.kind === 'respond') {
        get().submit({ type: 'respondCard', cardId, as: option.as, skillId: option.skillId });
        return;
      }
      set({
        selected: { cardId, as: option.as, skillId: option.skillId },
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
      selected: { cardId: asChooser.cardId, as, skillId: option?.skillId },
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
