import type { Card } from '../../core/types';
import { CardView } from './CardView';

export function DiscardModal({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal discard-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">弃牌堆（{cards.length}）</div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="discard-note">弃牌堆是公开信息，任何玩家都可以查看；谁因什么弃了什么会显示在牌桌底部和战报中。</div>
        {cards.length === 0 ? (
          <div className="discard-empty">还没有弃牌</div>
        ) : (
          <div className="discard-grid">
            {[...cards].reverse().map((card) => (
              <CardView key={card.id} card={card} size="sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
