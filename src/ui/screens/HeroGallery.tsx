import { useState } from 'react';
import { PLAYABLE_HEROES } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, type Faction } from '../../core/types';
import { HeroDetailModal } from '../components/HeroDetail';
import { useGameStore } from '../store';

const FACTIONS: ('all' | Faction)[] = ['all', 'wei', 'shu', 'wu', 'qun'];
const FACTION_LABEL: Record<'all' | Faction, string> = {
  all: '全部',
  wei: '魏',
  shu: '蜀',
  wu: '吴',
  qun: '群',
};

export function HeroGallery() {
  const [faction, setFaction] = useState<'all' | Faction>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const heroes = PLAYABLE_HEROES.filter((hero) => faction === 'all' || hero.faction === faction);

  return (
    <div className="gallery-screen">
      <div className="ink-bg" />
      <div className="setup-panel gallery-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">武将图鉴</div>
            <h2 className="setup-title">群 雄 譜</h2>
            <p className="setup-desc">
              点击任意武将查看完整技能、体力与装备说明。对局中也可以点击其他角色的「i」查看他们的技能。
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={() => useGameStore.setState({ screen: 'menu' })}>
            返回
          </button>
        </div>

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
              className={`hero-card gallery-card faction-${hero.faction}`}
              onClick={() => setDetail(hero.id)}
            >
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
      </div>

      {detail && <HeroDetailModal heroId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
