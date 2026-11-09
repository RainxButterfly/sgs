import { useState } from 'react';
import { useGameStore } from '../store';

export function SpectatorBadge({ compact = false }: { compact?: boolean }) {
  const spectators = useGameStore((s) => s.spectators);
  const room = useGameStore((s) => s.room);
  const lanRole = useGameStore((s) => s.lanRole);
  const [open, setOpen] = useState(false);
  const count = spectators.length;
  if (!lanRole) return null;

  return (
    <>
      <button
        type="button"
        className={`spectator-badge ${compact ? 'compact' : ''} ${count > 0 ? 'has-spectators' : ''}`}
        onClick={() => setOpen(true)}
        title="查看观战席"
      >
        观战席
        <b>{count}</b>
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal spectator-list-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">观战席 · {count} 人</div>
              <button type="button" className="modal-minimize" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            {count === 0 ? (
              <div className="spectator-empty">
                <p>还没有人观战。</p>
                {room && (
                  <p className="muted">
                    把房间码 <b>{room.code}</b> 和地址分享给朋友，对局中也可以进入观战。
                  </p>
                )}
              </div>
            ) : (
              <ul className="spectator-list">
                {spectators.map((spectator) => (
                  <li key={spectator.connId}>
                    <span className="spectator-avatar">{spectator.name.slice(0, 1)}</span>
                    <span className="spectator-name">{spectator.name}</span>
                    <code className="spectator-ip">{spectator.ip || 'IP 未知'}</code>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
