import { HERO_MAP } from '../core/deck';
import { equipSkillId } from '../core/equipment';
import type { Card, EquipSlot, GameMode, PlayerState, Suit } from '../core/types';

export const SUIT_CHAR: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

export function rankText(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function isRedCard(card: Card): boolean {
  return card.suit === 'heart' || card.suit === 'diamond';
}

export function cardTypeText(card: Card): string {
  if (card.type === 'basic') return '基本';
  if (card.type === 'trick') return '锦囊';
  if (card.type === 'delayed') return '延时';
  return '装备';
}

export function equipSlotText(slot?: EquipSlot): string {
  if (!slot) return '';
  return { weapon: '武器', armor: '防具', horsePlus: '+1马', horseMinus: '-1马' }[slot];
}

export function cardDisplayName(card: Card): string {
  if (card.name === '杀' && card.element === 'fire') return '火杀';
  if (card.name === '杀' && card.element === 'thunder') return '雷杀';
  return card.name;
}

const SELF_TARGET_CARDS = ['桃', '酒', '无中生有', '闪电'];
const AOE_TARGET_CARDS = ['南蛮入侵', '万箭齐发', '桃园结义', '五谷丰登'];

export function playTargetText(
  ids: number[],
  card: Card | undefined,
  as: string | undefined,
  nameOf: (id: number) => string,
): string {
  if (ids.length > 0) {
    return ids.length > 3
      ? `${ids.slice(0, 3).map(nameOf).join('、')} 等 ${ids.length} 人`
      : ids.map(nameOf).join('、');
  }
  const name = as ?? card?.name ?? '';
  if (card?.equipSlot || SELF_TARGET_CARDS.includes(name)) return '对自己';
  if (AOE_TARGET_CARDS.includes(name)) return '全体角色';
  return '无目标';
}

export function shortCardName(name: string): string {
  if (name === '雌雄双股剑') return '雌雄剑';
  if (name === '青龙偃月刀') return '青龙刀';
  if (name === '诸葛连弩') return '连弩';
  return name;
}

export function cardSuitText(card: Card): string {
  return `${SUIT_CHAR[card.suit]}${rankText(card.rank)}`;
}

export function factionKnown(player: PlayerState, mode: GameMode, self = false): boolean {
  if (mode !== 'guozhan' || self) return true;
  return !!player.generalRevealed?.some(Boolean);
}

export function visibleHeroNames(player: PlayerState, mode: GameMode, self = false): string {
  if (mode !== 'guozhan' || !player.generalRevealed) return playerHeroNames(player);
  const ids = player.heroIds?.length ? player.heroIds : [player.heroId];
  const names = ids
    .map((id, index) => (player.generalRevealed?.[index] || self ? HERO_MAP.get(id)?.name : null))
    .filter((name): name is string => !!name);
  return names.length ? names.join('·') : '暗将';
}

export function visibleSkillIds(player: PlayerState, mode: GameMode, self = false): string[] {
  const ids = generalSkillIds(player, mode, self);
  for (const card of Object.values(player.equips)) {
    if (!card) continue;
    const id = equipSkillId(card.name);
    if (id) ids.add(id);
  }
  return [...ids];
}

function generalSkillIds(player: PlayerState, mode: GameMode, self = false): Set<string> {
  if (mode !== 'guozhan' || !player.generalSkills) {
    return new Set([...player.skills, ...player.extraSkills]);
  }
  const ids = new Set<string>();
  player.generalSkills.forEach((skills, index) => {
    if (player.generalRevealed?.[index] || self) {
      for (const id of skills) ids.add(id);
    }
  });
  if (self || player.generalRevealed?.some(Boolean)) {
    for (const id of player.extraSkills) ids.add(id);
  }
  return ids;
}

export interface HeroSkillGroup {
  heroId: string;
  name: string;
  title?: string;
  label: string | null;
  skillIds: string[];
  revealed: boolean;
}

export function heroSkillGroups(player: PlayerState, mode: GameMode, self = false): HeroSkillGroup[] {
  const ids = player.heroIds?.length ? player.heroIds : [player.heroId];
  return ids.map((id, index) => {
    const hero = HERO_MAP.get(id);
    return {
      heroId: id,
      name: hero?.name ?? '',
      title: hero?.title,
      label: ids.length > 1 ? (index === 0 ? '主将' : '副将') : null,
      skillIds: player.generalSkills?.[index] ?? hero?.skillIds ?? [],
      revealed: mode !== 'guozhan' || self || !!player.generalRevealed?.[index],
    };
  });
}

export function playerHeroNames(player: PlayerState): string {
  const ids = player.heroIds?.length ? player.heroIds : [player.heroId];
  const names = ids.map((id) => HERO_MAP.get(id)?.name).filter((name): name is string => !!name);
  return names.length ? names.join('·') : player.heroName;
}

const TABLE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 座次序号：以先手（anchor）为 1 号位，沿本局出牌方向递增。
 * 选将页与牌桌共用同一套算法，保证两边显示的号位一致。
 */
export function seatNumber(index: number, anchor: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return (((index - anchor) * direction) % total + total) % total + 1;
}

/** 从自己出发沿出牌方向的相对位次：0=自己，1=下家 */
export function seatRelation(index: number, self: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return (((index - self) * direction) % total + total) % total;
}

export function tableSeatLabel(startPlayer: number, direction: 1 | -1, playerId: number, total: number): string {
  if (total <= 0) return '';
  const offset = seatNumber(playerId, startPlayer, total, direction) - 1;
  return TABLE_NUMERALS[offset] ?? String(offset + 1);
}
