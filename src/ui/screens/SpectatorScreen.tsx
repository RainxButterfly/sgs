import { useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { HeroDetailModal } from '../components/HeroDetail';
import { LogPanel } from '../components/LogPanel';
import { PlayerSeat } from '../components/PlayerSeat';
import { TableCenter } from '../components/TableCenter';
import { TopBar } from '../components/TopBar';
import { useGameSnapshot, useGameStore } from '../store';

export function SpectatorScreen() {
  const { game } = useGameSnapshot();
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const openChat = useGameStore((s) => s.openChat);
  const chatUnread = useGameStore((s) => s.chatUnread);
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);

  const exit = () => {
    if (!window.confirm('确定退出观战吗？')) return;
    useGameStore.getState().leaveLan();
  };

  if (!game) {
    return (
      <div className="spectator-screen spectator-loading">
        <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
        <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
        <div className="fatal-card">
          <h1>正在接入观战</h1>
          <p>已连接房间，等待房主同步对局画面。</p>
          <div className="fatal-actions">
            <button type="button" className="btn ghost" onClick={exit}>
              退出观战
            </button>
          </div>
        </div>
      </div>
    );
  }

  const n = Math.max(1, game.state.players.length);
  const currentId = game.state.current;
  const mode = n === 2 ? 'duel' : (game.state.rules?.mode ?? 'identity');

  return (
    <div className="spectator-screen">
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
      <TopBar logOpen={logOpen} onToggleLog={() => setLogOpen((v) => !v)} onExit={exit} />
      <div className="spectator-stage">
        <div className="spectator-ring">
          {game.state.players.map((player, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / n;
            const x = 50 + 38 * Math.cos(angle);
            const y = 48 + 36 * Math.sin(angle);
            return (
              <PlayerSeat
                key={player.id}
                player={player}
                mode={mode}
                current={player.id === currentId}
                flash={null}
                style={{ left: `${x}%`, top: `${y}%` }}
                onDetail={() => setDetailPlayer(player.id)}
              />
            );
          })}
        </div>
        <div className="seat-position" style={{ left: '50%', top: '48%' }}>
          <TableCenter />
        </div>
      </div>
      <footer className="spectator-foot">
        <span className="spectator-tag">观战中</span>
        <span>身份与手牌已隐藏 · 第 {game.state.turn} 回合</span>
        <button type="button" className="btn ghost small" onClick={openChat}>
          聊天{chatUnread > 0 && <span className="chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>}
        </button>
      </footer>
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          showRole={game.state.players[detailPlayer].roleRevealed || !game.state.players[detailPlayer].alive}
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  );
}
