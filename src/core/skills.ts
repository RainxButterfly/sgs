import type { Game } from './game';
import { SUIT_CN, type Card, type PlayerState } from './types';
import { EQUIP_SKILL_ID } from './equipment';

export type SkillEvent =
  | 'gameStart'
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
  | 'cardGained'
  | 'maxHpChanged'
  | 'shaTargeted'
  | 'shaDodged'
  | 'shanUsed'
  | 'handLost'
  | 'equipLost'
  | 'cardLost'
  | 'discardPhaseEnd'
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
  fromEquip?: boolean;
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
  distanceFrom?: (game: Game, owner: PlayerState, target: PlayerState) => number;
  distanceTo?: (game: Game, owner: PlayerState, target: PlayerState) => number;
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
  '火攻',
  '铁索连环',
  '无懈可击',
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
          if (c.card) await c.game.gainCard(c.owner, c.card);
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
          await c.game.gainCard(c.owner, card, source, isPublic);
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
          if (c.game.stageHandCard(c.owner, picked[0])) {
            c.data.judgeCard = picked[0];
            c.data.judgeSkill = '鬼才';
          }
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
              await c.game.gainCard(c.owner, card, target, false);
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
          await c.game.gainCard(c.owner, c.card);
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
          const times = Math.max(1, Number(c.data.amount ?? 1));
          for (let i = 0; i < times; i += 1) {
            const drawn = c.game.drawCards(c.owner, 2, '遗计');
            if (!drawn.length) return;
            for (const card of drawn) {
              const target = await c.game.askPlayer(
                c.owner,
                c.game.players.filter((p) => p.alive),
                `遗计：${card.name} 可以交给一名角色，取消则自己保留`,
                undefined,
                true,
              );
              if (!target || target.id === c.owner.id) continue;
              await c.game.gainCard(target, card, c.owner, false);
            }
            await c.game.afterHandChange(c.owner);
          }
        },
      },
    ],
  },
  {
    id: 'qingguo',
    name: '倾国',
    desc: '你可以将一张黑色手牌当【闪】使用或打出。',
    viewAs: [{ as: '闪', usage: 'respond', filter: (game, owner, card) => game.isBlackCard(owner, card) }],
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
        for (const card of cards) await game.gainCard(target, card, owner, false);
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
    active: {
      usable: (game, owner) =>
        game.shaTargets(owner).length > 0 &&
        game.players.some(
          (p) => p.alive && p.id !== owner.id && p.faction === 'shu' && p.hand.length > 0,
        ),
      run: async (game, owner) => {
        const target = await game.askPlayer(owner, game.shaTargets(owner), '激将：选择【杀】的目标');
        if (!target) return;
        const used = await game.useJijiang(owner, target.id);
        if (!used) game.log('没有蜀势力角色响应激将', 'system');
      },
    },
  },
  {
    id: 'wusheng',
    name: '武圣',
    desc: '你可以将一张红色牌当【杀】使用或打出。',
    viewAs: [{ as: '杀', usage: 'both', fromEquip: true, filter: (game, owner, card) => game.isRedCard(owner, card) }],
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
    viewAs: [{ as: '过河拆桥', usage: 'play', fromEquip: true, filter: (game, owner, card) => game.isBlackCard(owner, card) }],
  },
  {
    id: 'keji',
    name: '克己',
    desc: '若你于出牌阶段内未使用或打出过【杀】，你可以跳过弃牌阶段。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'discard' &&
          (c.owner.usedThisTurn.sha ?? 0) === 0 &&
          c.owner.flags.lastShaTurn !== c.game.state.turn,
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
    desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其获得你的一张手牌并展示；若此牌与所选花色不同，你对其造成 1 点伤害。',
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
        const picked = await game.askCards(
          owner,
          owner.hand,
          1,
          1,
          '反间：选择一张手牌交给目标',
          undefined,
          true,
        );
        if (!picked.length) return;
        const card = picked[0];
        await game.gainCard(target, card, owner, true);
        await game.afterHandChange(owner);
        if (card.suit !== suit) await game.damage(owner, target, 1, undefined, '反间');
      },
    },
  },
  {
    id: 'guose',
    name: '国色',
    desc: '你可以将一张方块牌当【乐不思蜀】使用。',
    viewAs: [{ as: '乐不思蜀', usage: 'play', fromEquip: true, filter: (_g, _o, card) => card.suit === 'diamond' }],
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
          const cost = await c.game.askCards(c.owner, allCards(c.owner), 1, 1, '流离：弃置一张牌', undefined, true);
          if (!cost.length) return;
          await c.game.discardCards(c.owner, cost, '流离');
          const valid = c.game.players.filter(
            (p) =>
              p.alive &&
              p.id !== c.owner.id &&
              p.id !== source.id &&
              c.game.distance(c.owner, p) <= c.game.attackRange(c.owner),
          );
          if (!valid.length) return;
          const target = await c.game.askPlayer(c.owner, valid, '流离：选择转移目标', undefined, true);
          if (!target) return;
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
        fromEquip: true,
        filter: (game, owner, card) => game.isRedCard(owner, card),
        condition: (game, owner) => game.currentPlayer?.id !== owner.id,
      },
    ],
  },
  {
    id: 'qingnang',
    name: '青囊',
    desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力。',
    active: {
      oncePerTurn: true,
      usable: (_g, owner) =>
        owner.hand.length > 0 && _g.players.some((p) => p.alive && p.hp < p.maxHp),
      run: async (game, owner) => {
        const card = await game.askCards(owner, owner.hand, 1, 1, '青囊：弃置一张手牌');
        if (!card.length) return;
        const target = await game.askPlayer(
          owner,
          game.players.filter((p) => p.alive && p.hp < p.maxHp),
          '青囊：选择一名已受伤的角色回复体力',
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
    triggers: [
      {
        event: 'shaTargeted',
        when: (c) =>
          c.source?.id === c.owner.id &&
          !!c.target &&
          c.target.gender !== c.owner.gender,
        optional: true,
        prompt: '是否发动【雌雄双股剑】？',
        effect: async (c) => {
          const target = c.target!;
          if (!target.hand.length) {
            c.game.drawCards(c.owner, 1, '雌雄双股剑');
            return;
          }
          const choice = await c.game.askOption(target, '雌雄双股剑：选择一项', [
            { id: 'discard', label: '弃置一张手牌' },
            { id: 'draw', label: '令使用者摸一张牌' },
          ]);
          if (choice === 'discard') {
            const picked = await c.game.askCards(
              target,
              target.hand,
              1,
              1,
              '雌雄双股剑：弃置一张手牌',
              undefined,
              false,
            );
            if (picked.length) await c.game.discardCards(target, picked, '雌雄双股剑');
          } else {
            c.game.drawCards(c.owner, 1, '雌雄双股剑');
          }
        },
      },
    ],
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
        when: (c) =>
          c.source?.id === c.owner.id &&
          !!c.target &&
          c.owner.alive &&
          c.game.canBeTargeted(c.target, c.owner, '杀') &&
          allCards(c.owner).length > 0,
        optional: true,
        prompt: '是否发动【青龙偃月刀】再使用一张杀？',
        effect: async (c) => {
          await c.game.useShaOn(
            c.owner,
            c.target!,
            '青龙偃月刀',
            false,
            `青龙偃月刀：是否对【${c.target!.name}】再使用一张杀？`,
          );
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
        game.shaTargets(owner).length > 0 &&
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
    desc: '当你使用最后一张手牌【杀】时，你可以额外选择至多两个目标。',
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
          (c.card?.name === '杀' || c.data.reason === '杀') &&
          !!c.target &&
          !!(c.target.equips.horsePlus || c.target.equips.horseMinus),
        optional: true,
        prompt: '是否发动【麒麟弓】弃置目标的坐骑？',
        effect: async (c) => {
          const target = c.target!;
          if (!target.alive) return;
          const horses = [target.equips.horsePlus, target.equips.horseMinus].filter(
            (horse): horse is NonNullable<typeof horse> => !!horse,
          );
          if (!horses.length) return;
          let picked = horses;
          if (horses.length > 1) {
            picked = await c.game.askCards(
              c.owner,
              horses,
              1,
              1,
              '麒麟弓：选择弃置一张坐骑牌',
              undefined,
              false,
            );
          }
          if (picked.length) await c.game.discardCards(target, picked, '麒麟弓');
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
  {
    id: 'guding',
    name: '古锭刀',
    desc: '锁定技，当你使用【杀】造成伤害时，若目标角色没有手牌，此伤害 +1。',
    locked: true,
  },
  {
    id: 'zhuque',
    name: '朱雀羽扇',
    desc: '你可以将一张普通【杀】当火【杀】使用。',
  },
  {
    id: 'tengjia',
    name: '藤甲',
    desc: '锁定技，【南蛮入侵】、【万箭齐发】和普通【杀】对你无效；当你受到火焰伤害时，此伤害 +1。',
    locked: true,
  },
  {
    id: 'baiyin',
    name: '白银狮子',
    desc: '锁定技，你每次受到伤害时，至多承受 1 点伤害；当你失去装备区里的【白银狮子】时，回复 1 点体力。',
    locked: true,
  },
  {
    id: 'hualiu',
    name: '骅骝',
    desc: '坐骑，其他角色计算与你的距离 +1。',
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
    desc: '锁定技，当你对距离 1 以内的一名角色造成 1 点伤害后，你回复 1 点体力。',
    locked: true,
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.source?.id === c.owner.id && !!c.target && c.game.distance(c.owner, c.target) <= 1,
        effect: async (c) => {
          const amount = Math.max(1, Number(c.data.amount ?? 1));
          c.game.heal(c.owner, c.owner, amount, { reason: '狂骨' });
        },
      },
    ],
  },
  {
    id: 'jushou',
    name: '据守',
    desc: '结束阶段，你可以摸三张牌，然后将你的武将牌翻面。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => isCurrent(c) && c.data.phase === 'finish',
        optional: true,
        prompt: '是否发动【据守】摸三张牌并翻面？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 3, '据守');
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
          await c.game.damage(c.source ?? null, target, amount, c.card, '天香', c.data.element as Card['element']);
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
    desc: '当你使用或打出【闪】时，你可以令一名角色进行判定，若结果为黑桃，你对其造成 2 点雷电伤害。',
    triggers: [
      {
        event: 'shanUsed',
        when: (c) => c.owner.id === c.player.id,
        optional: true,
        prompt: '是否发动【雷击】？',
        effect: async (c) => {
          const target = await c.game.askPlayer(
            c.owner,
            c.game.players.filter((p) => p.alive),
            '雷击：选择一名角色进行判定',
          );
          if (!target) return;
          const judged = await c.game.judge(target, '雷击');
          if (judged.suit !== 'spade') return;
          c.game.log(`雷击判定为黑桃，对【${target.name}】造成 2 点雷电伤害`, 'skill');
          await c.game.damage(c.owner, target, 2, undefined, '雷击', 'thunder');
        },
      },
    ],
  },
  {
    id: 'guidao',
    name: '鬼道',
    desc: '在一名角色的判定牌生效前，你可以打出一张黑色牌代替之。',
    triggers: [
      {
        event: 'judgeBefore',
        when: (c) => allCards(c.owner).some((card) => black(card)),
        optional: true,
        prompt: '是否发动【鬼道】替换判定牌？',
        effect: async (c) => {
          const pool = allCards(c.owner).filter((card) => black(card));
          const picked = await c.game.askCards(c.owner, pool, 1, 1, '鬼道：选择一张黑色牌替换判定牌');
          if (!picked.length) return;
          if (await c.game.stageAnyCard(c.owner, picked[0])) {
            c.data.judgeCard = picked[0];
            c.data.judgeSkill = '鬼道';
            c.data.judgeSkillOwner = c.owner.id;
          }
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
        await game.gainCard(lord, picked[0], owner, true);
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
            {
              id: 'weapon',
              label: '弃置武器牌',
              desc: [
                ...owner.hand.filter((card) => card.equipSlot === 'weapon').map((card) => card.name),
                ...(owner.equips.weapon ? [owner.equips.weapon.name] : []),
              ].join('、') || '没有武器',
            },
          ],
          undefined,
          true,
        );
        if (!choice) return;
        if (choice === 'weapon') {
          const weapons = [
            ...owner.hand.filter((card) => card.equipSlot === 'weapon'),
            ...(owner.equips.weapon ? [owner.equips.weapon] : []),
          ];
          const picked = weapons.length
            ? await game.askCards(owner, weapons, 1, 1, '强袭：选择一张武器牌弃置', undefined, false)
            : [];
          if (picked.length) await game.discardCards(owner, picked, '强袭');
          else await game.loseHp(owner, 1);
        } else {
          await game.loseHp(owner, 1);
        }
        if (game.state.over) return;
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
          const times = Math.max(1, Number(c.data.amount ?? 1));
          for (let i = 0; i < times; i += 1) {
            const target = await c.game.askPlayer(
              c.owner,
              c.game.players.filter((p) => p.alive),
              '节命：选择一名角色补牌',
            );
            if (!target) continue;
            const limit = Math.min(5, target.maxHp);
            const count = Math.max(0, limit - target.hand.length);
            if (count > 0) c.game.drawCards(target, count, '节命');
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
            if (allCards(target).length) {
              const cards = await c.game.askCards(target, allCards(target), 1, 1, '英魂：弃置一张牌', undefined, false);
              if (cards.length) await c.game.discardCards(target, cards, '英魂');
            }
          } else {
            c.game.drawCards(target, 1, '英魂');
            const count = Math.min(lost, allCards(target).length);
            if (count > 0) {
              const cards = await c.game.askCards(target, allCards(target), count, count, '英魂：弃置牌', undefined, false);
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
          const target = await c.game.askPlayer(
            c.owner,
            pool,
            '好施：选择一名手牌最少的角色',
          );
          if (!target) return;
          const cards = await c.game.askCards(
            c.owner,
            c.owner.hand,
            half,
            half,
            `好施：选择 ${half} 张手牌交给【${target.name}】`,
          );
          for (const card of cards) await c.game.gainCard(target, card, c.owner, false);
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
        await game.swapHands(first, second);
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
    desc: '摸牌阶段，你可以放弃摸牌，改为进行判定并获得判定牌；本回合你可以将与此牌颜色不同的手牌当【决斗】使用。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c),
        optional: true,
        prompt: '是否发动【双雄】改为亮出并获得一张牌？',
        effect: async (c) => {
          c.data.skip = true;
          const judged = await c.game.judge(c.owner, '双雄', {
            gainTo: c.owner,
          });
          c.owner.flags.shuangxiong = c.game.isRedCard(c.owner, judged) ? 1 : 2;
        },
      },
    ],
    viewAs: [
      {
        as: '决斗',
        usage: 'play',
        filter: (game, owner, card) =>
          !!owner.flags.shuangxiong &&
          (game.isRedCard(owner, card) ? 1 : 2) !== owner.flags.shuangxiong,
      },
    ],
  },
  {
    id: 'huoshou',
    name: '祸首',
    desc: '锁定技，【南蛮入侵】对你无效；你是其他角色使用的【南蛮入侵】造成伤害的来源。',
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
        when: (c) => c.source?.id === c.owner.id && (c.card?.name === '杀' || c.data.reason === '杀') && !!c.target,
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
          await c.game.gainCard(c.owner, card, target, isPublic);
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
        when: (c) => (c.card?.name === '杀' || c.data.reason === '杀') && !!c.target && allCards(c.owner).length > 0,
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
            const pool = allCards(source);
            const count = Math.min(2, pool.length);
            if (count > 0) {
              const cards = await c.game.askCards(source, pool, count, count, '悲歌：弃置两张牌', undefined, false);
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
          c.source.extraSkills = [];
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
    desc: '觉醒技，准备阶段开始时，若你没有手牌，你回复 1 点体力或摸两张牌，然后减 1 点体力上限，获得【观星】。',
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          c.owner.hand.length === 0 &&
          !c.owner.flags.zhiji,
        effect: async (c) => {
          c.owner.flags.zhiji = 1;
          const choice = await c.game.askOption(c.owner, '志继：选择一项', [
            { id: 'heal', label: '回复 1 点体力' },
            { id: 'draw', label: '摸两张牌' },
          ]);
          if (choice === 'heal') c.game.heal(c.owner, c.owner, 1, { reason: '志继' });
          else c.game.drawCards(c.owner, 2, '志继');
          await c.game.changeMaxHp(c.owner, -1);
          if (!c.owner.skills.includes('guanxing')) c.owner.skills.push('guanxing');
          c.game.log(`【${c.owner.name}】觉醒，减少 1 点体力上限并获得观星`, 'skill');
        },
      },
    ],
  },

  // ---------------- 风火林山 · 补充 ----------------
  {
    id: 'shensu',
    name: '神速',
    desc: '你可以选择一项：1. 跳过判定阶段和摸牌阶段；2. 跳过出牌阶段并弃置一张装备牌。你以此法跳过阶段后，视为对一名其他角色使用一张【杀】。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'judge' &&
          !c.owner.flags.shensuJudge &&
          others(c.game, c.owner).length > 0,
        optional: true,
        prompt: '是否发动【神速】，跳过判定与摸牌阶段并视为使用一张杀？',
        effect: async (c) => {
          c.owner.flags.shensuJudge = 1;
          c.owner.skipPhases.push('draw');
          c.data.skip = true;
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner),
            '神速：选择杀的目标',
          );
          if (target) await c.game.useVirtualSha(c.owner, [target.id], 'shensu', '神速');
        },
      },
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'play' &&
          !c.owner.flags.shensuPlay &&
          allCards(c.owner).some((card) => !!card.equipSlot) &&
          others(c.game, c.owner).length > 0,
        optional: true,
        prompt: '是否发动【神速】，弃一张装备牌跳过出牌阶段并视为使用一张杀？',
        effect: async (c) => {
          const equips = allCards(c.owner).filter((card) => !!card.equipSlot);
          const picked = await c.game.askCards(
            c.owner,
            equips,
            1,
            1,
            '神速：弃置一张装备牌',
            undefined,
            true,
          );
          if (!picked.length) return;
          await c.game.discardCards(c.owner, picked, '神速');
          c.owner.flags.shensuPlay = 1;
          c.data.skip = true;
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner),
            '神速：选择杀的目标',
          );
          if (target) await c.game.useVirtualSha(c.owner, [target.id], 'shensu', '神速');
        },
      },
    ],
  },
  {
    id: 'lianhuan',
    name: '连环',
    desc: '你可以将一张梅花手牌当【铁索连环】使用。',
    viewAs: [
      {
        as: '铁索连环',
        usage: 'play',
        filter: (_game, _owner, card) => card.suit === 'club',
      },
    ],
  },
  {
    id: 'niepan',
    name: '涅槃',
    desc: '限定技，当你处于濒死状态时，你可以弃置所有牌，复原武将牌，摸三张牌，将体力回复至 3 点。',
    triggers: [
      {
        event: 'dying',
        when: (c) => c.owner.hp <= 0 && !c.owner.flags.niepan,
        optional: true,
        prompt: '是否发动【涅槃】？',
        effect: async (c) => {
          c.owner.flags.niepan = 1;
          const cards = [...allCards(c.owner), ...c.owner.judgeZone];
          if (cards.length) await c.game.discardCards(c.owner, cards, '涅槃');
          c.owner.flipped = false;
          c.owner.chained = false;
          c.owner.hp = Math.min(3, c.owner.maxHp);
          c.game.drawCards(c.owner, 3, '涅槃');
          c.game.log(`【${c.owner.name}】涅槃重生，体力回复至 3 点`, 'skill');
        },
      },
    ],
  },
  {
    id: 'luanji',
    name: '乱击',
    desc: '出牌阶段，你可以将两张相同花色的手牌当【万箭齐发】使用。',
    active: {
      usable: (game, owner) => {
        const suits = new Set(owner.hand.map((c) => c.suit));
        return [...suits].some((s) => owner.hand.filter((c) => c.suit === s).length >= 2);
      },
      run: async (game, owner) => {
        const labels: Record<string, string> = { spade: '黑桃 ♠', heart: '红桃 ♥', club: '梅花 ♣', diamond: '方块 ♦' };
        const suits = ['spade', 'heart', 'club', 'diamond'].filter(
          (s) => owner.hand.filter((c) => c.suit === s).length >= 2,
        );
        if (!suits.length) return;
        const suit = await game.askOption(
          owner,
          '乱击：选择一种花色',
          suits.map((s) => ({ id: s, label: labels[s] })),
        );
        if (!suit) return;
        const cards = owner.hand.filter((c) => c.suit === suit);
        const picked = await game.askCards(owner, cards, 2, 2, '乱击：选择两张手牌当万箭齐发', undefined, false);
        if (picked.length !== 2) return;
        await game.useCard(owner, picked[0], '万箭齐发', [], 'luanji', [picked[1].id]);
      },
    },
  },
  {
    id: 'xueyi',
    name: '血裔',
    desc: '主公技，锁定技，你的手牌上限 +2×其他群势力角色数。',
    lord: true,
    locked: true,
    handLimit: (game, owner) =>
      game.alivePlayers().filter((p) => p.id !== owner.id && p.faction === 'qun').length * 2,
  },
  {
    id: 'bazhen',
    name: '八阵',
    desc: '锁定技，若你没有装备防具，视为装备着【八卦阵】。',
    locked: true,
  },
  {
    id: 'huoji',
    name: '火计',
    desc: '你可以将一张红色手牌当【火攻】使用。',
    viewAs: [
      {
        as: '火攻',
        usage: 'play',
        filter: (game, owner, card) => game.isRedCard(owner, card),
      },
    ],
  },
  {
    id: 'kanpo',
    name: '看破',
    desc: '你可以将一张黑色手牌当【无懈可击】使用。',
    viewAs: [
      {
        as: '无懈可击',
        usage: 'respond',
        filter: (game, owner, card) => game.isBlackCard(owner, card),
      },
    ],
  },
  {
    id: 'xingshang',
    name: '行殇',
    desc: '当其他角色死亡时，你可以获得其所有牌。',
    triggers: [
      {
        event: 'death',
        when: (c) =>
          !!c.target &&
          c.target.id !== c.owner.id &&
          (c.target.hand.length > 0 ||
            Object.values(c.target.equips).some(Boolean) ||
            c.target.judgeZone.length > 0),
        optional: true,
        prompt: '是否发动【行殇】获得阵亡角色的所有牌？',
        effect: async (c) => {
          const target = c.target!;
          const cards = [
            ...target.hand,
            ...Object.values(target.equips).filter((x): x is Card => !!x),
            ...target.judgeZone,
          ];
          await c.game.gainCards(c.owner, cards, target, true);
          c.game.log(`【${c.owner.name}】行殇获得了【${target.name}】的所有牌`, 'skill');
        },
      },
    ],
  },
  {
    id: 'fangzhu',
    name: '放逐',
    desc: '当你受到伤害后，你可以令一名其他角色摸 X 张牌，然后将其武将牌翻面（X 为你已损失的体力值）。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id && others(c.game, c.owner).length > 0,
        optional: true,
        prompt: '是否发动【放逐】？',
        effect: async (c) => {
          const lost = Math.max(1, c.owner.maxHp - c.owner.hp);
          const target = await c.game.askPlayer(c.owner, others(c.game, c.owner), '放逐：选择一名其他角色');
          if (!target) return;
          c.game.drawCards(target, lost, '放逐');
          target.flipped = !target.flipped;
          c.game.log(`【${target.name}】被放逐，摸 ${lost} 张牌并翻面`, 'skill');
        },
      },
    ],
  },
  {
    id: 'songwei',
    name: '颂威',
    desc: '主公技，其他魏势力角色的判定牌为黑色时，你可以摸一张牌。',
    lord: true,
    triggers: [
      {
        event: 'judgeAfter',
        when: (c) =>
          c.owner.id !== c.player.id &&
          c.player.faction === 'wei' &&
          !!c.data.judgeCard &&
          black(c.data.judgeCard as Card),
        optional: true,
        prompt: '是否发动【颂威】摸一张牌？',
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '颂威');
        },
      },
    ],
  },
  {
    id: 'duanliang',
    name: '断粮',
    desc: '你可以将一张黑色基本牌或黑色装备牌当【兵粮寸断】使用；你可以对距离为 2 的角色使用【兵粮寸断】。',
    viewAs: [
      {
        as: '兵粮寸断',
        usage: 'play',
        fromEquip: true,
        filter: (_game, _owner, card) => black(card) && (card.type === 'basic' || card.type === 'equip'),
      },
    ],
  },
  {
    id: 'jiuchi',
    name: '酒池',
    desc: '你可以将一张黑桃手牌当【酒】使用。',
    viewAs: [
      {
        as: '酒',
        usage: 'both',
        filter: (_game, _owner, card) => card.suit === 'spade',
      },
    ],
  },
  {
    id: 'roulin',
    name: '肉林',
    desc: '锁定技，你对女性角色使用【杀】时，其需连续使用两张【闪】；女性角色对你使用【杀】时，你需连续使用两张【闪】。',
    locked: true,
  },
  {
    id: 'benghuai',
    name: '崩坏',
    desc: '锁定技，结束阶段，若你的体力值不是全场最少，你须选择：失去 1 点体力，或减 1 点体力上限。',
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) => {
          if (!isCurrent(c) || c.data.phase !== 'finish') return false;
          const min = Math.min(...c.game.alivePlayers().map((p) => p.hp));
          return c.owner.hp > min;
        },
        effect: async (c) => {
          c.game.log(`【${c.owner.name}】的崩坏生效`, 'skill');
          const canLowerMax = c.owner.maxHp > 1;
          const choice = canLowerMax
            ? await c.game.askOption(c.owner, '崩坏：请选择一项', [
                { id: 'hp', label: '失去 1 点体力' },
                { id: 'max', label: '减 1 点体力上限' },
              ])
            : 'hp';
          if (choice === 'max' && canLowerMax) {
            await c.game.changeMaxHp(c.owner, -1);
            c.game.log(`【${c.owner.name}】崩坏减少了 1 点体力上限`, 'skill');
          } else {
            await c.game.loseHp(c.owner, 1);
          }
        },
      },
    ],
  },
  {
    id: 'baonue',
    name: '暴虐',
    desc: '主公技，其他群势力角色造成伤害后，你可以令其进行判定，若结果为黑桃，你回复 1 点体力。',
    lord: true,
    triggers: [
      {
        event: 'damageDone',
        when: (c) =>
          !!c.source &&
          c.source.id !== c.owner.id &&
          c.source.faction === 'qun' &&
          c.owner.alive,
        optional: true,
        prompt: '是否发动【暴虐】，令伤害来源判定？',
        effect: async (c) => {
          if (!c.source) return;
          const judged = await c.game.judge(c.source, '暴虐');
          if (judged.suit === 'spade') {
            c.game.heal(c.owner, c.owner, 1, { reason: '暴虐' });
            c.game.log(`【${c.owner.name}】的暴虐生效，回复 1 点体力`, 'skill');
          }
        },
      },
    ],
  },
  {
    id: 'wansha',
    name: '完杀',
    desc: '锁定技，你的回合内，除你以外只有濒死角色可以使用【桃】。',
    locked: true,
  },
  {
    id: 'luanwu',
    name: '乱武',
    desc: '限定技，出牌阶段，你可以令所有其他角色选择：对距离最近的一名角色使用一张【杀】，或失去 1 点体力。',
    active: {
      usable: (game, owner) => !owner.flags.luanwu && others(game, owner).length > 0,
      run: async (game, owner) => {
        owner.flags.luanwu = 1;
        for (const p of others(game, owner)) {
          if (!p.alive || game.state.over) continue;
          const closest = game.alivePlayers()
            .filter((x) => x.id !== p.id)
            .sort((a, b) => game.distance(p, a) - game.distance(p, b))[0];
          const options = closest
            ? game.buildPlayOptions(p).filter(
                (option) =>
                  option.as === '杀' && option.validTargets.includes(closest.id),
              )
            : [];
          if (options.length) {
            const picked = await game.askOption(
              p,
              '乱武：使用一张杀，否则失去 1 点体力',
              options.map((option) => ({
                id: `${option.cardId}|${option.skillId ?? ''}`,
                label: option.label ?? '使用【杀】',
              })),
              '只能对距离最近的角色使用',
              true,
            );
            if (picked) {
              const [cardId, skillId] = picked.split('|');
              const card = p.hand.find((item) => item.id === cardId);
              if (card) {
                await game.useCard(p, card, '杀', [closest!.id], skillId || 'luanwu');
                continue;
              }
            }
          }
          await game.loseHp(p, 1, owner);
        }
      },
    },
  },
  {
    id: 'weimu',
    name: '帷幕',
    desc: '锁定技，你不能成为黑色锦囊牌的目标。',
    locked: true,
  },
  {
    id: 'qiaobian',
    name: '巧变',
    desc: '你可以弃置一张手牌并跳过判定、摸牌、出牌或弃牌阶段之一。跳过摸牌阶段，你可以获得至多两名角色各一张手牌；跳过出牌阶段，你可以移动场上一张装备牌。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          ['judge', 'draw', 'play', 'discard'].includes(String(c.data.phase)) &&
          c.owner.hand.length > 0,
        optional: true,
        prompt: '是否发动【巧变】弃一张手牌跳过当前阶段？',
        effect: async (c) => {
          const cost = await c.game.askCards(
            c.owner,
            c.owner.hand,
            1,
            1,
            '巧变：弃置一张手牌',
            undefined,
            true,
          );
          if (!cost.length) return;
          await c.game.discardCards(c.owner, cost, '巧变');
          c.data.skip = true;
          const phase = String(c.data.phase);
          if (phase === 'draw') {
            const chosen = new Set<number>();
            for (let i = 0; i < 2; i += 1) {
              const candidates = others(c.game, c.owner).filter(
                (p) => p.hand.length > 0 && !chosen.has(p.id),
              );
              if (!candidates.length) break;
              const target = await c.game.askPlayer(
                c.owner,
                candidates,
                `巧变：选择第 ${i + 1} 名角色获得一张手牌`,
                '取消则结束',
                true,
              );
              if (!target) break;
              chosen.add(target.id);
              const card = c.game.randomItem(target.hand);
              if (card) await c.game.gainCard(c.owner, card, target, false);
            }
          } else if (phase === 'play') {
            const sources = c.game.players.filter((p) =>
              Object.values(p.equips).some(Boolean),
            );
            const source = await c.game.askPlayer(
              c.owner,
              sources,
              '巧变：选择一名有装备的角色',
              '取消则不移动',
              true,
            );
            if (!source) return;
            const equips = Object.values(source.equips).filter((card): card is Card => !!card);
            const picked = await c.game.askCards(
              c.owner,
              equips,
              1,
              1,
              '巧变：选择一张装备牌移动',
              undefined,
              true,
            );
            if (!picked.length) return;
            const card = picked[0];
            const slot = card.equipSlot;
            if (!slot || source.equips[slot]?.id !== card.id) return;
            const targets = c.game.players.filter(
              (p) => p.id !== source.id && !p.equips[slot],
            );
            const target = await c.game.askPlayer(
              c.owner,
              targets,
              '巧变：选择装备牌的新主人',
              '取消则不移动',
              true,
            );
            if (!target) return;
            c.game.moveEquipment(source, target, card);
          }
        },
      },
    ],
  },
  {
    id: 'tuntian',
    name: '屯田',
    desc: '当你于回合外失去牌后，你可以进行判定，若结果不为红桃，将此判定牌置于你的武将牌上，称为“田”；你计算与其他角色的距离 -X（X为“田”的数量）。',
    distanceFrom: (_game, owner) => -owner.fields.length,
    triggers: [
      {
        event: 'cardLost',
        when: (c) =>
          c.player?.id === c.owner.id &&
          c.game.currentPlayer?.id !== c.owner.id,
        optional: true,
        prompt: '是否发动【屯田】进行判定？',
        effect: async (c) => {
          const card = await c.game.judge(c.owner, '屯田', {
            gainTo: c.owner,
            gainIf: (judged) => judged.suit !== 'heart',
          });
          if (card.suit === 'heart') return;
          const idx = c.owner.hand.findIndex((x) => x.id === card.id);
          if (idx >= 0) {
            c.owner.hand.splice(idx, 1);
            c.owner.fields.push(card);
            c.game.log(`【${c.owner.name}】将 ${card.name} 置于武将牌上，称为田`, 'skill');
          }
        },
      },
    ],
  },
  {
    id: 'zaoxian',
    name: '凿险',
    desc: '觉醒技，准备阶段开始时，若你的“田”不少于三张，你减 1 点体力上限，然后获得【急袭】。',
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          c.owner.fields.length >= 3 &&
          !c.owner.flags.zaoxian,
        effect: async (c) => {
          c.owner.flags.zaoxian = 1;
          await c.game.changeMaxHp(c.owner, -1);
          if (!c.owner.extraSkills.includes('jixi')) c.owner.extraSkills.push('jixi');
          c.game.log(`【${c.owner.name}】觉醒，获得急袭`, 'skill');
        },
      },
    ],
  },
  {
    id: 'jixi',
    name: '急袭',
    desc: '你可以将一张“田”当【顺手牵羊】使用。',
    active: {
      usable: (game, owner) =>
        owner.fields.length > 0 &&
        others(game, owner).some((p) => game.hasAnyCard(p) && game.distance(owner, p) <= 1),
      run: async (game, owner) => {
        const picked = await game.askCards(owner, owner.fields, 1, 1, '急袭：选择一张田', undefined, false);
        if (picked.length !== 1) return;
        const candidates = others(game, owner).filter(
          (p) => game.hasAnyCard(p) && game.distance(owner, p) <= 1,
        );
        const target = await game.askPlayer(owner, candidates, '急袭：选择顺手牵羊的目标');
        if (!target) return;
        const idx = owner.fields.findIndex((x) => x.id === picked[0].id);
        if (idx < 0) return;
        const card = owner.fields.splice(idx, 1)[0];
        owner.hand.push(card);
        await game.useCard(owner, card, '顺手牵羊', [target.id], 'jixi');
      },
    },
  },
  {
    id: 'xiangle',
    name: '享乐',
    desc: '锁定技，当你成为【杀】的目标时，使用者需弃置一张基本牌，否则此【杀】对你无效。',
    locked: true,
    triggers: [
      {
        event: 'shaTargeted',
        when: (c) => c.target?.id === c.owner.id && c.source?.id !== c.owner.id,
        effect: async (c) => {
          const source = c.source!;
          const basics = source.hand.filter((card) => card.type === 'basic');
          if (!basics.length) {
            c.data.cancel = true;
            c.game.log(`【${source.name}】没有基本牌，享乐生效，此杀无效`, 'skill');
            return;
          }
          const choice = await c.game.askOption(
            source,
            `享乐：弃置一张基本牌，否则对【${c.owner.name}】的杀无效`,
            [
              { id: 'discard', label: '弃置一张基本牌' },
              { id: 'cancel', label: '令此杀无效' },
            ],
            undefined,
            false,
          );
          if (choice === 'discard') {
            const picked = await c.game.askCards(source, basics, 1, 1, '享乐：选择一张基本牌弃置', undefined, false);
            if (picked.length) {
              await c.game.discardCards(source, picked, '享乐');
              return;
            }
          }
          c.data.cancel = true;
          c.game.log(`【${c.owner.name}】的享乐生效，此杀无效`, 'skill');
        },
      },
    ],
  },
  {
    id: 'fangquan',
    name: '放权',
    desc: '出牌阶段限一次，你可以跳过出牌阶段，弃置一张手牌，令一名其他角色获得一个额外回合。',
    active: {
      oncePerTurn: true,
      usable: (_game, owner) => owner.hand.length > 0,
      run: async (game, owner) => {
        const cost = await game.askCards(
          owner,
          owner.hand,
          1,
          1,
          '放权：选择一张手牌作为费用',
          undefined,
          true,
        );
        if (!cost.length) return;
        const target = await game.askPlayer(owner, others(game, owner), '放权：选择一名其他角色');
        if (!target) return;
        await game.discardCards(owner, cost, '放权');
        game.grantExtraTurn(target);
        owner.flags.fangquanSkip = 1;
        game.log(`【${owner.name}】放权，令【${target.name}】获得一个额外回合`, 'skill');
      },
    },
  },
  {
    id: 'ruoyu',
    name: '若愚',
    desc: '主公技，觉醒技，准备阶段开始时，若你的体力值为全场最少（或之一），你加 1 点体力上限，回复 1 点体力，并获得【激将】。',
    lord: true,
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          !c.owner.flags.ruoyu &&
          c.owner.hp <= Math.min(...c.game.alivePlayers().map((p) => p.hp)),
        effect: async (c) => {
          c.owner.flags.ruoyu = 1;
          await c.game.changeMaxHp(c.owner, 1);
          c.game.heal(c.owner, c.owner, 1, { reason: '若愚' });
          if (!c.owner.extraSkills.includes('jijiang') && !c.owner.skills.includes('jijiang')) {
            c.owner.extraSkills.push('jijiang');
          }
          c.game.log(`【${c.owner.name}】觉醒，获得激将`, 'skill');
        },
      },
    ],
  },
  {
    id: 'jiang',
    name: '激昂',
    desc: '当你使用【决斗】或红色【杀】指定目标后，或成为【决斗】或红色【杀】的目标后，你可以摸一张牌。',
    triggers: [
      {
        event: 'cardUsed',
        when: (c) =>
          c.player.id === c.owner.id &&
          (c.data.as === '决斗' || (c.data.as === '杀' && !!c.card && red(c.card))),
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '激昂');
        },
      },
      {
        event: 'cardTargeted',
        when: (c) =>
          c.target?.id === c.owner.id &&
          (c.data.as === '决斗' ||
            (c.data.as === '杀' && !!c.card && red(c.card)) ||
            (c.card?.name === '决斗' || (c.card?.name === '杀' && red(c.card)))),
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '激昂');
        },
      },
    ],
  },
  {
    id: 'hunzi',
    name: '魂姿',
    desc: '觉醒技，准备阶段开始时，若你的体力值为 1，你减 1 点体力上限，然后获得【英姿】和【英魂】。',
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          c.owner.hp === 1 &&
          !c.owner.flags.hunzi,
        effect: async (c) => {
          c.owner.flags.hunzi = 1;
          await c.game.changeMaxHp(c.owner, -1);
          for (const id of ['yingzi', 'yinghun']) {
            if (!c.owner.skills.includes(id) && !c.owner.extraSkills.includes(id)) c.owner.extraSkills.push(id);
          }
          c.game.log(`【${c.owner.name}】魂姿觉醒，获得英姿与英魂`, 'skill');
        },
      },
    ],
  },
  {
    id: 'zhiba',
    name: '制霸',
    desc: '主公技，其他吴势力角色的出牌阶段限一次，该角色可以与你拼点；若其没赢，你可以获得双方拼点的牌。',
    lord: true,
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.faction === 'wu' &&
        game.players.some(
          (p) =>
            p.role === 'lord' &&
            p.alive &&
            p.skills.includes('zhiba') &&
            p.id !== owner.id,
        ),
      run: async (game, owner) => {
        const lord = game.players.find(
          (p) => p.role === 'lord' && p.alive && p.skills.includes('zhiba'),
        );
        if (!lord) return;
        if (lord.flags.hunzi) {
          const refuse = await game.confirm(lord, '是否拒绝【制霸】拼点？', '你已觉醒，可以拒绝此拼点');
          if (refuse) return;
        }
        const result = await game.pindianWithCards(owner, lord, '制霸');
        if (!result || result.win) return;
        const take = await game.confirm(lord, '是否获得双方拼点的牌？');
        if (!take) return;
        game.gainFromDiscard(lord, result.mine, true);
        game.gainFromDiscard(lord, result.theirs, true);
      },
    },
  },
  {
    id: 'zhijian',
    name: '直谏',
    desc: '出牌阶段，你可以将一张装备牌置于一名其他角色的装备区（不得替换原装备），然后摸一张牌。',
    active: {
      usable: (_game, owner) => owner.hand.some((c) => c.type === 'equip'),
      run: async (game, owner) => {
        const equips = owner.hand.filter((c) => c.type === 'equip');
        const picked = await game.askCards(owner, equips, 1, 1, '直谏：选择一张装备牌', undefined, false);
        if (!picked.length) return;
        const card = picked[0];
        const slot = card.equipSlot;
        if (!slot) return;
        const candidates = others(game, owner).filter((p) => !p.equips[slot]);
        if (!candidates.length) return;
        const target = await game.askPlayer(owner, candidates, '直谏：选择一名对应装备栏为空的其他角色');
        if (!target) return;
        if (await game.equipFromHandTo(owner, target, card)) {
          game.drawCards(owner, 1, '直谏');
        }
      },
    },
  },
  {
    id: 'guzheng',
    name: '固政',
    desc: '其他角色的弃牌阶段结束时，你可以将此阶段其弃置的一张牌交给该角色，然后你获得其余的牌。',
    triggers: [
      {
        event: 'discardPhaseEnd',
        when: (c) =>
          !!c.player &&
          c.player.id !== c.owner.id &&
          Array.isArray(c.data.cards) &&
          (c.data.cards as Card[]).length > 0,
        optional: true,
        prompt: '是否发动【固政】？',
        effect: async (c) => {
          const discarded = (c.data.cards as Card[] | undefined) ?? [];
          const returned = await c.game.askCards(
            c.owner,
            discarded,
            1,
            1,
            '固政：选择一张还给该角色',
            '取消则不发动',
            true,
          );
          if (!returned.length) return;
          const chosen = returned[0];
          c.game.gainFromDiscard(c.player!, chosen, true);
          for (const card of discarded) {
            if (card.id === chosen.id) continue;
            c.game.gainFromDiscard(c.owner, card, false);
          }
          c.game.log(`【${c.owner.name}】发动固政`, 'skill');
        },
      },
    ],
  },
  {
    id: 'huashen',
    name: '化身',
    desc: '锁定技，游戏开始时你随机获得两张其他武将的技能；此后每个回合开始时，你可以更换其中一张。',
    locked: true,
    triggers: [
      {
        event: 'gameStart',
        when: (c) => !c.owner.flags.huashen,
        effect: async (c) => {
          c.owner.flags.huashen = 1;
          c.owner.flags.huashenChanged = 1;
          const ids = grantRandomSkills(c.game, c.owner, 2);
          if (ids.length) c.game.log(`【${c.owner.name}】化身获得了 ${ids.map((id) => c.game.skillName(id)).join('、')}`, 'skill');
        },
      },
      {
        event: 'turnStart',
        when: (c) =>
          isCurrent(c) &&
          !!c.owner.flags.huashen &&
          !c.owner.flags.huashenChanged &&
          c.owner.extraSkills.length > 0,
        optional: true,
        prompt: '是否更换一张【化身】技能？',
        effect: async (c) => {
          const current = [...c.owner.extraSkills];
          const options = current.map((id) => ({ id, label: `更换【${c.game.skillName(id)}】` }));
          const choice = await c.game.askOption(c.owner, '化身：选择要更换的技能', options, undefined, true);
          if (!choice) return;
          c.owner.extraSkills = c.owner.extraSkills.filter((id) => id !== choice);
          c.owner.flags.huashenChanged = 1;
          const ids = grantRandomSkills(c.game, c.owner, 1);
          if (ids.length) c.game.log(`【${c.owner.name}】化身将【${c.game.skillName(choice)}】更换为【${ids.map((id) => c.game.skillName(id)).join('、')}】`, 'skill');
        },
      },
    ],
  },
  {
    id: 'xinsheng',
    name: '新生',
    desc: '当你受到伤害后，你可以随机获得一张新的化身技能。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id && c.owner.extraSkills.length < 4,
        optional: true,
        prompt: '是否发动【新生】获得一个新的化身技能？',
        effect: async (c) => {
          const ids = grantRandomSkills(c.game, c.owner, 1);
          if (ids.length) c.game.log(`【${c.owner.name}】新生获得了 ${c.game.skillName(ids[0])}`, 'skill');
        },
      },
    ],
  },
  {
    id: 'guhuo',
    name: '蛊惑',
    desc: '你可以将一张手牌声明为一种基本牌或非延时锦囊牌。其他角色可以依次质疑：若为真，质疑者各失去 1 点体力；若为假，质疑者各摸一张牌。无论真假，被质疑的牌均置入弃牌堆；仅当此牌为红桃且为真时，仍按声明结算。',
    active: {
      usable: (_game, owner) => owner.hand.length > 0,
      run: async (game, owner) => {
        const names = [
          '杀',
          '桃',
          '酒',
          '无中生有',
          '决斗',
          '过河拆桥',
          '顺手牵羊',
          '万箭齐发',
          '南蛮入侵',
          '桃园结义',
          '五谷丰登',
          '火攻',
          '铁索连环',
          '借刀杀人',
        ];
        const picked = await game.askCards(owner, owner.hand, 1, 1, '蛊惑：选择一张手牌', undefined, false);
        if (picked.length !== 1) return;
        const declared = await game.askOption(
          owner,
          '蛊惑：声明为什么牌？',
          names.map((name) => ({ id: name, label: `声明为【${name}】` })),
          undefined,
          true,
        );
        if (!declared) return;
        const otherAlive = () => others(game, owner).filter((p) => p.alive);
        const targets: number[] = [];
        if (declared === '杀') {
          const target = await game.askPlayer(owner, game.shaTargets(owner), '蛊惑：选择杀的目标');
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '决斗') {
          const target = await game.askPlayer(owner, otherAlive(), '蛊惑：选择决斗目标');
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '过河拆桥') {
          const target = await game.askPlayer(
            owner,
            otherAlive().filter((p) => game.hasAnyCard(p)),
            '蛊惑：选择过河拆桥目标',
          );
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '顺手牵羊') {
          const target = await game.askPlayer(
            owner,
            otherAlive().filter((p) => game.hasAnyCard(p) && game.distance(owner, p) <= 1),
            '蛊惑：选择顺手牵羊目标',
          );
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '火攻') {
          const target = await game.askPlayer(
            owner,
            otherAlive().filter((p) => p.hand.length > 0),
            '蛊惑：选择火攻目标',
          );
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '铁索连环') {
          const target = await game.askPlayer(
            owner,
            game.players.filter((p) => p.alive),
            '蛊惑：选择铁索连环的目标',
          );
          if (!target) return;
          targets.push(target.id);
        } else if (declared === '借刀杀人') {
          const holder = await game.askPlayer(
            owner,
            otherAlive().filter(
              (p) => !!p.equips.weapon && game.liangdaoVictims(p, owner).length > 0,
            ),
            '蛊惑：选择持有武器的角色',
          );
          if (!holder) return;
          const victim = await game.askPlayer(
            owner,
            game.liangdaoVictims(holder, owner),
            '蛊惑：选择被杀的目标',
          );
          if (!victim) return;
          targets.push(holder.id, victim.id);
        }
        const card = picked[0];
        const questioners: PlayerState[] = [];
        for (const p of otherAlive()) {
          const yes = await game.confirm(
            p,
            `是否质疑【${owner.name}】的蛊惑？`,
            '若此牌为真，你将失去 1 点体力；若为假，你摸一张牌',
          );
          if (yes) questioners.push(p);
        }
        let resolves = true;
        if (questioners.length > 0) {
          game.revealCards(owner.id, [card], '蛊惑质疑');
          game.log(
            `【${owner.name}】展示蛊惑牌【${card.name}】（${SUIT_CN[card.suit]}）`,
            'judge',
          );
          const isTrue = card.name === declared;
          if (isTrue) {
            for (const p of questioners) {
              if (p.alive) await game.loseHp(p, 1, owner);
            }
            game.log('蛊惑为真，质疑者各失去 1 点体力', 'skill');
            resolves = card.suit === 'heart';
            if (resolves) game.log('蛊惑牌为红桃，仍按声明结算', 'skill');
          } else {
            for (const p of questioners) {
              if (p.alive) game.drawCards(p, 1, '蛊惑');
            }
            game.log('蛊惑为假，质疑者各摸一张牌，此牌作废', 'skill');
            resolves = false;
          }
        }
        if (!resolves) {
          await game.discardCards(owner, [card], '蛊惑');
          return;
        }
        await game.useCard(owner, card, declared, targets, 'guhuo');
      },
    },
  },
  {
    id: 'xiaoguo',
    name: '骁果',
    desc: '其他角色的结束阶段开始时，你可以弃置一张基本牌，令其选择：弃置一张装备牌（然后你摸一张牌），或受到你造成的 1 点伤害。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          c.data.phase === 'finish' &&
          !!c.player &&
          c.player.id !== c.owner.id &&
          c.player.alive &&
          c.owner.alive &&
          c.owner.hand.some((card) => card.type === 'basic'),
        optional: true,
        prompt: '是否发动【骁果】？',
        effect: async (c) => {
          const target = c.player;
          if (!target?.alive) return;
          const basics = c.owner.hand.filter((card) => card.type === 'basic');
          const cost = await c.game.askCards(
            c.owner,
            basics,
            1,
            1,
            '骁果：弃置一张基本牌',
            undefined,
            true,
          );
          if (!cost.length) return;
          await c.game.discardCards(c.owner, cost, '骁果');
          const equips = Object.values(target.equips).filter((card): card is Card => !!card);
          if (!equips.length) {
            await c.game.damage(c.owner, target, 1, undefined, '骁果');
            return;
          }
          const choice = await c.game.askOption(target, '骁果：请选择一项', [
            { id: 'equip', label: '弃置一张装备牌' },
            { id: 'damage', label: '受到 1 点伤害' },
          ]);
          if (choice === 'equip') {
            const picked = await c.game.askCards(
              target,
              equips,
              1,
              1,
              '骁果：选择一张装备牌弃置',
              undefined,
              false,
            );
            if (picked.length) {
              await c.game.discardCards(target, picked, '骁果');
              c.game.drawCards(c.owner, 1, '骁果');
              return;
            }
          }
          await c.game.damage(c.owner, target, 1, undefined, '骁果');
        },
      },
    ],
  },
  {
    id: 'xunxun',
    name: '恂恂',
    desc: '摸牌阶段，你可以改为观看牌堆顶的四张牌，获得其中两张，然后将其余的牌置于牌堆底。',
    triggers: [
      {
        event: 'drawPhase',
        when: (c) => isCurrent(c),
        optional: true,
        prompt: '是否发动【恂恂】观看牌堆顶四张牌？',
        effect: async (c) => {
          if (c.game.state.deck.length === 0) c.game.reshuffle();
          const top = c.game.state.deck.splice(-4);
          if (!top.length) return;
          c.data.skip = true;
          const picked = await c.game.askCards(
            c.owner,
            top,
            2,
            2,
            '恂恂：选择获得其中两张牌',
            '其余牌置于牌堆底',
            false,
          );
          const gained = picked.length === 2 ? picked : top.slice(-2);
          for (const card of gained) {
            c.owner.hand.push(card);
            c.game.emit({ type: 'gain', playerId: c.owner.id, cards: [card], public: false });
          }
          const rest = top.filter((card) => !gained.some((item) => item.id === card.id));
          c.game.state.deck.unshift(...rest);
          c.game.log(`【${c.owner.name}】恂恂获得了 ${gained.map((card) => `【${card.name}】`).join('、')}`, 'skill');
        },
      },
    ],
  },
  {
    id: 'wangxi',
    name: '忘隙',
    desc: '当你对其他角色造成 1 点伤害后，或受到其他角色造成的 1 点伤害后，你可以与该角色各摸一张牌。',
    triggers: [
      {
        event: 'damageDone',
        when: (c) => {
          if (!c.source || !c.target || c.source.id === c.target.id) return false;
          return c.source.id === c.owner.id || c.target.id === c.owner.id;
        },
        optional: true,
        prompt: '是否发动【忘隙】令双方各摸一张牌？',
        effect: async (c) => {
          const other = c.source!.id === c.owner.id ? c.target! : c.source!;
          if (!other.alive) return;
          const amount = Math.max(1, Number(c.data.amount ?? 1));
          for (let i = 0; i < amount; i += 1) {
            c.game.drawCards(c.owner, 1, '忘隙');
            c.game.drawCards(other, 1, '忘隙');
          }
        },
      },
    ],
  },
  {
    id: 'enyuan',
    name: '恩怨',
    desc: '当你一次获得一名其他角色的至少两张牌后，你可以令其摸一张牌；当你受到 1 点伤害后，你可以令伤害来源交给你一张手牌，否则其失去 1 点体力。',
    triggers: [
      {
        event: 'cardGained',
        when: (c) =>
          c.player?.id === c.owner.id &&
          !!c.source &&
          c.source.id !== c.owner.id &&
          Number(c.data.count ?? 0) >= 2 &&
          c.source.alive,
        optional: true,
        prompt: '是否发动【恩怨】令其摸一张牌？',
        effect: async (c) => {
          if (c.source?.alive) c.game.drawCards(c.source, 1, '恩怨');
        },
      },
      {
        event: 'damageDone',
        when: (c) => c.target?.id === c.owner.id && !!c.source && c.source.alive,
        optional: true,
        prompt: '是否发动【恩怨】？',
        effect: async (c) => {
          const source = c.source!;
          const times = Math.max(1, Number(c.data.amount ?? 1));
          for (let i = 0; i < times; i += 1) {
            if (!source.alive || !c.owner.alive) return;
            if (source.hand.length === 0) {
              await c.game.loseHp(source, 1, c.owner);
              continue;
            }
            const choice = await c.game.askOption(
              source,
              `恩怨：交给【${c.owner.name}】一张手牌，或失去 1 点体力`,
              [
                { id: 'give', label: '交给一张手牌' },
                { id: 'hp', label: '失去 1 点体力' },
              ],
              undefined,
              false,
            );
            if (choice === 'give') {
              const picked = await c.game.askCards(source, source.hand, 1, 1, '恩怨：选择交给对方的手牌', undefined, false);
              if (picked.length) {
                await c.game.gainCard(c.owner, picked[0], source, false);
                continue;
              }
            }
            await c.game.loseHp(source, 1, c.owner);
          }
        },
      },
    ],
  },
  {
    id: 'xuanhuo',
    name: '眩惑',
    desc: '出牌阶段限一次，你可以将一张红桃手牌交给一名其他角色，然后获得该角色一张牌。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.hand.some((card) => card.suit === 'heart') &&
        others(game, owner).some((p) => p.alive),
      run: async (game, owner) => {
        const hearts = owner.hand.filter((card) => card.suit === 'heart');
        const give = await game.askCards(owner, hearts, 1, 1, '眩惑：选择一张红桃手牌交给其他角色', undefined, true);
        if (give.length !== 1) return;
        const target = await game.askPlayer(owner, others(game, owner), '眩惑：选择一名其他角色');
        if (!target) return;
        await game.gainCard(target, give[0], owner, true);
        if (!game.hasAnyCard(target)) return;
        const card = await game.pickCardFrom(target, owner, '眩惑：获得其一张牌');
        if (card) await game.gainCard(owner, card, target, true);
      },
    },
  },
  {
    id: 'qianxi',
    name: '潜袭',
    desc: '准备阶段开始时，你可以进行判定，然后令一名距离为 1 的角色本回合不能使用或打出与判定结果颜色相同的牌。',
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          others(c.game, c.owner).some((p) => c.game.distance(c.owner, p) <= 1),
        optional: true,
        prompt: '是否发动【潜袭】进行判定？',
        effect: async (c) => {
          const judged = await c.game.judge(c.owner, '潜袭');
          const targets = others(c.game, c.owner).filter((p) => c.game.distance(c.owner, p) <= 1);
          if (!targets.length) return;
          const target = await c.game.askPlayer(c.owner, targets, '潜袭：选择一名距离为 1 的角色');
          if (!target) return;
          const color = red(judged) ? 1 : 2;
          target.flags.qianxiColor = color;
          target.flags.qianxiTurn = c.game.state.turn;
          c.game.log(
            `【${target.name}】本回合不能使用或打出${color === 1 ? '红色' : '黑色'}牌`,
            'skill',
          );
        },
      },
    ],
  },
  {
    id: 'xuanfeng',
    name: '旋风',
    desc: '当你失去装备区里的牌时，你可以弃置一名其他角色的一张牌。',
    triggers: [
      {
        event: 'equipLost',
        when: (c) => c.player.id === c.owner.id && others(c.game, c.owner).some((p) => c.game.hasAnyCard(p)),
        optional: true,
        prompt: '是否发动【旋风】弃置一名角色的一张牌？',
        effect: async (c) => {
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner).filter((p) => c.game.hasAnyCard(p)),
            '旋风：选择一名角色',
          );
          if (!target) return;
          const card = await c.game.pickCardFrom(target, c.owner, '旋风：选择一张牌弃置');
          if (card) await c.game.discardCards(target, [card], '旋风');
        },
      },
    ],
  },
  {
    id: 'pojun',
    name: '破军',
    desc: '当你于出牌阶段使用【杀】指定目标后，你可以将目标至多 X 张牌置于其武将牌上（X 为其体力值）；当前回合结束时，其收回这些牌。',
    triggers: [
      {
        event: 'shaTargeted',
        when: (c) =>
          c.game.state.phase === 'play' &&
          c.source?.id === c.owner.id &&
          !!c.target &&
          c.target.alive &&
          c.game.hasAnyCard(c.target),
        optional: true,
        prompt: '是否发动【破军】将目标的牌置于其武将牌上？',
        effect: async (c) => {
          const target = c.target!;
          const limit = Math.max(1, target.hp);
          for (let i = 0; i < limit; i += 1) {
            if (!c.game.hasAnyCard(target)) break;
            const card = await c.game.pickCardFrom(target, c.owner, `破军：选择第 ${i + 1} 张牌`);
            if (!card) break;
            if (c.game.stagePojun(target, card)) {
              c.game.log(`【${c.owner.name}】将【${target.name}】的【${card.name}】置于其武将牌上`, 'skill');
            }
          }
        },
      },
    ],
  },
  {
    id: 'zhichi',
    name: '智迟',
    desc: '锁定技，当你于回合外受到伤害后，本回合【杀】和普通锦囊牌对你无效。',
    locked: true,
    triggers: [
      {
        event: 'damageDone',
        when: (c) =>
          c.target?.id === c.owner.id &&
          c.game.currentPlayer?.id !== c.owner.id,
        effect: async (c) => {
          c.owner.flags.zhichi = c.game.state.turn;
          c.game.log(`【${c.owner.name}】智迟生效，本回合【杀】和普通锦囊牌对其无效`, 'skill');
        },
      },
    ],
  },
  {
    id: 'mingce',
    name: '明策',
    desc: '出牌阶段限一次，你可以交给一名其他角色一张【杀】或装备牌，然后该角色选择：视为对其攻击范围内一名由你指定的角色使用一张【杀】，或摸一张牌。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) =>
        owner.hand.some((card) => card.name === '杀' || !!card.equipSlot) &&
        others(game, owner).length > 0,
      run: async (game, owner) => {
        const pool = owner.hand.filter((card) => card.name === '杀' || !!card.equipSlot);
        const picked = await game.askCards(owner, pool, 1, 1, '明策：选择交给其他角色的【杀】或装备牌');
        if (!picked.length) return;
        const target = await game.askPlayer(owner, others(game, owner), '明策：选择一名角色');
        if (!target) return;
        await game.gainCard(target, picked[0], owner, false);
        await game.afterHandChange(owner);
        const victimPool = game.shaTargets(target);
        const victim = victimPool.length
          ? await game.askPlayer(owner, victimPool, '明策：指定目标攻击范围内的一名角色')
          : null;
        const choice = await game.askOption(
          target,
          '明策：请选择一项',
          [
            { id: 'sha', label: '视为使用一张【杀】', desc: victim ? `目标：${victim.name}` : '没有合法目标' },
            { id: 'draw', label: '摸一张牌' },
          ],
          undefined,
          false,
        );
        if (choice === 'sha' && victim) {
          await game.useVirtualSha(target, [victim.id], 'mingce', '明策');
        } else {
          game.drawCards(target, 1, '明策');
        }
      },
    },
  },
  {
    id: 'jinjiu',
    name: '禁酒',
    desc: '锁定技，你的【酒】均视为【杀】。',
    locked: true,
    viewAs: [
      {
        as: '杀',
        usage: 'play',
        filter: (_game, _owner, card) => card.name === '酒',
      },
    ],
  },
  {
    id: 'xianzhen',
    name: '陷阵',
    desc: '出牌阶段限一次，你可以与一名其他角色拼点。若你赢，本回合你无视与其的距离和其防具，对其使用【杀】无次数限制；若你没赢，本回合不能使用【杀】。',
    active: {
      oncePerTurn: true,
      usable: (game, owner) => owner.hand.length > 0 && others(game, owner).some((p) => p.hand.length > 0),
      run: async (game, owner) => {
        const target = await game.askPlayer(
          owner,
          others(game, owner).filter((p) => p.hand.length > 0),
          '陷阵：选择一名角色拼点',
        );
        if (!target) return;
        if (await game.pindian(owner, target, '陷阵')) {
          owner.flags.xianzhenWin = target.id;
          game.log(`【${owner.name}】陷阵成功，本回合对【${target.name}】使用杀无距离和防具限制`, 'skill');
        } else {
          owner.flags.xianzhenFail = 1;
          game.log(`【${owner.name}】陷阵失败，本回合不能使用杀`, 'skill');
        }
      },
    },
  },
  {
    id: 'jiefan',
    name: '解烦',
    desc: '限定技，出牌阶段，你可以选择一名角色，令攻击范围内含有该角色的所有角色依次选择一项：弃置一张武器牌；或令该角色摸一张牌。',
    active: {
      usable: (_game, owner) => !owner.flags.jiefan,
      run: async (game, owner) => {
        const target = await game.askPlayer(
          owner,
          game.players.filter((p) => p.alive),
          '解烦：选择一名角色',
        );
        if (!target) return;
        owner.flags.jiefan = 1;
        const attackers = game.players.filter(
          (p) => p.alive && p.id !== target.id && game.distance(p, target) <= game.attackRange(p),
        );
        for (const attacker of attackers) {
          const weapons = [
            ...attacker.hand.filter((card) => card.equipSlot === 'weapon'),
            ...(attacker.equips.weapon ? [attacker.equips.weapon] : []),
          ];
          const choice = await game.askOption(attacker, '解烦：请选择一项', [
            { id: 'draw', label: `令【${target.name}】摸一张牌` },
            { id: 'weapon', label: '弃置一张武器牌', desc: weapons.length ? undefined : '没有武器牌' },
          ]);
          if (choice === 'weapon' && weapons.length) {
            const picked = await game.askCards(attacker, weapons, 1, 1, '解烦：弃置一张武器牌', undefined, false);
            if (picked.length) {
              await game.discardCards(attacker, picked, '解烦');
              continue;
            }
          }
          game.drawCards(target, 1, '解烦');
        }
        game.log(`【${owner.name}】发动解烦，目标为【${target.name}】`, 'skill');
      },
    },
  },
  {
    id: 'yicong',
    name: '义从',
    desc: '锁定技，若你的体力值大于 2，你计算与其他角色的距离 -1；若你的体力值不大于 2，其他角色计算与你的距离 +1。',
    locked: true,
    distanceFrom: (_game, owner) => (owner.hp > 2 ? -1 : 0),
    distanceTo: (_game, owner) => (owner.hp <= 2 ? 1 : 0),
  },
  {
    id: 'suishi',
    name: '随势',
    desc: '锁定技，当其他角色进入濒死状态时，若伤害来源与你势力相同，你摸一张牌；当与你势力相同的其他角色死亡时，你失去 1 点体力。',
    locked: true,
    triggers: [
      {
        event: 'dying',
        when: (c) =>
          c.player.id !== c.owner.id &&
          !!c.source &&
          c.source.faction === c.owner.faction,
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '随势');
        },
      },
      {
        event: 'death',
        when: (c) =>
          c.target?.id !== c.owner.id &&
          c.target?.faction === c.owner.faction,
        effect: async (c) => {
          await c.game.loseHp(c.owner, 1);
        },
      },
    ],
  },
  {
    id: 'sijian',
    name: '死谏',
    desc: '当你失去最后的手牌时，你可以弃置一名其他角色的一张牌。',
    triggers: [
      {
        event: 'handLost',
        when: (c) =>
          c.player?.id === c.owner.id &&
          c.owner.hand.length === 0 &&
          others(c.game, c.owner).some((p) => c.game.hasAnyCard(p)),
        optional: true,
        prompt: '是否发动【死谏】弃置一名角色的一张牌？',
        effect: async (c) => {
          const target = await c.game.askPlayer(
            c.owner,
            others(c.game, c.owner).filter((p) => c.game.hasAnyCard(p)),
            '死谏：选择一名角色',
          );
          if (!target) return;
          const card = await c.game.pickCardFrom(target, c.owner, '死谏：选择一张牌弃置');
          if (card) await c.game.discardCards(target, [card], '死谏');
        },
      },
    ],
  },
  {
    id: 'gongqi',
    name: '弓骑',
    desc: '出牌阶段限一次，你可以弃置一张牌，令本回合攻击范围无限；若弃置的是装备牌，你可以弃置一名其他角色的一张牌。',
    attackRange: (game, owner) => (owner.flags.gongqi === game.state.turn ? 99 : 0),
    active: {
      oncePerTurn: true,
      usable: (_game, owner) => allCards(owner).length > 0,
      run: async (game, owner) => {
        const picked = await game.askCards(owner, allCards(owner), 1, 1, '弓骑：弃置一张牌');
        if (picked.length !== 1) return;
        const isEquip = !!picked[0].equipSlot;
        await game.discardCards(owner, picked, '弓骑');
        owner.flags.gongqi = game.state.turn;
        game.log(`【${owner.name}】发动弓骑，本回合攻击范围无限`, 'skill');
        if (!isEquip) return;
        const targets = others(game, owner).filter((player) => game.hasAnyCard(player));
        if (!targets.length) return;
        const target = await game.askPlayer(owner, targets, '弓骑：弃置一名其他角色的一张牌', undefined, true);
        if (!target) return;
        const card = await game.pickCardFrom(target, owner, '弓骑：选择一张牌弃置');
        if (card) await game.discardCards(target, [card], '弓骑');
      },
    },
  },
  {
    id: 'juyi',
    name: '举义',
    desc: '觉醒技，准备阶段开始时，若你已受伤且体力上限大于全场角色数，你将手牌摸至等同于体力上限的张数，然后获得【崩坏】和【威重】。',
    locked: true,
    triggers: [
      {
        event: 'phaseStart',
        when: (c) =>
          isCurrent(c) &&
          c.data.phase === 'prepare' &&
          !c.owner.flags.juyi &&
          c.owner.hp < c.owner.maxHp &&
          c.owner.maxHp > c.game.alivePlayers().length,
        effect: async (c) => {
          c.owner.flags.juyi = 1;
          const count = Math.max(0, c.owner.maxHp - c.owner.hand.length);
          if (count > 0) c.game.drawCards(c.owner, count, '举义');
          for (const id of ['benghuai', 'weizhong']) {
            if (!c.owner.extraSkills.includes(id)) c.owner.extraSkills.push(id);
          }
          c.game.log(`【${c.owner.name}】举义觉醒，获得崩坏与威重`, 'skill');
        },
      },
    ],
  },
  {
    id: 'weizhong',
    name: '威重',
    desc: '锁定技，当你的体力上限变化时，你摸一张牌。',
    locked: true,
    triggers: [
      {
        event: 'maxHpChanged',
        when: (c) => c.player.id === c.owner.id,
        effect: async (c) => {
          c.game.drawCards(c.owner, 1, '威重');
        },
      },
    ],
  },
  {
    id: 'gongao',
    name: '功獒',
    desc: '锁定技，其他角色死亡后，你加 1 点体力上限并回复 1 点体力。',
    locked: true,
    triggers: [
      {
        event: 'death',
        when: (c) => c.player.id !== c.owner.id,
        effect: async (c) => {
          await c.game.changeMaxHp(c.owner, 1);
          c.game.heal(c.owner, c.owner, 1, { reason: '功獒' });
          c.game.log(`【${c.owner.name}】的功獒生效，体力上限 +1`, 'skill');
        },
      },
    ],
  },
  {
    id: 'bahu',
    name: '跋扈',
    desc: '锁定技，准备阶段开始时摸一张牌，出牌阶段使用【杀】的次数上限+1。',
  },
  {
    id: 'feiyang',
    name: '飞扬',
    desc: '判定阶段开始时，若你的判定区有牌，你可以弃置两张牌并弃置一张判定牌。',
  },
  {
    id: 'gongku',
    name: '共苦',
    desc: '限定技，队友阵亡后，你可以选择回复 1 点体力或摸两张牌。',
  },
];

function grantRandomSkills(game: Game, owner: PlayerState, count: number): string[] {
  const existing = new Set([...owner.skills, ...owner.extraSkills]);
  const equipmentSkills = new Set(Object.values(EQUIP_SKILL_ID));
  const pool = SKILLS.filter(
    (skill) =>
      !skill.lord &&
      !existing.has(skill.id) &&
      !equipmentSkills.has(skill.id) &&
      ![
        'huashen',
        'xinsheng',
        'zhiba',
        'bahu',
        'feiyang',
        'gongku',
        'niepan',
        'luanwu',
        'hunzi',
        'zhiji',
        'zaoxian',
        'ruoyu',
        'jiefan',
        'gongao',
      ].includes(skill.id),
  ).map((skill) => skill.id);
  const gained: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    const id = pool.splice(idx, 1)[0];
    owner.extraSkills.push(id);
    gained.push(id);
  }
  return gained;
}

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));
export const ALL_SKILLS = SKILLS;
