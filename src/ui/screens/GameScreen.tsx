import { useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { useGameSnapshot, useGameStore } from '../store';
import { GameContextMenu } from '../components/GameContextMenu';
import { HeroDetailModal } from '../components/HeroDetail';
import { HeroPanel } from '../components/HeroPanel';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { GameModals } from '../components/Modals';
import { PlayerSeat } from '../components/PlayerSeat';
import { PromptBar } from '../components/PromptBar';
import { TableCenter } from '../components/TableCenter';
import { TopBar } from '../components/TopBar';

export function GameScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const flash = useGameStore((s) => s.flash);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const selectedCardId = selected?.cardId;
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);

  if (!game) {
    return (
      <div className="fatal-error">
        <div className="fatal-card">
          <h1>对局状态丢失</h1>
          <p>房间可能已经关闭或连接中断。</p>
          <div className="fatal-actions">
            <button type="button" className="btn primary" onClick={() => useGameStore.getState().backToMenu()}>
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }
  const human = game.state.players[humanId];
  if (!human) {
    return (
      <div className="fatal-error">
        <div className="fatal-card">
          <h1>找不到你的座位</h1>
          <p>对局数据不完整，请返回主菜单重开。</p>
          <div className="fatal-actions">
            <button type="button" className="btn primary" onClick={() => useGameStore.getState().backToMenu()}>
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }
  const n = game.state.players.length;
  const displayMode = n === 2 ? 'duel' : game.state.rules.mode;
  const currentId = game.state.current;

  const selectedOption =
    pending?.kind === 'play' && selected
      ? pending.cardOptions?.find(
          (o) =>
            o.cardId === selected.cardId &&
            o.as === selected.as &&
            (o.skillId ?? '') === (selected.skillId ?? ''),
        )
      : undefined;

  const targetable = new Set<number>();
  if (pending) {
    if (pending.kind === 'choosePlayer') (pending.players ?? []).forEach((id) => targetable.add(id));
    else if (pending.kind === 'play' && selectedOption) selectedOption.validTargets.forEach((id) => targetable.add(id));
  }

  const opponents = game.state.players.filter((p) => p.id !== humanId);
  const m = Math.max(1, n - 1);

  const exit = () => {
    const state = useGameStore.getState();
    if (state.lanRole === 'client' && !game.state.over) {
      if (!window.confirm('退出后对局仍会继续，你可以从主菜单重新回归。确定退出吗？')) return;
      state.suspendGame();
      return;
    }
    if (!game.state.over && !window.confirm('确定要退出本局吗？')) return;
    state.backToMenu();
  };

  return (
    <div className="game-screen">
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
      <TopBar logOpen={logOpen} onToggleLog={() => setLogOpen((v) => !v)} onExit={exit} />
      <div className="table-area">
        <div className="ring">
          {opponents.map((player) => {
            const rel = (player.seat - human.seat + n) % n;
            const angle = Math.PI + (rel * Math.PI) / (m + 1);
            const x = 50 + 43 * Math.cos(angle);
            const y = 47 + 37 * Math.sin(angle);
            return (
              <PlayerSeat
                key={player.id}
                player={player}
                mode={displayMode}
                current={player.id === currentId}
                targetable={targetable.has(player.id)}
                selected={selectedTargets.includes(player.id)}
                clickable={targetable.has(player.id)}
                flash={flash}
                style={{ left: `${x}%`, top: `${y}%` }}
                onDetail={() => setDetailPlayer(player.id)}
                onClick={() => useGameStore.getState().seatClick(player.id)}
              />
            );
          })}
        </div>
        <div className="seat-position" style={{ left: '50%', top: '47%' }}>
          <TableCenter />
        </div>
        <div className="own-area">
          <HeroPanel
            player={human}
            mode={displayMode}
            current={human.id === currentId}
            flash={flash}
            handLimitModifier={game.state.rules?.handLimitModifier ?? 0}
            onDetail={() => setDetailPlayer(human.id)}
          />
          <div className="play-column">
            <PromptBar />
            <Hand
              player={human}
              pending={pending}
              selectedCardId={selectedCardId}
              onSelect={(id) => useGameStore.getState().selectCard(id)}
            />
          </div>
        </div>
      </div>
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      <GameModals />
      <GameContextMenu onShowLog={() => setLogOpen(true)} onExit={exit} onViewPlayer={setDetailPlayer} />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          showRole={
            detailPlayer === humanId ||
            game.state.players[detailPlayer].roleRevealed ||
            !game.state.players[detailPlayer].alive
          }
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  );
}
