import type { GameMode, GameState } from '../core/types';

export function compositionText(state: GameState, mode: GameMode): string {
  if (mode === 'identity') {
    const counts = { lord: 0, loyalist: 0, rebel: 0, traitor: 0 };
    for (const player of state.players) counts[player.role] += 1;
    return `主${counts.lord} 忠${counts.loyalist} 反${counts.rebel} 内${counts.traitor}`;
  }
  if (mode === 'guozhan') {
    const counts: Record<string, number> = { wei: 0, shu: 0, wu: 0, qun: 0 };
    for (const player of state.players) counts[player.faction] = (counts[player.faction] ?? 0) + 1;
    return `魏${counts.wei} 蜀${counts.shu} 吴${counts.wu} 群${counts.qun}`;
  }
  if (mode === 'landlord') {
    const lords = state.players.filter((player) => player.role === 'lord').length;
    return `地主${lords} 农民${state.players.length - lords}`;
  }
  return '';
}
