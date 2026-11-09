import { SKILL_MAP } from '../../core/skills';
import { PHASE_NAME } from '../../core/types';
import { useGameStore, useGameSnapshot } from '../store';

export function PromptBar() {
  const { game } = useGameSnapshot();
  const pending = useGameStore((s) => s.pending);
  const selected = useGameStore((s) => s.selected);
  const selectedTargets = useGameStore((s) => s.selectedTargets);
  const humanId = useGameStore((s) => s.humanId);

  if (!game || !pending) {
    const current = game?.state.players[game.state.current];
    const mine = current?.id === humanId;
    return (
      <div className={`prompt-bar idle ${mine ? 'mine' : ''}`}>
        <span className={`prompt-turn-dot ${mine ? 'mine' : ''}`} />
        <span className="prompt-idle">
          {current ? (mine ? '轮到你行动' : `等待 ${current.name} 行动`) : '等待对局开始'}
        </span>
        {current && (
          <span className="prompt-idle-sub">
            {current.heroName} · {PHASE_NAME[game.state.phase]}
          </span>
        )}
      </div>
    );
  }

  if (pending.playerId !== humanId) return null;

  if (pending.kind === 'play') {
    const cardOptions = pending.cardOptions ?? [];
    const skills = pending.skillOptions ?? [];
    const option = selected
      ? cardOptions.find(
          (o) =>
            o.cardId === selected.cardId &&
            o.as === selected.as &&
            (o.skillId ?? '') === (selected.skillId ?? ''),
        )
      : undefined;
    const targetNames = selectedTargets.map((id) => game.state.players[id]?.name ?? '?');
    const targetOk = !option || (selectedTargets.length >= option.targetMin && selectedTargets.length <= option.targetMax);

    return (
      <div className="prompt-bar active-play">
        <div className="prompt-main">
          <div className="prompt-title">
            <span className="prompt-dot" />
            {pending.prompt}
            <span className="prompt-sub">
              {cardOptions.length === 0 ? '无可用手牌' : '点击手牌出牌，可点击其他角色选择目标'}
            </span>
          </div>
          <div className="prompt-status">
            {selected ? (
              <>
                已选 <b>{selected.as === '杀' ? '杀' : `【${selected.as}】`}</b>
                {selected.skillId
                  ? `（${selected.skillId === 'recast' ? '重铸' : SKILL_MAP.get(selected.skillId)?.name ?? selected.skillId}）`
                  : ''}
                {option && option.targetMax > 0 && (
                  <span className="prompt-targets">
                    目标
                    {targetNames.length ? (
                      targetNames.map((name) => <b key={name}>{name}</b>)
                    ) : (
                      <em>未选择</em>
                    )}
                    <i>
                      {selectedTargets.length}/{option.targetMax}
                    </i>
                  </span>
                )}
                {selected.as === '铁索连环' && (
                  <span className="prompt-tip">点击高亮角色横置或重置，可选 1–2 人</span>
                )}
              </>
            ) : (
              <span className="muted">尚未选择卡牌</span>
            )}
          </div>
        </div>
        <div className="prompt-actions">
          {option?.validTargets.includes(humanId) && (
            <button
              type="button"
              className={`btn ghost skill-btn ${selectedTargets.includes(humanId) ? 'on' : ''}`}
              onClick={() => useGameStore.getState().seatClick(humanId)}
            >
              选择自己
            </button>
          )}
          {skills.length > 0 && <span className="prompt-skill-label">技能</span>}
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="btn ghost skill-btn"
              title={skill.desc}
              onClick={() => useGameStore.getState().activateSkill(skill.id)}
            >
              {skill.name}
            </button>
          ))}
          {selected && (
            <button type="button" className="btn ghost" onClick={() => useGameStore.getState().clearSelection()}>
              取消选择
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => useGameStore.getState().endPlay()}>
            结束出牌
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected || !targetOk}
            onClick={() => useGameStore.getState().confirmPlay()}
          >
            确定
          </button>
        </div>
      </div>
    );
  }

  if (pending.kind === 'respond') {
    const synthetic = (pending.cardOptions ?? []).filter((o) => o.cardId.startsWith('__'));
    const real = (pending.cardOptions ?? []).filter((o) => !o.cardId.startsWith('__'));
    const selectedOption = selected
      ? real.find(
          (o) =>
            o.cardId === selected.cardId &&
            o.as === selected.as &&
            (o.skillId ?? '') === (selected.skillId ?? ''),
        )
      : undefined;
    const isWuxie = pending.respondName === '无懈可击';
    const confirm = () => {
      if (!selected) return;
      useGameStore.getState().submit({
        type: 'respondCard',
        cardId: selected.cardId,
        as: selected.as,
        skillId: selected.skillId,
      });
    };
    return (
      <div className={`prompt-bar active-respond ${isWuxie ? 'wuxie-prompt' : ''}`}>
        <div className="prompt-main">
          <div className="prompt-title">
            <span className="prompt-dot red" />
            {isWuxie ? '无懈可击 · 可以抵消这张锦囊' : pending.prompt}
          </div>
          <div className="prompt-status">
            {isWuxie ? (
              <>
                {pending.prompt}
                {selected && <b className="wuxie-ready"> 已准备【无懈可击】</b>}
              </>
            ) : selected ? (
              `已选【${selected.as}】，点击确定打出`
            ) : real.length > 0 ? (
              '点击手牌中的对应牌进行响应'
            ) : (
              '没有可响应的手牌'
            )}
          </div>
        </div>
        <div className="prompt-actions">
          {synthetic.map((o) => (
            <button
              key={`${o.cardId}-${o.skillId}`}
              type="button"
              className="btn ghost skill-btn"
              onClick={() =>
                useGameStore.getState().submit({
                  type: 'respondCard',
                  cardId: o.cardId,
                  as: o.as,
                  skillId: o.skillId,
                })
              }
            >
              {o.label ?? '发动'}
            </button>
          ))}
          <button type="button" className="btn ghost" onClick={() => useGameStore.getState().cancelPrompt()}>
            {isWuxie ? '本轮不用' : '取消'}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!selected || !selectedOption}
            onClick={confirm}
          >
            确定
          </button>
        </div>
      </div>
    );
  }

  if (pending.kind === 'choosePlayer') {
    const confirm = () => {
      const ids = useGameStore.getState().selectedTargets;
      if (ids.length !== 1) return;
      useGameStore.getState().submit({ type: 'choosePlayers', playerIds: ids });
    };
    const canPickSelf = pending.players?.includes(humanId) ?? false;
    const canCancel = pending.canCancel || /^[^：]{1,12}：/.test(pending.prompt);
    return (
      <div className="prompt-bar active-choose">
        <div className="prompt-main">
          <div className="prompt-title">
            <span className="prompt-dot" />
            {pending.prompt}
          </div>
          <div className="prompt-status">点击一名高亮的角色</div>
        </div>
        <div className="prompt-actions">
          {canPickSelf && (
            <button
              type="button"
              className={`btn ghost skill-btn ${selectedTargets.includes(humanId) ? 'on' : ''}`}
              onClick={() => useGameStore.setState({ selectedTargets: [humanId] })}
            >
              选择自己
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn ghost" onClick={() => useGameStore.getState().cancelPrompt()}>
              取消
            </button>
          )}
          <button type="button" className="btn primary" disabled={selectedTargets.length !== 1} onClick={confirm}>
            确定
          </button>
        </div>
      </div>
    );
  }

  return null;
}
