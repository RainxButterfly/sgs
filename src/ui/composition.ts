import type { GameMode, GameState, Role } from '../core/types';

export function compositionText(state: GameState, mode: GameMode): string {
  const alive = state.players.filter((player) => player.alive);
  if (mode === 'identity') {
    const counts: Record<Role, number> = state.roleCounts
      ? { ...state.roleCounts }
      : { lord: 0, loyalist: 0, rebel: 0, traitor: 0 };
    if (!state.roleCounts) {
      for (const player of alive) counts[player.role] += 1;
    }
    return `主公：${counts.lord} 忠臣：${counts.loyalist} 反贼：${counts.rebel} 内奸：${counts.traitor}`;
  }
  if (mode === 'guozhan') {
    const counts: Record<string, number> = { wei: 0, shu: 0, wu: 0, qun: 0 };
    for (const player of alive) counts[player.faction] = (counts[player.faction] ?? 0) + 1;
    return `魏：${counts.wei} 蜀：${counts.shu} 吴：${counts.wu} 群：${counts.qun}`;
  }
  if (mode === 'landlord') {
    const lord = state.roleCounts?.lord ?? alive.filter((player) => player.role === 'lord').length;
    return `地主：${lord} 农民：${Math.max(0, alive.length - lord)}`;
  }
  return '';
}
