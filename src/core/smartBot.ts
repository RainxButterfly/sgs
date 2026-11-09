import { botAction } from './bot';
import type { AskRequest, Card, GameAction, GameState, PlayerState } from './types';

const CARD_VALUE: Record<string, number> = {
  桃: 100,
  闪: 92,
  无懈可击: 88,
  无中生有: 82,
  桃园结义: 72,
  杀: 70,
  五谷丰登: 66,
  万箭齐发: 62,
  决斗: 62,
  南蛮入侵: 60,
  顺手牵羊: 58,
  乐不思蜀: 56,
  过河拆桥: 55,
  借刀杀人: 50,
  闪电: 8,
};

function valueOf(card: Card | undefined): number {
  if (!card) return 0;
  if (card.type === 'equip') {
    if (card.equipSlot === 'weapon') return 58;
    if (card.equipSlot === 'armor') return 62;
    return 54;
  }
  return CARD_VALUE[card.name] ?? 45;
}

function isFriend(state: GameState, me: PlayerState, other: PlayerState): boolean {
  if (other.id === me.id) return true;
  const mode = state.rules?.mode ?? 'identity';
  if (mode === 'guozhan') return other.faction === me.faction;
  if (mode === 'landlord') return (me.role === 'lord') === (other.role === 'lord');
  if (me.role === 'lord' || me.role === 'loyalist') {
    return other.role === 'lord' || other.role === 'loyalist';
  }
  if (me.role === 'rebel') return other.role === 'rebel';
  return false;
}

function isEnemy(state: GameState, me: PlayerState, other: PlayerState): boolean {
  if (other.id === me.id || !other.alive) return false;
  const mode = state.rules?.mode ?? 'identity';
  if (mode === 'guozhan') return other.faction !== me.faction;
  if (mode === 'landlord') return (me.role === 'lord') !== (other.role === 'lord');
  if (mode === 'duel') return true;
  if (me.role === 'lord' || me.role === 'loyalist') {
    return other.role === 'rebel' || other.role === 'traitor';
  }
  if (me.role === 'rebel') return other.role === 'lord' || other.role === 'loyalist';
  const rebelsAlive = state.players.some((p) => p.alive && p.role === 'rebel');
  if (rebelsAlive) return other.role === 'rebel' || other.role === 'loyalist';
  return other.role === 'lord' || other.role === 'loyalist';
}

function friendsOf(state: GameState, me: PlayerState): PlayerState[] {
  return state.players.filter((p) => p.alive && p.id !== me.id && isFriend(state, me, p));
}

function enemiesOf(state: GameState, me: PlayerState): PlayerState[] {
  return state.players.filter((p) => p.alive && p.id !== me.id && isEnemy(state, me, p));
}

function cardInHand(me: PlayerState, id: string): Card | undefined {
  return me.hand.find((c) => c.id === id);
}

function cheapestOption(
  me: PlayerState,
  options: NonNullable<AskRequest['cardOptions']>,
): NonNullable<AskRequest['cardOptions']>[number] {
  const real = options.filter((o) => !o.cardId.startsWith('__'));
  if (!real.length) return options[0];
  return [...real].sort((a, b) => valueOf(cardInHand(me, a.cardId)) - valueOf(cardInHand(me, b.cardId)))[0];
}

function scorePlay(state: GameState, me: PlayerState, option: NonNullable<AskRequest['cardOptions']>[number]): number {
  const name = option.as;
  const targets = option.validTargets.map((id) => state.players[id]).filter((p) => p?.alive);
  const enemyTargets = targets.filter((p) => isEnemy(state, me, p));
  const friends = friendsOf(state, me);
  switch (name) {
    case '桃':
      return me.hp < me.maxHp ? 100 : 0;
    case '无中生有':
      return 85;
    case '五谷丰登':
      return 52;
    case '桃园结义': {
      const woundedFriends = friends.filter((p) => p.hp < p.maxHp).length;
      const woundedEnemies = enemiesOf(state, me).filter((p) => p.hp < p.maxHp).length;
      if (woundedFriends > woundedEnemies) return 45 + woundedFriends * 8;
      return woundedFriends > 0 ? 25 : 0;
    }
    case '杀': {
      if (!enemyTargets.length) return 0;
      const low = Math.min(...enemyTargets.map((p) => p.hp));
      return 70 + (low <= 1 ? 25 : 0);
    }
    case '决斗':
      return enemyTargets.length ? 55 : 0;
    case '过河拆桥':
      return enemyTargets.length ? 52 : 0;
    case '顺手牵羊':
      return enemyTargets.length ? 58 : 0;
    case '乐不思蜀': {
      const valid = enemyTargets.filter((p) => !p.judgeZone.some((c) => c.name === '乐不思蜀'));
      return valid.length ? 56 : 0;
    }
    case '借刀杀人':
      return enemyTargets.length ? 40 : 0;
    case '南蛮入侵':
    case '万箭齐发': {
      if (me.role === 'traitor' && (state.rules?.mode ?? 'identity') === 'identity') return 0;
      const enemies = enemiesOf(state, me).length;
      const friendsCount = friendsOf(state, me).length;
      return enemies >= friendsCount ? 44 : 0;
    }
    case '闪电':
      return 0;
    case '酒':
      return me.hand.some((card) => card.name === '杀') ? 80 : 0;
    case '火攻':
      return enemyTargets.length ? 55 : 0;
    case '兵粮寸断':
      return enemyTargets.length ? 50 : 0;
    case '铁索连环':
      return 20;
    default: {
      const card = cardInHand(me, option.cardId);
      if (card?.equipSlot) {
        const current = me.equips[card.equipSlot];
        if (!current) return 45;
        if (card.equipSlot === 'weapon' && (card.range ?? 1) > (current.range ?? 1)) return 35;
        return 8;
      }
      return 12;
    }
  }
}

function pickTargets(
  state: GameState,
  me: PlayerState,
  option: NonNullable<AskRequest['cardOptions']>[number],
): number[] {
  if (!option.targetMax) return [];
  const pool = option.validTargets.map((id) => state.players[id]).filter((p) => p?.alive);
  const enemies = pool.filter((p) => isEnemy(state, me, p));
  const harmful = ['杀', '决斗', '过河拆桥', '顺手牵羊', '乐不思蜀', '借刀杀人', '火攻', '兵粮寸断'].includes(option.as);
  let chosen = enemies;
  if (!chosen.length) {
    if (harmful) return [];
    chosen = pool;
  }
  if (option.as === '杀' || option.as === '决斗') chosen.sort((a, b) => a.hp - b.hp);
  if (option.as === '过河拆桥' || option.as === '顺手牵羊') chosen.sort((a, b) => b.hand.length - a.hand.length);
  if (option.as === '乐不思蜀') chosen = chosen.filter((p) => !p.judgeZone.some((c) => c.name === '乐不思蜀'));
  if (!chosen.length) return [];
  let count = 1;
  if (option.as === '杀' && option.targetMax > 1) count = option.targetMax;
  count = Math.max(option.targetMin, Math.min(option.targetMax, count));
  return chosen.slice(0, count).map((p) => p.id);
}

function scoreSkill(state: GameState, me: PlayerState, id: string): number {
  const friends = friendsOf(state, me);
  const enemies = enemiesOf(state, me);
  switch (id) {
    case 'zhiheng':
      return me.hand.length >= 2 ? 38 : 0;
    case 'kurou':
      return me.hp >= 3 && me.hand.length <= 2 ? 42 : 0;
    case 'qingnang':
      return me.hand.length > 0 && (me.hp < me.maxHp || friends.some((p) => p.hp < p.maxHp)) ? 52 : 0;
    case 'jieyin':
      return me.hand.length >= 2 && friends.some((p) => p.gender === 'male' && p.hp < p.maxHp) ? 48 : 0;
    case 'fanjian':
      return me.hand.length > 0 && enemies.length > 0 ? 42 : 0;
    case 'lijian':
      return enemies.filter((p) => p.gender === 'male').length >= 2 ? 32 : 0;
    case 'qiangxi':
      return me.equips.weapon || me.hp > 1 ? 50 : 0;
    case 'quhu':
      return me.hand.length > 0 && enemies.some((p) => p.hp > me.hp && p.hand.length > 0) ? 42 : 0;
    case 'tianyi':
      return me.hand.length > 0 && enemies.some((p) => p.hand.length > 0) ? 48 : 0;
    case 'tiaoxin':
      return 42;
    case 'dimeng':
      return 40;
    default:
      return 0;
  }
}

function chooseCards(state: GameState, me: PlayerState, req: AskRequest): GameAction {
  const cards = req.cards ?? [];
  if (!cards.length) return { type: 'chooseCards', cardIds: [] };
  const prompt = req.prompt;
  if (prompt.includes('拼点')) {
    const best = [...cards].sort((a, b) => b.rank - a.rank)[0];
    return { type: 'chooseCards', cardIds: [best.id] };
  }
  if (prompt.includes('五谷')) {
    const best = [...cards].sort((a, b) => valueOf(b) - valueOf(a))[0];
    return { type: 'chooseCards', cardIds: [best.id] };
  }
  if (prompt.includes('遗计')) return { type: 'chooseCards', cardIds: [] };
  if (prompt.includes('观星')) {
    const sorted = [...cards].sort((a, b) => valueOf(b) - valueOf(a));
    const top = sorted.filter((c) => valueOf(c) >= 50).slice(0, 3);
    return { type: 'chooseCards', cardIds: (top.length ? top : sorted.slice(0, 1)).map((c) => c.id) };
  }
  const min = req.min ?? 0;
  const max = req.max ?? cards.length;
  const sorted = [...cards].sort((a, b) => valueOf(a) - valueOf(b));
  if (prompt.includes('制衡')) {
    const keep = sorted.filter((c) => valueOf(c) < 70);
    const count = Math.min(max, Math.max(min, keep.length));
    return { type: 'chooseCards', cardIds: sorted.slice(0, count).map((c) => c.id) };
  }
  const count = Math.max(min, Math.min(max, min || 1));
  return { type: 'chooseCards', cardIds: sorted.slice(0, count).map((c) => c.id) };
}

function choosePlayer(state: GameState, me: PlayerState, req: AskRequest): GameAction {
  const ids = req.players ?? [];
  const candidates = state.players.filter((p) => ids.includes(p.id));
  if (!candidates.length) return { type: 'cancel' };
  const friendly = /青囊|结姻|仁德|回复|交给|救|英魂|节命|补牌/.test(req.prompt);
  const enemies = candidates.filter((p) => isEnemy(state, me, p));
  const friends = candidates.filter((p) => isFriend(state, me, p));
  let pool = friendly ? friends : enemies;
  if (!pool.length) pool = enemies.length ? enemies : candidates;
  if (!pool.length) return { type: 'cancel' };
  pool.sort((a, b) => a.hp - b.hp);
  return { type: 'choosePlayers', playerIds: [pool[0].id] };
}

function chooseOption(state: GameState, me: PlayerState, req: AskRequest): GameAction {
  const options = req.options ?? [];
  if (!options.length) return { type: 'cancel' };
  const ids = options.map((o) => o.id);
  const prompt = req.prompt;
  if (ids.includes('yes') && ids.includes('no')) {
    let yes = true;
    if (prompt.includes('鬼才')) yes = Math.random() < 0.25;
    else if (prompt.includes('流离')) {
      const sourceId = state.current;
      const hasEnemy = state.players.some(
        (p) => p.alive && p.id !== me.id && p.id !== sourceId && isEnemy(state, me, p),
      );
      yes = hasEnemy && Math.random() < 0.65;
    } else if (prompt.includes('克己')) yes = me.hand.length > me.hp;
    else if (prompt.includes('寒冰剑')) yes = Math.random() < 0.5;
    return { type: 'chooseOption', optionId: yes ? 'yes' : 'no' };
  }
  if (ids.includes('discard') && ids.includes('damage')) {
    return { type: 'chooseOption', optionId: me.hand.length >= 2 ? 'discard' : 'damage' };
  }
  if (ids.includes('hp') && ids.includes('weapon')) {
    return { type: 'chooseOption', optionId: me.equips.weapon ? 'weapon' : 'hp' };
  }
  if (ids.includes('discard') && ids.includes('draw')) {
    return { type: 'chooseOption', optionId: me.hand.length > 0 ? 'discard' : 'draw' };
  }
  if (ids.some((id) => ['spade', 'heart', 'club', 'diamond'].includes(id))) {
    const asker = state.players[state.current] ?? me;
    const counts: Record<string, number> = { spade: 0, heart: 0, club: 0, diamond: 0 };
    for (const card of asker.hand) counts[card.suit] += 1;
    const suits: string[] = ['spade', 'heart', 'club', 'diamond'];
    const best = suits.sort((a, b) => counts[b] - counts[a])[0];
    return { type: 'chooseOption', optionId: best };
  }
  const preferred = options.find((o) => o.id !== 'no') ?? options[0];
  return { type: 'chooseOption', optionId: preferred.id };
}

function chooseRespond(state: GameState, me: PlayerState, req: AskRequest): GameAction {
  const options = req.cardOptions ?? [];
  if (!options.length) return { type: 'cancel' };
  const name = req.respondName;
  if (name === '桃') {
    if (req.targetId != null) {
      const target = state.players[req.targetId];
      if (!target || !isFriend(state, me, target)) return { type: 'cancel' };
    }
    const option = cheapestOption(me, options);
    return { type: 'respondCard', cardId: option.cardId, as: option.as, skillId: option.skillId };
  }
  if (name === '无懈可击') {
    const target = req.targetId != null ? state.players[req.targetId] : null;
    const beneficial = /无中生有|桃园结义|五谷丰登/.test(req.prompt);
    const harmful = /杀|决斗|南蛮|万箭|过河|顺手|乐不思蜀|闪电/.test(req.prompt);
    let use = false;
    if (target) {
      if (beneficial) use = isEnemy(state, me, target);
      else if (harmful) use = isFriend(state, me, target);
      else use = isFriend(state, me, target);
    } else {
      use = Math.random() < 0.25;
    }
    if (!use) return { type: 'cancel' };
    const option = options.find((o) => !o.cardId.startsWith('__')) ?? options[0];
    return { type: 'respondCard', cardId: option.cardId, as: option.as, skillId: option.skillId };
  }
  const synthetic = options.find((o) => o.cardId.startsWith('__'));
  if (synthetic) {
    return { type: 'respondCard', cardId: synthetic.cardId, as: synthetic.as, skillId: synthetic.skillId };
  }
  const option = cheapestOption(me, options);
  return { type: 'respondCard', cardId: option.cardId, as: option.as, skillId: option.skillId };
}

export function smartBotAction(state: GameState, req: AskRequest): GameAction {
  const me = state.players[req.playerId];
  if (!me || !me.alive) return botAction(req);
  switch (req.kind) {
    case 'play': {
      const cards = (req.cardOptions ?? [])
        .map((option) => ({ option, score: scorePlay(state, me, option) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      const skills = (req.skillOptions ?? [])
        .map((skill) => ({ skill, score: scoreSkill(state, me, skill.id) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      if (skills.length && (!cards.length || skills[0].score > cards[0].score + 8)) {
        return { type: 'activateSkill', skillId: skills[0].skill.id };
      }
      if (!cards.length) return { type: 'endPlay' };
      const best = cards[0].option;
      const targets = pickTargets(state, me, best);
      if (best.targetMax > 0 && targets.length < best.targetMin) return { type: 'endPlay' };
      return {
        type: 'useCard',
        cardId: best.cardId,
        as: best.as,
        targets,
        skillId: best.skillId,
        element: best.element,
      };
    }
    case 'respond':
      return chooseRespond(state, me, req);
    case 'chooseCards':
      return chooseCards(state, me, req);
    case 'choosePlayer':
      return choosePlayer(state, me, req);
    case 'chooseOption':
      return chooseOption(state, me, req);
    case 'reorder': {
      const cards = [...(req.cards ?? [])].sort((a, b) => valueOf(b) - valueOf(a));
      const topCount = Math.min(2, cards.length);
      return { type: 'chooseCards', cardIds: cards.slice(0, Math.max(1, topCount)).map((c) => c.id) };
    }
    default:
      return botAction(req);
  }
}
