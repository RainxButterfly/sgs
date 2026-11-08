import type { Card, EquipSlot, Suit } from '../core/types';

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

export function shortCardName(name: string): string {
  if (name === '雌雄双股剑') return '雌雄剑';
  if (name === '青龙偃月刀') return '青龙刀';
  if (name === '诸葛连弩') return '连弩';
  return name;
}
