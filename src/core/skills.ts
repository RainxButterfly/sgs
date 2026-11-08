import type { Game } from './game';
import type { Card, PlayerState } from './types';

export type SkillEvent =
  | 'turnStart'
  | 'turnEnd'
  | 'phaseStart'
  | 'phaseEnd'
  | 'drawPhase'
  | 'damageBefore'
  | 'damageDone'
  | 'judgeBefore'
  | 'judgeAfter'
  | 'cardUsed'
  | 'cardTargeted'
  | 'shaTargeted'
  | 'shaDodged'
  | 'shanUsed'
  | 'handLost'
  | 'equipLost'
  | 'dying'
  | 'death';

export interface SkillContext {
  game: Game;
  owner: PlayerState;
  player: PlayerState;
  source?: PlayerState;
  target?: PlayerState;
  card?: Card;
  data: Record<string, any>;
}

export interface TriggerDef {
  event: SkillEvent | SkillEvent[];
  when?: (ctx: SkillContext) => boolean;
  optional?: boolean;
  oncePerTurn?: boolean;
  prompt?: string;
  effect: (ctx: SkillContext) => Promise<void>;
}

export interface ActiveSkillDef {
  oncePerTurn?: boolean;
  usable: (game: Game, owner: PlayerState) => boolean;
  run: (game: Game, owner: PlayerState) => Promise<void>;
}

export interface ViewAsRule {
  as: string;
  usage: 'play' | 'respond' | 'both';
  filter: (game: Game, owner: PlayerState, card: Card) => boolean;
  condition?: (game: Game, owner: PlayerState) => boolean;
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  lord?: boolean;
  locked?: boolean;
  triggers?: TriggerDef[];
  active?: ActiveSkillDef;
  viewAs?: ViewAsRule[];
  unlimitedSha?: boolean;
  attackRange?: (game: Game, owner: PlayerState) => number;
  handLimit?: (game: Game, owner: PlayerState) => number;
  immortalTarget?: (game: Game, owner: PlayerState, source: PlayerState, cardName: string) => boolean;
}

const red = (c: Card) => c.suit === 'heart' || c.suit === 'diamond';
const black = (c: Card) => c.suit === 'spade' || c.suit === 'club';
const allCards = (p: PlayerState): Card[] => [
  ...p.hand,
  ...(Object.values(p.equips).filter((c): c is Card => !!c)),
];
const others = (game: Game, owner: PlayerState) => game.players.filter((p) => p.alive && p.id !== owner.id);
const isCurrent = (ctx: SkillContext) => ctx.owner.id === ctx.game.currentPlayer?.id;

const NON_DELAYED = new Set([
  '决斗',
  '过河拆桥',
  '顺手牵羊',
  '万箭齐发',
  '南蛮入侵',
  '桃园结义',
  '五谷丰登',
  '借刀杀人',
  '无中生有',
]);

const SKILLS: SkillDef[] = [
  // ---------------- 魏 ----------------
  {
    id: 'jianxiong',
    name: '奸雄',
    desc: '当你受到伤害后，你可以获得对你造成伤害的牌。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) =>
          c.target?.id === c.owner.id &&
          !!c.card &&
          (c.game.isInLimbo(c.card) || !!c.game.cardOwner(c.card)),
        optional: true,
        prompt: '是否发动【奸雄】获得造成伤害的牌？',
        effect: async (c) => {
          if (c.card) c.game.gainCard(c.owner, c.card);
        },
      },
    ],
  },
  {
    id: 'hujia',
    name: '护驾',
    desc: '主公技，当你需要使用或打出【闪】时，你可以令其他魏势力角色选择是否打出一张【闪】（视为由你使用或打出）。',
    lord: true,
  },
  {
    id: 'fankui',
    name: '反馈',
    desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id && !!c.source && c.game.hasAnyCard(c.source),
        optional: true,
        prompt: '是否发动【反馈】获得伤害来源的一张牌？',
        effect: async (c) => {
          const source = c.source!;
          const card = await c.game.pickCardFrom(source, c.owner, '反馈：选择获得一张牌');
          if (!card) return;
          const slot = card.equipSlot;
          const isPublic = !!slot || source.judgeZone.some((x) => x.id === card.id);
          c.game.gainCard(c.owner, card, source, isPublic);
          if (slot) await c.game.trigger('equipLost', { player: source, card, data: {} });
          else await c.game.afterHandChange(source);
        },
      },
    ],
  },
  {
    id: 'guicai',
    name: '鬼才',
    desc: '在一名角色的判定牌生效前，你可以打出一张手牌代替之。',
    triggers: [
      {
        event: 'judgeBefore',
        when: (c) => c.owner.hand.length > 0,
        optional: true,
        prompt: '是否发动【鬼才】替换判定牌？',
        effect: async (c) => {
          const picked = await c.game.askCards(c.owner, c.owner.hand, 1, 1, '鬼才：选择一张手牌替换判定牌');
          if (!picked.length) return;
          if (c.game.stageHandCard(c.owner, picked[0])) c.data.judgeCard = picked[0];
        },
      },
    ],
  },
  {
    id: 'ganglie',
    name: '刚烈',
    desc: '当你受到伤害后，你可以进行判定，若结果不为红桃，伤害来源需弃置两张手牌，否则受到你造成的 1 点伤害。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id && !!c.source && c.source.alive,
        optional: true,
        prompt: '是否发动【刚烈】进行判定？',
        effect: async (c) => {
          const source = c.source!;
          const judged = await c.game.judge(c.owner, '刚烈');
          if (judged.suit === 'heart') return;
          const choice = await c.game.askOption(source, '刚烈：请选择一项', [
            { id: 'discard', label: '弃置两张手牌' },
            { id: 'damage', label: '受到 1 点伤害' },
          ]);
          if (choice === 'discard' && source.hand.length >= 2) {
            const picked = await c.game.askCards(source, source.hand, 2, 2, '刚烈：弃置两张手牌', undefined, false);
            if (picked.length === 2) {
              await c.game.discardCards(source, picked, '刚烈');
              return;
            }
          }
          await c.game.damage(c.owner, source, 1, undefined, '刚烈');
        },
      },
    ],
  },
  {
    id: 'tuxi',
    name: '突袭',
    desc: '摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色各一张手牌。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c) && others(c.game, c.owner).some((p) => p.hand.length > 0),
        optional: true,
        prompt: '是否发动【突袭】改为获得其他角色的手牌？',
        effect: async (c) => {
          c.data.skip = true;
          const chosen = new Set<number>();
          for (let i = 0; i < 2; i += 1) {
            const candidates = others(c.game, c.owner).filter((p) => p.hand.length > 0 && !chosen.has(p.id));
            if (!candidates.length) break;
            const target = await c.game.askPlayer(
              c.owner,
              candidates,
              `突袭：选择第 ${i + 1} 名角色（可取消）`,
              '获得其一张随机手牌',
              true,
            );
            if (!target) break;
            chosen.add(target.id);
            const card = c.game.randomItem(target.hand);
            if (card) {
              c.game.gainCard(c.owner, card, target, false);
              await c.game.afterHandChange(target);
            }
          }
        },
      },
    ],
  },
  {
    id: 'luoyi',
    name: '裸衣',
    desc: '摸牌阶段，你可以少摸一张牌，若如此做，本回合你使用【杀】或【决斗】造成的伤害 +1。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c),
        optional: true,
        prompt: '是否发动【裸衣】少摸一张牌，本回合杀与决斗伤害 +1？',
        effect: async (c) => {
          c.data.drawCount = Math.max(0, Number(c.data.drawCount ?? 2) - 1);
          c.owner.flags.luoyi = 1;
        },
      },
    ],
  },
  {
    id: 'tiandu',
    name: '天妒',
    desc: '当你的判定牌生效后，你可以获得此牌。',
    triggers: [
      {
        event: 'judgeAfter',
        when: (c) => c.player?.id === c.owner.id && !!c.card,
        optional: true,
        prompt: '是否发动【天妒】获得判定牌？',
        effect: async (c) => {
          if (!c.card) return;
          c.game.gainCard(c.owner, c.card);
          c.data.gained = true;
        },
      },
    ],
  },
  {
    id: 'yiji',
    name: '遗计',
    desc: '当你受到伤害后，你可以摸两张牌，然后将这些牌交给任意角色。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id,
        optional: true,
        prompt: '是否发动【遗计】摸两张牌并分配？',
        effect: async (c) => {
          const drawn = c.game.drawCards(c.owner, 2, '遗计');
          if (!drawn.length) return;
          const give = await c.game.askCards(c.owner, drawn, 0, 2, '遗计：选择要交给其他角色的牌', '不选则全部保留', true);
          if (!give.length) return;
          const target = await c.game.askPlayer(c.owner, others(c.game, c.owner), '遗计：选择一名角色');
          if (!target) return;
          for (const card of give) c.game.gainCard(target, card, c.owner, false);
          await c.game.afterHandChange(c.owner);
        },
      },
    ],
  },
  {
    id: 'qingguo',
    name: '倾国',
    desc: '你可以将一张黑色手牌当【闪】使用或打出。',
    viewAs: [{ as: '闪', usage: 'respond', filter: (_g, _o, card) => black(card) }],
  },
  {
    id: 'luoshen',
    name: '洛神',
    desc: '准备阶段，你可以进行判定，若结果为黑色，你获得此牌并可重复此流程。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'prepare',
        optional: true,
        prompt: '是否发动【洛神】？',
        effect: async (c) => {
          let judged = await c.game.judge(c.owner, '洛神', {
            gainTo: c.owner,
            gainIf: (card) => black(card),
          });
          if (!black(judged)) return;
          for (let i = 0; i < 10; i += 1) {
            const go = await c.game.confirm(c.owner, '洛神：是否继续判定？', '洛神');
            if (!go) break;
            judged = await c.game.judge(c.owner, '洛神', {
              gainTo: c.owner,
              gainIf: (card) => black(card),
            });
            if (!black(judged)) break;
          }
        },
      },
    ],
  },

  // ---------------- 蜀 ----------------
  {
    id: 'rende',
    name: '仁德',
    desc: '出牌阶段，你可以将任意张手牌交给其他角色；当你于此阶段给出第二张牌时，你回复 1 点体力。',
    active: {
      usable: (_g, owner) => owner.hand.length > 0,
      run: async (game, owner) => {
        const cards = await game.askCards(owner, owner.hand, 1, owner.hand.length, '仁德：选择要交给其他角色的手牌');
        if (!cards.length) return;
        const target = await game.askPlayer(owner, others(game, owner), '仁德：选择一名角色');
        if (!target) return;
        for (const card of cards) game.gainCard(target, card, owner, false);
        await game.afterHandChange(owner);
        owner.flags.rende = (owner.flags.rende ?? 0) + cards.length;
        if ((owner.flags.rende ?? 0) >= 2 && !owner.flags.rendeHeal) {
          owner.flags.rendeHeal = 1;
          game.heal(owner, owner, 1, { reason: '仁德' });
        }
      },
    },
  },
  {
    id: 'jijiang',
    name: '激将',
    desc: '主公技，当你需要使用或打出【杀】时，你可以令其他蜀势力角色选择是否打出一张【杀】（视为由你使用或打出）。',
    lord: true,
  },
  {
    id: 'wusheng',
    name: '武圣',
    desc: '你可以将一张红色牌当【杀】使用或打出。',
    viewAs: [{ as: '杀', usage: 'both', filter: (_g, _o, card) => red(card) }],
  },
  {
    id: 'paoxiao',
    name: '咆哮',
    desc: '锁定技，出牌阶段你使用【杀】无次数限制。',
    locked: true,
    unlimitedSha: true,
  },
  {
    id: 'guanxing',
    name: '观星',
    desc: '准备阶段，你可以观看牌堆顶的 X 张牌（X 为存活角色数且至多 5），以任意顺序置于牌堆顶或牌堆底。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'prepare',
        optional: true,
        prompt: '是否发动【观星】？',
        effect: async (c) => {
          const alive = c.game.alivePlayers().length;
          const deck = c.game.state.deck;
          const n = Math.min(5, alive, deck.length);
          if (n <= 0) return;
          const cards = deck.splice(deck.length - n, n);
          const { top, bottom } = await c.game.askReorder(
            c.owner,
            cards,
            '观星：依次选择置于牌堆顶的牌，其余置于牌堆底',
          );
          deck.push(...top.slice().reverse());
          deck.unshift(...bottom);
          c.game.log(`【${c.owner.name}】发动观星，调整了 ${n} 张牌`, 'skill');
        },
      },
    ],
  },
  {
    id: 'kongcheng',
    name: '空城',
    desc: '锁定技，当你没有手牌时，你不能成为【杀】或【决斗】的目标。',
    locked: true,
    immortalTarget: (_g, owner, _source, cardName) =>
      owner.hand.length === 0 && (cardName === '杀' || cardName === '决斗'),
  },
  {
    id: 'longdan',
    name: '龙胆',
    desc: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
    viewAs: [
      { as: '闪', usage: 'respond', filter: (_g, _o, card) => card.name === '杀' },
      { as: '杀', usage: 'both', filter: (_g, _o, card) => card.name === '闪' },
    ],
  },
  {
    id: 'mashu',
    name: '马术',
    desc: '锁定技，你计算与其他角色的距离 -1。',
    locked: true,
  },
  {
    id: 'tieji',
    name: '铁骑',
    desc: '当你使用【杀】指定目标后，你可以进行判定，若结果为红色，该角色不能使用【闪】响应此【杀】。',
    triggers: [
      {
        event: 'shaTargeted',
        when: (c) => c.source?.id === c.owner.id && !!c.target,
        optional: true,
        prompt: '是否发动【铁骑】进行判定？',
        effect: async (c) => {
          const judged = await c.game.judge(c.owner, '铁骑');
          if (red(judged)) {
            c.data.noShan = true;
            c.game.log('铁骑判定为红色，目标不能使用闪', 'skill');
          }
        },
      },
    ],
  },
  {
    id: 'jizhi',
    name: '集智',
    desc: '当你使用非延时类锦囊牌时，你可以摸一张牌。',
    triggers: [
      {
        event: 'cardUsed',
        when: (c) => c.player.id === c.owner.id && typeof c.data.as === 'string' && NON_DELAYED.has(c.data.as),
        optional: true,
        prompt: '是否发动【集智】摸一张牌？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '集智');
        },
      },
    ],
  },
  {
    id: 'qicai',
    name: '奇才',
    desc: '锁定技，你使用锦囊牌无距离限制。',
    locked: true,
  },

  // ---------------- 吴 ----------------
  {
    id: 'zhiheng',
    name: '制衡',
    desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
    active: {
      oncePerTurn: true,
      usable: (_g, owner) => allCards(owner).length > 0,
      run: async (game, owner) => {
        const all = allCards(owner);
        const picked = await game.askCards(owner, all, 1, all.length, '制衡：选择要弃置的牌');
        if (!picked.length) return;
        await game.discardCards(owner, picked, '制衡');
        game.drawCards(owner, picked.length, '制衡');
      },
    },
  },
  {
    id: 'jiuyuan',
    name: '救援',
    desc: '主公技，其他吴势力角色对你使用【桃】时，你额外回复 1 点体力。',
    lord: true,
    locked: true,
  },
  {
    id: 'qixi',
    name: '奇袭',
    desc: '你可以将一张黑色牌当【过河拆桥】使用。',
    viewAs: [{ as: '过河拆桥', usage: 'play', filter: (_g, _o, card) => black(card) }],
  },
  {
    id: 'keji',
    name: '克己',
    desc: '若你于出牌阶段内未使用或打出过【杀】，你可以跳过弃牌阶段。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) && c.data.phase === 'discard' && (c.owner.usedThisTurn.sha ?? 0) === 0,
        optional: true,
        prompt: '是否发动【克己】跳过弃牌阶段？',
        effect: async (c) => {
          c.data.skip = true;
        },
      },
    ],
  },
  {
    id: 'kurou',
    name: '苦肉',
    desc: '出牌阶段，你可以失去 1 点体力，然后摸两张牌。',
    active: {
      usable: (_g, owner) => owner.alive,
      run: async (game, owner) => {
        await game.loseHp(owner, 1);
        if (owner.alive) game.drawCards(owner, 2, '苦肉');
      },
    },
  },
  {
    id: 'yingzi',
    name: '英姿',
    desc: '锁定技，摸牌阶段你额外摸一张牌。',
    locked: true,
  },
  {
    id: 'fanjian',
    name: '反间',
    desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后获得你的一张随机手牌并展示；若此牌与所选花色不同，你对其造成 1 点伤害。',
    active: {
      oncePerTurn: true,
      usable: (_g, owner) => owner.hand.length > 0,
      run: async (game, owner) => {
        const target = await game.askPlayer(owner, others(game, owner), '反间：选择一名角色');
        if (!target) return;
        const suit = await game.askOption(
          target,
          '反间：请选择一种花色',
          [
            { id: 'spade', label: '黑桃 ♠' },
            { id: 'heart', label: '红桃 ♥' },
            { id: 'club', label: '梅花 ♣' },
            { id: 'diamond', label: '方块 ♦' },
          ],
        );
        if (!suit) return;
        const card = game.randomItem(owner.hand);
        if (!card) return;
        game.gainCard(target, card, owner, true);
        await game.afterHandChange(owner);
        if (card.suit !== suit) await game.damage(owner, target, 1, undefined, '反间');
      },
    },
  },
  {
    id: 'guose',
    name: '国色',
    desc: '你可以将一张方块牌当【乐不思蜀】使用。',
    viewAs: [{ as: '乐不思蜀', usage: 'play', filter: (_g, _o, card) => card.suit === 'diamond' }],
  },
  {
    id: 'liuli',
    name: '流离',
    desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的一名其他角色（不能是此【杀】的使用者）。',
    triggers: [
      {
        event: 'cardTargeted',
        when: (c) => {
          if (c.target?.id !== c.owner.id || c.card?.name !== '杀' || !c.source) return false;
          if (c.source.id === c.owner.id || !allCards(c.owner).length) return false;
          return c.game.players.some(
            (p) =>
              p.alive &&
              p.id !== c.owner.id &&
              p.id !== c.source!.id &&
              c.game.distance(c.owner, p) <= c.game.attackRange(c.owner),
          );
        },
        optional: true,
        prompt: '是否发动【流离】转移此【杀】？',
        effect: async (c) => {
          const source = c.source!;
          const valid = c.game.players.filter(
            (p) =>
              p.alive &&
              p.id !== c.owner.id &&
              p.id !== source.id &&
              c.game.distance(c.owner, p) <= c.game.attackRange(c.owner),
          );
          const target = await c.game.askPlayer(c.owner, valid, '流离：选择转移目标', '需弃置一张牌', true);
          if (!target) return;
          const cost = await c.game.askCards(c.owner, allCards(c.owner), 1, 1, '流离：弃置一张牌', undefined, true);
          if (!cost.length) return;
          await c.game.discardCards(c.owner, cost, '流离');
          c.data.newTarget = target.id;
        },
      },
    ],
  },
  {
    id: 'qianxun',
    name: '谦逊',
    desc: '锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标。',
    locked: true,
    immortalTarget: (_g, _owner, _source, cardName) =>
      cardName === '顺手牵羊' || cardName === '乐不思蜀',
  },
  {
    id: 'lianying',
    name: '连营',
    desc: '当你失去最后一张手牌时，你可以摸一张牌。',
    triggers: [
      {
        event: 'handLost',
        when: (c) => c.player?.id === c.owner.id && c.owner.hand.length === 0,
        optional: true,
        prompt: '是否发动【连营】摸一张牌？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '连营');
        },
      },
    ],
  },
  {
    id: 'jieyin',
    name: '结姻',
    desc: '出牌阶段限一次，你可以弃置两张手牌，令你和一名已受伤的男性角色各回复 1 点体力。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.hand.length >= 2 &&
        others(game, owner).some((p) => p.gender === 'male' && p.hp < p.maxHp),
      run: async (game, owner) => {
        const valid = others(game, owner).filter((p) => p.gender === 'male' && p.hp < p.maxHp);
        const target = await game.askPlayer(owner, valid, '结姻：选择一名已受伤的男性角色');
        if (!target) return;
        const picked = await game.askCards(owner, owner.hand, 2, 2, '结姻：弃置两张手牌');
        if (picked.length !== 2) return;
        await game.discardCards(owner, picked, '结姻');
        game.heal(owner, owner, 1, { reason: '结姻' });
        game.heal(owner, target, 1, { reason: '结姻' });
      },
    },
  },
  {
    id: 'xiaoji',
    name: '枭姬',
    desc: '当你失去装备区里的一张牌时，你可以摸两张牌。',
    triggers: [
      {
        event: 'equipLost',
        when: (c) => c.player?.id === c.owner.id,
        optional: true,
        prompt: '是否发动【枭姬】摸两张牌？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 2, '枭姬');
        },
      },
    ],
  },

  // ---------------- 群 ----------------
  {
    id: 'jijiu',
    name: '急救',
    desc: '你的回合外，你可以将一张红色牌当【桃】使用。',
    viewAs: [
      {
        as: '桃',
        usage: 'respond',
        filter: (_g, _o, card) => red(card),
        condition: (game, owner) => game.currentPlayer?.id !== owner.id,
      },
    ],
  },
  {
    id: 'qingnang',
    name: '青囊',
    desc: '出牌阶段限一次，你可以弃置一张手牌，令一名角色回复 1 点体力。',
    active: {
      oncePerTurn: true,
      usable: (_g, owner) => owner.hand.length > 0,
      run: async (game, owner) => {
        const card = await game.askCards(owner, owner.hand, 1, 1, '青囊：弃置一张手牌');
        if (!card.length) return;
        const target = await game.askPlayer(
          owner,
          game.players.filter((p) => p.alive),
          '青囊：选择一名角色回复体力',
        );
        if (!target) return;
        await game.discardCards(owner, card, '青囊');
        game.heal(owner, target, 1, { reason: '青囊' });
      },
    },
  },
  {
    id: 'wushuang',
    name: '无双',
    desc: '锁定技，你使用【杀】时目标需连续打出两张【闪】；与你决斗的角色每次需连续打出两张【杀】。',
    locked: true,
  },
  {
    id: 'lijian',
    name: '离间',
    desc: '出牌阶段限一次，你可以弃置一张牌，令两名男性角色进行决斗。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        allCards(owner).length > 0 && others(game, owner).filter((p) => p.gender === 'male').length >= 2,
      run: async (game, owner) => {
        const picked = await game.askCards(owner, allCards(owner), 1, 1, '离间：弃置一张牌');
        if (!picked.length) return;
        const males = others(game, owner).filter((p) => p.gender === 'male');
        const first = await game.askPlayer(owner, males, '离间：选择决斗的使用者');
        if (!first) return;
        const second = await game.askPlayer(
          owner,
          males.filter((p) => p.id !== first.id),
          '离间：选择决斗的目标',
        );
        if (!second) return;
        await game.discardCards(owner, picked, '离间');
        game.log(`【${first.name}】与【${second.name}】被离间决斗`, 'skill');
        await game.resolveDuel(first, second, null);
      },
    },
  },
  {
    id: 'biyue',
    name: '闭月',
    desc: '结束阶段，你可以摸一张牌。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'finish',
        optional: true,
        prompt: '是否发动【闭月】摸一张牌？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '闭月');
        },
      },
    ],
  },

  // ---------------- 装备 ----------------
  {
    id: 'zhuge',
    name: '诸葛连弩',
    desc: '锁定技，出牌阶段你可以无限次使用【杀】。',
    locked: true,
    unlimitedSha: true,
  },
  {
    id: 'qinggang',
    name: '青釭剑',
    desc: '锁定技，你使用【杀】时无视目标的防具。',
    locked: true,
  },
  {
    id: 'cixiong',
    name: '雌雄双股剑',
    desc: '当你使用【杀】指定异性目标后，该角色选择弃置一张手牌或令你摸一张牌。',
  },
  {
    id: 'hanbing',
    name: '寒冰剑',
    desc: '当你使用【杀】造成伤害时，你可以防止此伤害，改为弃置目标两张牌。',
  },
  {
    id: 'guanshi',
    name: '贯石斧',
    desc: '当你使用的【杀】被抵消时，你可以弃置两张牌，令此【杀】依然造成伤害。',
    triggers: [
      {
        event: 'shaDodged',
        when: (c) => c.source?.id === c.owner.id && !!c.target && allCards(c.owner).length >= 2,
        optional: true,
        prompt: '是否发动【贯石斧】弃置两张牌令此杀命中？',
        effect: async (c) => {
          const all = allCards(c.owner);
          const picked = await c.game.askCards(c.owner, all, 2, 2, '贯石斧：弃置两张牌', undefined, false);
          if (picked.length !== 2) return;
          await c.game.discardCards(c.owner, picked, '贯石斧');
          c.data.forcedHit = true;
        },
      },
    ],
  },
  {
    id: 'qinglong',
    name: '青龙偃月刀',
    desc: '当你使用的【杀】被抵消时，你可以对目标角色再使用一张【杀】。',
    triggers: [
      {
        event: 'shaDodged',
        when: (c) => c.source?.id === c.owner.id && !!c.target && c.owner.hand.length > 0,
        optional: true,
        prompt: '是否发动【青龙偃月刀】再使用一张杀？',
        effect: async (c) => {
          await c.game.useShaOn(c.owner, c.target!, '青龙偃月刀');
        },
      },
    ],
  },
  {
    id: 'zhangba',
    name: '丈八蛇矛',
    desc: '你可以将两张手牌当【杀】使用。',
    active: {
      usable: (game, owner) =>
        owner.hand.length >= 2 &&
        (game.skillsOf(owner).some((s) => s.unlimitedSha) || (owner.usedThisTurn.sha ?? 0) < 1),
      run: async (game, owner) => {
        const picked = await game.askCards(owner, owner.hand, 2, 2, '丈八蛇矛：选择两张手牌当杀');
        if (picked.length !== 2) return;
        const targets = game.shaTargets(owner);
        if (!targets.length) return;
        const target = await game.askPlayer(owner, targets, '丈八蛇矛：选择杀的目标');
        if (!target) return;
        await game.useCard(owner, picked[0], '杀', [target.id], 'zhangba', [picked[1].id]);
      },
    },
  },
  {
    id: 'fangtian',
    name: '方天画戟',
    desc: '锁定技，当你使用最后一张手牌【杀】时，你可以额外选择至多两个目标。',
    locked: true,
  },
  {
    id: 'qilin',
    name: '麒麟弓',
    desc: '当你使用【杀】对目标造成伤害后，你可以弃置其装备区里的一张坐骑牌。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) =>
          c.source?.id === c.owner.id &&
          c.card?.name === '杀' &&
          !!c.target &&
          !!(c.target.equips.horsePlus || c.target.equips.horseMinus),
        optional: true,
        prompt: '是否发动【麒麟弓】弃置目标的坐骑？',
        effect: async (c) => {
          const target = c.target!;
          if (!target.alive) return;
          const horse = target.equips.horsePlus ?? target.equips.horseMinus;
          if (!horse) return;
          await c.game.discardCards(target, [horse], '麒麟弓');
        },
      },
    ],
  },
  {
    id: 'bagua',
    name: '八卦阵',
    desc: '每当你需要使用或打出【闪】时，你可以进行判定，若为红色则视为打出一张【闪】。',
  },
  {
    id: 'renwang',
    name: '仁王盾',
    desc: '锁定技，黑色【杀】对你无效。',
    locked: true,
  },
  // ---------------- 风火林山扩展 ----------------
  {
    id: 'liegong',
    name: '烈弓',
    desc: '当你于出牌阶段使用【杀】指定目标后，若目标角色的手牌数大于或等于你的体力值，或小于或等于你的攻击范围，则该角色不能使用【闪】响应此【杀】。',
    locked: true,
  },
  {
    id: 'kuanggu',
    name: '狂骨',
    desc: '锁定技，当你对距离 1 以内的一名角色造成伤害后，你回复 1 点体力。',
    locked: true,
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.source?.id === c.owner.id && !!c.target && c.game.distance(c.owner, c.target) <= 1,
        effect: async (c) => {
          c.game.heal(c.owner, c.owner, 1, { reason: '狂骨' });
        },
      },
    ],
  },
  {
    id: 'jushou',
    name: '据守',
    desc: '结束阶段，你可以摸两张牌，然后将你的武将牌翻面。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'finish',
        optional: true,
        prompt: '是否发动【据守】摸两张牌并翻面？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 2, '据守');
          c.owner.flipped = !c.owner.flipped;
          c.game.log(`【${c.owner.name}】发动据守，武将牌${c.owner.flipped ? '翻至背面' : '翻回正面'}`, 'skill');
        },
      },
    ],
  },
  {
    id: 'tianxiang',
    name: '天香',
    desc: '每当你受到伤害时，你可以弃置一张红桃手牌，将此伤害转移给一名其他角色，然后该角色摸 X 张牌（X 为其已损失的体力值）。',
    triggers: [
      {
        event: 'damageBefore',
        when: (c) =>
          c.target?.id === c.owner.id &&
          c.owner.hand.some(
            (card) =>
              card.suit === 'heart' ||
              (c.owner.skills.includes('hongyan') && card.suit === 'spade'),
          ),
        optional: true,
        prompt: '是否发动【天香】转移伤害？',
        effect: async (c) => {
          const pool = c.owner.hand.filter(
            (card) =>
              card.suit === 'heart' ||
              (c.owner.skills.includes('hongyan') && card.suit === 'spade'),
          );
          const cost = await c.game.askCards(c.owner, pool, 1, 1, '天香：弃置一张红桃手牌', undefined, true);
          if (!cost.length) return;
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner),
            '天香：选择伤害转移目标',
            '不能选择自己',
            true,
          );
          if (!target) return;
          await c.game.discardCards(c.owner, cost, '天香');
          c.data.cancel = true;
          const amount = Number(c.data.amount ?? 1);
          c.game.log(`【${c.owner.name}】发动天香，将伤害转移给【${target.name}】`, 'skill');
          await c.game.damage(c.source ?? null, target, amount, c.card, '天香');
          if (target.alive) {
            c.game.drawCards(target, Math.max(0, target.maxHp - target.hp), '天香');
          }
        },
      },
    ],
  },
  {
    id: 'hongyan',
    name: '红颜',
    desc: '锁定技，你的黑桃牌视为红桃牌。',
    locked: true,
  },
  {
    id: 'bujue',
    name: '不屈',
    desc: '锁定技，当你处于濒死状态时，亮出牌堆顶一张牌置于你的武将牌上；若点数与已有的牌均不同，你将体力回复至 1 点。',
    locked: true,
  },
  {
    id: 'leiji',
    name: '雷击',
    desc: '当你使用或打出【闪】时，你可以进行判定，若结果为黑桃，你选择一名角色，对其造成 2 点雷电伤害。',
    triggers: [
      {
        event: 'shanUsed',
        when: (c) => c.owner.id === c.player.id,
        optional: true,
        prompt: '是否发动【雷击】进行判定？',
        effect: async (c) => {
          const judged = await c.game.judge(c.owner, '雷击');
          if (judged.suit !== 'spade') return;
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner),
            '雷击：选择一名角色造成 2 点伤害',
          );
          if (target) await c.game.damage(c.owner, target, 2, undefined, '雷击');
        },
      },
    ],
  },
  {
    id: 'guidao',
    name: '鬼道',
    desc: '在一名角色的判定牌生效前，你可以打出一张黑色手牌代替之。',
    triggers: [
      {
        event: 'judgeBefore',
        when: (c) => c.owner.hand.some((card) => black(card)),
        optional: true,
        prompt: '是否发动【鬼道】替换判定牌？',
        effect: async (c) => {
          const pool = c.owner.hand.filter((card) => black(card));
          const picked = await c.game.askCards(c.owner, pool, 1, 1, '鬼道：选择一张黑色手牌替换判定牌');
          if (!picked.length) return;
          if (c.game.stageHandCard(c.owner, picked[0])) c.data.judgeCard = picked[0];
        },
      },
    ],
  },
  {
    id: 'huangtian',
    name: '黄天',
    desc: '主公技，其他群势力角色的出牌阶段限一次，该角色可以将一张【闪】或【闪电】交给你。',
    lord: true,
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.faction === 'qun' &&
        !owner.skills.includes('leiji') &&
        game.players.some((p) => p.alive && p.skills.includes('huangtian') && p.id !== owner.id) &&
        owner.hand.some((card) => card.name === '闪' || card.name === '闪电'),
      run: async (game, owner) => {
        const lord = game.players.find(
          (p) => p.alive && p.skills.includes('huangtian') && p.id !== owner.id,
        );
        if (!lord) return;
        const pool = owner.hand.filter((card) => card.name === '闪' || card.name === '闪电');
        const picked = await game.askCards(owner, pool, 1, 1, '黄天：选择一张闪或闪电交给主公');
        if (!picked.length) return;
        game.gainCard(lord, picked[0], owner, true);
        await game.afterHandChange(owner);
      },
    },
  },
  {
    id: 'qiangxi',
    name: '强袭',
    desc: '出牌阶段限一次，你可以失去 1 点体力或弃置一张武器牌，然后对攻击范围内的一名角色造成 1 点伤害。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        others(game, owner).some((p) => game.distance(owner, p) <= game.attackRange(owner)),
      run: async (game, owner) => {
        const targets = others(game, owner).filter(
          (p) => game.distance(owner, p) <= game.attackRange(owner),
        );
        const target = await game.askPlayer(owner, targets, '强袭：选择攻击范围内的一名角色');
        if (!target) return;
        const choice = await game.askOption(
          owner,
          '强袭：选择代价',
          [
            { id: 'hp', label: '失去 1 点体力' },
            { id: 'weapon', label: '弃置武器牌', desc: owner.equips.weapon ? owner.equips.weapon.name : '没有武器' },
          ],
          undefined,
          true,
        );
        if (!choice) return;
        if (choice === 'weapon' && owner.equips.weapon) {
          await game.discardCards(owner, [owner.equips.weapon], '强袭');
        } else {
          await game.loseHp(owner, 1);
        }
        if (!owner.alive || game.state.over) return;
        await game.damage(owner, target, 1, undefined, '强袭');
      },
    },
  },
  {
    id: 'quhu',
    name: '驱虎',
    desc: '出牌阶段限一次，你可以与一名体力值大于你的角色拼点。若你赢，该角色对其攻击范围内另一名由你指定的角色造成 1 点伤害；若你没赢，该角色对你造成 1 点伤害。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.hand.length > 0 &&
        others(game, owner).some((p) => p.hp > owner.hp && p.hand.length > 0),
      run: async (game, owner) => {
        const candidates = others(game, owner).filter((p) => p.hp > owner.hp && p.hand.length > 0);
        const target = await game.askPlayer(owner, candidates, '驱虎：选择一名体力值大于你的角色拼点');
        if (!target) return;
        const win = await game.pindian(owner, target, '驱虎');
        if (!win) {
          await game.damage(target, owner, 1, undefined, '驱虎');
          return;
        }
        const victims = game.players.filter(
          (p) => p.alive && p.id !== target.id && game.distance(target, p) <= game.attackRange(target),
        );
        if (!victims.length) return;
        const victim = await game.askPlayer(owner, victims, '驱虎：选择受到伤害的角色');
        if (victim) await game.damage(target, victim, 1, undefined, '驱虎');
      },
    },
  },
  {
    id: 'jieming',
    name: '节命',
    desc: '当你受到伤害后，你可以令一名角色将手牌补至其体力上限。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id,
        optional: true,
        prompt: '是否发动【节命】令一名角色补牌？',
        effect: async (c) => {
          const target = await c.game.askPlayer(
            c.owner,
            c.game.players.filter((p) => p.alive),
            '节命：选择一名角色补牌',
          );
          if (target) {
            c.game.drawCards(target, Math.max(0, target.maxHp - target.hand.length), '节命');
          }
        },
      },
    ],
  },
  {
    id: 'tianyi',
    name: '天义',
    desc: '出牌阶段限一次，你可以与一名角色拼点。若你赢，本回合你使用【杀】无距离限制、可额外使用一张【杀】且可以多选择一个目标；若你没赢，本回合你不能使用【杀】。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.hand.length > 0 && others(game, owner).some((p) => p.hand.length > 0),
      run: async (game, owner) => {
        const target = await game.askPlayer(
          owner,
          others(game, owner).filter((p) => p.hand.length > 0),
          '天义：选择一名角色拼点',
        );
        if (!target) return;
        const win = await game.pindian(owner, target, '天义');
        if (win) {
          owner.flags.tianyi = 1;
          game.log('【天义】生效：本回合杀无距离限制，可额外使用一张杀并多选一个目标', 'skill');
        } else {
          owner.flags.tianyiFail = 1;
          game.log('【天义】未赢：本回合不能使用杀', 'skill');
        }
      },
    },
  },
  {
    id: 'yinghun',
    name: '英魂',
    desc: '准备阶段，若你已受伤，你可以选择一名其他角色并选择一项：令其摸 X 张牌然后弃置一张牌；或令其摸一张牌然后弃置 X 张牌（X 为你已损失的体力值）。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'prepare' && c.owner.hp < c.owner.maxHp,
        optional: true,
        prompt: '是否发动【英魂】？',
        effect: async (c) => {
          const lost = c.owner.maxHp - c.owner.hp;
          const target = await c.game.askPlayer(c.owner, others(c.game, c.owner), '英魂：选择一名角色');
          if (!target) return;
          const choice = await c.game.askOption(c.owner, '英魂：选择一项', [
            { id: 'drawx', label: `令其摸 ${lost} 张牌，然后弃置一张牌` },
            { id: 'discardx', label: `令其摸一张牌，然后弃置 ${lost} 张牌` },
          ]);
          if (!choice) return;
          if (choice === 'drawx') {
            c.game.drawCards(target, lost, '英魂');
            if (target.hand.length) {
              const cards = await c.game.askCards(target, target.hand, 1, 1, '英魂：弃置一张牌', undefined, false);
              if (cards.length) await c.game.discardCards(target, cards, '英魂');
            }
          } else {
            c.game.drawCards(target, 1, '英魂');
            const count = Math.min(lost, target.hand.length);
            if (count > 0) {
              const cards = await c.game.askCards(target, target.hand, count, count, '英魂：弃置手牌', undefined, false);
              if (cards.length) await c.game.discardCards(target, cards, '英魂');
            }
          }
        },
      },
    ],
  },
  {
    id: 'haoshi',
    name: '好施',
    desc: '摸牌阶段，你可以多摸两张牌；若如此做，摸牌结束后，若你的手牌数大于 5，你将一半的手牌交给手牌数最少的一名其他角色。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c),
        optional: true,
        prompt: '是否发动【好施】多摸两张牌？',
        effect: async (c) => {
          c.data.skip = true;
          c.game.drawCards(c.owner, 4, '好施');
          if (c.owner.hand.length <= 5) return;
          const half = Math.floor(c.owner.hand.length / 2);
          const candidates = others(c.game, c.owner);
          if (!candidates.length) return;
          const minHand = Math.min(...candidates.map((p) => p.hand.length));
          const pool = candidates.filter((p) => p.hand.length === minHand);
          const target = pool[Math.floor(Math.random() * pool.length)];
          if (!target) return;
          const cards = await c.game.askCards(
            c.owner,
            c.owner.hand,
            half,
            half,
            `好施：选择 ${half} 张手牌交给【${target.name}】`,
          );
          for (const card of cards) c.game.gainCard(target, card, c.owner, false);
          await c.game.afterHandChange(c.owner);
        },
      },
    ],
  },
  {
    id: 'dimeng',
    name: '缔盟',
    desc: '出牌阶段限一次，你可以选择两名其他角色，弃置 X 张牌，然后交换他们的手牌（X 为两人手牌数之差）。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) => others(game, owner).length >= 2,
      run: async (game, owner) => {
        const first = await game.askPlayer(owner, others(game, owner), '缔盟：选择第一名角色');
        if (!first) return;
        const second = await game.askPlayer(
          owner,
          others(game, owner).filter((p) => p.id !== first.id),
          '缔盟：选择第二名角色',
        );
        if (!second) return;
        const diff = Math.abs(first.hand.length - second.hand.length);
        if (diff > 0) {
          const all = allCards(owner);
          if (all.length < diff) {
            game.log('【缔盟】手牌不足，无法支付', 'system');
            return;
          }
          const cost = await game.askCards(owner, all, diff, diff, '缔盟：弃置相差数量的牌');
          if (cost.length !== diff) return;
          await game.discardCards(owner, cost, '缔盟');
        }
        game.swapHands(first, second);
      },
    },
  },
  {
    id: 'mengjin',
    name: '猛进',
    desc: '当你使用的【杀】被目标角色使用【闪】抵消时，你可以弃置目标一张牌。',
    triggers: [
      {
        event: 'shaDodged',
        when: (c) => c.source?.id === c.owner.id && !!c.target && c.game.hasAnyCard(c.target),
        optional: true,
        prompt: '是否发动【猛进】弃置目标一张牌？',
        effect: async (c) => {
          const card = await c.game.pickCardFrom(c.target!, c.owner, '猛进：选择弃置的牌');
          if (card) await c.game.discardCards(c.target!, [card], '猛进');
        },
      },
    ],
  },
  {
    id: 'shuangxiong',
    name: '双雄',
    desc: '摸牌阶段，你可以改为亮出并获得牌堆顶一张牌；本回合你可以将与此牌颜色不同的手牌当【决斗】使用。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c),
        optional: true,
        prompt: '是否发动【双雄】改为亮出并获得一张牌？',
        effect: async (c) => {
          c.data.skip = true;
          const cards = c.game.drawRevealed(c.owner, 1, '双雄');
          if (cards.length) c.owner.flags.shuangxiong = red(cards[0]) ? 1 : 2;
        },
      },
    ],
    viewAs: [
      {
        as: '决斗',
        usage: 'play',
        filter: (_g, owner, card) =>
          !!owner.flags.shuangxiong && (red(card) ? 1 : 2) !== owner.flags.shuangxiong,
      },
    ],
  },
  {
    id: 'huoshou',
    name: '祸首',
    desc: '锁定技，【南蛮入侵】对你无效。',
    locked: true,
  },
  {
    id: 'zaiqi',
    name: '再起',
    desc: '摸牌阶段，若你已受伤，你可以改为亮出 X 张牌（X 为你已损失的体力值），回复 1 点体力，获得其中的红桃牌，弃置其余牌。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c) && c.owner.hp < c.owner.maxHp,
        optional: true,
        prompt: '是否发动【再起】？',
        effect: async (c) => {
          c.data.skip = true;
          const lost = c.owner.maxHp - c.owner.hp;
          const cards = c.game.drawRevealed(c.owner, lost, '再起');
          c.game.heal(c.owner, c.owner, 1, { reason: '再起' });
          const discard = cards.filter((card) => card.suit !== 'heart');
          if (discard.length) await c.game.discardCards(c.owner, discard, '再起');
        },
      },
    ],
  },
  {
    id: 'juxiang',
    name: '巨象',
    desc: '锁定技，【南蛮入侵】对你无效；其他角色使用的【南蛮入侵】结算结束后，你获得之。',
    locked: true,
  },
  {
    id: 'lieren',
    name: '烈刃',
    desc: '当你使用【杀】造成伤害后，你可以与目标角色拼点。若你赢，你获得其一张牌。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.source?.id === c.owner.id && c.card?.name === '杀' && !!c.target,
        optional: true,
        prompt: '是否发动【烈刃】与目标拼点？',
        effect: async (c) => {
          const target = c.target!;
          if (!target.alive || !target.hand.length) return;
          const win = await c.game.pindian(c.owner, target, '烈刃');
          if (!win) return;
          const card = await c.game.pickCardFrom(target, c.owner, '烈刃：获得一张牌');
          if (!card) return;
          const slot = card.equipSlot;
          const isPublic = !!slot || target.judgeZone.some((x) => x.id === card.id);
          c.game.gainCard(c.owner, card, target, isPublic);
          if (slot) await c.game.trigger('equipLost', { player: target, card, data: {} });
          else await c.game.afterHandChange(target);
        },
      },
    ],
  },
  {
    id: 'beige',
    name: '悲歌',
    desc: '当一名角色受到【杀】造成的伤害后，你可以弃置一张牌并进行判定：红桃，该角色回复 1 点体力；方块，该角色摸两张牌；梅花，伤害来源弃置两张牌；黑桃，伤害来源翻面。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.card?.name === '杀' && !!c.target && allCards(c.owner).length > 0,
        optional: true,
        prompt: '是否发动【悲歌】？',
        effect: async (c) => {
          const cost = await c.game.askCards(c.owner, allCards(c.owner), 1, 1, '悲歌：弃置一张牌');
          if (!cost.length) return;
          await c.game.discardCards(c.owner, cost, '悲歌');
          const judged = await c.game.judge(c.owner, '悲歌');
          const target = c.target!;
          const source = c.source;
          if (judged.suit === 'heart') {
            c.game.heal(c.owner, target, 1, { reason: '悲歌' });
          } else if (judged.suit === 'diamond') {
            c.game.drawCards(target, 2, '悲歌');
          } else if (judged.suit === 'club' && source) {
            const count = Math.min(2, source.hand.length);
            if (count > 0) {
              const cards = await c.game.askCards(source, source.hand, count, count, '悲歌：弃置手牌', undefined, false);
              if (cards.length) await c.game.discardCards(source, cards, '悲歌');
            }
          } else if (judged.suit === 'spade' && source) {
            source.flipped = !source.flipped;
            c.game.log(`【${source.name}】被悲歌翻面`, 'skill');
          }
        },
      },
    ],
  },
  {
    id: 'duanchang',
    name: '断肠',
    desc: '锁定技，当你死亡时，杀死你的角色失去所有技能。',
    locked: true,
    triggers: [
      {
        event: 'death',
        when: (c) => c.player.id === c.owner.id && !!c.source,
        effect: async (c) => {
          if (!c.source) return;
          c.source.skills = [];
          c.game.log(`【${c.source.name}】被断肠，失去所有技能`, 'skill');
        },
      },
    ],
  },
  {
    id: 'tiaoxin',
    name: '挑衅',
    desc: '出牌阶段限一次，你可以选择一名攻击范围内的角色，令其对你使用一张【杀】，否则你弃置其一张牌。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        others(game, owner).some((p) => game.distance(owner, p) <= game.attackRange(owner)),
      run: async (game, owner) => {
        const candidates = others(game, owner).filter(
          (p) => game.distance(owner, p) <= game.attackRange(owner),
        );
        const target = await game.askPlayer(owner, candidates, '挑衅：选择一名攻击范围内的角色');
        if (!target) return;
        const used = await game.useShaOn(target, owner, '挑衅');
        if (used) return;
        const card = await game.pickCardFrom(target, owner, '挑衅：弃置目标一张牌');
        if (card) await game.discardCards(target, [card], '挑衅');
      },
    },
  },
  {
    id: 'zhiji',
    name: '志继',
    desc: '觉醒技，回合开始时，若你没有手牌，你减 1 点体力上限，然后获得【观星】。',
    locked: true,
    triggers: [
      {
        event: 'turnStart',
        when: (c) => isCurrent(c) && c.owner.hand.length === 0 && !c.owner.flags.zhiji,
        optional: true,
        prompt: '是否发动【志继】觉醒？',
        effect: async (c) => {
          c.owner.flags.zhiji = 1;
          c.owner.maxHp = Math.max(1, c.owner.maxHp - 1);
          c.owner.hp = Math.min(c.owner.hp, c.owner.maxHp);
          if (!c.owner.skills.includes('guanxing')) c.owner.skills.push('guanxing');
          c.game.log(`【${c.owner.name}】觉醒，减少 1 点体力上限并获得观星`, 'skill');
        },
      },
    ],
  },
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));
export const ALL_SKILLS = SKILLS;
