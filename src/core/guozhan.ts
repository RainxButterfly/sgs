import { PLAYABLE_HEROES } from './deck';
import type { Faction } from './types';

const FACTIONS: Faction[] = ['wei', 'shu', 'wu', 'qun'];

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 电脑势力配额：先给落单的人类势力补队友，再按两人一组填充，尽量不让单一势力超过半数。 */
export function planBotFactions(total: number, humanFactions: Faction[]): Faction[] {
  const counts = new Map<Faction, number>();
  for (const faction of humanFactions) counts.set(faction, (counts.get(faction) ?? 0) + 1);
  const cap = Math.max(2, Math.floor(total / 2));
  let remaining = Math.max(0, total - humanFactions.length);
  const bots: Faction[] = [];
  for (const faction of shuffled(FACTIONS)) {
    if (remaining <= 0) break;
    if ((counts.get(faction) ?? 0) === 1) {
      bots.push(faction);
      counts.set(faction, 2);
      remaining -= 1;
    }
  }
  while (remaining >= 2) {
    const options = FACTIONS.filter((f) => (counts.get(f) ?? 0) + 2 <= cap);
    const pool = options.length ? options : FACTIONS;
    const faction = pool[Math.floor(Math.random() * pool.length)];
    bots.push(faction, faction);
    counts.set(faction, (counts.get(faction) ?? 0) + 2);
    remaining -= 2;
  }
  if (remaining === 1) {
    const options = FACTIONS.filter((f) => (counts.get(f) ?? 0) + 1 <= cap);
    const pool = options.length ? options : FACTIONS;
    bots.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return shuffled(bots);
}

/** 从候选池取一组同势力双将；优先指定势力，数量不足时退回随机势力。 */
export function takeFactionPair(
  available: Set<string>,
  faction?: Faction,
): { primary: string; secondary: string } | null {
  const groups = FACTIONS.map((f) =>
    PLAYABLE_HEROES.filter((hero) => available.has(hero.id) && hero.faction === f),
  ).filter((group) => group.length >= 2);
  if (!groups.length) return null;
  const preferred = faction ? groups.find((group) => group[0].faction === faction) : undefined;
  const group = [...(preferred ?? groups[Math.floor(Math.random() * groups.length)])];
  const primary = group.splice(Math.floor(Math.random() * group.length), 1)[0].id;
  const secondary = group.splice(Math.floor(Math.random() * group.length), 1)[0].id;
  available.delete(primary);
  available.delete(secondary);
  return { primary, secondary };
}