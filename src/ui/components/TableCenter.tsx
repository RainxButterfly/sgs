import { useGameSnapshot, useGameStore } from '../store';
import { CardView } from './CardView';

export function TableCenter() {
  const { game } = useGameSnapshot();
  const lastPlay = useGameStore((s) => s.lastPlay);
  const lastJudge = useGameStore((s) => s.lastJudge);
  const cardHistory = useGameStore((s) => s.cardHistory);
  if (!game) return null;
  const playerName = (id: number) => game.state.players[id]?.name ?? '';

  return (
    <div className="table-center">
      <div className="pile-row">
        <div className="pile">
          <span className="pile-stack back" />
          <span className="pile-label">牌堆 {game.state.deckCount ?? game.state.deck.length}</span>
        </div>
        <div className="pile">
          <span className="pile-stack face" />
          <span className="pile-label">弃牌 {game.state.discardCount ?? game.state.discard.length}</span>
        </div>
      </div>
      {cardHistory.length > 0 && (
        <div className="card-history">
          {cardHistory.map((entry) => (
            <div key={entry.id} className={`history-entry history-${entry.kind}`}>
              <span className="history-label">
                {entry.playerId !== undefined ? playerName(entry.playerId) : '牌堆'} · {entry.label}
              </span>
              <div className="history-cards">
                {entry.cards.map((card) => (
                  <CardView key={card.id} card={card} size="sm" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="center-stage">
        {lastPlay && (
          <div key={lastPlay.id} className="played">
            <CardView card={lastPlay.card} size="lg" className="played-card" />
            <div className="played-caption">
              <span className="played-user">{playerName(lastPlay.playerId)}</span>
              <span className="played-as">
                {lastPlay.as === lastPlay.card.name
                  ? `使用【${lastPlay.card.name}】`
                  : `将【${lastPlay.card.name}】当【${lastPlay.as}】使用`}
              </span>
              {lastPlay.targets.length > 0 && (
                <span className="played-targets">→ {lastPlay.targets.map(playerName).join('、')}</span>
              )}
            </div>
          </div>
        )}
        {lastJudge && (
          <div key={lastJudge.id} className={`judge-strip ${lastJudge.success ? 'ok' : 'bad'}`}>
            <span className="judge-owner">{playerName(lastJudge.playerId)}</span>
            <span className="judge-reason">{lastJudge.reason}</span>
            <span className="judge-card-mini">
              {lastJudge.card.name} {lastJudge.text}
            </span>
            <span className="judge-result">{lastJudge.success ? '生效' : '未生效'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
