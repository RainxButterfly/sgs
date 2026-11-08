import { useState } from 'react';
import { DEFAULT_RULES, type CustomRules } from '../../core/types';
import { useGameStore } from '../store';
import { RulesEditor } from '../components/RulesEditor';

type SetupMode = 'identity' | 'duel' | 'landlord' | 'guozhan' | 'custom';

export function SetupScreen() {
  const [count, setCount] = useState(8);
  const [mode, setMode] = useState<SetupMode>('identity');
  const [rules, setRules] = useState<CustomRules>({ ...DEFAULT_RULES });
  const prepareLocal = useGameStore((s) => s.prepareLocal);

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
      ? '1v1 单挑 · 双方没有身份，不额外增加体力'
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
              设置好人数和规则后进入选将，其余席位由电脑补足。身份随机分配，主公额外获得 1 点体力。
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

        <div className="setup-actions">
          <span className="setup-picked">
            下一步：选择出战武将
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
            onClick={() =>
              prepareLocal(
                effectiveCount,
                mode === 'custom'
                  ? { ...rules, mode: 'identity' }
                  : { military: rules.military, mode: mode === 'identity' ? 'identity' : mode },
              )
            }
          >
            进入选将
          </button>
        </div>
      </div>
    </div>
  );
}
