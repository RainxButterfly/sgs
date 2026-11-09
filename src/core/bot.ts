import type {
  AskRequest,
  CardOption,
  GameAction,
  GameEvent,
  GameIO,
} from './types';

function pick<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function botAction(req: AskRequest): GameAction {
  switch (req.kind) {
    case 'play': {
      const cards = req.cardOptions ?? [];
      const skills = req.skillOptions ?? [];
      if (skills.length && Math.random() < 0.25) {
        return { type: 'activateSkill', skillId: pick(skills)!.id };
      }
      if (!cards.length) return { type: 'endPlay' };
      const usable = cards.filter((c) => c.targetMax === 0 || c.validTargets.length > 0);
      const option: CardOption | null = pick(usable.length ? usable : cards);
      if (!option) return { type: 'endPlay' };
      let targets: number[] = [];
      if (option.targetAfter && option.validTargets.length) {
        const first = pick(option.validTargets);
        const follow = first !== null ? option.targetAfter[first] ?? [] : [];
        const second = pick(follow);
        if (first === null || second === null) return { type: 'endPlay' };
        targets = [first, second];
      } else if (option.targetMax > 0 && option.validTargets.length) {
        const want = Math.max(option.targetMin, Math.min(option.targetMax, 1));
        const pool = [...option.validTargets];
        for (let i = 0; i < want && pool.length; i += 1) {
          const idx = Math.floor(Math.random() * pool.length);
          targets.push(pool.splice(idx, 1)[0]);
        }
        if (targets.length < option.targetMin) return { type: 'endPlay' };
      }
      return {
        type: 'useCard',
        cardId: option.cardId,
        as: option.as,
        targets,
        skillId: option.skillId,
        extraCardIds: option.extraCardIds,
        element: option.element,
      };
    }
    case 'respond': {
      const cards = req.cardOptions ?? [];
      if (!cards.length) return { type: 'cancel' };
      if (req.respondName === '无懈可击' && Math.random() < 0.55) return { type: 'cancel' };
      if (req.respondName === '桃' && Math.random() < 0.08) return { type: 'cancel' };
      if (req.respondName === '闪' && Math.random() < 0.05) return { type: 'cancel' };
      const option = pick(cards)!;
      return {
        type: 'respondCard',
        cardId: option.cardId,
        as: option.as,
        skillId: option.skillId,
        extraCardIds: option.extraCardIds,
      };
    }
    case 'chooseCards': {
      const cards = req.cards ?? [];
      const min = req.min ?? 0;
      const max = req.max ?? cards.length;
      const count = Math.max(min, Math.min(max, min));
      const pool = [...cards];
      const ids: string[] = [];
      for (let i = 0; i < count && pool.length; i += 1) {
        const idx = Math.floor(Math.random() * pool.length);
        ids.push(pool.splice(idx, 1)[0].id);
      }
      return { type: 'chooseCards', cardIds: ids };
    }
    case 'choosePlayer': {
      const players = req.players ?? [];
      if (!players.length) return { type: 'cancel' };
      return { type: 'choosePlayers', playerIds: [pick(players)!] };
    }
    case 'chooseOption': {
      const options = req.options ?? [];
      if (!options.length) return { type: 'cancel' };
      if (req.canCancel && Math.random() < 0.15) return { type: 'cancel' };
      const preferred = options.filter((o) => o.id !== 'no');
      return { type: 'chooseOption', optionId: pick(preferred.length ? preferred : options)!.id };
    }
    case 'reorder': {
      const cards = [...(req.cards ?? [])].sort(() => Math.random() - 0.5);
      return { type: 'chooseCards', cardIds: cards.map((c) => c.id) };
    }
    case 'discard': {
      return { type: 'cancel' };
    }
    default:
      return { type: 'cancel' };
  }
}

export class SimIO implements GameIO {
  asks = 0;
  events: GameEvent[] = [];
  stopped = false;
  onLog?: (text: string) => void;
  onLimit?: () => void;

  async ask(req: AskRequest): Promise<GameAction> {
    this.asks += 1;
    if (this.asks > 20000) {
      this.stopped = true;
      this.onLimit?.();
      if (req.kind === 'play') return { type: 'endPlay' };
      return { type: 'cancel' };
    }
    return botAction(req);
  }

  emit(ev: GameEvent): void {
    if (ev.type === 'log' && this.onLog) this.onLog(ev.text);
    if (this.events.length < 5000) this.events.push(ev);
  }

  async delay(): Promise<void> {
    // no-op
  }
}
