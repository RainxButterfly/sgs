import { invoke } from '@tauri-apps/api/core';
import { Game, buildRoles } from '../core/game';
import { HEROES } from '../core/deck';
import { botAction } from '../core/bot';
import { smartBotAction } from '../core/smartBot';
import type { AskRequest, GameAction, GameEvent, GameIO, Role } from '../core/types';
import { DEFAULT_RULES, type CustomRules } from '../core/types';import {
  redactState,
  type ChatMessage,
  type GuestPayload,
  type HostPayload,
  type LobbyPlayer,
  type LobbyState,
  type RoomInfo,
  type ServerEvent,
  type SpectatorInfo,
} from './protocol';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isAndroidApp(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export async function createRoomInfo(): Promise<RoomInfo> {
  if (isTauri()) return await invoke<RoomInfo>('start_room');
  return { ip: '127.0.0.1', port: 8787, code: 'DEV', secret: 'dev' };
}

export function parseAddress(input: string): { ip: string; port: number } {
  let value = input.trim().replace(/^wss?:\/\//i, '').replace(/\/.*$/, '');
  if (!value) return { ip: '127.0.0.1', port: 8787 };
  const index = value.lastIndexOf(':');
  if (index > 0 && !value.includes('::')) {
    const port = Number(value.slice(index + 1));
    return {
      ip: value.slice(0, index),
      port: Number.isFinite(port) && port > 0 ? port : 8787,
    };
  }
  return { ip: value, port: 8787 };
}

function sanitizeEvent(event: GameEvent): GameEvent | null {
  if (event.type === 'log') return null;
  if (event.type === 'draw') return { ...event, cardIds: [] };
  if (event.type === 'gain' && !event.public) return { ...event, cards: [] };
  return event;
}

class RelayClient {
  private ws: WebSocket | null = null;
  private closed = false;
  onServer?: (event: ServerEvent) => void;
  onPayload?: (from: number, payload: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;

  constructor(private readonly url: string) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.onOpen?.();
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message && typeof message === 'object' && 'server' in message) {
          this.onServer?.(message as ServerEvent);
        } else if (message && typeof message === 'object' && 'payload' in message) {
          this.onPayload?.(Number(message.from ?? 0), message.payload);
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.closed = true;
      this.onClose?.();
    };
    ws.onerror = () => {
      if (this.closed) return;
      this.closed = true;
      this.onClose?.();
    };
  }

  send(payload: unknown, to?: number | null): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ to, payload }));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}

interface HostGuest {
  connId: number;
  name: string;
  playerId: number;
  connected: boolean;
  choices: string[];
  heroId: string | null;
  heroIds: string[];
}

function pairKey(primary: string, secondary: string): string {
  return `${primary}|${secondary}`;
}

function choiceHeroIds(choice: string): string[] {
  const [primary, secondary] = choice.split('|');
  return primary ? (secondary ? [primary, secondary] : [primary]) : [];
}

interface HostHooks {
  askHost: (request: AskRequest) => Promise<GameAction>;
  emitHost: (event: GameEvent) => void;
  onLobby: (lobby: LobbyState) => void;
  onGame: (game: Game) => void;
  onChat: (message: ChatMessage) => void;
  onSpectators: (spectators: SpectatorInfo[]) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export class LanHostManager {
  readonly info: RoomInfo;
  readonly hostName: string;
  lobby: LobbyState;
  game: Game | null = null;
  started = false;
  mode: 'standard' | 'custom' = 'standard';
  rules: CustomRules = { ...DEFAULT_RULES };
  picking = false;
  targetCount = 0;
  roles: Role[] | null = null;
  lordPlayerId: number | null = null;
  lordBotHero: string | null = null;
  private readonly relay: RelayClient;
  private readonly hooks: HostHooks;
  private lastGameHeroes = new Set<string>();
  private chatSeq = 0;
  private hostConnId = 0;
  private hostChoices: string[] = [];
  private hostHeroId: string | null = null;
  private hostHeroIds: string[] = [];
  private guests: HostGuest[] = [];
  private spectators: SpectatorInfo[] = [];
  private pending = new Map<number, { request: AskRequest; resolve: (action: GameAction) => void; timer: ReturnType<typeof setTimeout> }>();
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(info: RoomInfo, hostName: string, hooks: HostHooks) {
    this.info = info;
    this.hostName = hostName;
    this.hooks = hooks;
    this.hostChoices = this.rollChoices();
    this.lobby = this.buildLobby();
    const url = `ws://127.0.0.1:${info.port}/ws?room=${encodeURIComponent(info.code)}&secret=${encodeURIComponent(info.secret)}&name=${encodeURIComponent(hostName)}`;
    this.relay = new RelayClient(url);
    this.relay.onServer = (event) => this.handleServer(event);
    this.relay.onPayload = (from, payload) => this.handleGuestPayload(from, payload);
    this.relay.onClose = () => {
      if (this.closed) return;
      this.hooks.onClosed();
    };
    this.relay.connect();
  }

  private takenHeroIds(includeHost = true): Set<string> {
    const taken = new Set<string>();
    if (includeHost) for (const id of this.hostHeroIds) taken.add(id);
    for (const guest of this.guests) for (const id of guest.heroIds) taken.add(id);
    return taken;
  }

  private rollChoices(): string[] {
    const taken = this.takenHeroIds();
    for (const heroId of this.lastGameHeroes) taken.add(heroId);
    if (this.rules.mode === 'guozhan') {
      const available = new Set(HEROES.map((hero) => hero.id).filter((id) => !taken.has(id)));
      const choices: string[] = [];
      for (let guard = 0; guard < 20 && choices.length < 5; guard += 1) {
        const factions = ['wei', 'shu', 'wu', 'qun'] as const;
        const groups = factions
          .map((faction) => HEROES.filter((hero) => available.has(hero.id) && hero.faction === faction))
          .filter((group) => group.length >= 2);
        if (!groups.length) break;
        const group = groups[Math.floor(Math.random() * groups.length)];
        const first = group[Math.floor(Math.random() * group.length)];
        const secondPool = group.filter((hero) => hero.id !== first.id);
        const second = secondPool[Math.floor(Math.random() * secondPool.length)];
        available.delete(first.id);
        available.delete(second.id);
        choices.push(pairKey(first.id, second.id));
      }
      return choices;
    }
    const pool = HEROES.map((hero) => hero.id).filter((id) => !taken.has(id));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 5);
  }

  private buildLobby(): LobbyState {
    const players: LobbyPlayer[] = [
      {
        playerId: 0,
        connId: this.hostConnId,
        name: this.hostName,
        isHost: true,
        connected: true,
        heroId: this.hostHeroId ?? undefined,
        heroIds: this.hostHeroIds.length ? this.hostHeroIds : undefined,
        choices: this.hostChoices,
      },
      ...this.guests.map((guest) => ({
        playerId: guest.playerId,
        connId: guest.connId,
        name: guest.name,
        isHost: false,
        connected: guest.connected,
        heroId: guest.heroId ?? undefined,
        heroIds: guest.heroIds.length ? guest.heroIds : undefined,
        choices: guest.choices,
      })),
    ];
    const lordGuest =
      this.lordPlayerId != null && this.lordPlayerId > 0
        ? this.guests.find((guest) => guest.playerId === this.lordPlayerId)
        : undefined;
    const lordHeroId =
      this.lordBotHero ??
      (this.lordPlayerId === 0 ? this.hostHeroId : lordGuest?.heroId) ??
      undefined;
    const revealed =
      this.picking &&
      this.hostHeroIds.length > 0 &&
      this.guests.every((guest) => guest.heroIds.length > 0);
    const lordSeat = this.lordPlayerId == null && this.lordBotHero ? this.roles?.indexOf('lord') : undefined;
    return {
      room: {
        ip: this.info.ip,
        ips: this.info.ips,
        names: this.info.names,
        port: this.info.port,
        code: this.info.code,
      },
      hostName: this.hostName,
      players,
      maxPlayers: this.rules.mode === 'duel' ? 2 : this.rules.mode === 'landlord' ? 3 : 8,
      mode: this.mode,
      rules: { ...this.rules },
      picking: this.picking,
      targetCount: this.targetCount || undefined,
      lordPlayerId: this.lordPlayerId,
      lordSeat,
      lordHeroId,
      revealed,
      spectators: this.spectators.map((spectator) => ({ ...spectator })),
    };
  }

  beginPicking(count: number): void {
    if (this.started || this.picking) return;
    this.ensureChoicesForMode();
    const total = Math.max(2, Math.min(8, count));
    const gameMode = this.rules.mode ?? 'identity';
    const roles = buildRoles(total, gameMode);
    for (let i = roles.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    this.roles = roles;
    const lordIndex = roles.indexOf('lord');
    const humans = 1 + this.guests.length;
    const visibleIdentity = total > 2 && (gameMode === 'identity' || gameMode === 'landlord');
    if (!visibleIdentity || lordIndex < 0) {
      this.lordPlayerId = null;
      this.lordBotHero = null;
    } else if (lordIndex < humans) {
      this.lordPlayerId = lordIndex;
      this.lordBotHero = null;
    } else {
      const taken = new Set<string>();
      if (this.hostHeroId) taken.add(this.hostHeroId);
      for (const guest of this.guests) if (guest.heroId) taken.add(guest.heroId);
      const pool = HEROES.filter((hero) => !taken.has(hero.id));
      this.lordPlayerId = null;
      this.lordBotHero = pool[Math.floor(Math.random() * pool.length)]?.id ?? HEROES[0].id;
    }
    this.picking = true;
    this.targetCount = total;
    this.refreshLobby();
  }

  cancelPicking(): void {
    if (!this.picking) return;
    this.picking = false;
    this.targetCount = 0;
    this.roles = null;
    this.lordPlayerId = null;
    this.lordBotHero = null;
    this.refreshLobby();
  }

  setRules(mode: 'standard' | 'custom', rules: CustomRules): void {
    if (this.started || this.picking) return;
    this.mode = mode;
    this.rules = { ...rules };
    this.ensureChoicesForMode();
    this.refreshLobby();
  }

  private refreshLobby(): void {
    this.lobby = this.buildLobby();
    this.hooks.onLobby(this.lobby);
    const guestLobby: LobbyState = {
      ...this.lobby,
      room: {
        ip: this.info.ip,
        port: this.info.port,
        code: this.info.code,
      },
    };
    this.broadcast({ t: 'lobby', lobby: guestLobby } satisfies HostPayload);
  }

  private broadcastSpectators(): void {
    const list = this.spectators.map((spectator) => ({ ...spectator }));
    this.lobby = { ...this.lobby, spectators: list };
    this.hooks.onSpectators(list);
    this.broadcast({ t: 'spectators', spectators: list } satisfies HostPayload);
  }

  private handleServer(event: ServerEvent): void {
    if (event.server === 'welcome') {
      this.hostConnId = event.id;
      this.refreshLobby();
      return;
    }
    if (event.server === 'join') {
      const joinName = event.name || `玩家${event.id}`;
      if (event.spectate) {
        const existing = this.spectators.find((item) => item.name === joinName);
        if (existing) {
          existing.connId = event.id;
          if (event.ip) existing.ip = event.ip;
        } else {
          this.spectators.push({ connId: event.id, name: joinName, ip: event.ip ?? '' });
          if (this.started && this.game) this.game.log(`【${joinName}】进入观战`, 'system');
        }
        this.sendTo(event.id, { t: 'spectate' });
        if (this.started && this.game) {
          this.sendTo(event.id, {
            t: 'state',
            state: redactState(this.game.state, -1),
          });
        }
        this.broadcastSpectators();
        if (!this.started) this.refreshLobby();
        return;
      }
      if (this.started || this.picking) {
        const rejoin = this.guests.find((guest) => !guest.connected && guest.name === joinName);
        if (rejoin) {
          rejoin.connId = event.id;
          rejoin.connected = true;
          if (this.started && this.game) {
            const player = this.game.state.players[rejoin.playerId];
            if (player) player.isBot = false;
            this.sendTo(event.id, { t: 'start', playerId: rejoin.playerId });
            this.sendTo(event.id, {
              t: 'state',
              state: redactState(this.game.state, rejoin.playerId),
            });
            const pending = this.pending.get(rejoin.playerId);
            if (pending) {
              this.sendTo(event.id, {
                t: 'ask',
                request: pending.request,
                state: redactState(this.game.state, rejoin.playerId),
              });
            }
            this.game.log(`【${rejoin.name}】重新连接`, 'system');
            if (this.game.state.over) {
              this.sendTo(event.id, {
                t: 'end',
                text: '对局已经结束',
                winner: this.game.state.winner ?? 'draw',
              });
            }
          } else {
            this.refreshLobby();
          }
          return;
        }
        const spectator = this.spectators.find((item) => item.name === joinName);
        if (spectator) {
          spectator.connId = event.id;
          if (event.ip) spectator.ip = event.ip;
          if (this.started && this.game) {
            this.sendTo(event.id, { t: 'spectate' });
            this.sendTo(event.id, {
              t: 'state',
              state: redactState(this.game.state, -1),
            });
          }
          this.broadcastSpectators();
          return;
        }
        const nextSpectator: SpectatorInfo = {
          connId: event.id,
          name: joinName,
          ip: event.ip ?? '',
        };
        this.spectators.push(nextSpectator);
        if (this.started && this.game) {
          this.sendTo(event.id, { t: 'spectate' });
          this.sendTo(event.id, {
            t: 'state',
            state: redactState(this.game.state, -1),
          });
          this.game.log(`【${joinName}】进入观战`, 'system');
        }
        this.broadcastSpectators();
        return;
      }
      if (this.guests.some((g) => g.connId === event.id)) return;
      this.guests.push({
        connId: event.id,
        name: event.name || `玩家${event.id}`,
        playerId: this.guests.length + 1,
        connected: true,
        choices: this.rollChoices(),
        heroId: null,
        heroIds: [],
      });
      this.refreshLobby();
      return;
    }
    if (event.server === 'leave') {
      const guest = this.guests.find((g) => g.connId === event.id);
      if (!guest) {
        const leaving = this.spectators.find((item) => item.connId === event.id);
        if (!leaving) return;
        this.spectators = this.spectators.filter((item) => item.connId !== event.id);
        this.broadcastSpectators();
        if (this.game && this.started) this.game.log(`【${leaving.name}】离开观战`, 'system');
        return;
      }
      if (this.started) {
        guest.connected = false;
        const player = this.game?.state.players[guest.playerId];
        if (player) player.isBot = true;
        const pending = this.pending.get(guest.playerId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(guest.playerId);
          const fallback = this.game
            ? smartBotAction(this.game.state, pending.request)
            : botAction(pending.request);
          pending.resolve(fallback);
        }
        this.game?.log(`【${guest.name}】已离开，由电脑接管`, 'system');
      } else {
        this.guests = this.guests.filter((g) => g.connId !== event.id);
        this.guests.forEach((g, index) => {
          g.playerId = index + 1;
        });
        this.refreshLobby();
      }
    }
  }

  sendChat(text: string): void {
    const value = text.trim().slice(0, 200);
    if (!value) return;
    this.chatSeq += 1;
    const message: ChatMessage = {
      id: this.chatSeq,
      name: this.hostName,
      text: value,
      at: Date.now(),
    };
    this.hooks.onChat(message);
    this.broadcast({ t: 'chat', message });
  }

  private handleGuestPayload(from: number, payload: unknown): void {
    const message = payload as GuestPayload | undefined;
    if (!message) return;
    const guest = this.guests.find((g) => g.connId === from);
    const spectator = this.spectators.find((item) => item.connId === from);
    if (!guest && !spectator) return;
    if (message.t === 'chat') {
      const value = message.text.trim().slice(0, 200);
      if (!value) return;
      this.chatSeq += 1;
      const chat: ChatMessage = {
        id: this.chatSeq,
        name: guest?.name ?? spectator?.name ?? '观战者',
        text: value,
        at: Date.now(),
      };
      this.hooks.onChat(chat);
      this.broadcast({ t: 'chat', message: chat });
      return;
    }
    if (!guest) return;
    if (message.t === 'action') {
      const pending = this.pending.get(guest.playerId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(guest.playerId);
      pending.resolve(message.action);
      return;
    }
    if (message.t === 'pickHero') {
      this.pickGuestHero(guest.connId, message.heroId);
    }
  }

  pickHostHero(choice: string): void {
    if (this.started || !this.hostChoices.includes(choice)) return;
    const heroIds = choiceHeroIds(choice);
    const expected = this.rules.mode === 'guozhan' ? 2 : 1;
    if (heroIds.length !== expected) return;
    const taken = this.takenHeroIds(false);
    if (heroIds.some((id) => taken.has(id) || id === this.lordBotHero)) return;
    this.hostHeroIds = heroIds;
    this.hostHeroId = heroIds[0];
    this.refreshLobby();
  }

  private pickGuestHero(connId: number, choice: string): void {
    if (this.started) return;
    const guest = this.guests.find((item) => item.connId === connId);
    if (!guest || !guest.choices.includes(choice)) return;
    const heroIds = choiceHeroIds(choice);
    const expected = this.rules.mode === 'guozhan' ? 2 : 1;
    if (heroIds.length !== expected) return;
    const taken = new Set(this.hostHeroIds);
    for (const item of this.guests) {
      if (item.connId !== connId) for (const id of item.heroIds) taken.add(id);
    }
    if (heroIds.some((id) => taken.has(id) || id === this.lordBotHero)) return;
    guest.heroIds = heroIds;
    guest.heroId = heroIds[0];
    this.refreshLobby();
  }

  private ensureChoicesForMode(): void {
    const guozhan = this.rules.mode === 'guozhan';
    const hasPairs = this.hostChoices.some((choice) => choice.includes('|'));
    if (guozhan === hasPairs) return;
    this.hostHeroIds = [];
    this.hostHeroId = null;
    this.hostChoices = this.rollChoices();
    for (const guest of this.guests) {
      guest.heroIds = [];
      guest.heroId = null;
      guest.choices = this.rollChoices();
    }
  }

  private broadcast(payload: HostPayload): void {
    this.relay.send(payload, null);
  }

  private sendTo(connId: number, payload: HostPayload): void {
    this.relay.send(payload, connId);
  }

  private scheduleState(): void {
    if (this.stateTimer || !this.game) return;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.sendStates();
    }, 80);
  }

  private sendStates(): void {
    if (!this.game) return;
    for (const guest of this.guests) {
      if (!guest.connected) continue;
      this.sendTo(guest.connId, {
        t: 'state',
        state: redactState(this.game.state, guest.playerId),
      });
    }
    for (const spectator of this.spectators) {
      this.sendTo(spectator.connId, {
        t: 'state',
        state: redactState(this.game.state, -1),
      });
    }
  }

  private createIO(getGame: () => Game | null): GameIO {
    return {
      emit: (event) => {
        const game = getGame();
        if (!game || this.game !== game || !this.started) return;
        this.hooks.emitHost(event);
        const safe = sanitizeEvent(event);
        if (safe) this.broadcast({ t: 'event', ev: safe });
        this.scheduleState();
        if (event.type === 'gameOver') {
          this.broadcast({ t: 'end', text: event.text, winner: event.winner });
          this.sendStates();
        }
      },
      ask: async (request) => {
        const game = getGame();
        if (!game || this.game !== game || !this.started) return botAction(request);
        if (request.playerId === 0) return this.hooks.askHost(request);
        const player = game.state.players[request.playerId];
        if (!player || player.isBot) {
          await new Promise((resolve) => setTimeout(resolve, 220 + Math.random() * 320));
          return smartBotAction(game.state, request);
        }
        const guest = this.guests.find((g) => g.playerId === request.playerId && g.connected);
        if (!guest) {
          game.log(`【${player.name}】已断线，由电脑代打`, 'system');
          await new Promise((resolve) => setTimeout(resolve, 220 + Math.random() * 320));
          return smartBotAction(game.state, request);
        }
        this.sendTo(guest.connId, {
          t: 'ask',
          request,
          state: redactState(game.state, guest.playerId),
        });
        return await new Promise<GameAction>((resolve) => {
          const timer = setTimeout(() => {
            this.pending.delete(player.id);
            game.log(`【${player.name}】响应超时，由电脑代打`, 'system');
            resolve(smartBotAction(game.state, request));
          }, 180000);
          this.pending.set(player.id, { request, resolve, timer });
        });
      },
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
  }

  startGame(count: number): void {
    if (this.started) return;
    this.ensureChoicesForMode();
    if (!this.hostHeroIds.length || this.guests.some((guest) => !guest.heroIds.length)) return;
    this.picking = false;
    this.targetCount = 0;
    const humans = 1 + this.guests.length;
    const gameMode = this.rules.mode ?? 'identity';
    const minPlayers =
      gameMode === 'duel' ? 2 : gameMode === 'landlord' ? 3 : gameMode === 'guozhan' ? 4 : this.mode === 'custom' ? 2 : 5;
    const maxPlayers = gameMode === 'duel' ? 2 : gameMode === 'landlord' ? 3 : 8;
    if (humans > maxPlayers) {
      this.hooks.onError(`当前模式最多 ${maxPlayers} 名玩家`);
      return;
    }
    const total = Math.max(minPlayers, Math.min(maxPlayers, Math.max(count, humans)));
    this.guests.forEach((guest, index) => {
      guest.playerId = index + 1;
    });

    const botNames = ['电脑·孟德', '电脑·玄德', '电脑·仲谋', '电脑·奉孝', '电脑·子龙', '电脑·公瑾', '电脑·翼德'];
    const players: { name: string; heroId: string; heroIds?: string[]; isBot: boolean }[] = [
      { name: this.hostName, heroId: this.hostHeroId ?? '', heroIds: this.hostHeroIds, isBot: false },
      ...this.guests.map((guest) => ({
        name: guest.name,
        heroId: guest.heroId ?? '',
        heroIds: guest.heroIds,
        isBot: false,
      })),
    ];
    const usedByHumans = new Set(players.flatMap((player) => player.heroIds ?? []));
    const takeBotPair = (): string[] => {
      const factions = ['wei', 'shu', 'wu', 'qun'] as const;
      const groups = factions
        .map((faction) =>
          HEROES.filter((hero) => hero.faction === faction && !usedByHumans.has(hero.id)),
        )
        .filter((group) => group.length >= 2);
      if (!groups.length) return [];
      const group = groups[Math.floor(Math.random() * groups.length)];
      const first = group.splice(Math.floor(Math.random() * group.length), 1)[0];
      const second = group[Math.floor(Math.random() * group.length)];
      usedByHumans.add(first.id);
      usedByHumans.add(second.id);
      return [first.id, second.id];
    };
    for (let i = players.length; i < total; i += 1) {
      if (gameMode === 'guozhan') {
        const heroIds = takeBotPair();
        players.push({
          name: botNames[(i - humans) % botNames.length],
          heroId: heroIds[0] ?? '',
          heroIds: heroIds.length ? heroIds : undefined,
          isBot: true,
        });
      } else {
        players.push({ name: botNames[(i - humans) % botNames.length], heroId: '', isBot: true });
      }
    }

    this.lastGameHeroes = new Set(
      players.flatMap((player) => player.heroIds ?? (player.heroId ? [player.heroId] : [])),
    );
    const roles = this.roles?.length === total ? this.roles : undefined;
    if (roles && this.lordBotHero) {
      const lordIndex = roles.indexOf('lord');
      if (lordIndex >= 0 && lordIndex < players.length) {
        players[lordIndex].heroId = this.lordBotHero;
        players[lordIndex].heroIds = [this.lordBotHero];
      }
    }

    const box: { game: Game | null } = { game: null };
    const game = new Game(
      {
        players,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        roles,
        rules: this.mode === 'custom' || gameMode !== 'identity' ? this.rules : { military: this.rules.military },
      },
      this.createIO(() => box.game),
    );
    box.game = game;
    this.game = game;
    this.started = true;
    for (const guest of this.guests) {
      if (!guest.connected) continue;
      this.sendTo(guest.connId, { t: 'start', playerId: guest.playerId });
      this.sendTo(guest.connId, { t: 'state', state: redactState(game.state, guest.playerId) });
    }
    for (const spectator of this.spectators) {
      this.sendTo(spectator.connId, { t: 'spectate' });
      this.sendTo(spectator.connId, { t: 'state', state: redactState(game.state, -1) });
    }
    this.broadcastSpectators();
    this.hooks.onGame(game);
    game.begin().catch((error) => {
      this.hooks.onError(`对局异常：${(error as Error).message}`);
    });
  }

  returnToLobby(): void {
    this.game?.stop();
    this.game = null;
    this.started = false;
    this.picking = false;
    this.targetCount = 0;
    this.roles = null;
    this.lordPlayerId = null;
    this.lordBotHero = null;
    this.hostHeroId = null;
    this.hostHeroIds = [];
    this.hostChoices = this.rollChoices();
    for (const guest of this.guests) {
      guest.heroId = null;
      guest.heroIds = [];
      guest.choices = this.rollChoices();
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(botAction(pending.request));
    }
    this.pending.clear();
    this.guests = this.guests.filter((guest) => guest.connected);
    this.guests.forEach((guest, index) => {
      guest.playerId = index + 1;
    });
    this.refreshLobby();
  }

  close(): void {
    this.closed = true;
    this.game?.stop();
    this.game = null;
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    this.relay.close();
  }
}

interface ClientHooks {
  onWelcome?: (connId: number) => void;
  onLobby: (lobby: LobbyState) => void;
  onStart: (playerId: number) => void;
  onSpectate: () => void;
  onSpectators: (spectators: SpectatorInfo[]) => void;
  onState: (state: Game['state']) => void;
  onAsk: (request: AskRequest, state: Game['state']) => void;
  onEvent: (event: GameEvent) => void;
  onEnd: (text: string, winner: string) => void;
  onChat: (message: ChatMessage) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export class LanClientManager {
  readonly address: string;
  readonly code: string;
  private readonly relay: RelayClient;
  private readonly hooks: ClientHooks;
  private closedByUser = false;

  constructor(
    ip: string,
    port: number,
    code: string,
    name: string,
    hooks: ClientHooks,
    spectate = false,
  ) {
    this.address = `${ip}:${port}`;
    this.code = code;
    this.hooks = hooks;
    const watch = spectate ? '&spectate=1' : '';
    const url = `ws://${ip}:${port}/ws?room=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}${watch}`;
    this.relay = new RelayClient(url);
    this.relay.onServer = (event) => {
      if (event.server === 'welcome') this.hooks.onWelcome?.(event.id);
      else if (event.server === 'host-left') this.hooks.onError('房主已离开房间');
    };
    this.relay.onPayload = (_from, payload) => this.handlePayload(payload);
    this.relay.onClose = () => {
      if (this.closedByUser) return;
      this.hooks.onClosed();
    };
    this.relay.connect();
  }

  private handlePayload(payload: unknown): void {
    const message = payload as HostPayload | undefined;
    if (!message) return;
    switch (message.t) {
      case 'lobby':
        this.hooks.onLobby(message.lobby);
        break;
      case 'start':
        this.hooks.onStart(message.playerId);
        break;
      case 'spectate':
        this.hooks.onSpectate();
        break;
      case 'spectators':
        this.hooks.onSpectators(message.spectators);
        break;
      case 'state':
        this.hooks.onState(message.state);
        break;
      case 'ask':
        this.hooks.onAsk(message.request, message.state);
        break;
      case 'event':
        this.hooks.onEvent(message.ev);
        break;
      case 'end':
        this.hooks.onEnd(message.text, message.winner);
        break;
      case 'chat':
        this.hooks.onChat(message.message);
        break;
      case 'error':
        this.hooks.onError(message.message);
        this.relay.close();
        break;
    }
  }

  sendAction(action: GameAction): void {
    this.relay.send({ t: 'action', action } satisfies GuestPayload);
  }

  pickHero(heroId: string): void {
    this.relay.send({ t: 'pickHero', heroId } satisfies GuestPayload);
  }

  sendChat(text: string): void {
    const value = text.trim().slice(0, 200);
    if (!value) return;
    this.relay.send({ t: 'chat', text: value } satisfies GuestPayload);
  }

  leave(): void {
    this.closedByUser = true;
    this.relay.send({ t: 'leave' } satisfies GuestPayload);
    this.relay.close();
  }

  close(): void {
    this.closedByUser = true;
    this.relay.close();
  }
}
