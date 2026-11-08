import { useState } from 'react';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME } from '../../core/types';
import { useGameStore } from '../store';

export function PickScreen() {
  const preGame = useGameStore((s) => s.preGame);
  const confirm = useGameStore((s) => s.confirmLocalPick);
  const [picked, setPicked] = useState(() => preGame?.candidates[0] ?? '');
  if (!preGame) return null;
  const selected = HERO_MAP.get(picked);

  return (
    <div className="pick-screen">
      <div className="ink-bg" />
      <div className="setup-panel pick-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">进入对局 · 选择武将</div>
            <h2 className="setup-title">点 将 出 征</h2>
            <p className="setup-desc">
              其他角色的武将已经就位。从下面的候选武将中选择你的出战武将，选择完成后进入牌桌。
            </p>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => useGameStore.setState({ screen: 'setup', preGame: null })}
          >
            返回
          </button>
        </div>

        <div className="pick-layout">
          <section className="pick-seats">
            <div className="room-card-title">座次与武将</div>
            <div className="pick-seat is-human">
              <span className="pick-seat-label">你</span>
              <span className="pick-seat-hero">{selected?.name ?? '待选择'}</span>
              <span className="pick-seat-tag">{selected ? '已选择' : '选择中'}</span>
            </div>
            {preGame.bots.map((bot) => {
              const hero = HERO_MAP.get(bot.heroId);
              return (
                <div key={bot.name + bot.heroId} className="pick-seat">
                  <span className="pick-seat-label">电脑</span>
                  <span className="pick-seat-hero">{hero?.name ?? '随机'}</span>
                  <span className="pick-seat-tag">{bot.name}</span>
                </div>
              );
            })}
            <div className="pick-seat-note">其余空位由电脑自动选择武将。</div>
          </section>

          <section className="pick-choice">
            <div className="setup-row">
              <span className="setup-label">你的候选武将</span>
              <span className="setup-hint">点击一张武将牌选择</span>
            </div>
            <div className="pick-hero-grid">
              {preGame.candidates.map((id) => {
                const hero = HERO_MAP.get(id);
                if (!hero) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`hero-card faction-${hero.faction} ${picked === id ? 'picked' : ''}`}
                    onClick={() => setPicked(id)}
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
                    </div>
                    <div className="hero-card-quote">「{hero.quote}」</div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="setup-actions">
          <span className="setup-picked">
            已选：<b>{selected?.name ?? '—'}</b>
          </span>
          <button type="button" className="btn primary big" disabled={!picked} onClick={() => confirm(picked)}>
            进入对局
          </button>
        </div>
      </div>
    </div>
  );
}
