import { useState } from 'react';
import { cardDisplayName, rankText, shortCardName, SUIT_CHAR } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';
import { DiscardModal } from './DiscardModal';

export function TablePiles() {
  const { game } = useGameSnapshot();
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const [open, setOpen] = useState(false);
  if (!game) return null;

  const discard = game.state.discard;
  const deck = game.state.deckCount ?? game.state.deck.length;
  const lastOwner = lastDiscard
    ? game.state.players[lastDiscard.playerId]?.name ?? `座位${lastDiscard.playerId}`
    : '';
  const cards = lastDiscard
    ? lastDiscard.cards.slice(0, 3)
    : discard.slice(-3);
  const cardCount = lastDiscard ? lastDiscard.cards.length : discard.length;
  const moreCount = cardCount - cards.length;

  return (
    <>
      <div className="table-piles">
        <span className="table-pile-stat">
          牌堆 <b>{deck}</b>
        </span>
        <i className="table-pile-sep" />
        <button type="button" className="table-pile-stat is-button" onClick={() => setOpen(true)}>
          弃牌 <b>{discard.length}</b>
        </button>
        {lastDiscard && (
          <span className="table-pile-owner">
            {lastOwner} · {lastDiscard.reason ?? '弃置'}
          </span>
        )}
        {cards.length > 0 && (
          <span className="table-pile-cards">
            {cards.map((card) => (
              <span className="table-discard-card" key={card.id}>
                <em>
                  {SUIT_CHAR[card.suit]}
                  {rankText(card.rank)}
                </em>
                {shortCardName(cardDisplayName(card))}
              </span>
            ))}
            {moreCount > 0 && <span className="table-pile-more">+{moreCount}</span>}
          </span>
        )}
        <button type="button" className="table-pile-view" onClick={() => setOpen(true)}>
          查看
        </button>
      </div>
      {open && <DiscardModal cards={discard} onClose={() => setOpen(false)} />}
    </>
  );
}
