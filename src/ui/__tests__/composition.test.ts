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
    startPlayer: 0,
    turn: 1,
    direction: 1,
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
  it('身份场统计当前存活人数，阵亡后减少', () => {
    const players = [
      player(0, 'lord', 'qun'),
      player(1, 'loyalist', 'qun'),
      player(2, 'rebel', 'qun'),
      player(3, 'rebel', 'qun'),
      player(4, 'traitor', 'qun'),
    ];
    expect(compositionText(state(players), 'identity')).toBe('主公：1 忠臣：1 反贼：2 内奸：1');
    players[2].alive = false;
    players[2].roleRevealed = true;
    expect(compositionText(state(players), 'identity')).toBe('主公：1 忠臣：1 反贼：1 内奸：1');
  });

  it('联机端使用房主下发的存活身份统计，不依赖被隐藏的角色字段', () => {
    const players = Array.from({ length: 5 }, (_, id) => player(id, 'rebel', 'qun'));
    const game = state(players);
    game.roleCounts = { lord: 1, loyalist: 1, rebel: 1, traitor: 1 };
    expect(compositionText(game, 'identity')).toBe('主公：1 忠臣：1 反贼：1 内奸：1');
  });

  it('国战按存活势力统计', () => {
    const players = [
      player(0, 'rebel', 'wei'),
      player(1, 'rebel', 'wei'),
      player(2, 'rebel', 'shu'),
      player(3, 'rebel', 'wu'),
      player(4, 'rebel', 'qun'),
    ];
    expect(compositionText(state(players), 'guozhan')).toBe('魏：2 蜀：1 吴：1 群：1');
    players[1].alive = false;
    expect(compositionText(state(players), 'guozhan')).toBe('魏：1 蜀：1 吴：1 群：1');
  });
});
