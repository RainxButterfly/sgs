import { useState } from 'react';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { DEFAULT_RULES, FACTION_NAME, type CustomRules } from '../../core/types';
import { randomHeroChoices, useGameStore } from '../store';
import { RulesEditor } from '../components/RulesEditor';

export function SetupScreen() {
  const [count, setCount] = useState(8);
  const [mode, setMode] = useState<'standard' | 'custom'>('standard');
  const [rules, setRules] = useState<CustomRules>({ ...DEFAULT_RULES });
  const [choices, setChoices] = useState(() => randomHeroChoices(5));
  const [picked, setPicked] = useState<string>(choices[0]);
  const initLocal = useGameStore((s) => s.initLocal);

  const reroll = () => {
    const next = randomHeroChoices(5);
    setChoices(next);
    setPicked(next[0]);
  };

  const counts = mode === 'standard' ? [5, 6, 7, 8] : [2, 3, 4, 5, 6, 7, 8];
  const effectiveCount = mode === 'standard' ? Math.max(5, count) : Math.max(2, count);
  const roleHint =
    mode === 'custom' && effectiveCount === 2
      ? '主公 1 · 反贼 1'
      : mode === 'custom' && effectiveCount === 3
        ? '主公 1 · 忠臣 1 · 反贼 1'
        : mode === 'custom' && effectiveCount === 4
          ? '主公 1 · 忠臣 1 · 反贼 2'
          : `主公 1 · 忠臣 ${effectiveCount === 5 || effectiveCount === 6 ? 1 : 2} · 反贼 ${
              effectiveCount === 5 ? 2 : effectiveCount === 6 || effectiveCount === 7 ? 3 : 4
            } · 内奸 1`;

  return (
    <div className="setup-screen">
      <div className="ink-bg" />
      <div className="setup-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">单机对战 · {mode === 'standard' ? '身份场' : '自定义'}</div>
            <h2 className="setup-title">调 兵 遣 将</h2>
            <p className="setup-desc">
              选择你的武将，其余席位由电脑补足。身份随机分配，主公额外获得 1 点体力。
              自定义模式可以调整手牌、体力、身份公开和卡牌范围。
            </p>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => useGameStore.setState({ screen: 'menu' })}
          >
            返回
          </button>
        </div>

        <div className="setup-row">
          <span className="setup-label">对局模式</span>
          <div className="count-group">
            <button
              type="button"
              className={`count-btn ${mode === 'standard' ? 'on' : ''}`}
              onClick={() => {
                setMode('standard');
                if (count < 5) setCount(5);
              }}
            >
              标准身份场
            </button>
            <button
              type="button"
              className={`count-btn ${mode === 'custom' ? 'on' : ''}`}
              onClick={() => setMode('custom')}
            >
              自定义对局
            </button>
          </div>
        </div>

        <div className="setup-row">
          <span className="setup-label">对局人数</span>
          <div className="count-group">
            {counts.map((n) => (
              <button
                key={n}
                type="button"
                className={`count-btn ${effectiveCount === n ? 'on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n} 人
              </button>
            ))}
          </div>
          <span className="setup-hint">{roleHint}</span>
        </div>

        {mode === 'custom' && <RulesEditor rules={rules} onChange={setRules} />}

        <div className="setup-row">
          <span className="setup-label">选择武将</span>
          <button type="button" className="btn ghost small" onClick={reroll}>
            换一批
          </button>
        </div>

        <div className="hero-grid">
          {choices.map((id) => {
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

        <div className="setup-actions">
          <span className="setup-picked">
            已选：<b>{HERO_MAP.get(picked)?.name ?? '—'}</b>
            {mode === 'custom' && (
              <span className="setup-rule-summary">
                {' '}
                · 自定义：初始 {rules.initialHand} 牌，摸 {rules.drawCount} 张，体力 {rules.hpModifier >= 0 ? '+' : ''}
                {rules.hpModifier}
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn primary big"
            disabled={!picked}
            onClick={() => initLocal(effectiveCount, picked, mode === 'custom' ? rules : undefined)}
          >
            开始对局
          </button>
        </div>
      </div>
    </div>
  );
}
