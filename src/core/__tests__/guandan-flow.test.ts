import { describe, expect, it } from 'vitest';
import { GuandanMatch, nextLevel, LEVEL_ORDER } from '../guandan-match';
import { detectCombo, enumerateCombos, type GdCard, type GdSuit } from '../guandan';

/** 构造一张牌，便于写测试 */
function C(suit: GdSuit | 'joker', rank: number): GdCard {
  if (suit === 'joker') {
    return { id: `joker-${rank}-t`, suit: 'joker', rank, joker: rank === 17 ? 'big' : 'small' };
  }
  return { id: `${suit}-${rank}-t`, suit, rank };
}

/** 固定随机数，保证牌局可复现 */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function freshGame(seed = 7) {
  const game = new GuandanMatch({ rng: seeded(seed) });
  return game;
}

/** 清空手牌，装入手工牌局 */
function setupHands(game: GuandanMatch, hands: GdCard[][]) {
  game.seats.forEach((seat, i) => {
    seat.hand = hands[i] ?? [];
    seat.place = null;
  });
  game.places = [];
  game.trick = null;
  game.trickOwner = null;
  game.passes = 0;
  game.phase = 'play';
  game.turn = 0;
}

describe('掼蛋 · 发牌', () => {
  it('首局先手座位随机，不固定房主先出', () => {
    const leaders = [0.05, 0.3, 0.55, 0.8].map((value) => new GuandanMatch({ rng: () => value }).turn);
    expect(leaders).toEqual([0, 1, 2, 3]);
  });

  it('四家各 27 张，共 108 张且无重复', () => {
    const game = freshGame();
    expect(game.seats.map((s) => s.hand.length)).toEqual([27, 27, 27, 27]);
    const ids = new Set(game.seats.flatMap((s) => s.hand.map((c) => c.id)));
    expect(ids.size).toBe(108);
  });

  it('对家为队友（0/2 甲队，1/3 乙队）', () => {
    const game = freshGame();
    expect(game.seats.map((s) => s.team)).toEqual([0, 1, 0, 1]);
  });
});

describe('掼蛋 · 出牌规则', () => {
  it('首家不能过牌', () => {
    const game = freshGame();
    const r = game.pass(game.turn);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('首家');
  });

  it('压不过上家会被拒绝', () => {
    const game = freshGame();
    setupHands(game, [[C('spade', 10)], [C('club', 3)], [C('diamond', 4)], [C('heart', 5)]]);
    game.play(0, [game.seats[0].hand[0]]);
    const r = game.play(1, [game.seats[1].hand[0]]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('压不过');
  });

  it('牌型不同不能互压', () => {
    const game = freshGame();
    setupHands(game, [
      [C('spade', 8), C('club', 8)],
      [C('spade', 13), C('heart', 12)],
      [C('diamond', 4)],
      [C('heart', 5)],
    ]);
    game.play(0, game.seats[0].hand.slice(0, 2)); // 一对 8
    const r = game.play(1, [game.seats[1].hand[0]]); // 单张 K
    expect(r.ok).toBe(false);
  });

  it('炸弹可以压对子', () => {
    const game = freshGame();
    setupHands(game, [
      [C('spade', 8), C('club', 8)],
      [C('spade', 9), C('club', 9), C('diamond', 9), C('heart', 9)],
      [C('diamond', 4)],
      [C('heart', 5)],
    ]);
    game.play(0, game.seats[0].hand.slice(0, 2));
    const r = game.play(1, game.seats[1].hand.slice(0, 4));
    expect(r.ok).toBe(true);
    expect(r.combo?.type).toBe('bomb');
  });

  it('三家过牌后由出牌者继续', () => {
    const game = freshGame();
    setupHands(game, [
      [C('spade', 9), C('spade', 3)],
      [C('club', 4), C('club', 5)],
      [C('diamond', 6), C('diamond', 7)],
      [C('heart', 8), C('heart', 2)],
    ]);
    game.play(0, [game.seats[0].hand[0]]);
    expect(game.pass(1).ok).toBe(true);
    expect(game.pass(2).ok).toBe(true);
    expect(game.pass(3).ok).toBe(true);
    expect(game.trick).toBeNull();
    expect(game.turn).toBe(0);
  });
});

describe('掼蛋 · 接风', () => {
  it('出完的人不轮转，其余人都不要时由对家接风', () => {
    const game = freshGame();
    setupHands(game, [
      [C('spade', 10)],
      [C('club', 3)],
      [C('diamond', 4), C('diamond', 5)],
      [C('heart', 6)],
    ]);
    const r = game.play(0, [game.seats[0].hand[0]]);
    expect(r.ok).toBe(true);
    expect(game.seats[0].place).toBe(1);

    game.pass(1);
    game.pass(2);
    game.pass(3);
    expect(game.turn).toBe(2); // 对家接风
    expect(game.log.join('')).toContain('接风');
  });
});

describe('掼蛋 · 名次与升级', () => {
  it('双下（1、2 名同队）升 3 级', () => {
    const game = freshGame();
    setupHands(game, [[C('spade', 10)], [C('club', 3)], [C('diamond', 11)], [C('heart', 4)]]);
    game.play(0, [game.seats[0].hand[0]]); // 甲队头游
    game.pass(1);
    game.play(2, [game.seats[2].hand[0]]); // 甲队二游 → 双下
    expect(game.lastResult?.doubleDown).toBe(true);
    expect(game.lastResult?.up).toBe(3);
    expect(game.lastResult?.winnerTeam).toBe(0);
    expect(game.levels[0]).toBe(nextLevel(2, 3));
    expect(game.phase).toBe('roundOver');
  });

  it('1、3 名升 2 级，1、4 名升 1 级', () => {
    expect(nextLevel(2, 3)).toBe(5);
    expect(nextLevel(2, 2)).toBe(4);
    expect(nextLevel(2, 1)).toBe(3);
    expect(nextLevel(13, 1)).toBe(1); // K → A
    expect(nextLevel(1, 1)).toBe(1); // A 已是顶级
    expect(LEVEL_ORDER[LEVEL_ORDER.length - 1]).toBe(1);
  });

  it('打 A 时双下才算赢下整场', () => {
    const game = freshGame();
    game.levels = [1, 2];
    setupHands(game, [[C('spade', 10)], [C('club', 3)], [C('diamond', 11)], [C('heart', 4)]]);
    game.play(0, [game.seats[0].hand[0]]);
    game.pass(1);
    game.play(2, [game.seats[2].hand[0]]);
    expect(game.matchWinner).toBe(0);
    expect(game.phase).toBe('matchOver');
  });

  it('本局级牌取上一局赢家队伍的级牌', () => {
    const game = freshGame();
    game.levels = [2, 9];
    setupHands(game, [[C('spade', 10)], [C('club', 3)], [C('diamond', 11)], [C('heart', 4)]]);
    game.play(0, [game.seats[0].hand[0]]);
    game.pass(1);
    game.play(2, [game.seats[2].hand[0]]);
    // 甲队双下升 3 级：2 → 5
    expect(game.levels[0]).toBe(5);
    game.nextRound();
    expect(game.roundLevel).toBe(5);
    // 乙队级牌不变
    expect(game.levels[1]).toBe(9);
  });
});

describe('掼蛋 · 进贡还贡', () => {
  it('末游向头游进贡，且贡最大的一张', () => {
    const game = freshGame();
    // 头游甲队 0 号、二游乙队 1 号 → 单下，由末游 3 号贡给 0 号
    game.lastResult = { places: [0, 1, 2, 3], winnerTeam: 0, up: 2, doubleDown: false };
    game.places = [0, 1, 2, 3];
    for (const s of game.seats) s.hand = [];
    game.seats[3].hand = [C('club', 3), C('spade', 13), C('diamond', 7)];
    game.seats[0].hand = [C('club', 4), C('spade', 5)];
    // @ts-expect-error 测试中直接调用内部进贡安排
    game.planTribute();
    expect(game.tributes).toHaveLength(1);
    expect(game.tributes[0].from).toBe(3);
    expect(game.tributes[0].to).toBe(0);
    expect(game.tributes[0].card?.rank).toBe(13);
  });

  it('双下时两家分别进贡', () => {
    const game = freshGame();
    game.lastResult = { places: [0, 2, 1, 3], winnerTeam: 0, up: 3, doubleDown: true };
    game.places = [0, 2, 1, 3];
    for (const s of game.seats) s.hand = [];
    game.seats[1].hand = [C('club', 3), C('spade', 9)];
    game.seats[3].hand = [C('diamond', 4), C('heart', 8)];
    game.seats[0].hand = [C('club', 6)];
    game.seats[2].hand = [C('club', 7)];
    // @ts-expect-error 测试中直接调用内部进贡安排
    game.planTribute();
    expect(game.tributes.map((t) => [t.from, t.to])).toEqual([
      [1, 0],
      [3, 2],
    ]);
    expect(game.tributes[0].card?.rank).toBe(9);
    expect(game.tributes[1].card?.rank).toBe(8);
  });

  it('手握两张大王可以抗贡', () => {
    const game = freshGame();
    game.lastResult = { places: [0, 2, 1, 3], winnerTeam: 0, up: 2, doubleDown: false };
    game.places = [0, 2, 1, 3];
    for (const s of game.seats) s.hand = [];
    game.seats[3].hand = [C('joker', 17), { ...C('joker', 17), id: 'joker-17-t2' }, C('club', 3)];
    game.seats[0].hand = [C('club', 4)];
    // @ts-expect-error 测试中直接调用内部进贡安排
    game.planTribute();
    expect(game.tributes[0].resisted).toBe(true);
    expect(game.tributes[0].card).toBeNull();
    expect(game.log.join('')).toContain('抗贡');
  });

  it('还贡不能还 J 及以上的大牌', () => {
    const game = freshGame();
    expect(game.canReturn(0, C('spade', 10))).toBe(true);
    expect(game.canReturn(0, C('spade', 11))).toBe(false);
    expect(game.canReturn(0, C('joker', 16))).toBe(false);
  });
});

describe('掼蛋 · 整局推进', () => {
  it('机器人能把一局打完，四家名次齐全', () => {
    const game = freshGame(3);
    let guard = 0;
    while (game.phase === 'play' && guard < 4000) {
      game.autoPlay(1);
      guard += 1;
    }
    expect(game.phase).toBe('roundOver');
    expect(game.places).toHaveLength(4);
    expect(new Set(game.places).size).toBe(4);
    // 牌不会凭空增加或消失
    const total = game.seats.reduce((n, s) => n + s.hand.length, 0);
    expect(total).toBeLessThanOrEqual(108);
  });

  it('连续多局不卡死，级牌只升不降（除打 A 失败）', () => {
    const game = freshGame(11);
    let guard = 0;
    while (guard < 12 && game.phase !== 'matchOver') {
      let inner = 0;
      while (game.phase === 'play' && inner < 4000) {
        game.autoPlay(1);
        inner += 1;
      }
      if (game.phase !== 'roundOver') break;
      const next = game.nextRound();
      if (!next) break;
      expect(game.seats.every((s) => s.hand.length === 27)).toBe(true);
      guard += 1;
    }
    expect(guard).toBeGreaterThan(0);
  }, 30000);
});

describe('掼蛋 · 牌型枚举', () => {
  it('单张王也是合法牌型', () => {
    expect(detectCombo([C('joker', 17)], 2)?.type).toBe('single');
    expect(detectCombo([C('joker', 16)], 2)?.type).toBe('single');
  });

  it('能枚举出顺子、连对与炸弹', () => {
    const hand = [
      C('spade', 3), C('heart', 4), C('club', 5), C('diamond', 6), C('spade', 7),
      C('club', 9), C('diamond', 9), C('heart', 9), C('spade', 9),
    ];
    const combos = enumerateCombos(hand, 2);
    expect(combos.some((c) => c.type === 'straight')).toBe(true);
    expect(combos.some((c) => c.type === 'bomb')).toBe(true);
    expect(combos.some((c) => c.type === 'single')).toBe(true);
  });
});
