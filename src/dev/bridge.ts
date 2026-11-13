import type { Card, GameState, PlayerState } from '../core/types';
import { HERO_MAP, buildGameDeck } from '../core/deck';
import { useGameStore } from '../ui/store';
import {
  DEV_GAME_VERSION_KEY,
  DEV_SESSION_KEY,
  DEV_TOOL_VERSION,
  licenseAllowsLan,
  licenseProblem,
  readSession,
  todayStamp,
  verifyLicense,
  writeSession,
  type DevCardSpec,
  type DevCommand,
  type DevSession,
  type LicenseFields,
} from './license';
import { REVOKED_DEV_BATCHES, REVOKED_DEV_SERIALS } from './policy';
import { resolveBinding } from './binding';

const CATALOG = new Map<string, Card>();
for (const card of buildGameDeck(true)) {
  if (!CATALOG.has(card.name)) CATALOG.set(card.name, card);
}

export const DEV_CARD_NAMES = [...CATALOG.keys()].sort((a, b) => a.localeCompare(b, 'zh'));

/** 允许延时锦囊，供「贴判定牌」使用 */
const JUDGE_CARDS = ['乐不思蜀', '兵粮寸断', '闪电'];

interface DevGame {
  state: GameState;
  drawCards?: (player: PlayerState, count: number, reason?: string) => Card[];
  devKillPlayer?: (playerId: number) => Promise<boolean>;
  devEndGame?: (winner: 'loyalist' | 'rebel' | 'draw') => void;
  devAnnounce?: (playerId: number, text: string) => void;
  attackRange?: (player: PlayerState) => number;
}

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

function judgeCard(name: string): Card {
  seq += 1;
  const card = CATALOG.get(name) ?? CATALOG.get('乐不思蜀');
  return {
    ...(card ?? { name: '乐不思蜀', suit: 'spade' as Card['suit'], rank: 6, type: 'delayed' as Card['type'] }),
    id: `dev-judge-${seq}`,
    name,
    type: 'delayed',
  };
}

/** 给玩家看的操作描述（会出现在联机弹窗与战报里） */
export function describeCommand(cmd: DevCommand): string {
  switch (cmd.type) {
    case 'setHand':
      return `将自己的手牌替换为 ${(cmd.cards ?? []).map((c) => c.name).join('、')}`;
    case 'addCards':
      return `给自己添加了 ${(cmd.cards ?? []).map((c) => c.name).join('、')}`;
    case 'stackDeck':
      return `将 ${(cmd.cards ?? []).map((c) => c.name).join('、')} 置于牌堆顶`;
    case 'setHero':
      return `将武将换成【${HERO_MAP.get(cmd.heroId ?? '')?.name ?? cmd.heroId}】`;
    case 'setPickPool':
      return `指定了 ${(cmd.heroIds ?? []).length} 名候选武将`;
    case 'setHp':
      return `将体力设为 ${cmd.hp}`;
    case 'setMaxHp':
      return `将体力上限设为 ${cmd.hp}`;
    case 'healFull':
      return '将体力恢复到上限';
    case 'drawCards':
      return `摸了 ${cmd.count ?? 1} 张牌`;
    case 'setRole':
      return `将自己的身份改为 ${cmd.role ?? ''}`;
    case 'setChained':
      return '切换了自己的铁索（横置）状态';
    case 'setFlipped':
      return '切换了自己的翻面状态';
    case 'addJudge':
      return `给自己贴上了【${cmd.judge ?? '乐不思蜀'}】`;
    case 'clearJudges':
      return '清空了自己的判定区';
    case 'killSelf':
      return '直接令自己阵亡';
    case 'killOthers':
      return '令其他所有角色阵亡';
    case 'endGame':
      return `直接结束对局（${cmd.winner === 'loyalist' ? '甲队胜' : cmd.winner === 'rebel' ? '乙队胜' : '平局'}）`;
    default:
      return '执行了测试指令';
  }
}

export async function applyDevCommandToGame(
  game: DevGame | null,
  humanId: number,
  cmd: DevCommand,
): Promise<string | null> {
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

  if (cmd.type === 'setMaxHp') {
    human.maxHp = Math.max(1, Math.min(12, Math.round(cmd.hp ?? human.maxHp)));
    human.hp = Math.min(human.hp, human.maxHp);
    return null;
  }

  if (cmd.type === 'healFull') {
    human.hp = human.maxHp;
    return null;
  }

  if (cmd.type === 'drawCards') {
    const count = Math.max(1, Math.min(10, Math.round(cmd.count ?? 1)));
    game.drawCards?.(human, count, '测试工具');
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

  if (cmd.type === 'setChained') {
    human.chained = !human.chained;
    return null;
  }

  if (cmd.type === 'setFlipped') {
    human.flipped = !human.flipped;
    return null;
  }

  if (cmd.type === 'addJudge') {
    const name = JUDGE_CARDS.includes(cmd.judge ?? '') ? (cmd.judge as string) : '乐不思蜀';
    human.judgeZone.push(judgeCard(name));
    return null;
  }

  if (cmd.type === 'clearJudges') {
    human.judgeZone = [];
    return null;
  }

  if (cmd.type === 'killSelf') {
    const ok = await game.devKillPlayer?.(humanId);
    return ok ? null : '你自己已经阵亡';
  }

  if (cmd.type === 'killOthers') {
    let killed = 0;
    for (const player of game.state.players) {
      if (player.id === humanId || !player.alive) continue;
      const ok = await game.devKillPlayer?.(player.id);
      if (ok) killed += 1;
    }
    return killed > 0 ? null : '没有可阵亡的其他角色';
  }

  if (cmd.type === 'endGame') {
    game.devEndGame?.(cmd.winner ?? 'draw');
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
    const fields: LicenseFields | null = await verifyLicense(session.code);
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
      const inLan = state.lanRole === 'host' || state.lanRole === 'client';
      for (const cmd of session.commands) {
        if (cmd.status !== 'pending') continue;
        changed = true;
        if (inLan && state.lanRole === 'client') {
          cmd.status = 'rejected';
          cmd.note = '联机客机不自带引擎，请由房主在本机使用测试工具';
          continue;
        }
        if (inLan && !licenseAllowsLan(fields)) {
          cmd.status = 'rejected';
          cmd.note = '该授权码仅限单机使用，联机需要使用「单机+联机」类型的授权码';
          continue;
        }
        const game = state.game as unknown as DevGame | null;
        const note = await applyDevCommandToGame(game, state.humanId, cmd);
        if (note) {
          cmd.status = 'rejected';
          cmd.note = note;
        } else {
          cmd.status = 'applied';
          cmd.note = cmd.type === 'setPickPool' ? '已生效，下次选将使用指定候选' : '已生效';
          if (cmd.type !== 'setPickPool') useGameStore.setState({ devTainted: true });
          // 联机：向全场广播，其他玩家会收到弹窗并写入战报
          if (inLan) game?.devAnnounce?.(state.humanId, describeCommand(cmd));
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
