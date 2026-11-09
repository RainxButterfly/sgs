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
    let hidden = 0;
    let ambition = 0;
    for (const player of alive) {
      if (player.ambition) {
        ambition += 1;
      } else if (!player.generalRevealed || player.generalRevealed.some(Boolean)) {
        counts[player.faction] = (counts[player.faction] ?? 0) + 1;
      } else {
        hidden += 1;
      }
    }
    const parts = [`魏：${counts.wei}`, `蜀：${counts.shu}`, `吴：${counts.wu}`, `群：${counts.qun}`];
    if (hidden > 0) parts.push(`暗：${hidden}`);
    if (ambition > 0) parts.push(`野心家：${ambition}`);
    return parts.join(' ');
  }
  if (mode === 'landlord') {
    const lord = state.roleCounts?.lord ?? alive.filter((player) => player.role === 'lord').length;
    return `地主：${lord} 农民：${Math.max(0, alive.length - lord)}`;
  }
  return '';
}
