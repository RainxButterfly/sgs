import { SKILL_MAP } from '../../core/skills';
import { useGameStore } from '../store';
import { CardView } from './CardView';

function Overlay({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function AsChooserModal() {
  const asChooser = useGameStore((s) => s.asChooser);
  if (!asChooser) return null;
  const chooseAs = useGameStore((s) => s.chooseAs);
  const close = useGameStore((s) => s.closeAsChooser);
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
            <span className="as-name">视为【{option.as}】</span>
            {option.skillId && (
              <span className="as-skill">
                {SKILL_MAP.get(option.skillId)?.name ?? option.skillId}
                <em>{SKILL_MAP.get(option.skillId)?.desc}</em>
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
        {pending.canCancel && (
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
  return (
    <Overlay title={pending.prompt}>
      {pending.detail && <div className="modal-desc">{pending.detail}</div>}
      <div className="reorder-tip">点击卡牌加入牌堆顶顺序，再次点击移回牌堆底</div>
      <div className="modal-cards">
        {cards.map((card) => {
          const idx = top.indexOf(card.id);
          return (
            <div key={card.id} className="reorder-item">
              <CardView card={card} selected={idx >= 0} onClick={() => toggle(card.id)} />
              {idx >= 0 && <span className="reorder-badge">顶 {idx + 1}</span>}
            </div>
          );
        })}
      </div>
      <div className="modal-hint">
        牌堆顶顺序：{top.map((id) => cards.find((c) => c.id === id)?.name).filter(Boolean).join(' → ') || '（空）'}
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
  return (
    <Overlay title={pending.prompt}>
      {pending.detail && <div className="modal-desc">{pending.detail}</div>}
      <div className="option-list">
        {(pending.options ?? []).map((option) => (
          <button
            key={option.id}
            type="button"
            className="option-button"
            onClick={() => choose(option.id)}
            title={option.desc}
          >
            <span>{option.label}</span>
            {option.desc && <em>{option.desc}</em>}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        {pending.canCancel && (
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
  if (!pending) return null;
  if (pending.kind === 'chooseCards') return <CardsModal />;
  if (pending.kind === 'reorder') return <ReorderModal />;
  if (pending.kind === 'chooseOption') return <OptionModal />;
  return <AsChooserModal />;
}
