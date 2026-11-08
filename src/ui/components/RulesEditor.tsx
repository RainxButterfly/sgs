import type { CustomRules } from '../../core/types';

interface Props {
  rules: CustomRules;
  onChange: (rules: CustomRules) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="stepper">
        <button type="button" className="step-btn" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <span className="step-value">{value}</span>
        <button type="button" className="step-btn" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button type="button" className={`toggle-btn ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
        {value ? '开启' : '关闭'}
      </button>
    </div>
  );
}

export function RulesEditor({ rules, onChange }: Props) {
  const set = (patch: Partial<CustomRules>) => onChange({ ...rules, ...patch });
  return (
    <div className="rules-editor">
      <Stepper label="初始手牌" value={rules.initialHand} min={1} max={8} onChange={(v) => set({ initialHand: v })} />
      <Stepper label="摸牌数" value={rules.drawCount} min={1} max={4} onChange={(v) => set({ drawCount: v })} />
      <Stepper label="体力上限调整" value={rules.hpModifier} min={-2} max={3} onChange={(v) => set({ hpModifier: v })} />
      <Stepper
        label="手牌上限调整"
        value={rules.handLimitModifier}
        min={-3}
        max={4}
        onChange={(v) => set({ handLimitModifier: v })}
      />
      <Toggle label="身份公开" value={rules.revealRoles} onChange={(v) => set({ revealRoles: v })} />
      <Toggle label="武将技能" value={rules.skillsEnabled} onChange={(v) => set({ skillsEnabled: v })} />
      <Toggle label="延时锦囊" value={rules.allowDelayed} onChange={(v) => set({ allowDelayed: v })} />
      <Toggle label="无懈可击" value={rules.allowNullification} onChange={(v) => set({ allowNullification: v })} />
      <Toggle label="装备牌" value={rules.allowEquipment} onChange={(v) => set({ allowEquipment: v })} />
    </div>
  );
}
