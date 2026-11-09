import { SKILL_MAP } from '../../core/skills';
import { cardDisplayName } from '../labels';
import { useGameStore } from '../store';

export function AoePanel() {
  const aoe = useGameStore((s) => s.aoe);
  const game = useGameStore((s) => s.game);
  const screen = useGameStore((s) => s.screen);
  const dismiss = useGameStore((s) => s.dismissAoe);



  if (!aoe || !game || screen !== 'game') return null;
  const source = game.state.players[aoe.sourceId];
  const playerName = (id: number) => game.state.players[id]?.name ?? `座位${id}`;

  return (
    <aside className={`aoe-panel ${aoe.done ? 'done' : ''}`}>
      <div className="aoe-head">
        <div>
          <span className="aoe-kicker">结算顺序</span>
          <b>
            {source?.name ?? '?'} 使用【{aoe.cardName}】
          </b>
        </div>
        <button type="button" className="aoe-close" onClick={dismiss} aria-label="关闭结算面板">
          ×
        </button>
      </div>
      <ol className="aoe-entries">
        {aoe.entries.map((entry) => {
          let text = '等待响应';
          if (entry.result === 'answered') {
            if (entry.card) {
              text =
                entry.card.name === entry.as
                  ? `打出【${cardDisplayName(entry.card)}】`
                  : `将【${cardDisplayName(entry.card)}】当【${entry.as}】打出`;
            } else {
              const skill = entry.skillId ? SKILL_MAP.get(entry.skillId)?.name : '';
              text = `${skill ? `发动【${skill}】` : ''}打出【${entry.as}】`;
            }
          } else if (entry.result === 'wuxie') {
            text = '被无懈可击抵消';
          } else if (entry.result === 'immune') {
            text = `${entry.note ?? '技能'}生效，免疫`;
          } else if (entry.result === 'damage') {
            text = `未响应，受到 1 点伤害${entry.hp !== undefined ? `（剩余 ${entry.hp} 体力）` : ''}`;
          } else if (entry.result === 'dead') {
            text = '已阵亡';
          }
          return (
            <li
              key={entry.playerId}
              className={`aoe-entry result-${entry.result} ${entry.playerId === aoe.activeId ? 'is-active' : ''}`}
            >
              <span className="aoe-name">{playerName(entry.playerId)}</span>
              <span className="aoe-result">{text}</span>
              {entry.playerId === aoe.activeId && entry.result === 'pending' && (
                <span
                  key={`timer-${aoe.activeId}`}
                  className="aoe-timer"
                  style={{ animationDuration: `${aoe.timeoutMs ?? 6000}ms` }}
                >
                  <i />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="aoe-foot">{aoe.done ? '结算完毕' : '正在依次结算…'}</div>
    </aside>
  );
}
