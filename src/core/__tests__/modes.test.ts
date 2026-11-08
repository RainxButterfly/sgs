import { describe, expect, it } from 'vitest';
import { HEROES } from '../deck';
import { SKILL_MAP } from '../skills';
import { SimIO } from '../bot';
import { Game } from '../game';

async function run(count: number, seed: number, mode: 'identity' | 'duel' | 'landlord' | 'guozhan', heroId = '') {
  const io = new SimIO();
  const game = new Game(
    {
      players: Array.from({ length: count }, (_, idx) => ({
        name: `P${idx + 1}`,
        heroId: idx === 0 ? heroId : '',
        isBot: true,
      })),
      seed,
      rules: { mode },
    },
    io,
  );
  io.onLimit = () => game.stop();
  await game.begin();
  return { game, io };
}

describe('武将技能完整', () => {
  it('每个武将的技能与主公技都已实现', () => {
    for (const hero of HEROES) {
      for (const id of hero.skillIds) expect(SKILL_MAP.has(id), `${hero.name} 缺少技能 ${id}`).toBe(true);
      if (hero.lordSkillId) {
        expect(SKILL_MAP.has(hero.lordSkillId), `${hero.name} 缺少主公技 ${hero.lordSkillId}`).toBe(true);
      }
    }
  });
});

describe('对局模式', () => {
  it('1v1 模式可以正常结束', async () => {
    const { game, io } = await run(2, 20260301, 'duel');
    expect(game.state.players).toHaveLength(2);
    expect(game.state.players.filter((p) => p.role === 'lord')).toHaveLength(1);
    expect(game.state.over || io.stopped).toBe(true);
  }, 20000);

  it('1v1 双方没有主公加成和主公技', () => {
    const io = new SimIO();
    const game = new Game(
      {
        players: [
          { name: 'A', heroId: 'caocao', isBot: true },
          { name: 'B', heroId: 'liubei', isBot: true },
        ],
        seed: 202603011,
        rules: { mode: 'duel' },
      },
      io,
    );
    expect(game.state.players.map((p) => p.maxHp)).toEqual([4, 4]);
    expect(game.state.players.some((p) => p.skills.includes('hujia'))).toBe(false);
    expect(game.state.log.some((entry) => entry.text.includes('主公身份'))).toBe(false);
  });

  it('斗地主为 1 地主 2 农民且可以正常结束', async () => {
    const { game, io } = await run(3, 20260302, 'landlord');
    expect(game.state.players).toHaveLength(3);
    expect(game.state.players.filter((p) => p.role === 'lord')).toHaveLength(1);
    expect(game.state.players.filter((p) => p.role === 'rebel')).toHaveLength(2);
    expect(game.state.over || io.stopped).toBe(true);
  }, 20000);

  it('国战按阵营分队并可以正常结束', async () => {
    const { game, io } = await run(6, 20260303, 'guozhan');
    expect(game.state.players).toHaveLength(6);
    expect(game.state.players.every((p) => p.role === 'rebel')).toBe(true);
    const factions = new Set(game.state.players.map((p) => p.faction));
    expect(factions.size).toBeGreaterThan(1);
    expect(game.state.over || io.stopped).toBe(true);
  }, 20000);
});

describe('全部武将可以进入对局', () => {
  for (const hero of HEROES) {
    it(`${hero.name}（${hero.id}）`, async () => {
      const io = new SimIO();
      const game = new Game(
        {
          players: Array.from({ length: 4 }, (_, idx) => ({
            name: `P${idx + 1}`,
            heroId: idx === 0 ? hero.id : '',
            isBot: true,
          })),
          seed: 500000 + hero.id.length * 97,
        },
        io,
      );
      io.onLimit = () => game.stop();
      await game.begin();
      expect(game.state.players[0].heroId).toBe(hero.id);
      expect(game.state.log.length).toBeGreaterThan(3);
      expect(game.state.over || io.stopped || game.state.players.every((p) => !p.alive)).toBe(true);
    }, 20000);
  }
});
