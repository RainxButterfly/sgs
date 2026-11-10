import { useEffect } from 'react';
import { ROLE_NAME, type Role } from '../../core/types';
import { useGameStore } from '../store';

const ROLES: Role[] = ['lord', 'loyalist', 'rebel', 'traitor'];

export function IdentityMarkModal() {
  const playerId = useGameStore((s) => s.markingPlayerId);
  const game = useGameStore((s) => s.game);
  const marks = useGameStore((s) => s.identityMarks);
  const setMark = useGameStore((s) => s.setIdentityMark);
  const close = useGameStore((s) => s.closeIdentityMark);
  const open = playerId != null && !!game;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);
  if (!open) return null;
  const player = game.state.players[playerId];
  if (!player) return null;
  const current = marks[playerId];

  return (
    <div className="modal-backdrop identity-mark-backdrop" onClick={close}>
      <div className="modal identity-mark-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">标记身份 · {player.name}</div>
          <button type="button" className="modal-minimize" onClick={close}>
            关闭
          </button>
        </div>
        <p className="modal-desc">只是你自己的判断记录，不会公开，也不会影响对局。</p>
        <div className="identity-mark-options">
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={`identity-mark-option role-${role} ${current === role ? 'on' : ''}`}
              onClick={() => setMark(role)}
            >
              {ROLE_NAME[role]}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => setMark(null)} disabled={!current}>
            清除标记
          </button>
          <button type="button" className="btn primary" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
