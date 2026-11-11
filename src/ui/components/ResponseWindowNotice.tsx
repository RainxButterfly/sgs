import { CountdownRing } from './CountdownRing';
import { useGameSnapshot, useGameStore } from '../store';

export function ResponseWindowNotice() {
  const active = useGameStore((s) => s.responseWindow);
  const pending = useGameStore((s) => s.pending);
  const humanId = useGameStore((s) => s.humanId);
  const screen = useGameStore((s) => s.screen);
  const { game } = useGameSnapshot();
  if (!active || screen !== 'game' || !game) return null;
  if (active.playerId === humanId && pending?.kind === 'respond') return null;
  const player = game.state.players[active.playerId];
  return (
    <div className="response-window-notice">
      <span className="response-window-dot" />
      <span>
        等待 {active.playerId === humanId ? '你' : player?.name ?? '玩家'} 响应 {active.name}
      </span>
      <CountdownRing deadline={active.until} totalMs={active.ms} size={20} />
    </div>
  );
}
