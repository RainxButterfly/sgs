import { PHASE_NAME } from '../../core/types';
import { useGameSnapshot } from '../store';

interface Props {
  logOpen: boolean;
  onToggleLog: () => void;
  onExit: () => void;
}

export function TopBar({ logOpen, onToggleLog, onExit }: Props) {
  const { game } = useGameSnapshot();
  if (!game) return null;
  const current = game.state.players[game.state.current];
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-seal">杀</span>
        <span className="brand-text">三國殺 · 星河</span>
      </div>
      <div className="turn-info">
        <span className="turn-round">第 {game.state.turn} 回合</span>
        <span className="turn-dot" />
        <span className="turn-player">{current ? `${current.name} · ${current.heroName}` : '—'}</span>
        <span className={`phase-pill phase-${game.state.phase}`}>{PHASE_NAME[game.state.phase]}</span>
      </div>
      <div className="top-actions">
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
