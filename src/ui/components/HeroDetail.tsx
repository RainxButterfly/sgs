import { useEffect } from 'react';
import { HERO_MAP } from '../../core/deck';
import { equipSkillId } from '../../core/equipment';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type PlayerState } from '../../core/types';

interface Props {
  heroId: string;
  player?: PlayerState;
  showRole?: boolean;
  onClose: () => void;
}

const SLOTS = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'horsePlus', label: '+1 马' },
  { key: 'horseMinus', label: '-1 马' },
] as const;

export function HeroDetailModal({ heroId, player, showRole, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const hero = HERO_MAP.get(heroId);
  if (!hero) return null;
  const partner = player?.heroIds?.[1] ? HERO_MAP.get(player.heroIds[1]) : undefined;
  const skillIds = [
    ...new Set([
      ...(player?.skills?.length ? player.skills : hero.skillIds),
      ...(hero.lordSkillId ? [hero.lordSkillId] : []),
      ...(player?.extraSkills ?? []),
    ]),
  ];
  const pips = player ? Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp) : [];
  const fields = player?.fields ?? [];

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div
        className={`hero-detail faction-${hero.faction}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="detail-close" onClick={onClose} aria-label="收起武将详情">
          ×
        </button>
        <div className="hero-detail-head">
          <div className="detail-emblem">{FACTION_NAME[hero.faction]}</div>
          <div className="detail-identity">
            <div className="detail-name-row">
              <span className="detail-name">{partner ? `${hero.name} / ${partner.name}` : hero.name}</span>
              <span className={`gender-badge ${hero.gender}`}>{hero.gender === 'male' ? '♂' : '♀'}</span>
              {player && showRole && <span className={`role-tag role-${player.role}`}>{ROLE_NAME[player.role]}</span>}
            </div>
            <div className="detail-title">{hero.title}</div>
            <div className="detail-meta">
              <span>体力 {player ? `${Math.max(0, player.hp)}/${player.maxHp}` : hero.hp}</span>
              {player && <span>手牌 {player.hand.length}</span>}
              {player && !player.alive && <span className="detail-dead">已阵亡</span>}
            </div>
            {player && (
              <div className="hp-row big detail-pips">
                {pips.map((filled, index) => (
                  <span key={index} className={`hp-pip ${filled ? 'hp-on' : 'hp-off'}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="detail-quote">「{hero.quote}」</div>

        {player && (
          <>
            <div className="detail-section-title">当前装备</div>
            <div className="detail-equip-summary">
              {SLOTS.map(({ key, label }) => {
                const card = player.equips[key];
                return (
                  <span key={key} className={card ? 'filled' : ''}>
                    <i>{label}</i>
                    {card ? card.name : '—'}
                  </span>
                );
              })}
              {player.judgeZone.length > 0 && (
                <span className="filled">
                  <i>判定区</i>
                  {player.judgeZone.map((card) => card.name).join('、')}
                </span>
              )}
            </div>
          </>
        )}

        <div className="detail-section-title">武将技能</div>
        <div className="detail-skills">
          {skillIds.map((id) => {
            const skill = SKILL_MAP.get(id);
            if (!skill) return null;
            return (
              <div key={id} className={`detail-skill ${skill.lord ? 'is-lord' : ''}`}>
                <div className="detail-skill-head">
                  <b>{skill.name}</b>
                  {skill.lord && <span className="detail-tag">主公技</span>}
                  {skill.locked && <span className="detail-tag">锁定技</span>}
                </div>
                <p>{skill.desc}</p>
              </div>
            );
          })}
        </div>

        {player && (player.flipped || player.unyu.length > 0 || player.chained || fields.length > 0) && (
          <>
            <div className="detail-section-title">当前状态</div>
            <div className="detail-judge">
              {player.flipped && <span className="detail-tag">翻面</span>}
              {player.chained && <span className="mini-status chained" title="铁索连环：横置，受到属性伤害时会传导">铁索·横置</span>}
              {fields.map((card) => (
                <span key={card.id} className="mini-unyu">
                  田 {card.name}
                </span>
              ))}
              {player.unyu.map((card) => (
                <span key={card.id} className="mini-unyu">
                  创 {card.name}
                </span>
              ))}
            </div>
          </>
        )}

        {player && (
          <>
            <div className="detail-section-title">装备技能</div>
            <div className="detail-equips">
              {SLOTS.map(({ key, label }) => {
                const card = player.equips[key];
                const skill = card ? SKILL_MAP.get(equipSkillId(card.name) ?? '') : undefined;
                return (
                  <div key={key} className={`detail-equip ${card ? 'filled' : ''}`}>
                    <div className="detail-equip-head">
                      <span>{label}</span>
                      <b>{card ? card.name : '—'}</b>
                    </div>
                    {skill && <p>{skill.desc}</p>}
                  </div>
                );
              })}
            </div>
            {player.judgeZone.length > 0 && (
              <>
                <div className="detail-section-title">判定区</div>
                <div className="detail-judge">
                  {player.judgeZone.map((card) => (
                    <span key={card.id} className="mini-judge">
                      {card.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="modal-actions detail-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            收起详情
          </button>
        </div>
      </div>
    </div>
  );
}
