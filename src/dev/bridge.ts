import type { GameState } from '../core/types';
import { HERO_MAP, buildGameDeck } from '../core/deck';
import type { Card } from '../core/types';
import { useGameStore } from '../ui/store';
import {
  DEV_GAME_VERSION_KEY,
  DEV_SESSION_KEY,
  DEV_TOOL_VERSION,
  licenseProblem,
  readSession,
  todayStamp,
  verifyLicense,
  writeSession,
  type DevCardSpec,
  type DevCommand,
  type DevSession,
} from './license';
import { REVOKED_DEV_BATCHES, REVOKED_DEV_SERIALS } from './policy';
import { resolveBinding } from './binding';

const CATALOG = new Map<string, Card>();
for (const card of buildGameDeck(true)) {
  if (!CATALOG.has(card.name)) CATALOG.set(card.name, card);
}

export const DEV_CARD_NAMES = [...CATALOG.keys()].sort((a, b) => a.localeCompare(b, 'zh'));

let seq = 0;
let pickPoolOverride: string[] | null = null;
let started = false;
let lastRaw: string | null = null;
let ticking = false;

export function getDevPickPool(): string[] | null {
  return pickPoolOverride;
}

function makeDevCard(spec: DevCardSpec): Card | null {
  const template = CATALOG.get(spec.name);
  if (!template) return null;
  if (!['spade', 'heart', 'club', 'diamond'].includes(spec.suit)) return null;
  if (!Number.isInteger(spec.rank) || spec.rank < 1 || spec.rank > 13) return null;
  seq += 1;
  return { ...template, id: `dev-${seq}-${spec.suit}-${spec.rank}`, suit: spec.suit, rank: spec.rank };
}

export function applyDevCommandToGame(game: { state: GameState } | null, humanId: number, cmd: DevCommand): string | null {
  if (cmd.type === 'setPickPool') {
    const ids = (cmd.heroIds ?? []).filter((id) => HERO_MAP.has(id));
    if (!ids.length) return '没有有效的武将';
    pickPoolOverride = ids;
    return null;
  }
  if (!game) return '没有进行中的对局，请先开局';
  const human = game.state.players[humanId];
  if (!human) return '找不到你的座位';
  if (cmd.type === 'setHand' || cmd.type === 'addCards' || cmd.type === 'stackDeck') {
    const cards: Card[] = [];
    for (const spec of cmd.cards ?? []) {
      const card = makeDevCard(spec);
      if (!card) return `无法生成牌：${spec.name}`;
      cards.push(card);
    }
    if (!cards.length) return '没有指定牌';
    if (cmd.type === 'setHand') human.hand = cards;
    else if (cmd.type === 'addCards') human.hand.push(...cards);
    else for (const card of [...cards].reverse()) game.state.deck.push(card);
    return null;
  }
  if (cmd.type === 'setHero') {
    const hero = HERO_MAP.get(cmd.heroId ?? '');
    if (!hero) return '未知武将';
    human.heroId = hero.id;
    human.heroIds = [hero.id];
    human.heroName = hero.name;
    human.faction = hero.faction;
    human.gender = hero.gender;
    if (game.state.rules.skillsEnabled) {
      human.skills = [
        ...hero.skillIds,
        ...(human.role === 'lord' && hero.lordSkillId ? [hero.lordSkillId] : []),
      ];
    }
    human.hp = Math.min(human.hp, human.maxHp);
    return null;
  }
  if (cmd.type === 'setHp') {
    human.hp = Math.max(1, Math.min(human.maxHp, Math.round(cmd.hp ?? human.hp)));
    return null;
  }
  if (cmd.type === 'setRole') {
    if (game.state.rules.mode !== 'identity') return '当前模式不支持设置身份';
    const role = cmd.role ?? '';
    if (!['lord', 'loyalist', 'rebel', 'renegade'].includes(role)) return '未知身份';
    human.role = role as typeof human.role;
    if (role === 'lord') human.roleRevealed = true;
    return null;
  }
  return '未知指令';
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (raw === lastRaw) return;
    lastRaw = raw;
    const store = useGameStore.getState();
    if (!raw) {
      pickPoolOverride = null;
      useGameStore.setState({ devStatus: 'off', devMessage: '', devBatch: '' });
      return;
    }
    let session: DevSession | null = null;
    try {
      session = JSON.parse(raw) as DevSession;
    } catch {
      session = null;
    }
    if (!session || typeof session.code !== 'string' || !Array.isArray(session.commands)) {
      useGameStore.setState({
        devStatus: 'blocked',
        devMessage: '测试工具警告：测试会话数据损坏，指令不会被执行。仅警告，不影响对局。',
        devBatch: '',
      });
      return;
    }
    const env = {
      gameVersion: store.appVersion,
      toolVersion: DEV_TOOL_VERSION,
      revoked: REVOKED_DEV_BATCHES,
      revokedSerials: REVOKED_DEV_SERIALS,
      today: todayStamp(),
    };
    const fields = await verifyLicense(session.code);
    const problem = fields ? licenseProblem(fields, env) : '授权码签名无效或格式错误';
    let bindingIssue: string | null = null;
    if (fields && !problem) {
      const bind = await resolveBinding(session.code, fields, env);
      if (!bind.ok) bindingIssue = bind.reason;
    }
    const effectiveProblem = problem ?? bindingIssue;
    let changed = false;
    if (!fields || effectiveProblem) {
      pickPoolOverride = null;
      for (const cmd of session.commands) {
        if (cmd.status === 'pending') {
          cmd.status = 'rejected';
          cmd.note = effectiveProblem ?? '授权无效';
          changed = true;
        }
      }
      useGameStore.setState({
        devStatus: 'blocked',
        devMessage: `测试工具警告：${effectiveProblem}。本局不接受该授权的测试指令；仅警告，不会关闭或影响对局。`,
        devBatch: fields?.batch ?? '',
      });
    } else {
      useGameStore.setState({ devStatus: 'active', devMessage: '', devBatch: fields.batch });
      const state = useGameStore.getState();
      for (const cmd of session.commands) {
        if (cmd.status !== 'pending') continue;
        changed = true;
        if (state.lanRole === 'client') {
          cmd.status = 'rejected';
          cmd.note = '联机客机不支持测试指令';
          continue;
        }
        const note = applyDevCommandToGame(state.game, state.humanId, cmd);
        if (note) {
          cmd.status = 'rejected';
          cmd.note = note;
        } else {
          cmd.status = 'applied';
          cmd.note = cmd.type === 'setPickPool' ? '已生效，下次选将使用指定候选' : '已生效';
          if (cmd.type !== 'setPickPool') useGameStore.setState({ devTainted: true });
        }
      }
      if (session.commands.some((cmd) => cmd.status === 'applied')) {
        useGameStore.setState({ version: useGameStore.getState().version + 1 });
      }
    }
    if (changed) {
      session.updatedAt = Date.now();
      writeSession(session);
      lastRaw = localStorage.getItem(DEV_SESSION_KEY);
    }
  } finally {
    ticking = false;
  }
}

export function initDevBridge(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    localStorage.setItem(DEV_GAME_VERSION_KEY, useGameStore.getState().appVersion);
  } catch {
    // ignore storage failures
  }
  window.addEventListener('storage', (event) => {
    if (event.key === DEV_SESSION_KEY) void tick();
  });
  window.setInterval(() => void tick(), 1000);
  void tick();
}