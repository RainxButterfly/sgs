import type { Card } from '../../core/types';
import { cardDisplayName, cardTypeText, isRedCard, rankText, SUIT_CHAR } from '../labels';

interface Props {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CardView({ card, size = 'md', selected, disabled, dimmed, onClick, className }: Props) {
  const red = isRedCard(card);
  return (
    <button
      type="button"
      className={[
        'card',
        `card-${size}`,
        `card-${card.type}`,
        card.element ? `card-${card.element}` : '',
        red ? 'card-red' : 'card-black',
        selected ? 'card-selected' : '',
        disabled ? 'card-disabled' : '',
        dimmed ? 'card-dimmed' : '',
        className ?? '',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={`${cardDisplayName(card)} ${SUIT_CHAR[card.suit]}${rankText(card.rank)}`}
    >
      <span className="card-corner card-corner-tl">
        {SUIT_CHAR[card.suit]}
        {rankText(card.rank)}
      </span>
      <span className="card-body">
        <span className="card-name">{cardDisplayName(card)}</span>
        {size !== 'sm' && <span className="card-kind">{cardTypeText(card)}</span>}
        {card.equipSlot && size !== 'sm' && (
          <span className="card-kind card-range">
            {card.equipSlot === 'weapon' ? `攻击 ${card.range ?? 1}` : ''}
          </span>
        )}
      </span>
      <span className="card-corner card-corner-br">
        {SUIT_CHAR[card.suit]}
        {rankText(card.rank)}
      </span>
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={`card card-back card-${size}`} aria-label="牌背" />;
}
