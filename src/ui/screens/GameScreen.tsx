import { useEffect, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { useGameSnapshot, useGameStore } from '../store';
import { GameContextMenu } from '../components/GameContextMenu';
import { GameRail } from '../components/GameRail';
import { HeroDetailModal } from '../components/HeroDetail';
import { HeroPanel } from '../components/HeroPanel';
import { Hand } from '../components/Hand';
import { LogPanel } from '../components/LogPanel';
import { GameModals } from '../components/Modals';
import { PlayerSeat } from '../components/PlayerSeat';
import { PromptBar } from '../components/PromptBar';
import { TableCenter } from '../components/TableCenter';
import { TablePiles } from '../components/TablePiles';
import { TopBar } from '../components/TopBar';
import { tableSeatLabel } from '../labels';

type SeatLayout = [number, number][];

const WIDE_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 20]],
  2: [[35, 24], [65, 24]],
  3: [[10, 56], [50, 20], [90, 56]],
  4: [[10, 68], [32, 24], [68, 24], [90, 68]],
  5: [[10, 68], [18, 32], [50, 20], [82, 32], [90, 68]],
  6: [[10, 68], [12, 34], [34, 24], [66, 24], [88, 34], [90, 68]],
  7: [[10, 68], [10, 34], [30, 24], [50, 20], [70, 24], [90, 34], [90, 68]],
};

const COMPACT_SEAT_LAYOUT: Record<number, SeatLayout> = {
  1: [[50, 22]],
  2: [[35, 24], [65, 24]],
  3: [[50, 20], [14, 58], [86, 58]],
  4: [[30, 22], [70, 22], [14, 60], [86, 60]],
  5: [[20, 22], [50, 20], [80, 22], [14, 62], [86, 62]],
  6: [[22, 22], [50, 20], [78, 22], [14, 49], [86, 49], [50, 75]],
  7: [[22, 22], [50, 20], [78, 22], [14, 49], [86, 49], [14, 74], [86, 74]],
};

export function GameScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const selfCardSide = useGameStore((s) => s.selfCardSide);
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const identityMarks = useGameStore((s) => s.identityMarks);
  const openIdentityMark = useGameStore((s) => s.openIdentityMark);
  const flash = useGameStore((s) => s.flash);
  const flashes = useGameStore((s) => s.flashes);
  const speechBubbles = useGameStore((s) => s.speechBubbles);
  const lastPlay = useGameStore((s) => s.lastPlay);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const selectedCardId = selected?.cardId;
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);
  const [compactRing, setCompactRing] = useState(() => window.innerWidth < 1460);

  useEffect(() => {
    const onResize = () => setCompactRing(window.innerWidth < 1460);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    else if (pending.kind === 'play' && selectedOption) {
      const pool = selectedOption.targetAfter
        ? selectedTargets.length === 0
          ? selectedOption.validTargets
          : selectedOption.targetAfter[selectedTargets[0]] ?? []
        : selectedOption.validTargets;
      pool.forEach((id) => targetable.add(id));
      if (selectedOption.targetAfter) selectedTargets.forEach((id) => targetable.add(id));
    }
  }

  const opponents = game.state.players.filter((p) => p.id !== humanId);
  const m = Math.max(1, n - 1);
  const seatLayout = (compactRing ? COMPACT_SEAT_LAYOUT : WIDE_SEAT_LAYOUT)[Math.min(7, m)] ?? WIDE_SEAT_LAYOUT[7];
  const targeting = pending?.kind === 'play' && !!selectedOption && selectedOption.targetMax > 0;

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
    <div className={`game-screen self-card-${selfCardSide}`}>
      <div className="game-bg" style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }} />
      <div className="game-bg-shade" style={{ opacity: bgDim / 100 }} />
      <TopBar logOpen={logOpen} onToggleLog={() => setLogOpen((v) => !v)} onExit={exit} />
      <div className="table-area">
        <div className="board-area">
          <div className="ring">
            {opponents.map((player) => {
              const rel = (player.seat - human.seat + n) % n;
              const [x, y] = seatLayout[Math.max(0, Math.min(m - 1, rel - 1))];
              return (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  mode={displayMode}
                  current={player.id === currentId}
                  targetable={targetable.has(player.id)}
                  targeted={!!lastPlay?.targets.includes(player.id)}
                  selected={selectedTargets.includes(player.id)}
                  mark={displayMode === 'identity' ? identityMarks[player.id] : undefined}
                  onMark={
                    displayMode === 'identity'
                      ? () => openIdentityMark(player.id)
                      : undefined
                  }
                  clickable={targetable.has(player.id)}
                  flash={flash}
                  flashes={flashes}
                  speech={speechBubbles.find((bubble) => bubble.playerId === player.id) ?? null}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  tableNo={tableSeatLabel(game.state.startPlayer, game.state.direction, player.id, n)}
                  unavailableHint={targeting && !targetable.has(player.id) ? '距离不足' : undefined}
                  onDetail={() => setDetailPlayer(player.id)}
                  onClick={() => useGameStore.getState().seatClick(player.id)}
                />
              );
            })}
          </div>
          <div className="seat-position" style={{ left: '50%', top: '55%' }}>
            <TableCenter />
          </div>
          <TablePiles />
        </div>
        <GameRail onShowLog={() => setLogOpen(true)} />
      </div>
      <div className="own-area">
        <HeroPanel
          player={human}
          mode={displayMode}
          current={human.id === currentId}
          flash={flash}
          flashes={flashes}
          speech={speechBubbles.find((bubble) => bubble.playerId === human.id) ?? null}
          handLimitModifier={game.state.rules?.handLimitModifier ?? 0}
          selfView
          tableNo={tableSeatLabel(game.state.startPlayer, game.state.direction, human.id, n)}
          onReveal={(index) => useGameStore.getState().revealGeneral(index)}
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
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
      <GameModals />
      <GameContextMenu onShowLog={() => setLogOpen(true)} onExit={exit} onViewPlayer={setDetailPlayer} />
      {detailPlayer !== null && game.state.players[detailPlayer] && (
        <HeroDetailModal
          heroId={game.state.players[detailPlayer].heroId}
          player={game.state.players[detailPlayer]}
          mode={displayMode}
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
