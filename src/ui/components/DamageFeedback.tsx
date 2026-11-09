import { cardDisplayName } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';

export function DamageFeedback() {
  const { game } = useGameSnapshot();
  const notice = useGameStore((s) => s.damageNotice);
  const humanId = useGameStore((s) => s.humanId);
  const screen = useGameStore((s) => s.screen);
  if (!game || !notice || screen !== 'game') return null;
  const source = notice.sourceId !== undefined ? game.state.players[notice.sourceId] : undefined;
  const target = game.state.players[notice.targetId];
  if (!target) return null;
  const isSelf = notice.targetId === humanId;
  const detail = notice.reason ?? (notice.card ? cardDisplayName(notice.card) : '');
  return (
    <>
      <div
        key={`notice-${notice.id}`}
        className={`damage-callout ${notice.kind} ${isSelf ? 'self' : ''}`}
      >
        <div className="damage-callout-head">
          <span className="damage-callout-target">{target.name}</span>
          <b>
            {notice.kind === 'damage' ? '−' : '+'}
            {notice.amount} 体力
          </b>
        </div>
        <div className="damage-callout-sub">
          {source && source.id !== target.id ? `${source.name} 造成 · ` : ''}
          {detail || (notice.kind === 'damage' ? '受到伤害' : '回复体力')}
          <span>剩余 {Math.max(0, notice.hp)}/{target.maxHp}</span>
        </div>
      </div>
      {notice.kind === 'damage' && isSelf && (
        <div key={`hit-${notice.id}`} className="hit-vignette" />
      )}
    </>
  );
}
