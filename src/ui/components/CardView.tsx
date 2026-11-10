import type { Card } from '../../core/types';
import shaArt from '../../assets/cards/sha-haha.png';
import shanArt from '../../assets/cards/shan-ji.jpg';
import taoArt from '../../assets/cards/tao-mi.jpg';
import { cardEffectText } from '../cardEffects';
import { cardDisplayName, cardTypeText, isRedCard, rankText, SUIT_CHAR } from '../labels';

const CARD_ART: Record<string, string> = {
  杀: shaArt,
  闪: shanArt,
  桃: taoArt,
};

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
  const art = CARD_ART[card.name];
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
        className ?? '',
      ].join(' ')}
      onClick={onClick}
      disabled={disabled}
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
        {size !== 'sm' && <span className="card-kind">{cardTypeText(card)}</span>}
        {card.equipSlot && size !== 'sm' && (
          <span className="card-kind card-range">
            {card.equipSlot === 'weapon' ? `攻击 ${card.range ?? 1}` : ''}
          </span>
        )}
      </span>
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
