import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { HERO_MAP } from '../deck';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../types';
import { matchXpBreakdown } from '../../ui/profile';

class NoopIO implements GameIO {
  emit(_event: GameEvent): void {}
  ask(_req: AskRequest): Promise<GameAction> {
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeGame() {
  return new Game(
    {
      players: [
        { name: '于吉', heroId: 'yuji', isBot: false },
        { name: '刘备', heroId: 'liubei', isBot: false },
      ],
      seed: 20261114,
      rules: { skillsEnabled: true },
    },
    new NoopIO(),
  );
}

describe('于吉蛊惑声明限制', () => {
  it('满血不能声明桃，受伤后可以', () => {
    const game = makeGame();
    const yuji = game.state.players[0];
    expect(game.guhuoDeclarable(yuji, '桃')).toBe(false);
    yuji.hp = yuji.maxHp - 1;
    expect(game.guhuoDeclarable(yuji, '桃')).toBe(true);
  });

  it('不能声明闪/无懈可击，无中生有始终可声明', () => {
    const game = makeGame();
    const yuji = game.state.players[0];
    expect(game.guhuoDeclarable(yuji, '闪')).toBe(false);
    expect(game.guhuoDeclarable(yuji, '无懈可击')).toBe(false);
    expect(game.guhuoDeclarable(yuji, '无中生有')).toBe(true);
  });

  it('有合法杀目标时可声明杀，目标空城且无手牌时不可', () => {
    const game = makeGame();
    const yuji = game.state.players[0];
    const target = game.state.players[1];
    expect(game.guhuoDeclarable(yuji, '杀')).toBe(true);
    target.skills = ['kongcheng'];
    target.hand = [];
    expect(game.guhuoDeclarable(yuji, '杀')).toBe(false);
  });

  it('顺手牵羊无距离内目标时不可声明', () => {
    const game = makeGame();
    const yuji = game.state.players[0];
    const target = game.state.players[1];
    target.hand = [];
    target.equips = {};
    target.judgeZone = [];
    expect(game.guhuoDeclarable(yuji, '顺手牵羊')).toBe(false);
  });
});

describe('华雄体力', () => {
  it('华雄为 6 体力', () => {
    expect(HERO_MAP.get('huaxiong')?.hp).toBe(6);
  });
});

describe('获胜额外经验', () => {
  it('获胜额外加少量经验，失败/平局没有', () => {
    const win = matchXpBreakdown('identity', 'win', 1);
    const lose = matchXpBreakdown('identity', 'lose', 1);
    const draw = matchXpBreakdown('identity', 'draw', 1);
    expect(win.winExtra).toBeGreaterThan(0);
    expect(win.winExtra).toBeLessThanOrEqual(12);
    expect(lose.winExtra).toBe(0);
    expect(draw.winExtra).toBe(0);
    expect(win.total).toBe(win.base + win.winBonus + win.winExtra + win.realBonus);
  });
});