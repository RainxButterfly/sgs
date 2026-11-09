import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../types';

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
        { name: '魏一', heroIds: ['caocao', 'xiahou_dun'], heroId: 'caocao' },
        { name: '魏二', heroIds: ['simayi', 'zhangliao'], heroId: 'simayi' },
        { name: '魏三', heroIds: ['xuchu', 'dianwei'], heroId: 'xuchu' },
        { name: '蜀一', heroIds: ['liubei', 'guanyu'], heroId: 'liubei' },
      ],
      roles: ['rebel', 'rebel', 'rebel', 'rebel'],
      seed: 20261118,
      rules: { mode: 'guozhan', skillsEnabled: true },
    },
    new QuietIO(),
  );
}

describe('国战暗将与野心家', () => {
  it('暗将没有技能，明置一个武将后获得该武将技能', () => {
    const game = makeGame();
    const player = game.state.players[0];
    expect(player.generalRevealed).toEqual([false, false]);
    expect(game.hasSkill(player, 'jianxiong')).toBe(false);

    expect(game.revealGeneral(player, 0)).toBe(true);
    expect(game.hasSkill(player, 'jianxiong')).toBe(true);
    expect(game.hasSkill(player, 'ganglie')).toBe(false);
    expect(player.ambition).toBe(false);
  });

  it('同势力明置人数超过半数后成为野心家', () => {
    const game = makeGame();
    const [a, b, c, d] = game.state.players;
    expect(game.revealGeneral(a, 0)).toBe(true);
    expect(game.revealGeneral(b, 0)).toBe(true);
    expect(a.ambition).toBe(false);
    expect(game.revealGeneral(c, 0)).toBe(true);
    expect(a.ambition).toBe(true);
    expect(b.ambition).toBe(true);
    expect(c.ambition).toBe(true);
    expect(d.ambition).toBe(false);
  });
});
