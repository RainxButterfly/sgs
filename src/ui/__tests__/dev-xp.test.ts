import { describe, expect, it } from 'vitest';
import { HERO_MAP } from '../../core/deck';
import type { GameState } from '../../core/types';
import { normalizeProfile } from '../profile';
import { useGameStore } from '../store';

function fakeState(): GameState {
  const players = [0, 1, 2, 3].map((id) => ({
    id,
    seat: id,
    name: id === 0 ? '你' : `电脑${id}`,
    heroId: 'caocao',
    heroIds: ['caocao'],
    heroName: '曹操',
    faction: 'wei' as const,
    gender: 'male' as const,
    role: (id === 0 ? 'lord' : 'rebel') as 'lord' | 'rebel',
    roleRevealed: id === 0,
    hp: 4,
    maxHp: 4,
    alive: true,
    isBot: id !== 0,
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
    generalSkills: [['jianxiong']],
    generalRevealed: [true],
    ambition: false,
    chained: false,
  }));
  return {
    players,
    deck: [],
    discard: [],
    current: 0,
    startPlayer: 0,
    turn: 1,
    direction: -1,
    phase: 'prepare',
    over: true,
    winner: 'rebel',
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
      turnDirection: -1,
    },
  };
}

async function settle(devTainted: boolean) {
  const game = { state: fakeState() };
  const profile = normalizeProfile({ level: 1, xp: 0, totalGames: 5, wins: 2 });
  useGameStore.setState({
    game: game as never,
    humanId: 0,
    spectate: false,
    lanRole: null,
    firstPlayerId: null,
    devTainted,
    profile,
    xpGain: null,
    result: null,
  });
  useGameStore.getState().event({ type: 'gameOver', text: '反贼获胜', winner: 'rebel' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  return useGameStore.getState();
}

describe('测试对局不结算经验', () => {
  it('使用过测试工具的对局不获得经验与等级', async () => {
    const after = await settle(true);
    expect(after.xpGain).toBeNull();
    expect(after.profile.totalGames).toBe(5);
    expect(after.profile.level).toBe(1);
    expect(after.profile.xp).toBe(0);
  });

  it('正常对局照常结算经验', async () => {
    const after = await settle(false);
    expect(after.xpGain).toBeTruthy();
    expect(after.profile.totalGames).toBe(6);
    expect(after.xpGain?.total).toBeGreaterThan(0);
  });

  it('开局时重置测试标记，候选池强制选将才标记', () => {
    useGameStore.setState({ game: null, preGame: null, devTainted: true });
    useGameStore.getState().prepareLocal(4, { mode: 'identity' });
    const pre = useGameStore.getState().preGame;
    expect(pre).toBeTruthy();
    useGameStore.getState().confirmLocalPick(pre!.candidates[0]);
    expect(useGameStore.getState().devTainted).toBe(false);
    useGameStore.getState().game?.stop?.();
    useGameStore.getState().backToMenu();
  });
});

describe('本地国战势力配额', () => {
  it('人类势力至少两人，所有双将同势力', () => {
    for (let round = 0; round < 20; round += 1) {
      useGameStore.setState({ game: null, preGame: null });
      useGameStore.getState().prepareLocal(6, { mode: 'guozhan', skillsEnabled: false });
      const pre = useGameStore.getState().preGame;
      expect(pre?.candidatePairs?.length).toBeGreaterThan(0);
      const pair = pre!.candidatePairs![0];
      useGameStore.getState().confirmLocalPick(pair.primary, pair.secondary);
      const game = useGameStore.getState().game;
      expect(game).toBeTruthy();
      const players = game!.state.players;
      const humanFaction = HERO_MAP.get(pair.primary)?.faction;
      expect(players.filter((p) => p.faction === humanFaction).length).toBeGreaterThanOrEqual(2);
      for (const player of players) {
        expect(player.heroIds).toHaveLength(2);
        expect(HERO_MAP.get(player.heroIds![0])?.faction).toBe(
          HERO_MAP.get(player.heroIds![1])?.faction,
        );
        expect(player.faction).toBe(HERO_MAP.get(player.heroIds![0])?.faction);
      }
      game?.stop?.();
      useGameStore.getState().backToMenu();
    }
  });
});