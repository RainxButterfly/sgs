import { SKILL_MAP } from '../../core/skills';
import { useGameStore } from '../store';
import { CardView } from './CardView';

function Overlay({ children, title }: { children: React.ReactNode; title: string }) {
  const minimized = useGameStore((s) => s.modalMinimized);
  const toggle = useGameStore((s) => s.toggleModalMinimized);
  if (minimized) {
    return (
      <div className="modal-minimized">
        <b>{title}</b>
        <span>面板已收起</span>
        <button type="button" className="btn primary small" onClick={toggle}>
          展开面板
        </button>
      </div>
    );
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-minimize" onClick={toggle}>
            收起查看牌桌
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AsChooserModal() {
  const asChooser = useGameStore((s) => s.asChooser);
  const chooseAs = useGameStore((s) => s.chooseAs);
  const close = useGameStore((s) => s.closeAsChooser);
  if (!asChooser) return null;
  return (
    <Overlay title="选择使用方式">
      <div className="as-options">
        {asChooser.options.map((option) => (
          <button
            key={`${option.as}-${option.skillId ?? ''}`}
            type="button"
            className="as-option"
            onClick={() => chooseAs(option.as, option.skillId)}
          >
            <span className="as-name">{option.label ?? `视为【${option.as}】`}</span>
            {option.skillId && option.skillId !== 'recast' && (
              <span className="as-skill">
                {SKILL_MAP.get(option.skillId)?.name ?? option.skillId}
                <em>{SKILL_MAP.get(option.skillId)?.desc}</em>
              </span>
            )}
            {option.skillId === 'recast' && (
              <span className="as-skill">
                重铸
                <em>弃置此牌，摸一张牌</em>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={close}>
          取消
        </button>
      </div>
    </Overlay>
  );
}

export function CardsModal() {
  const pending = useGameStore((s) => s.pending);
  const choices = useGameStore((s) => s.cardChoices);
  const toggle = useGameStore((s) => s.toggleCardChoice);
  const confirm = useGameStore((s) => s.confirmCards);
  const cancel = useGameStore((s) => s.cancelPrompt);
  if (!pending || pending.kind !== 'chooseCards') return null;
  const cards = pending.cards ?? [];
  const min = pending.min ?? 0;
  const max = pending.max ?? cards.length;
  const canConfirm = choices.length >= min && choices.length <= max;
  const canCancel =
    pending.canCancel ||
    /^(?!弃牌阶段|五谷)([^：]{1,12})：/.test(pending.prompt);
  return (
    <Overlay title={pending.prompt}>
      {pending.detail && <div className="modal-desc">{pending.detail}</div>}
      <div className="modal-cards">
        {cards.map((card) => (
          <CardView
            key={card.id}
            card={card}
            selected={choices.includes(card.id)}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>
      <div className="modal-hint">
        已选择 {choices.length} 张（需要 {min} 张{max !== min ? `，至多 ${max} 张` : ''}）
      </div>
      <div className="modal-actions">
        {canCancel && (
          <button type="button" className="btn ghost" onClick={cancel}>
            取消
          </button>
        )}
        <button type="button" className="btn primary" disabled={!canConfirm} onClick={confirm}>
          确定
        </button>
      </div>
    </Overlay>
  );
}

export function ReorderModal() {
  const pending = useGameStore((s) => s.pending);
  const top = useGameStore((s) => s.reorderTop);
  const toggle = useGameStore((s) => s.toggleReorder);
  const confirm = useGameStore((s) => s.confirmReorder);
  if (!pending || pending.kind !== 'reorder') return null;
  const cards = pending.cards ?? [];
  const bottom = cards.filter((card) => !top.includes(card.id));
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.name;
  return (
    <Overlay title={pending.prompt}>
      {pending.detail && <div className="modal-desc">{pending.detail}</div>}
      <div className="reorder-tip">
        点击卡牌加入牌堆顶顺序，再次点击移回牌堆底；每张牌左上角标注最终位置。
      </div>
      <div className="modal-cards">
        {cards.map((card) => {
          const idx = top.indexOf(card.id);
          const bottomIdx = bottom.findIndex((item) => item.id === card.id);
          return (
            <div key={card.id} className="reorder-item">
              <CardView card={card} selected={idx >= 0} onClick={() => toggle(card.id)} />
              <span className={`reorder-badge ${idx >= 0 ? 'top' : 'bottom'}`}>
                {idx >= 0 ? `顶 ${idx + 1}` : `底 ${bottomIdx + 1}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="modal-hint reorder-summary">
        <span>牌堆顶：{top.map(nameOf).filter(Boolean).join(' → ') || '（空）'}</span>
        <span>牌堆底：{bottom.map((card) => card.name).join(' → ') || '（空）'}</span>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={confirm}>
          确定
        </button>
      </div>
    </Overlay>
  );
}

export function OptionModal() {
  const pending = useGameStore((s) => s.pending);
  const choose = useGameStore((s) => s.chooseOption);
  const cancel = useGameStore((s) => s.cancelPrompt);
  if (!pending || pending.kind !== 'chooseOption') return null;
  const skillName = pending.prompt.match(/【([^】]+)】/)?.[1];
  const skill = skillName
    ? [...SKILL_MAP.values()].find((item) => item.name === skillName)
    : undefined;
  const isQuestion = /是否质疑/.test(pending.prompt) || /是否质疑/.test(pending.detail ?? '');
  const isSkillLike = isQuestion || /是否发动|是否使用/.test(pending.prompt);
  const canCancel = pending.canCancel || isSkillLike;
  const label = (id: string, fallback: string) => {
    if (isQuestion && id === 'yes') return '质疑';
    if (isQuestion && id === 'no') return '不质疑';
    if (isSkillLike && id === 'yes') return skillName ? `发动【${skillName}】` : '发动';
    if (isSkillLike && id === 'no') return '不发动';
    return fallback;
  };
  return (
    <Overlay title={isQuestion ? '蛊惑 · 是否质疑' : isSkillLike ? '技能发动' : pending.prompt}>
      {isQuestion && (
        <div className="guhuo-question">
          <span className="guhuo-seal">疑</span>
          <div>
            <b>{pending.prompt}</b>
            <p>{pending.detail || '是否质疑这次蛊惑？'}</p>
          </div>
        </div>
      )}
      {!isQuestion && isSkillLike && (
        <div className="skill-prompt">
          <span className="skill-prompt-seal">技</span>
          <div>
            <b>{skill?.name ?? skillName ?? '技能'}</b>
            <p>{pending.detail || skill?.desc || pending.prompt}</p>
          </div>
        </div>
      )}
      {!isSkillLike && pending.detail && <div className="modal-desc">{pending.detail}</div>}
      <div className={`option-list ${isSkillLike ? 'skill-option-list' : ''}`}>
        {(pending.options ?? []).map((option) => (
          <button
            key={option.id}
            type="button"
            className={`option-button ${isSkillLike && option.id === 'yes' ? 'primary-choice' : ''}`}
            onClick={() => choose(option.id)}
            title={option.desc}
          >
            <span>{label(option.id, option.label)}</span>
            {option.desc && <em>{option.desc}</em>}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        {canCancel && (
          <button type="button" className="btn ghost" onClick={cancel}>
            取消
          </button>
        )}
      </div>
    </Overlay>
  );
}

export function GameModals() {
  const pending = useGameStore((s) => s.pending);
  const harvest = useGameStore((s) => s.harvest);
  if (!pending) return null;
  if (pending.kind === 'chooseCards' && harvest && pending.prompt.startsWith('五谷')) return null;
  if (pending.kind === 'chooseCards') return <CardsModal />;
  if (pending.kind === 'reorder') return <ReorderModal />;
  if (pending.kind === 'chooseOption') return <OptionModal />;
  return <AsChooserModal />;
}
