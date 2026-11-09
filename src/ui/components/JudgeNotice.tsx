import { cardDisplayName, rankText, SUIT_CHAR } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';

export function JudgeNotice() {
  const { game } = useGameSnapshot();
  const judge = useGameStore((s) => s.lastJudge);
  const screen = useGameStore((s) => s.screen);
  if (!game || !judge || screen !== 'game') return null;
  const player = game.state.players[judge.playerId];
  return (
    <div
      key={`judge-notice-${judge.id}`}
      className={`judge-notice ${judge.success ? 'ok' : 'bad'}`}
    >
      <div className="judge-notice-head">
        <span>{player?.name ?? `座位${judge.playerId}`}</span>
        <b>
          {judge.reason}
          {judge.changedBy ? ` · ${judge.changedBy}改判` : ''}
        </b>
      </div>
      <div className="judge-notice-body">
        <span className="judge-notice-card">
          {SUIT_CHAR[judge.card.suit]}
          {rankText(judge.card.rank)} {cardDisplayName(judge.card)}
        </span>
        <strong>{judge.success ? '生效' : '未生效'}</strong>
      </div>
    </div>
  );
}
