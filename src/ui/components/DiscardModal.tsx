import { useMemo, useState } from 'react';
import type { Card } from '../../core/types';
import { cardDisplayName } from '../labels';
import { useGameStore } from '../store';
import { CardView } from './CardView';

export function DiscardModal({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const origins = useGameStore((s) => s.discardOrigins);
  const game = useGameStore((s) => s.game);
  const [filter, setFilter] = useState('all');
  const names = useMemo(() => {
    const ids = new Set<number>();
    for (const card of cards) {
      const origin = origins[card.id];
      if (origin) ids.add(origin.playerId);
    }
    return [...ids]
      .map((id) => ({ id: String(id), name: game?.state.players[id]?.name ?? `座位${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [cards, origins, game]);
  const visible = filter === 'all'
    ? cards
    : cards.filter((card) => String(origins[card.id]?.playerId) === filter);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal discard-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">弃牌堆（{cards.length}）</div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="discard-note">
          弃牌堆是公开信息，任何玩家都可以查看；每张牌下方标注了弃置者和原因。
        </div>
        <div className="discard-toolbar">
          <span>按弃置者筛选</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">全部（{cards.length}）</option>
            {names.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <span className="discard-scroll-hint">列表可滚动</span>
        </div>
        {visible.length === 0 ? (
          <div className="discard-empty">还没有弃牌</div>
        ) : (
          <div className="discard-grid">
            {[...visible].reverse().map((card) => {
              const origin = origins[card.id];
              const player = origin ? game?.state.players[origin.playerId] : undefined;
              return (
                <div key={card.id} className="discard-item">
                  <CardView card={card} size="sm" />
                  <span className="discard-origin" title={cardDisplayName(card)}>
                    <b>{player?.name ?? '牌堆'}</b>
                    <em>{origin?.reason ?? '弃置'}</em>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
