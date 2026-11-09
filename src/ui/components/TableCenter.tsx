import { useState } from 'react';
import { cardDisplayName, rankText, shortCardName, SUIT_CHAR } from '../labels';
import { cardEffectText } from '../cardEffects';
import { DiscardModal } from './DiscardModal';
import { useGameSnapshot, useGameStore } from '../store';
import { CardView } from './CardView';

export function TableCenter() {
  const { game } = useGameSnapshot();
  const [discardOpen, setDiscardOpen] = useState(false);
  const lastPlay = useGameStore((s) => s.lastPlay);
  const lastJudge = useGameStore((s) => s.lastJudge);
  const lastDiscard = useGameStore((s) => s.lastDiscard);
  const cardHistory = useGameStore((s) => s.cardHistory);
  if (!game) return null;
  const player = (id?: number) => (id === undefined ? undefined : game.state.players[id]);
  const playerName = (id: number) => game.state.players[id]?.name ?? '';
  const faction = (id?: number) => player(id)?.faction;
  const recentText = (entry: (typeof cardHistory)[number]) => {
    const card = entry.cards[0];
    if (entry.kind === 'play' || entry.kind === 'respond') {
      return `${entry.kind === 'respond' ? '打出' : '使用'}【${entry.as ?? (card ? cardDisplayName(card) : '')}】`;
    }
    if (entry.kind === 'judge') return `判定${card ? `【${card.name}】` : ''}`;
    if (entry.kind === 'discard') return `弃置${card ? `【${card.name}】` : ''}`;
    if (entry.kind === 'gain') return `获得${card ? `【${card.name}】` : ''}`;
    return entry.label;
  };

  return (
    <div className="table-center">
      <div className="pile-row">
        <div className="pile">
          <span className="pile-stack back" />
          <span className="pile-label">牌堆 {game.state.deckCount ?? game.state.deck.length}</span>
        </div>
        <div className="pile">
          <button type="button" className="pile-stack face pile-button" onClick={() => setDiscardOpen(true)} aria-label="查看弃牌堆" />
          <button type="button" className="pile-label pile-button" onClick={() => setDiscardOpen(true)}>
            弃牌 {game.state.discardCount ?? game.state.discard.length}
          </button>
        </div>
      </div>

      <div className="center-stage">
        <div className="played-column">
          {lastPlay ? (
            <div key={lastPlay.id} className={`played faction-${faction(lastPlay.playerId) ?? 'qun'}`}>
              <div className="played-banner">
                <span className="played-user">{playerName(lastPlay.playerId)}</span>
                <span className="played-verb">{lastPlay.isResponse ? '打出' : '使用'}</span>
                <span className="played-as">
                  {lastPlay.as === cardDisplayName(lastPlay.card)
                    ? `【${cardDisplayName(lastPlay.card)}】`
                    : `【${cardDisplayName(lastPlay.card)}】当【${lastPlay.as}】`}
                </span>
              </div>
              <CardView card={lastPlay.card} size="lg" className="played-card" />
              {cardEffectText(lastPlay.card) && (
                <div className="played-effect">{cardEffectText(lastPlay.card)}</div>
              )}
              {lastPlay.targets.length > 0 && (
                <div className="played-targets-row">
                  <span>目标</span>
                  {lastPlay.targets.map((id) => (
                    <b key={id}>{playerName(id)}</b>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="played-empty">等待出牌</div>
          )}
        </div>
        {cardHistory.length > 0 && (
          <div className="recent-actions">
            {cardHistory.slice(-3).map((entry) => (
              <span key={entry.id} className="recent-action">
                <b>{entry.playerId !== undefined ? playerName(entry.playerId) : '牌堆'}</b>
                {recentText(entry)}
              </span>
            ))}
          </div>
        )}
      </div>

      {lastDiscard && (
        <div key={`discard-${lastDiscard.id}`} className="discard-strip">
          <span className="discard-owner">{playerName(lastDiscard.playerId)}</span>
          <span className="discard-verb">{lastDiscard.reason ?? '弃置'}</span>
          <span className="discard-cards">
            {lastDiscard.cards.map((card) => (
              <span key={card.id} className="discard-chip">
                <em>
                  {SUIT_CHAR[card.suit]}
                  {rankText(card.rank)}
                </em>
                {shortCardName(cardDisplayName(card))}
              </span>
            ))}
          </span>
        </div>
      )}
      {discardOpen && <DiscardModal cards={game.state.discard} onClose={() => setDiscardOpen(false)} />}
    </div>
  );
}
