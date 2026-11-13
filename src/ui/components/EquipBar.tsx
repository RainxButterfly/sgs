import type { CSSProperties } from 'react';
import type { PlayerState } from '../../core/types';
import { cardArtUrl } from '../cardArt';
import { cardSuitText, isRedCard, shortCardName } from '../labels';
import { EquipHover, HoverInfo } from './HoverInfo';

interface Props {
  player: PlayerState;
}

const SLOTS = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'horsePlus', label: '+1 马' },
  { key: 'horseMinus', label: '-1 马' },
] as const;

/** 装备效果简述：武器=攻击范围，马=距离影响，防具=防护 */
function effectText(key: (typeof SLOTS)[number]['key'], range?: number): string {
  if (key === 'weapon') return `攻击范围 ${range ?? 1}`;
  if (key === 'armor') return '提供防护';
  if (key === 'horsePlus') return '他人距我 +1';
  return '我距他人 -1';
}

/** 独立装备栏：右侧个人信息卡之外单列显示武器/防具/两匹马，格子背景用对应装备牌的牌面 */
export function EquipBar({ player }: Props) {
  return (
    <div className="equip-bar">
      <div className="equip-bar-title">装备栏</div>
      <div className="equip-bar-list">
        {SLOTS.map(({ key, label }) => {
          const card = player.equips[key];
          const art = card ? cardArtUrl(card.name) : null;
          const style = art ? ({ '--equip-art': `url(${art})` } as CSSProperties) : undefined;
          const body = (
            <>
              <span className="equip-bar-label">{label}</span>
              {card && (
                <span className={`equip-bar-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>
                  {cardSuitText(card)}
                </span>
              )}
              <span className={`equip-bar-name ${card ? '' : 'is-empty'}`}>
                {card ? shortCardName(card.name) : '空'}
              </span>
              <span className="equip-bar-effect">{card ? effectText(key, card.range) : '未装备'}</span>
            </>
          );
          return card ? (
            <HoverInfo
              key={key}
              as="div"
              className="equip-bar-slot filled"
              style={style}
              content={<EquipHover name={card.name} />}
            >
              {body}
            </HoverInfo>
          ) : (
            <div key={key} className="equip-bar-slot">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
