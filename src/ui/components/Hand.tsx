import type { AskRequest, PlayerState } from '../../core/types';
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
        {cards.map((card, index) => {
          const canUse = playable.has(card.id);
          // 弧形手牌：中间高、两边低，牌数越多每张的倾角越小
          const mid = (cards.length - 1) / 2;
          const offset = index - mid;
          const step = Math.min(2.6, 30 / Math.max(cards.length, 1));
          // 中间的牌略高，两边的牌回落，形成弧形
          const spread = mid > 0 ? Math.abs(offset) / mid : 0;
          const fanStyle = {
            ['--fan-rot' as string]: `${(offset * step).toFixed(2)}deg`,
            ['--fan-lift' as string]: `${(-(1 - spread) * 8).toFixed(1)}px`,
          } as React.CSSProperties;
          return (
            <CardView
              key={card.id}
              style={fanStyle}
              card={card}
              selected={selectedCardId === card.id}
              dimmed={interactive && !canUse}
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
