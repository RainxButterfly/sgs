import { cardEffectText } from '../cardEffects';
import { cardDisplayName, cardTypeText } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';
import { CardView } from './CardView';

interface Props {
  onShowLog: () => void;
}

export function GameRail({ onShowLog }: Props) {
  const { game } = useGameSnapshot();
  const lastPlay = useGameStore((s) => s.lastPlay);
  if (!game) return null;

  const playerName = (id: number) => game.state.players[id]?.name ?? `座位${id}`;
  const targetText = (ids: number[]) =>
    ids.length === 0
      ? '无目标'
      : ids.length > 3
        ? `${ids.slice(0, 3).map(playerName).join('、')} 等 ${ids.length} 人`
        : ids.map(playerName).join('、');
  const recent = [...game.state.log].reverse().slice(0, 16);

  return (
    <aside className="game-rail">
      <section className="rail-card rail-play">
        <div className="rail-title">
          <b>当前出牌</b>
          <span>WHO → WHOM</span>
        </div>
        {lastPlay ? (
          <>
            <div className="rail-route">
              <b>{playerName(lastPlay.playerId)}</b>
              <i>→</i>
              <span>{targetText(lastPlay.targets)}</span>
            </div>
            <div className="rail-play-main">
              <CardView card={lastPlay.card} size="sm" />
              <div>
                <b>
                  {lastPlay.isResponse ? '打出' : '使用'}【{cardDisplayName(lastPlay.card)}】
                </b>
                <small>{cardTypeText(lastPlay.card)}</small>
                {cardEffectText(lastPlay.card) && <p>{cardEffectText(lastPlay.card)}</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="rail-empty">等待出牌</div>
        )}
      </section>

      <section className="rail-card rail-feed">
        <div className="rail-title">
          <b>最近动向</b>
          <button type="button" onClick={onShowLog}>
            完整战报
          </button>
        </div>
        <div className="rail-feed-list">
          {recent.length === 0 && <div className="rail-empty">暂无记录</div>}
          {recent.map((entry) => (
            <div key={entry.id} className={`rail-feed-line log-${entry.kind}`}>
              <i className="rail-feed-dot" />
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
