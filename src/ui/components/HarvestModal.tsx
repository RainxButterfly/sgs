import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { CardView } from './CardView';

export function HarvestModal() {
  const harvest = useGameStore((s) => s.harvest);
  const pending = useGameStore((s) => s.pending);
  const humanId = useGameStore((s) => s.humanId);
  const choices = useGameStore((s) => s.cardChoices);
  const toggle = useGameStore((s) => s.toggleCardChoice);
  const confirm = useGameStore((s) => s.confirmCards);
  const dismiss = useGameStore((s) => s.dismissHarvest);
  const game = useGameStore((s) => s.game);
  const [collapsed, setCollapsed] = useState(false);

  const done = !!harvest?.done;
  const harvestPending =
    !!pending && pending.kind === 'chooseCards' && pending.prompt.startsWith('五谷');
  const myTurn = harvestPending && pending?.playerId === humanId;
  const chooser = harvest?.chooserId !== undefined ? game?.state.players[harvest.chooserId] : undefined;
  const chooserName = chooser?.name ?? '';
  const harvestKey = harvest ? harvest.cards.map((card) => card.id).join('|') : '';
  const wasMyTurn = useRef(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => useGameStore.getState().dismissHarvest(), 2000);
    return () => window.clearTimeout(timer);
  }, [done]);

  useEffect(() => {
    if (harvestKey) setCollapsed(false);
  }, [harvestKey]);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) setCollapsed(false);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  if (!harvest) return null;

  const pickedBy = new Map(harvest.picks.map((pick) => [pick.card.id, pick.playerId]));
  const remaining = harvest.cards.filter((card) => !pickedBy.has(card.id));

  if (collapsed) {
    return (
      <button
        type="button"
        className={`harvest-mini ${myTurn ? 'is-my-turn' : ''}`}
        onClick={() => setCollapsed(false)}
        aria-label="展开五谷丰登结算"
      >
        <span className="harvest-mini-icon">五</span>
        <span className="harvest-mini-copy">
          <b>五谷丰登</b>
          <em>
            {done ? '已选完' : myTurn ? '轮到你选择' : `等待${chooserName || '其他玩家'}`}
            {done ? '' : ` · 剩余 ${remaining.length} 张`}
          </em>
        </span>
        <span className="harvest-mini-open">
          展开<i>▾</i>
        </span>
      </button>
    );
  }

  if (pending && !harvestPending) return null;

  return (
    <div className="modal-backdrop harvest-backdrop">
      <div className="modal harvest-modal">
        <div className="modal-head">
          <div className="modal-title">五谷丰登</div>
          <button type="button" className="modal-minimize" onClick={() => setCollapsed(true)}>
            <i>▴</i>收起
          </button>
        </div>
        <div className="harvest-cards">
          {harvest.cards.map((card) => {
            const ownerId = pickedBy.get(card.id);
            const owner = ownerId !== undefined ? game?.state.players[ownerId] : undefined;
            const selectable = myTurn && (pending?.cards ?? []).some((item) => item.id === card.id);
            return (
              <div key={card.id} className={`harvest-slot ${owner ? 'picked' : ''}`}>
                <CardView
                  card={card}
                  selected={choices.includes(card.id)}
                  disabled={!selectable}
                  dimmed={!!owner}
                  onClick={selectable ? () => toggle(card.id) : undefined}
                />
                <span className={`harvest-owner ${owner ? 'has-owner' : ''}`}>
                  {owner ? `${owner.name} 获得` : done ? '无人获得' : selectable ? '可选择' : '待选'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="harvest-status">
          {done ? (
            <span className="harvest-done">
              所有人已选完
              <span className="harvest-progress">
                <i />
              </span>
            </span>
          ) : myTurn ? (
            <span>轮到你选择，点击一张牌后确认</span>
          ) : (
            <span>
              等待 <b>{chooserName || '其他玩家'}</b> 选择
            </span>
          )}
          <span className="harvest-count">剩余 {remaining.length} 张</span>
        </div>
        <div className="harvest-picks">
          {harvest.picks.length === 0 ? (
            <span className="muted">还没有人选择</span>
          ) : (
            harvest.picks.map((pick) => {
              const player = game?.state.players[pick.playerId];
              return (
                <span key={`${pick.playerId}-${pick.card.id}`} className="harvest-pick-row">
                  <b>{player?.name ?? `座位${pick.playerId}`}</b>
                  <em>{pick.card.name}</em>
                </span>
              );
            })
          )}
        </div>
        <div className="modal-actions">
          {done ? (
            <button type="button" className="btn primary" onClick={dismiss}>
              关闭
            </button>
          ) : myTurn ? (
            <button
              type="button"
              className="btn primary"
              disabled={choices.length !== 1}
              onClick={confirm}
            >
              确认选择
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setCollapsed(true)}>
              收起
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HarvestLayer() {
  const harvest = useGameStore((s) => s.harvest);
  if (!harvest) return null;
  return <HarvestModal />;
}
