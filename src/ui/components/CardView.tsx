import type { Card } from '../../core/types';
import { cardEffectText } from '../cardEffects';
import { cardArtUrl, cardRangeText } from '../cardArt';
import { cardDisplayName, isRedCard, rankText, SUIT_CHAR } from '../labels';

interface Props {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function CardView({
  card,
  size = 'md',
  selected,
  disabled,
  dimmed,
  highlighted,
  onClick,
  className,
  style,
}: Props) {
  const red = isRedCard(card);
  const art = cardArtUrl(card.name);
  const range = cardRangeText(card);
  return (
    <button
      type="button"
      className={[
        'card',
        `card-${size}`,
        `card-${card.type}`,
        card.element ? `card-${card.element}` : '',
        red ? 'card-red' : 'card-black',
        art ? 'card-art' : '',
        selected ? 'card-selected' : '',
        disabled ? 'card-disabled' : '',
        dimmed ? 'card-dimmed' : '',
        highlighted ? 'card-highlighted' : '',
        className ?? '',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={`${cardDisplayName(card)} ${SUIT_CHAR[card.suit]}${rankText(card.rank)}${cardEffectText(card) ? `
${cardEffectText(card)}` : ''}`}
    >
      {art && <img className="card-art-img" src={art} alt="" aria-hidden="true" />}
      <span className="card-corner card-corner-tl">
        <span className="card-suit">{SUIT_CHAR[card.suit]}</span>
        <span className="card-rank">{rankText(card.rank)}</span>
      </span>
      <span className="card-body">
        <span className="card-name">{cardDisplayName(card)}</span>
      </span>
      {art && range && <span className="card-range-tag">{range}</span>}
      <span className="card-corner card-corner-br">
        <span className="card-suit">{SUIT_CHAR[card.suit]}</span>
        <span className="card-rank">{rankText(card.rank)}</span>
      </span>
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={`card card-back card-${size}`} aria-label="牌背" />;
}
