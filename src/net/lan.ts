import { invoke } from '@tauri-apps/api/core';
import { Game } from '../core/game';
import { botAction } from '../core/bot';
import { smartBotAction } from '../core/smartBot';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../core/types';
import { DEFAULT_RULES, type CustomRules } from '../core/types';import {
  redactState,
  type GuestPayload,
  type HostPayload,
  type LobbyPlayer,
  type LobbyState,
  type RoomInfo,
  type ServerEvent,
} from './protocol';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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
}

interface HostHooks {
  askHost: (request: AskRequest) => Promise<GameAction>;
  emitHost: (event: GameEvent) => void;
  onLobby: (lobby: LobbyState) => void;
  onGame: (game: Game) => void;
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
  private readonly relay: RelayClient;
  private readonly hooks: HostHooks;
  private hostConnId = 0;
  private guests: HostGuest[] = [];
  private pending = new Map<number, { request: AskRequest; resolve: (action: GameAction) => void; timer: ReturnType<typeof setTimeout> }>();
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(info: RoomInfo, hostName: string, hooks: HostHooks) {
    this.info = info;
    this.hostName = hostName;
    this.hooks = hooks;
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

  private buildLobby(): LobbyState {
    const players: LobbyPlayer[] = [
      {
        playerId: 0,
        connId: this.hostConnId,
        name: this.hostName,
        isHost: true,
        connected: true,
      },
      ...this.guests.map((guest) => ({
        playerId: guest.playerId,
        connId: guest.connId,
        name: guest.name,
        isHost: false,
        connected: guest.connected,
      })),
    ];
    return {
      room: { ip: this.info.ip, ips: this.info.ips, port: this.info.port, code: this.info.code },
      hostName: this.hostName,
      players,
      maxPlayers: 8,
      mode: this.mode,
      rules: { ...this.rules },
    };
  }

  setRules(mode: 'standard' | 'custom', rules: CustomRules): void {
    if (this.started) return;
    this.mode = mode;
    this.rules = { ...rules };
    this.refreshLobby();
  }

  private refreshLobby(): void {
    this.lobby = this.buildLobby();
    this.hooks.onLobby(this.lobby);
    this.broadcast({ t: 'lobby', lobby: this.lobby } satisfies HostPayload);
  }

  private handleServer(event: ServerEvent): void {
    if (event.server === 'welcome') {
      this.hostConnId = event.id;
      this.refreshLobby();
      return;
    }
    if (event.server === 'join') {
      if (this.started) {
        this.relay.send({ t: 'error', message: '对局已经开始，请等待下一局' } satisfies HostPayload, event.id);
        return;
      }
      if (this.guests.some((g) => g.connId === event.id)) return;
      this.guests.push({
        connId: event.id,
        name: event.name || `玩家${event.id}`,
        playerId: this.guests.length + 1,
        connected: true,
      });
      this.refreshLobby();
      return;
    }
    if (event.server === 'leave') {
      const guest = this.guests.find((g) => g.connId === event.id);
      if (!guest) return;
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

  private handleGuestPayload(from: number, payload: unknown): void {
    const message = payload as GuestPayload | undefined;
    if (!message) return;
    const guest = this.guests.find((g) => g.connId === from);
    if (!guest) return;
    if (message.t === 'action') {
      const pending = this.pending.get(guest.playerId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(guest.playerId);
      pending.resolve(message.action);
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
    const humans = 1 + this.guests.length;
    const minPlayers = this.mode === 'custom' ? 2 : 5;
    const total = Math.max(minPlayers, Math.min(8, Math.max(count, humans)));
    this.guests.forEach((guest, index) => {
      guest.playerId = index + 1;
    });

    const botNames = ['电脑·孟德', '电脑·玄德', '电脑·仲谋', '电脑·奉孝', '电脑·子龙', '电脑·公瑾', '电脑·翼德'];
    const players: { name: string; heroId: string; isBot: boolean }[] = [
      { name: this.hostName, heroId: '', isBot: false },
      ...this.guests.map((guest) => ({ name: guest.name, heroId: '', isBot: false })),
    ];
    for (let i = players.length; i < total; i += 1) {
      players.push({ name: botNames[(i - humans) % botNames.length], heroId: '', isBot: true });
    }

    const box: { game: Game | null } = { game: null };
    const game = new Game(
      {
        players,
        seed: (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0,
        rules: this.mode === 'custom' ? this.rules : undefined,
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
    this.hooks.onGame(game);
    game.begin().catch((error) => {
      this.hooks.onError(`对局异常：${(error as Error).message}`);
    });
  }

  returnToLobby(): void {
    this.game?.stop();
    this.game = null;
    this.started = false;
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
  onLobby: (lobby: LobbyState) => void;
  onStart: (playerId: number) => void;
  onState: (state: Game['state']) => void;
  onAsk: (request: AskRequest, state: Game['state']) => void;
  onEvent: (event: GameEvent) => void;
  onEnd: (text: string, winner: string) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export class LanClientManager {
  readonly address: string;
  readonly code: string;
  private readonly relay: RelayClient;
  private readonly hooks: ClientHooks;
  private closedByUser = false;

  constructor(ip: string, port: number, code: string, name: string, hooks: ClientHooks) {
    this.address = `${ip}:${port}`;
    this.code = code;
    this.hooks = hooks;
    const url = `ws://${ip}:${port}/ws?room=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`;
    this.relay = new RelayClient(url);
    this.relay.onServer = (event) => {
      if (event.server === 'host-left') this.hooks.onError('房主已离开房间');
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
      case 'error':
        this.hooks.onError(message.message);
        this.relay.close();
        break;
    }
  }

  sendAction(action: GameAction): void {
    this.relay.send({ t: 'action', action } satisfies GuestPayload);
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
