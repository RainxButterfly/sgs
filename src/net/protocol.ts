import type { AskRequest, Card, CustomRules, GameAction, GameEvent, GameState, PlayerState, Role } from '../core/types';

export interface RoomInfo {
  ip: string;
  ips?: string[];
  names?: string[];
  port: number;
  code: string;
  secret: string;
}

export interface RoomAddress {
  ip: string;
  ips?: string[];
  names?: string[];
  port: number;
  code: string;
}

export interface LobbyPlayer {
  playerId: number;
  connId: number;
  name: string;
  isHost: boolean;
  connected: boolean;
  heroId?: string;
  heroIds?: string[];
  choices?: string[];
}

export interface SpectatorInfo {
  connId: number;
  name: string;
  ip: string;
}

export interface LobbyState {
  room: RoomAddress;
  hostName: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  mode: 'standard' | 'custom';
  rules: CustomRules;
  picking?: boolean;
  targetCount?: number;
  lordPlayerId?: number | null;
  lordSeat?: number;
  lordHeroId?: string;
  revealed?: boolean;
  spectators?: SpectatorInfo[];
}

export type ServerEvent =
  | { server: 'welcome'; id: number; role: 'host' | 'guest' }
  | { server: 'join'; id: number; name: string; ip?: string; spectate?: boolean }
  | { server: 'leave'; id: number; name: string }
  | { server: 'host-left' };

export interface ChatMessage {
  id: number;
  name: string;
  text: string;
  at: number;
  playerId?: number;
}

export type HostPayload =
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'start'; playerId: number }
  | { t: 'role'; role: Role }
  | { t: 'spectate' }
  | { t: 'spectators'; spectators: SpectatorInfo[] }
  | { t: 'state'; state: GameState }
  | { t: 'ask'; request: AskRequest; state: GameState }
  | { t: 'event'; ev: GameEvent }
  | { t: 'end'; text: string; winner: string }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'error'; message: string };

export type GuestPayload =
  | { t: 'action'; action: GameAction }
  | { t: 'pickHero'; heroId: string }
  | { t: 'chat'; text: string }
  | { t: 'leave' };

function hiddenCard(playerId: number, index: number): Card {
  return {
    id: `hidden-${playerId}-${index}`,
    name: '未知',
    suit: 'spade',
    rank: 1,
    type: 'basic',
  };
}

function redactPlayer(player: PlayerState, viewerId: number, over: boolean): PlayerState {
  const isSelf = player.id === viewerId;
  const hand = isSelf
    ? player.hand
    : Array.from({ length: player.hand.length }, (_, i) => hiddenCard(player.id, i));
  return {
    ...player,
    hand,
    role: over || isSelf || player.roleRevealed || !player.alive ? player.role : 'rebel',
    flags: isSelf ? player.flags : {},
  };
}

export function spectateState(state: GameState): GameState {
  return {
    ...state,
    seed: 0,
    deck: [],
    deckCount: state.deck.length,
    discard: state.discard,
    discardCount: state.discard.length,
    log: state.log.slice(-150),
  };
}

export function redactState(state: GameState, viewerId: number): GameState {
  const roleCounts: Record<Role, number> = { lord: 0, loyalist: 0, rebel: 0, traitor: 0 };
  for (const player of state.players) {
    if (player.alive) roleCounts[player.role] += 1;
  }
  return {
    ...state,
    seed: 0,
    players: state.players.map((p) => redactPlayer(p, viewerId, state.over)),
    deck: [],
    discard: state.discard,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    roleCounts,
    log: state.log.slice(-150),
  };
}
