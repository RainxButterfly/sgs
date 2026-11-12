import type { AskRequest, PlayerState } from '../../core/types';
import { useGameStore } from '../store';
import { CardView } from './CardView';

interface Props {
  player: PlayerState;
  pending: AskRequest | null;
  selectedCardId?: string;
  onSelect: (cardId: string) => void;
  onClearSelection?: () => void;
}

const TYPE_ORDER: Record<string, number> = { basic: 0, trick: 1, delayed: 2, equip: 3 };

export function Hand({ player, pending, selectedCardId, onSelect, onClearSelection }: Props) {
  const viewAsFilter = useGameStore((s) => s.viewAsFilter);
  const eligible = viewAsFilter ? new Set(viewAsFilter.eligibleCardIds) : null;
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
          const canUse = eligible ? eligible.has(card.id) : playable.has(card.id);
          return (
            <CardView
              key={card.id}
              card={card}
              selected={selectedCardId === card.id}
              dimmed={interactive && !canUse}
              highlighted={!!eligible && eligible.has(card.id)}
              onClick={
                interactive
                  ? () => (canUse ? onSelect(card.id) : onClearSelection?.())
                  : undefined
              }
              className="hand-card"
            />
          );
        })}
      </div>
    </div>
  );
}
