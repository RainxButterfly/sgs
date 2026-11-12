import { useState } from 'react';
import { buildGameDeck, PLAYABLE_HEROES } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import {
  FACTION_NAME,
  type Card,
  type CardType,
  type Faction,
  type Suit,
} from '../../core/types';
import { cardEffectText } from '../cardEffects';
import { CardView } from '../components/CardView';
import { CardSkinModal } from '../components/CardSkinModal';
import { HeroDetailModal } from '../components/HeroDetail';
import { useSkins } from '../components/HeroPortrait';
import { portraitFor } from '../portrait';
import { cardDisplayName, cardTypeText, SUIT_CHAR } from '../labels';
import { useGameStore } from '../store';

const FACTIONS: ('all' | Faction)[] = ['all', 'wei', 'shu', 'wu', 'qun'];
const FACTION_LABEL: Record<'all' | Faction, string> = {
  all: '全部',
  wei: '魏',
  shu: '蜀',
  wu: '吴',
  qun: '群',
};

type GalleryTab = 'heroes' | 'cards';
type CardFilter = 'all' | CardType;

const CARD_FILTERS: { id: CardFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'basic', label: '基本牌' },
  { id: 'trick', label: '锦囊牌' },
  { id: 'delayed', label: '延时锦囊' },
  { id: 'equip', label: '装备牌' },
];

const CARD_ORDER: Record<CardType, number> = { basic: 0, trick: 1, delayed: 2, equip: 3 };
const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond'];

interface CardGroup {
  key: string;
  card: Card;
  count: number;
  suits: Partial<Record<Suit, number>>;
}

function buildCardGroups(): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const card of buildGameDeck(true)) {
    const key = cardDisplayName(card);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.suits[card.suit] = (existing.suits[card.suit] ?? 0) + 1;
    } else {
      groups.set(key, { key, card, count: 1, suits: { [card.suit]: 1 } });
    }
  }
  return [...groups.values()].sort(
    (a, b) => CARD_ORDER[a.card.type] - CARD_ORDER[b.card.type] || a.key.localeCompare(b.key, 'zh'),
  );
}

export function HeroGallery() {
  useSkins();
  const [tab, setTab] = useState<GalleryTab>('heroes');
  const [faction, setFaction] = useState<'all' | Faction>('all');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const [cardDetail, setCardDetail] = useState<Card | null>(null);
  const [cardGroups] = useState(buildCardGroups);

  const heroes = PLAYABLE_HEROES.filter((hero) => faction === 'all' || hero.faction === faction);
  const cards = cardGroups.filter((group) => cardFilter === 'all' || group.card.type === cardFilter);

  return (
    <div className="gallery-screen">
      <div className="ink-bg" />
      <div className="setup-panel gallery-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">图鉴 · {tab === 'heroes' ? '武将' : '卡牌'}</div>
            <h2 className="setup-title">{tab === 'heroes' ? '群 雄 譜' : '牌 譜'}</h2>
            <p className="setup-desc">
              {tab === 'heroes'
                ? '点击任意武将查看完整技能、体力与装备说明。对局中也可以点击其他角色的「i」查看他们的技能。'
                : '按类型查看牌堆中的基本牌、锦囊牌、延时锦囊和装备牌效果，括号内为这套牌堆中的数量。'}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={() => useGameStore.setState({ screen: 'menu' })}>
            返回
          </button>
        </div>

        <div className="gallery-tabs">
          <button
            type="button"
            className={`count-btn ${tab === 'heroes' ? 'on' : ''}`}
            onClick={() => setTab('heroes')}
          >
            武将
          </button>
          <button
            type="button"
            className={`count-btn ${tab === 'cards' ? 'on' : ''}`}
            onClick={() => setTab('cards')}
          >
            卡牌
          </button>
        </div>

        {tab === 'heroes' ? (
          <>
            <div className="gallery-filters">
              {FACTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`count-btn ${faction === item ? 'on' : ''}`}
                  onClick={() => setFaction(item)}
                >
                  {FACTION_LABEL[item]}
                </button>
              ))}
              <span className="setup-hint">共 {heroes.length} 名</span>
            </div>

            <div className="hero-grid gallery-grid">
              {heroes.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  className={`hero-card gallery-card has-skin faction-${hero.faction}`}
                  onClick={() => setDetail(hero.id)}
                >
                  <span
                    className="gallery-portrait"
                    style={{ backgroundImage: `url("${portraitFor(hero.id)}")` }}
                    aria-hidden="true"
                  />
                  <div className="hero-card-top">
                    <span className="faction-badge">{FACTION_NAME[hero.faction]}</span>
                    <span className="hero-card-name">{hero.name}</span>
                    <span className={`gender-badge ${hero.gender}`}>{hero.gender === 'male' ? '♂' : '♀'}</span>
                  </div>
                  <div className="hero-card-title">{hero.title}</div>
                  <div className="hero-card-hp">
                    <span className="hp-icon">♥</span>
                    <span>{hero.hp}</span>
                  </div>
                  <div className="hero-card-skills">
                    {hero.skillIds.map((sid) => {
                      const skill = SKILL_MAP.get(sid);
                      return skill ? (
                        <div key={sid} className="hero-skill-line">
                          <b>{skill.name}</b>
                          <span>{skill.desc}</span>
                        </div>
                      ) : null;
                    })}
                    {hero.lordSkillId && SKILL_MAP.get(hero.lordSkillId) && (
                      <div className="hero-skill-line lord-line">
                        <b>{SKILL_MAP.get(hero.lordSkillId)!.name}</b>
                        <span>主公技 · {SKILL_MAP.get(hero.lordSkillId)!.desc}</span>
                      </div>
                    )}
                  </div>
                  <div className="hero-card-quote">「{hero.quote}」</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="gallery-filters">
              {CARD_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`count-btn ${cardFilter === item.id ? 'on' : ''}`}
                  onClick={() => setCardFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
              <span className="setup-hint">共 {cards.length} 种</span>
            </div>

            <div className="card-gallery-grid">
              {cards.map((group) => (
                <div key={group.key} className="card-gallery-item">
                  <CardView card={group.card} size="sm" onClick={() => setCardDetail(group.card)} />
                  <div className="card-gallery-info">
                    <div className="card-gallery-head">
                      <b>{group.key}</b>
                      <span>×{group.count}</span>
                    </div>
                    <div className="card-gallery-meta">
                      {cardTypeText(group.card)}
                      {group.card.equipSlot === 'weapon' && group.card.range
                        ? ` · 攻击距离 ${group.card.range}`
                        : ''}
                    </div>
                    <p>{cardEffectText(group.card) || '暂无说明'}</p>
                    <div className="card-gallery-suits">
                      {SUITS.filter((suit) => group.suits[suit]).map((suit) => (
                        <span key={suit}>
                          {SUIT_CHAR[suit]}
                          {group.suits[suit]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {detail && <HeroDetailModal heroId={detail} onClose={() => setDetail(null)} />}
      {cardDetail && <CardSkinModal card={cardDetail} onClose={() => setCardDetail(null)} />}
    </div>
  );
}
