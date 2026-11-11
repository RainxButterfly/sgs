import { describe, expect, it } from 'vitest';
import { Game } from '../../core/game';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../../core/types';
import { heroSkillGroups, visibleHeroNames, visibleSkillIds } from '../labels';

class QuietIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(_req: AskRequest): Promise<GameAction> {
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeGame(): Game {
  return new Game(
    {
      players: [
        { name: '甲', heroIds: ['caocao', 'xiahoudun'], heroId: 'caocao' },
        { name: '乙', heroIds: ['liubei', 'guanyu'], heroId: 'liubei' },
        { name: '丙', heroIds: ['sunquan', 'zhouyu'], heroId: 'sunquan' },
        { name: '丁', heroIds: ['lvbu', 'diaochan'], heroId: 'lvbu' },
      ],
      roles: ['rebel', 'rebel', 'rebel', 'rebel'],
      seed: 20261111,
      rules: { mode: 'guozhan', skillsEnabled: true },
    },
    new QuietIO(),
  );
}

describe('国战双将技能分组', () => {
  it('未明置时对手看不到两个武将的名字与技能', () => {
    const game = makeGame();
    const player = game.state.players[0];
    const groups = heroSkillGroups(player, 'guozhan');
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.label)).toEqual(['主将', '副将']);
    expect(groups.every((group) => !group.revealed)).toBe(true);
    expect(visibleHeroNames(player, 'guozhan')).toBe('暗将');
    expect(visibleSkillIds(player, 'guozhan')).toEqual([]);
  });

  it('明置主将后只展示主将一组，副将仍是暗将', () => {
    const game = makeGame();
    const player = game.state.players[0];
    game.revealGeneral(player, 0);
    const groups = heroSkillGroups(player, 'guozhan');
    expect(groups[0].revealed).toBe(true);
    expect(groups[0].name).toBe('曹操');
    expect(groups[0].skillIds).toContain('jianxiong');
    expect(groups[1].revealed).toBe(false);
    expect(visibleHeroNames(player, 'guozhan')).toBe('曹操');
    expect(visibleSkillIds(player, 'guozhan')).toContain('jianxiong');
    expect(visibleSkillIds(player, 'guozhan')).not.toContain('ganglie');
  });

  it('自己始终能看到双将全部技能', () => {
    const game = makeGame();
    const player = game.state.players[0];
    const groups = heroSkillGroups(player, 'guozhan', true);
    expect(groups.every((group) => group.revealed)).toBe(true);
    expect(groups[1].skillIds).toContain('ganglie');
    expect(visibleHeroNames(player, 'guozhan', true)).toBe('曹操·夏侯惇');
    expect(visibleSkillIds(player, 'guozhan', true)).toEqual(
      expect.arrayContaining(['jianxiong', 'ganglie']),
    );
  });

  it('身份场单将不分组且全部可见', () => {
    const game = makeGame();
    const player = game.state.players[0];
    const groups = heroSkillGroups(player, 'identity');
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.revealed)).toBe(true);
    const single = { ...player, heroIds: ['caocao'], generalSkills: undefined, generalRevealed: undefined };
    const singleGroups = heroSkillGroups(single, 'identity');
    expect(singleGroups).toHaveLength(1);
    expect(singleGroups[0].label).toBeNull();
    expect(singleGroups[0].skillIds).toContain('jianxiong');
  });
});