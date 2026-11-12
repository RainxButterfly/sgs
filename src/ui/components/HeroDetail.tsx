import { useEffect } from 'react';
import { HERO_MAP } from '../../core/deck';
import { equipSkillId } from '../../core/equipment';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type GameMode, type PlayerState } from '../../core/types';
import { cardSuitText, heroSkillGroups, isRedCard, visibleHeroNames, type HeroSkillGroup } from '../labels';
import { builtinPortrait, portraitFor } from '../portrait';
import {
  heroSkinList,
  heroSkinSelection,
  removeSkin,
  selectHeroSkin,
} from '../skins';
import { useSkins } from './HeroPortrait';
import { getHeroVoicePack, setHeroVoicePack, VOICE_PACKS } from '../voicePacks';

interface Props {
  heroId: string;
  heroIds?: string[];
  player?: PlayerState;
  mode?: GameMode;
  showRole?: boolean;
  selfView?: boolean;
  onClose: () => void;
}

const SLOTS = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'horsePlus', label: '+1 马' },
  { key: 'horseMinus', label: '-1 马' },
] as const;

function DetailSkill({ id }: { id: string }) {
  const skill = SKILL_MAP.get(id);
  if (!skill) return null;
  return (
    <div className={`detail-skill ${skill.lord ? 'is-lord' : ''}`}>
      <div className="detail-skill-head">
        <b>{skill.name}</b>
        {skill.lord && <span className="detail-tag">主公技</span>}
        {skill.locked && <span className="detail-tag">锁定技</span>}
      </div>
      <p>{skill.desc}</p>
    </div>
  );
}

/** 图鉴里的皮肤选择：第一套「默认」，导入的皮肤可切换/删除 */
function SkinSection({ heroId }: { heroId: string }) {
  useSkins();
  const skins = heroSkinList(heroId);
  const current = heroSkinSelection(heroId);
  if (skins.length <= 1 && !skins[0]?.url) return null;
  return (
    <>
      <div className="detail-section-title">皮肤 · 点击切换</div>
      <div className="detail-skins">
        {skins.map((skin) => (
          <div
            key={skin.id}
            className={`detail-skin ${skin.id === current ? 'is-on' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => selectHeroSkin(heroId, skin.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') selectHeroSkin(heroId, skin.id);
            }}
          >
            <span
              className="detail-skin-art"
              style={{ backgroundImage: `url("${skin.url ?? builtinPortrait(heroId)}")` }}
            />
            <span className="detail-skin-name">{skin.name}</span>
            {!skin.builtin && (
              <button
                type="button"
                className="detail-skin-del"
                title="删除这套皮肤"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeSkin(heroId, skin.id);
                }}
              >
                ×
              </button>
            )}
            {skin.id === current && <span className="detail-skin-on">使用中</span>}
          </div>
        ))}
      </div>
    </>
  );
}

/** 武将语音包：当前默认一套，预留多包切换 */
function VoicePackSection() {
  const current = getHeroVoicePack();
  return (
    <>
      <div className="detail-section-title">武将语音包</div>
      <div className="detail-skins">
        {VOICE_PACKS.map((pack) => (
          <div
            key={pack.id}
            className={`detail-skin ${pack.id === current ? 'is-on' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setHeroVoicePack(pack.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setHeroVoicePack(pack.id);
            }}
          >
            <span className="detail-skin-name voice-pack-name">{pack.name}</span>
            {pack.id === current && <span className="detail-skin-on">使用中</span>}
          </div>
        ))}
      </div>
    </>
  );
}

export function HeroDetailModal({ heroId, heroIds, player, mode = 'identity', showRole, selfView = false, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const hero = HERO_MAP.get(heroId);
  if (!hero) return null;
  const skinUrl = portraitFor(hero.id);
  const roleLabel =
    mode === 'duel' || mode === 'guozhan' || !player
      ? ''
      : mode === 'landlord'
        ? player.role === 'lord'
          ? '地主'
          : '农民'
        : ROLE_NAME[player.role];
  const dualIds = player?.heroIds?.length ? player.heroIds : heroIds?.length ? heroIds : [heroId];
  const groups: HeroSkillGroup[] = player
    ? heroSkillGroups(player, mode, selfView)
    : dualIds.map((id, index) => {
        const item = HERO_MAP.get(id);
        return {
          heroId: id,
          name: item?.name ?? '',
          title: item?.title,
          label: dualIds.length > 1 ? (index === 0 ? '主将' : '副将') : null,
          skillIds: item?.skillIds ?? [],
          revealed: true,
        };
      });
  const dual = groups.length > 1;
  const anyRevealed = groups.some((group) => group.revealed);
  const skillIds = [
    ...new Set([
      ...(player?.skills?.length
        ? player.skills
        : dualIds.flatMap((id) => HERO_MAP.get(id)?.skillIds ?? [])),
      ...(hero.lordSkillId ? [hero.lordSkillId] : []),
      ...(player?.extraSkills ?? []),
    ]),
  ];
  const displayName = player
    ? visibleHeroNames(player, mode, selfView)
    : groups.map((group) => group.name).filter(Boolean).join(' / ');
  const titles = groups
    .filter((group) => group.revealed)
    .map((group) => group.title)
    .filter(Boolean)
    .join(' · ');
  const quotes = (dual && player
    ? groups.filter((group) => group.revealed).map((group) => HERO_MAP.get(group.heroId)?.quote)
    : [hero.quote]
  ).filter((quote): quote is string => !!quote);
  const pips = player ? Array.from({ length: Math.max(player.maxHp, player.hp) }, (_, i) => i < player.hp) : [];
  const fields = player?.fields ?? [];

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div
        className={`hero-detail faction-${hero.faction}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(44, 36, 26, 0.86), rgba(22, 18, 13, 0.94)), url("${skinUrl}")`,
          backgroundSize: 'auto, cover',
          backgroundPosition: 'center, center 20%',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div key={skinUrl} className="detail-render-sweep" aria-hidden="true" />
        <button type="button" className="detail-close" onClick={onClose} aria-label="收起武将详情">
          ×
        </button>
        <div className="hero-detail-head">
          <div className="detail-emblem">{FACTION_NAME[hero.faction]}</div>
          <div className="detail-identity">
            <div className="detail-name-row">
              <span className="detail-name">{displayName}</span>
              <span className={`gender-badge ${hero.gender}`}>{hero.gender === 'male' ? '♂' : '♀'}</span>
              {player && showRole && roleLabel && (
                <span className={`role-tag role-${player.role}`}>{roleLabel}</span>
              )}
            </div>
            <div className="detail-title">{titles}</div>
            <div className="detail-meta">
              <span>
                体力 {player ? `${Math.max(0, player.hp)}/${player.maxHp}` : hero.hp}
                {dual ? '（双将合计）' : ''}
              </span>
              {dual && player && <span>性别：{player.gender === 'male' ? '男' : '女'}（按主将）</span>}
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

        {quotes.length > 0 && <div className="detail-quote">{quotes.map((quote) => `「${quote}」`).join(' ')}</div>}

        <SkinSection heroId={hero.id} />

        <VoicePackSection />

        {player && (
          <>
            <div className="detail-section-title">当前装备</div>
            <div className="detail-equip-summary">
              {SLOTS.map(({ key, label }) => {
                const card = player.equips[key];
                return (
                  <span key={key} className={card ? 'filled' : ''}>
                    <i>{label}</i>
                    {card && (
                      <i className={`equip-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>{cardSuitText(card)}</i>
                    )}
                    {card ? card.name : '—'}
                  </span>
                );
              })}
              {player.judgeZone.length > 0 && (
                <span className="filled">
                  <i>判定区</i>
                  {player.judgeZone
                    .map((card) => `${cardSuitText(card)} ${card.name}`)
                    .join('、')}
                </span>
              )}
            </div>
          </>
        )}

        <div className="detail-section-title">武将技能</div>
        {dual ? (
          <div className="detail-skills">
            {groups.map((group) =>
              group.revealed ? (
                <div className="detail-general" key={group.heroId}>
                  <div className="detail-general-head">
                    <span className="detail-tag">{group.label}</span>
                    <b>{group.name}</b>
                  </div>
                  {group.skillIds.map((id) => (
                    <DetailSkill key={id} id={id} />
                  ))}
                </div>
              ) : (
                <div className="detail-general is-dark" key={group.heroId}>
                  <div className="detail-general-head">
                    <span className="detail-tag">{group.label}</span>
                    <b>暗将</b>
                  </div>
                  <p className="detail-dark-note">明置后显示武将与技能</p>
                </div>
              ),
            )}
            {anyRevealed && (player?.extraSkills ?? []).length > 0 && (
              <div className="detail-general">
                <div className="detail-general-head">
                  <span className="detail-tag">其他</span>
                </div>
                {(player?.extraSkills ?? []).map((id) => (
                  <DetailSkill key={id} id={id} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="detail-skills">
            {skillIds.map((id) => (
              <DetailSkill key={id} id={id} />
            ))}
          </div>
        )}

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
                      <b>
                        {card && (
                          <i className={`equip-suit ${isRedCard(card) ? 'is-red' : 'is-black'}`}>
                            {cardSuitText(card)}
                          </i>
                        )}
                        {card ? card.name : '—'}
                      </b>
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
