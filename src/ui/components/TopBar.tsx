import { PHASE_NAME } from '../../core/types';
import { compositionText } from '../composition';
import { visibleHeroNames } from '../labels';
import { useGameSnapshot, useGameStore } from '../store';
import { SpectatorBadge } from './SpectatorBadge';

interface Props {
  logOpen: boolean;
  onToggleLog: () => void;
  onExit: () => void;
}

export function TopBar({ logOpen, onToggleLog, onExit }: Props) {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const spectate = useGameStore((s) => s.spectate);
  const openChat = useGameStore((s) => s.openChat);
  const chatUnread = useGameStore((s) => s.chatUnread);
  if (!game) return null;
  const current = game.state.players[game.state.current];
  const mine = !spectate && current?.id === humanId;
  const mode = game.state.players.length === 2 ? 'duel' : (game.state.rules?.mode ?? 'identity');
  const composition = compositionText(game.state, mode);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-seal">閃</span>
        <span className="brand-text">四國閃 · 星河</span>
      </div>
      <div className={`turn-info ${mine ? 'turn-mine' : ''}`}>
        <span className="turn-round">第 {game.state.turn} 回合</span>
        <span className="turn-direction">{game.state.direction === 1 ? '顺时针' : '逆时针'}</span>
        <span className="turn-dot" />
        <span className="turn-label">{spectate ? '观战中' : mine ? '轮到你' : '等待'}</span>
        <span className="turn-player">
          {current
            ? `${current.name} · ${visibleHeroNames(current, mode, spectate || current.id === humanId)}`
            : '—'}
        </span>
        <span className={`phase-pill phase-${game.state.phase}`}>{PHASE_NAME[game.state.phase]}</span>
        {composition && <span className="turn-composition">{composition}</span>}
      </div>
      <div className="top-actions">
        <SpectatorBadge />
        <button type="button" className="btn ghost small" onClick={openChat}>
          聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
        </button>
        <button type="button" className="btn ghost small" onClick={() => useGameStore.getState().openSettings()}>
          设置
        </button>
        <button type="button" className={`btn ghost small ${logOpen ? 'on' : ''}`} onClick={onToggleLog}>
          战报
        </button>
        <button type="button" className="btn ghost small" onClick={onExit}>
          退出
        </button>
      </div>
    </header>
  );
}
