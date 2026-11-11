import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { SimIO } from '../bot';
import type { Card } from '../types';

function card(name: string, suit: Card['suit'], rank: number, element?: Card['element']): Card {
  return { id: `t-${name}-${suit}-${rank}-${element ?? ''}`, name, suit, rank, type: 'basic', element };
}

function gameWith(heroSkills: string[]) {
  const game = new Game(
    {
      players: [
        { name: 'P1', heroId: '', isBot: false },
        { name: 'P2', heroId: '', isBot: true },
      ],
      seed: 1,
      rules: { skillsEnabled: true },
    },
    new SimIO(),
  );
  const player = game.state.players[0];
  player.skills = heroSkills;
  return { game, player };
}

function options(game: Game, player: unknown, name: string) {
  return (game as unknown as { buildRespondOptions: (p: unknown, n: string) => { cardId: string; as: string; skillId?: string }[] })
    .buildRespondOptions(player, name);
}

describe('响应杀', () => {
  it('火杀和雷杀可以作为杀响应南蛮', () => {
    const { game, player } = gameWith([]);
    player.hand = [card('杀', 'heart', 4, 'fire'), card('杀', 'spade', 5, 'thunder')];
    const result = options(game, player, '杀');
    expect(result.map((item) => item.cardId)).toEqual(player.hand.map((item) => item.id));
  });

  it('禁酒的酒可以作为杀响应南蛮', () => {
    const { game, player } = gameWith(['jinjiu']);
    const wine = card('酒', 'spade', 3);
    player.hand = [wine];
    const result = options(game, player, '杀');
    expect(result).toContainEqual(expect.objectContaining({ cardId: wine.id, as: '杀', skillId: 'jinjiu' }));
  });

  it('武圣红牌和龙胆闪都可以作为杀响应', () => {
    const { game, player } = gameWith(['wusheng', 'longdan']);
    const red = card('桃', 'heart', 2);
    const dodge = card('闪', 'diamond', 3);
    player.hand = [red, dodge];
    const result = options(game, player, '杀');
    expect(result).toContainEqual(expect.objectContaining({ cardId: red.id, as: '杀', skillId: 'wusheng' }));
    expect(result).toContainEqual(expect.objectContaining({ cardId: dodge.id, as: '杀', skillId: 'longdan' }));
  });
});
