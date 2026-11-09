import type { GameMode, GameState } from '../core/types';

const IDENTITY_COUNTS: Record<number, { lord: number; loyalist: number; rebel: number; traitor: number }> = {
  2: { lord: 1, loyalist: 0, rebel: 1, traitor: 0 },
  3: { lord: 1, loyalist: 1, rebel: 1, traitor: 0 },
  4: { lord: 1, loyalist: 1, rebel: 2, traitor: 0 },
  5: { lord: 1, loyalist: 1, rebel: 2, traitor: 1 },
  6: { lord: 1, loyalist: 1, rebel: 3, traitor: 1 },
  7: { lord: 1, loyalist: 2, rebel: 3, traitor: 1 },
  8: { lord: 1, loyalist: 2, rebel: 4, traitor: 1 },
};

export function compositionText(state: GameState, mode: GameMode): string {
  if (mode === 'identity') {
    const counts = IDENTITY_COUNTS[state.players.length] ?? IDENTITY_COUNTS[8];
    return `主${counts.lord} 忠${counts.loyalist} 反${counts.rebel} 内${counts.traitor}`;
  }
  if (mode === 'guozhan') {
    const counts: Record<string, number> = { wei: 0, shu: 0, wu: 0, qun: 0 };
    for (const player of state.players) counts[player.faction] = (counts[player.faction] ?? 0) + 1;
    return `魏${counts.wei} 蜀${counts.shu} 吴${counts.wu} 群${counts.qun}`;
  }
  if (mode === 'landlord') {
    return `地主1 农民${Math.max(0, state.players.length - 1)}`;
  }
  return '';
}
