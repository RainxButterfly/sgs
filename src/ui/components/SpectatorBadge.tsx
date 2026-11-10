import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KickMenu } from './KickMenu';
import { NameChip } from './NameChip';
import { useGameStore } from '../store';

export function SpectatorBadge({ compact = false }: { compact?: boolean }) {
  const spectators = useGameStore((s) => s.spectators);
  const room = useGameStore((s) => s.room);
  const lanRole = useGameStore((s) => s.lanRole);
  const lanHost = useGameStore((s) => s.lanHost);
  const [open, setOpen] = useState(false);
  const [kickMenu, setKickMenu] = useState<{
    x: number;
    y: number;
    name: string;
    connId: number;
  } | null>(null);
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
      {open &&
        createPortal(
          <aside className="spectator-drawer">
            <div className="spectator-drawer-head">
              <div>
                <b>观战席 · {count} 人</b>
                <span>不占玩家座次，牌局继续</span>
              </div>
              <button type="button" className="spectator-drawer-close" onClick={() => setOpen(false)} aria-label="关闭观战席">
                ×
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
                    <span className="spectator-name">
                      <NameChip name={spectator.name} level={spectator.level ?? 1} size="sm" />
                    </span>
                    <code className="spectator-ip">{spectator.ip || 'IP 未知'}</code>
                    {lanRole === 'host' && (
                      <button
                        type="button"
                        className="lobby-kick"
                        onClick={(event) => {
                          event.stopPropagation();
                          setKickMenu({
                            x: event.clientX,
                            y: event.clientY,
                            name: spectator.name,
                            connId: spectator.connId,
                          });
                        }}
                      >
                        移出
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="spectator-drawer-foot">
              <span>房主和所有玩家都能查看这份名单</span>
              <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
          </aside>,
          document.body,
        )}
      {kickMenu && (
        <KickMenu
          x={kickMenu.x}
          y={kickMenu.y}
          name={kickMenu.name}
          kind="spectator"
          onKick={() => {
            lanHost?.kickSpectator(kickMenu.connId);
            setKickMenu(null);
          }}
          onPermanent={() => {
            lanHost?.kickSpectator(kickMenu.connId, true);
            setKickMenu(null);
          }}
          onClose={() => setKickMenu(null)}
        />
      )}
    </>
  );
}
