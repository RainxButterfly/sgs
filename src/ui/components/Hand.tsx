import type { AskRequest, PlayerState } from '../../core/types';
import { CardView } from './CardView';

interface Props {
  player: PlayerState;
  pending: AskRequest | null;
  selectedCardId?: string;
  onSelect: (cardId: string) => void;
}

const TYPE_ORDER: Record<string, number> = { basic: 0, trick: 1, delayed: 2, equip: 3 };

export function Hand({ player, pending, selectedCardId, onSelect }: Props) {
  const playable = new Set(
    pending?.kind === 'play' || pending?.kind === 'respond'
      ? (pending.cardOptions ?? []).map((o) => o.cardId)
      : [],
  );
  const interactive = pending?.kind === 'play' || pending?.kind === 'respond';
  const cards = [...player.hand].sort(
    (a, b) =>
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
      a.name.localeCompare(b.name, 'zh') ||
      a.rank - b.rank,
  );

  return (
    <div className="hand-zone">
      <div className="hand-label">
        <span>手牌</span>
        <span className="hand-count">{player.hand.length}</span>
      </div>
      <div className="hand-cards">
        {cards.length === 0 && <div className="hand-empty">暂无手牌</div>}
        {cards.map((card) => {
          const canUse = playable.has(card.id);
          return (
            <CardView
              key={card.id}
              card={card}
              selected={selectedCardId === card.id}
              disabled={interactive ? !canUse : true}
              dimmed={interactive && !canUse}
              onClick={canUse ? () => onSelect(card.id) : undefined}
              className="hand-card"
            />
          );
        })}
      </div>
    </div>
  );
}
