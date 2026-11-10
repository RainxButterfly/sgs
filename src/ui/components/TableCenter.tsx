import { cardDisplayName } from '../labels';
import { cardEffectText } from '../cardEffects';
import { useGameSnapshot, useGameStore } from '../store';
import { CardView } from './CardView';

export function TableCenter() {
  const { game } = useGameSnapshot();
  const lastPlay = useGameStore((s) => s.lastPlay);
  const cardHistory = useGameStore((s) => s.cardHistory);
  if (!game) return null;
  const player = (id?: number) => (id === undefined ? undefined : game.state.players[id]);
  const playerName = (id: number) => game.state.players[id]?.name ?? '';
  const faction = (id?: number) => player(id)?.faction;
  const recentText = (entry: (typeof cardHistory)[number]) => {
    const card = entry.cards[0];
    if (entry.kind === 'play' || entry.kind === 'respond') {
      const targetText =
        entry.targets && entry.targets.length > 0
          ? ` → ${entry.targets.map(playerName).join('、')}`
          : '';
      return `${entry.kind === 'respond' ? '打出' : '使用'}【${entry.as ?? (card ? cardDisplayName(card) : '')}】${targetText}`;
    }
    if (entry.kind === 'judge') return `判定${card ? `【${card.name}】` : ''}`;
    if (entry.kind === 'discard') return `弃置${card ? `【${card.name}】` : ''}`;
    if (entry.kind === 'gain') return `获得${card ? `【${card.name}】` : ''}`;
    return entry.label;
  };
  const targetText = (ids: number[]) =>
    ids.length === 0
      ? '无目标'
      : ids.length > 3
        ? `${ids.slice(0, 3).map(playerName).join('、')} 等 ${ids.length} 人`
        : ids.map(playerName).join('、');

  return (
    <div className="table-center">
      <div className="center-stage">
        <div className="played-column">
          {lastPlay ? (
            <div key={lastPlay.id} className={`played faction-${faction(lastPlay.playerId) ?? 'qun'}`}>
              <div className="played-banner">
                <span className="played-user">{playerName(lastPlay.playerId)}</span>
                <span className="played-arrow">→</span>
                <span className="played-target-inline">{targetText(lastPlay.targets)}</span>
              </div>
              <div className="played-action">
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
    </div>
  );
}
