import { describe, expect, it } from 'vitest';
import { compositionText } from '../composition';
import type { GameState, PlayerState } from '../../core/types';

function player(id: number, role: PlayerState['role'], faction: PlayerState['faction']): PlayerState {
  return {
    id,
    seat: id,
    name: `P${id}`,
    heroId: '',
    heroName: '',
    faction,
    gender: 'male',
    role,
    roleRevealed: false,
    maxHp: 4,
    hp: 4,
    alive: true,
    hand: [],
    equips: {},
    judgeZone: [],
    flags: {},
    usedThisTurn: {},
    skipPhases: [],
    skills: [],
    extraSkills: [],
    fields: [],
    flipped: false,
    unyu: [],
    chained: false,
    isBot: false,
  };
}

function state(players: PlayerState[]): GameState {
  return {
    players,
    deck: [],
    discard: [],
    current: 0,
    turn: 1,
    phase: 'prepare',
    over: false,
    winner: null,
    log: [],
    seed: 1,
    rules: {
      mode: 'identity',
      initialHand: 4,
      drawCount: 2,
      hpModifier: 0,
      handLimitModifier: 0,
      revealRoles: false,
      skillsEnabled: true,
      allowDelayed: true,
      allowNullification: true,
      allowEquipment: true,
      military: true,
    },
  };
}

describe('身份与阵营人数', () => {
  it('身份场按人数显示固定配置，不受隐藏身份影响', () => {
    const hiddenRoles = Array.from({ length: 5 }, (_, id) => player(id, 'rebel', 'qun'));
    expect(compositionText(state(hiddenRoles), 'identity')).toBe('主1 忠1 反2 内1');
    const eight = Array.from({ length: 8 }, (_, id) => player(id, 'rebel', 'qun'));
    expect(compositionText(state(eight), 'identity')).toBe('主1 忠2 反4 内1');
  });

  it('国战按势力统计', () => {
    const players = [
      player(0, 'rebel', 'wei'),
      player(1, 'rebel', 'wei'),
      player(2, 'rebel', 'shu'),
      player(3, 'rebel', 'wu'),
      player(4, 'rebel', 'qun'),
    ];
    expect(compositionText(state(players), 'guozhan')).toBe('魏2 蜀1 吴1 群1');
  });
});
