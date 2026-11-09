import { HERO_MAP } from '../core/deck';
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

export function shortCardName(name: string): string {
  if (name === '雌雄双股剑') return '雌雄剑';
  if (name === '青龙偃月刀') return '青龙刀';
  if (name === '诸葛连弩') return '连弩';
  return name;
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
  if (mode !== 'guozhan' || !player.generalSkills) {
    return [...new Set([...player.skills, ...player.extraSkills])];
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
  return [...ids];
}

export function playerHeroNames(player: PlayerState): string {
  const ids = player.heroIds?.length ? player.heroIds : [player.heroId];
  const names = ids.map((id) => HERO_MAP.get(id)?.name).filter((name): name is string => !!name);
  return names.length ? names.join('·') : player.heroName;
}
