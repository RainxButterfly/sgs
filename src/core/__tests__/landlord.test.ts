import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import type { AskRequest, GameAction, GameEvent, GameIO } from '../types';

class LandlordIO implements GameIO {
  events: GameEvent[] = [];
  emit(event: GameEvent): void {
    this.events.push(event);
  }
  ask(req: AskRequest): Promise<GameAction> {
    if (req.kind === 'chooseOption') {
      const heal = req.options?.find((option) => option.id === 'heal');
      return Promise.resolve({
        type: 'chooseOption',
        optionId: /共苦/.test(req.prompt) && heal ? 'heal' : 'no',
      });
    }
    if (req.kind === 'chooseCards') {
      return Promise.resolve({ type: 'chooseCards', cardIds: [req.cards?.[0]?.id ?? ''] });
    }
    if (req.kind === 'respond') return Promise.resolve({ type: 'cancel' });
    if (req.kind === 'play') return Promise.resolve({ type: 'endPlay' });
    return Promise.resolve({ type: 'cancel' });
  }
  delay(): Promise<void> {
    return Promise.resolve();
  }
}

function makeLandlordGame(io: GameIO): Game {
  return new Game(
    {
      players: [
        { name: '地主', heroId: 'caocao', isBot: false },
        { name: '农民甲', heroId: 'liubei', isBot: false },
        { name: '农民乙', heroId: 'sunquan', isBot: false },
      ],
      roles: ['lord', 'rebel', 'rebel'],
      seed: 20261113,
      rules: { mode: 'landlord', skillsEnabled: true },
    },
    io,
  );
}

describe('斗地主规则', () => {
  it('地主不获得主公技，拥有跋扈/飞扬，农民拥有共苦', () => {
    const game = makeLandlordGame(new LandlordIO());
    const [landlord, farmerA, farmerB] = game.state.players;
    expect(landlord.maxHp).toBe(5);
    expect(landlord.skills).toEqual(expect.arrayContaining(['bahu', 'feiyang', 'jianxiong']));
    expect(landlord.skills).not.toContain('hujia');
    expect(farmerA.skills).toContain('gongku');
    expect(farmerB.skills).toContain('gongku');
    expect(farmerA.skills).not.toContain('bahu');
    expect(farmerA.maxHp).toBe(4);
  });

  it('队友阵亡触发共苦，击杀全部农民地主获胜', async () => {
    const io = new LandlordIO();
    const game = makeLandlordGame(io);
    const [landlord, farmerA, farmerB] = game.state.players;
    farmerB.hp = 2;
    const kill = (
      game as unknown as { kill: (player: unknown, killer?: unknown) => Promise<void> }
    ).kill.bind(game);

    await kill(farmerA, landlord);
    expect(farmerB.hp).toBe(3);
    expect(farmerB.flags.gongku).toBe(1);
    expect(game.state.over).toBe(false);

    await kill(farmerB, landlord);
    expect(game.state.over).toBe(true);
    expect(game.state.winner).toBe('lord');
  });

  it('地主阵亡时农民获胜', async () => {
    const game = makeLandlordGame(new LandlordIO());
    const [landlord, farmerA] = game.state.players;
    const kill = (
      game as unknown as { kill: (player: unknown, killer?: unknown) => Promise<void> }
    ).kill.bind(game);
    await kill(landlord, farmerA);
    expect(game.state.over).toBe(true);
    expect(game.state.winner).toBe('rebel');
  });
});
