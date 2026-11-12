import { useState } from 'react';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME, type Role } from '../../core/types';
import type { LobbyPlayer } from '../../net/protocol';
import { HeroDetailModal } from './HeroDetail';
import { HeroPortrait } from './HeroPortrait';
import { HeroDataHover, HeroPairHover, HoverInfo } from './HoverInfo';
import { isPickHeroVisible } from '../pickReveal';

interface Props {
  players: LobbyPlayer[];
  me: LobbyPlayer;
  host: boolean;
  guozhan: boolean;
  landlord?: boolean;
  team?: boolean;
  /** 主公在 players 里的下标，用于把主公显示成 1 号位 */
  turnAnchor?: number;
  /** 本模式是否存在主公（身份场 / 斗地主） */
  hasLord?: boolean;
  startCount: number;
  code: string;
  lordPlayerId?: number | null;
  lordSeat?: number;
  lordHeroId?: string;
  revealed?: boolean;
  role?: Role | null;
  onPick: (heroId: string) => void;
  onStart: () => void;
  onCancel: () => void;
}

const TEAM_MATE_SEAT = [3, 2, 1, 0];
const teamName = (playerId: number) => (playerId === 0 || playerId === 3 ? '甲队' : '乙队');

export function LanPickPanel({
  players,
  me,
  host,
  guozhan: guozhanMode,
  landlord,
  team,
  turnAnchor = 0,
  hasLord = false,
  startCount,
  code,
  lordPlayerId,
  lordSeat,
  lordHeroId,
  revealed,
  role,
  onPick,
  onStart,
  onCancel,
}: Props) {
  const [detailHero, setDetailHero] = useState<{ heroId: string; heroIds: string[] } | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const guozhan =
    guozhanMode || (me.choices ?? []).some((choice) => choice.includes('|'));
  const choiceHeroIds = (choice: string) => choice.split('|').filter(Boolean);
  const validChoices = (me.choices ?? []).filter((choice) =>
    choiceHeroIds(choice).some((id) => HERO_MAP.has(id)),
  );
  const playerHeroIds = (player: LobbyPlayer) =>
    player.heroIds?.length ? player.heroIds : player.heroId ? [player.heroId] : [];
  const allPicked = players.every((player) => playerHeroIds(player).length >= (guozhan ? 2 : 1));
  const emptySlots = Math.max(0, startCount - players.length);
  const lordReady = !lordPlayerId || !!lordHeroId;
  const canPick = lordReady || me.playerId === lordPlayerId;
  const lordBotHero = lordPlayerId == null && lordHeroId ? HERO_MAP.get(lordHeroId) : undefined;
  // 座次编号按「全部座位」取模，电脑位也要排进去
  const seatTotal = Math.max(1, players.length + emptySlots);
  const seatNo = (index: number) => ((index - turnAnchor + seatTotal) % seatTotal) + 1;

  const matePicks = team
    ? (players.find((player) => player.playerId === TEAM_MATE_SEAT[me.playerId])?.heroIds ?? [])
    : [];
  const teamTaken = new Set(team ? matePicks : []);

  return (
    <div className="lan-pick">
      <div className="lan-pick-head">
        <div>
          <div className="room-card-title">选 将</div>
          <p className="setup-hint">
            房间码 {code} · 所有人选好武将后由房主进入对局
            {role && (
              <span className={`pick-my-role role-${role}`}>
                你的身份：{ROLE_NAME[role]}
              </span>
            )}
          </p>
        </div>
        <span className={`lobby-status ${allPicked ? '' : 'waiting'}`}>
          {allPicked ? '所有人已选择' : '等待选择'}
        </span>
      </div>

      <div className="pick-layout">
        <section className="pick-seats">
          <div className="room-card-title">座次与武将</div>
          {players.map((player, index) => {
            const isLord =
              lordPlayerId != null
                ? player.playerId === lordPlayerId
                : hasLord && index === turnAnchor;
            const showHero = isPickHeroVisible({
              isSelf: player.connId === me.connId,
              revealed: !!revealed,
              isLord,
              landlord: !!landlord,
            });
            const selectedIds = playerHeroIds(player);
            const hero = player.heroId && showHero ? HERO_MAP.get(player.heroId) : undefined;
            return (
              <div
                key={player.connId}
                className={`pick-seat ${player.connId === me.connId ? 'is-human' : ''} ${isLord ? 'is-lord' : ''}`}
              >
                <span className="pick-seat-label">
                  {isLord ? (landlord ? '地主' : '主公') : player.isHost ? '房主' : '玩家'} · {seatNo(index)}号位
                  {player.connId === me.connId && <span className="pick-seat-me">你</span>}
                  {team && <span className="pick-seat-team">{teamName(player.playerId)}</span>}
                </span>
                <span className="pick-seat-hero">
                  {selectedIds.length
                    ? showHero
                      ? selectedIds.map((id) => HERO_MAP.get(id)?.name).filter(Boolean).join(' / ')
                      : '未亮将'
                    : '选择中'}
                </span>
                <span className="pick-seat-tag">{player.name}</span>
                {showHero && selectedIds.length > 0 && (
                  <button
                    type="button"
                    className="pick-seat-info"
                    title="查看该武将的技能"
                    onClick={() =>
                      setDetailHero({ heroId: selectedIds[0], heroIds: selectedIds })
                    }
                  >
                    i
                  </button>
                )}
              </div>
            );
          })}
          {Array.from({ length: emptySlots }, (_, index) => {
            const seatIndex = players.length + index;
            const isBotLord = !lordPlayerId && !!lordBotHero && lordSeat === seatIndex;
            return (
              <div key={`empty-${index}`} className={`pick-seat ${isBotLord ? 'is-lord' : ''}`}>
                <span className="pick-seat-label">{isBotLord ? (landlord ? '地主' : '主公') : '电脑'} · {seatNo(seatIndex)}号位</span>
                <span className="pick-seat-hero">{isBotLord ? lordBotHero?.name : '自动补足'}</span>
                <span className="pick-seat-tag">{isBotLord ? '电脑' : '空位'}</span>
              </div>
            );
          })}
          <div className="pick-seat-note">
            {team
              ? '1、4号位为甲队，2、3号位为乙队；队友共享候选池，不能重复选将。'
              : guozhan
              ? '国战为双将模式，主将与副将必须属于同一势力。'
              : revealed
                ? '全部选择完成，所有武将已亮出。'
                : '主公武将先行亮出，其余武将等全部选择完成后亮出。'}
          </div>
        </section>

        <section className="pick-choice">
          <div className="setup-row">
            <span className="setup-label">{guozhan ? '你的候选双将' : '你的候选武将'}</span>
            <span className="setup-hint">
              {playerHeroIds(me).length
                ? '已锁定，等待其他玩家'
                : !lordReady && me.playerId !== lordPlayerId
                  ? '等待主公选择武将'
                  : guozhan
                    ? '选择一组同势力双将'
                    : '选择一名武将'}
            </span>
          </div>
          {playerHeroIds(me).length ? (
            <div className="pick-locked">
              <div className="pick-locked-title">已锁定出战武将</div>
              <div className="pick-locked-heroes">
                {playerHeroIds(me)
                  .map((id) => HERO_MAP.get(id)?.name)
                  .filter(Boolean)
                  .join(' / ')}
              </div>
              <p>等待其他玩家选择，本局选将不能更换。</p>
            </div>
          ) : (
          <div className={`lobby-hero-grid ${guozhan ? 'pair-grid' : ''}`}>
            {validChoices.map((choice) => {
              const ids = choiceHeroIds(choice);
              const heroes = ids.map((id) => HERO_MAP.get(id)).filter((hero): hero is NonNullable<typeof hero> => !!hero);
              if (!heroes.length) return null;
              const first = heroes[0];
              const taken =
                (ids.includes(lordHeroId ?? '') &&
                  !ids.every((id) => playerHeroIds(me).includes(id))) ||
                ids.some((id) => teamTaken.has(id));
              const picked =
                me.heroIds?.length === ids.length &&
                ids.every((id) => me.heroIds?.includes(id));
              return (
                <HoverInfo
                  key={choice}
                  as="div"
                  className="lobby-hero-wrap"
                  content={heroes.length > 1 ? <HeroPairHover heroes={heroes} /> : <HeroDataHover hero={first} />}
                >
                <button
                  type="button"
                  className={`lobby-hero-card ${guozhan ? 'pair-lobby-hero' : ''} faction-${first.faction} ${picked || selectedChoice === choice ? 'picked' : ''} ${taken ? 'taken' : ''}`}
                  disabled={taken || !canPick}
                  onClick={() => setSelectedChoice(choice)}
                >
                  <HeroPortrait heroId={first.id} className="lobby-hero-portrait" />
                  <div className="lobby-hero-top">
                    <span className="faction-badge">{FACTION_NAME[first.faction]}</span>
                    <span className="lobby-hero-name">{heroes.map((hero) => hero.name).join(' / ')}</span>
                    {!guozhan && first.lordSkillId && <span className="lord-general-badge">主公将</span>}
                    <span className="lobby-hero-hp">♥ {heroes.reduce((sum, hero) => sum + hero.hp, 0)}</span>
                  </div>
                  <div className="lobby-hero-title">{heroes.map((hero) => hero.title).join(' · ')}</div>
                  <div className="lobby-hero-skills">
                    {[...new Set(heroes.flatMap((hero) => hero.skillIds))]
                      .map((skillId) => SKILL_MAP.get(skillId)?.name)
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {taken && <span className="lobby-hero-flag">已被选择</span>}
                  {picked && <span className="lobby-hero-flag picked">已选择</span>}
                </button>
                <span
                  className="lobby-hero-info"
                  role="button"
                  tabIndex={0}
                  aria-label="查看武将信息"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDetailHero({ heroId: first.id, heroIds: ids });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                      setDetailHero({ heroId: first.id, heroIds: ids });
                    }
                  }}
                >
                  i
                </span>
                </HoverInfo>
              );
            })}
            {!validChoices.length && (
              <div className="lobby-hero-empty">候选武将同步中，请让房主重新开始选将。</div>
            )}
          </div>
          )}
          {!playerHeroIds(me).length && (
            <div className="pick-confirm-row">
              <span>
                {selectedChoice
                  ? `已选：${choiceHeroIds(selectedChoice).map((id) => HERO_MAP.get(id)?.name).filter(Boolean).join(' / ')}`
                  : '请先选择一组武将'}
              </span>
              <button
                type="button"
                className="btn primary"
                disabled={!selectedChoice || !canPick}
                onClick={() => {
                  if (selectedChoice) onPick(selectedChoice);
                  setSelectedChoice(null);
                }}
              >
                确认选择
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="start-row lan-pick-actions">
        {host ? (
          <>
            <span className="setup-hint">
              {allPicked ? '可以进入对局了' : '还有玩家没有选择武将'}
            </span>
            <button type="button" className="btn ghost" onClick={onCancel}>
              返回大厅
            </button>
            <button type="button" className="btn primary big" disabled={!allPicked} onClick={onStart}>
              进入对局
            </button>
          </>
        ) : (
          <div className="waiting-row">
            <span className="waiting-dot" />
            <span>选择武将后等待房主进入对局…</span>
          </div>
        )}
      </div>
      {detailHero && (
        <HeroDetailModal
          heroId={detailHero.heroId}
          heroIds={detailHero.heroIds}
          showRole={false}
          onClose={() => setDetailHero(null)}
        />
      )}
    </div>
  );
}
