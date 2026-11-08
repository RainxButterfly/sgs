import { useState } from 'react';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { DEFAULT_RULES, FACTION_NAME, type CustomRules } from '../../core/types';
import { randomHeroChoices, useGameStore } from '../store';
import { RulesEditor } from '../components/RulesEditor';

type SetupMode = 'identity' | 'duel' | 'landlord' | 'guozhan' | 'custom';

export function SetupScreen() {
  const [count, setCount] = useState(8);
  const [mode, setMode] = useState<SetupMode>('identity');
  const [rules, setRules] = useState<CustomRules>({ ...DEFAULT_RULES });
  const [choices, setChoices] = useState(() => randomHeroChoices(5));
  const [picked, setPicked] = useState<string>(choices[0]);
  const initLocal = useGameStore((s) => s.initLocal);

  const reroll = () => {
    const next = randomHeroChoices(5);
    setChoices(next);
    setPicked(next[0]);
  };

  const counts =
    mode === 'duel'
      ? [2]
      : mode === 'landlord'
        ? [3]
        : mode === 'guozhan'
          ? [4, 5, 6, 7, 8]
          : mode === 'custom'
            ? [2, 3, 4, 5, 6, 7, 8]
            : [5, 6, 7, 8];
  const effectiveCount =
    mode === 'duel'
      ? 2
      : mode === 'landlord'
        ? 3
        : mode === 'guozhan'
          ? Math.max(4, count)
          : mode === 'custom'
            ? Math.max(2, count)
            : Math.max(5, count);
  const roleHint =
    mode === 'duel'
      ? '主公 1 · 反贼 1 · 单挑对决'
      : mode === 'landlord'
        ? '地主 1 · 农民 2 · 3 人对局'
        : mode === 'guozhan'
          ? '魏 · 蜀 · 吴 · 群 · 阵营团战，存活到最后的势力获胜'
          : mode === 'custom' && effectiveCount === 2
            ? '主公 1 · 反贼 1'
            : mode === 'custom' && effectiveCount === 3
              ? '主公 1 · 忠臣 1 · 反贼 1'
              : mode === 'custom' && effectiveCount === 4
                ? '主公 1 · 忠臣 1 · 反贼 2'
                : `主公 1 · 忠臣 ${effectiveCount === 5 || effectiveCount === 6 ? 1 : 2} · 反贼 ${
                    effectiveCount === 5 ? 2 : effectiveCount === 6 || effectiveCount === 7 ? 3 : 4
                  } · 内奸 1`;
  const modeTitle =
    mode === 'identity'
      ? '身份场'
      : mode === 'duel'
        ? '1v1 单挑'
        : mode === 'landlord'
          ? '斗地主'
          : mode === 'guozhan'
            ? '国战'
            : '自定义';

  return (
    <div className="setup-screen">
      <div className="ink-bg" />
      <div className="setup-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">单机对战 · {modeTitle}</div>
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
            {([
              ['identity', '身份场'],
              ['duel', '1v1'],
              ['landlord', '斗地主'],
              ['guozhan', '国战'],
              ['custom', '自定义'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`count-btn ${mode === id ? 'on' : ''}`}
                onClick={() => {
                  setMode(id);
                  if (id === 'duel') setCount(2);
                  else if (id === 'landlord') setCount(3);
                  else if (id === 'guozhan') setCount(Math.max(4, Math.min(count, 8)));
                  else if (id === 'identity') setCount(Math.max(5, Math.min(count, 8)));
                  else setCount(Math.max(2, Math.min(count, 8)));
                }}
              >
                {label}
              </button>
            ))}
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

        <div className="setup-row">
          <span className="setup-label">扩展牌堆</span>
          <button
            type="button"
            className={`count-btn ${rules.military ? 'on' : ''}`}
            onClick={() => setRules({ ...rules, military: !rules.military })}
          >
            军争篇 {rules.military ? '开启' : '关闭'}
          </button>
          <span className="setup-hint">火杀、雷杀、酒、火攻、铁索连环、兵粮寸断、藤甲、白银狮子</span>
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
            onClick={() =>
              initLocal(
                effectiveCount,
                picked,
                mode === 'custom'
                  ? { ...rules, mode: 'identity' }
                  : { military: rules.military, mode: mode === 'identity' ? 'identity' : mode },
              )
            }
          >
            开始对局
          </button>
        </div>
      </div>
    </div>
  );
}
