import { useState } from 'react';
import { useGameSnapshot, useGameStore } from '../store';
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
  const selectedCardId = selected?.cardId;
  const [logOpen, setLogOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number | null>(null);

  if (!game) return null;
  const human = game.state.players[humanId];
  const n = game.state.players.length;
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
    if (!game.state.over && !window.confirm('确定要退出本局吗？')) return;
    useGameStore.getState().backToMenu();
  };

  return (
    <div className="game-screen">
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
