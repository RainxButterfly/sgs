import { useState } from 'react';
import { HERO_MAP } from '../../core/deck';
import { SKILL_MAP } from '../../core/skills';
import { FACTION_NAME, ROLE_NAME } from '../../core/types';
import { HeroDetailModal } from '../components/HeroDetail';
import { HeroDataHover, HoverInfo } from '../components/HoverInfo';
import { useGameStore } from '../store';

export function PickScreen() {
  const preGame = useGameStore((s) => s.preGame);
  const confirm = useGameStore((s) => s.confirmLocalPick);
  const bidLocal = useGameStore((s) => s.bidLocal);
  const [picked, setPicked] = useState(() => preGame?.candidates[0] ?? '');
  const [pairIndex, setPairIndex] = useState(0);
  const [detailHero, setDetailHero] = useState<string | null>(null);
  if (!preGame) return null;
  const pairs = preGame.candidatePairs ?? [];
  const selectedPair = pairs[pairIndex];
  const selected = HERO_MAP.get(selectedPair?.primary ?? picked);
  const pairHeroes = selectedPair
    ? [HERO_MAP.get(selectedPair.primary), HERO_MAP.get(selectedPair.secondary)].filter(
        (hero): hero is NonNullable<typeof hero> => !!hero,
      )
    : [];
  const pairHp = pairHeroes.reduce((sum, hero) => sum + hero.hp, 0);
  const pairSkills = [...new Set(pairHeroes.flatMap((hero) => hero.skillIds))];
  const gameMode = preGame.rules?.mode ?? 'identity';
  const bid = preGame.bid;
  const bidPending = !!bid && !bid.done;
  const myRole =
    gameMode === 'guozhan' || gameMode === 'duel' || bidPending
      ? null
      : gameMode === 'landlord'
        ? preGame.roles[0] === 'lord'
          ? '地主'
          : '农民'
        : ROLE_NAME[preGame.roles[0]];

  return (
    <div className="pick-screen">
      <div className="ink-bg" />
      <div className="setup-panel pick-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">进入对局 · 选择武将</div>
            <h2 className="setup-title">点 将 出 征</h2>
            <p className="setup-desc">
              {pairs.length
                ? '国战需要两张同势力武将。从下面的候选双将中选择一组，选择完成后进入牌桌。'
                : '其他角色的武将已经就位。从下面的候选武将中选择你的出战武将，选择完成后进入牌桌。'}
            </p>
            {myRole && (
              <span className={`pick-my-role role-${preGame.roles[0]}`}>
                你的身份：{myRole}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => useGameStore.setState({ screen: 'setup', preGame: null })}
          >
            返回
          </button>
        </div>

        {bid && (
          <section className="bid-panel">
            <div className="room-card-title">叫 地 主</div>
            {!bid.done ? (
              <>
                <p className="setup-hint">
                  3 分最高，直接成为地主；全部不叫时首位玩家成为地主。地主额外获得 1 点体力上限。
                </p>
                <div className="bid-actions">
                  {[0, 1, 2, 3].map((score) => (
                    <button
                      key={score}
                      type="button"
                      className={`btn ${score === 3 ? 'primary' : 'ghost'}`}
                      onClick={() => bidLocal(score)}
                    >
                      {score === 0 ? '不叫' : `${score} 分`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="bid-result">
                <b>
                  {bid.highestBidder === 0
                    ? '你成为地主'
                    : `${preGame.bots[bid.highestBidder - 1]?.name ?? '电脑'} 成为地主`}
                </b>
                <span>{bid.highest > 0 ? `最高 ${bid.highest} 分` : '全部不叫，首位玩家成为地主'}</span>
                <div className="bid-list">
                  <span>你：{bid.bids[0] ? `${bid.bids[0]} 分` : '不叫'}</span>
                  {preGame.bots.map((bot, index) => (
                    <span key={bot.name}>
                      {bot.name}：{bid.bids[index + 1] ? `${bid.bids[index + 1]} 分` : '不叫'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div
          className="pick-layout"
          style={bidPending ? { display: 'none' } : undefined}
        >
          <section className="pick-seats">
            <div className="room-card-title">座次与武将</div>
            <div className="pick-seat is-human">
              <span className="pick-seat-label">你</span>
              <span className="pick-seat-hero">
                {selectedPair
                  ? `${HERO_MAP.get(selectedPair.primary)?.name ?? ''} / ${HERO_MAP.get(selectedPair.secondary)?.name ?? ''}`
                  : selected?.name ?? '待选择'}
              </span>
              <span className="pick-seat-tag">
                {preGame.lordIndex === 0
                  ? gameMode === 'landlord'
                    ? '地主 · 已亮将'
                    : '主公 · 已亮将'
                  : selectedPair
                    ? '双将 · 已选择'
                    : selected
                      ? '已选择'
                      : '选择中'}
              </span>
            </div>
            {preGame.bots.map((bot, index) => {
              const hero = HERO_MAP.get(bot.heroId);
              const isLord = preGame.lordIndex === index + 1;
              return (
                <div key={bot.name + bot.heroId} className={`pick-seat ${isLord ? 'is-lord' : ''}`}>
                  <span className="pick-seat-label">电脑</span>
                  <span className="pick-seat-hero">
                    {isLord || gameMode === 'landlord' ? (hero?.name ?? '随机') : '未亮将'}
                  </span>
                  <span className="pick-seat-tag">
                    {isLord ? (gameMode === 'landlord' ? '地主' : '主公') : bot.name}
                  </span>
                </div>
              );
            })}
            <div className="pick-seat-note">
              {gameMode === 'landlord'
                ? '斗地主身份公开，其他玩家的武将也会在选择阶段显示。'
                : preGame.lordIndex >= 0
                  ? '主公武将已经亮出，其余武将会在全部选择完成后亮出。'
                  : '其余空位由电脑自动选择武将。'}
            </div>
          </section>

          <section className="pick-choice">
            <div className="setup-row">
              <span className="setup-label">{pairs.length ? '你的候选双将' : '你的候选武将'}</span>
              <span className="setup-hint">{pairs.length ? '点击一组同势力双将' : '点击一张武将牌选择'}</span>
            </div>
            {pairs.length ? (
              <div className="pick-hero-grid">
                {pairs.map((pair, index) => {
                  const heroes = [HERO_MAP.get(pair.primary), HERO_MAP.get(pair.secondary)].filter(
                    (hero): hero is NonNullable<typeof hero> => !!hero,
                  );
                  const first = heroes[0];
                  if (!first) return null;
                  const hp = heroes.reduce((sum, hero) => sum + hero.hp, 0);
                  const skills = [...new Set(heroes.flatMap((hero) => hero.skillIds))];
                  return (
                    <button
                      key={`${pair.primary}-${pair.secondary}`}
                      type="button"
                      className={`hero-card pair-hero-card faction-${first.faction} ${pairIndex === index ? 'picked' : ''}`}
                      onClick={() => setPairIndex(index)}
                    >
                      <div className="pair-hero-names">
                        {heroes.map((hero, heroIndex) => (
                          <span key={hero.id}>
                            <em>{heroIndex === 0 ? '主将' : '副将'}</em>
                            <b>{hero.name}</b>
                          </span>
                        ))}
                      </div>
                      <div className="hero-card-hp">
                        <span className="hp-icon">♥</span>
                        <span>{hp}</span>
                      </div>
                      <div className="hero-card-skills">
                        {skills.map((sid) => {
                          const skill = SKILL_MAP.get(sid);
                          return skill ? (
                            <div key={sid} className="hero-skill-line">
                              <b>{skill.name}</b>
                              <span>{skill.desc}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pick-hero-grid">
                {preGame.candidates.map((id) => {
                  const hero = HERO_MAP.get(id);
                  if (!hero) return null;
                  return (
                    <HoverInfo key={id} as="div" className="pick-card-wrap" content={<HeroDataHover hero={hero} />}>
                    <button
                      type="button"
                      className={`hero-card faction-${hero.faction} ${picked === id ? 'picked' : ''}`}
                      onClick={() => setPicked(id)}
                    >
                      <div className="hero-card-top">
                        <span className="faction-badge">{FACTION_NAME[hero.faction]}</span>
                        <span className="hero-card-name">{hero.name}</span>
                        <span className={`gender-badge ${hero.gender}`}>{hero.gender === 'male' ? '♂' : '♀'}</span>
                      </div>
                      <div className="hero-card-title">{hero.title}</div>
                      <div className="hero-card-hp">
                        <span className="hp-icon">♥</span>
                        <span>{hero.hp}</span>
                      </div>
                      <div className="hero-card-skills">
                        {hero.skillIds.map((sid) => {
                          const skill = SKILL_MAP.get(sid);
                          return skill ? (
                            <div key={sid} className="hero-skill-line">
                              <b>{skill.name}</b>
                              <span>{skill.desc}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div className="hero-card-quote">「{hero.quote}」</div>
                    </button>
                    <span
                      className="hero-card-info"
                      role="button"
                      tabIndex={0}
                      aria-label="查看武将信息"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetailHero(id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation();
                          setDetailHero(id);
                        }
                      }}
                    >
                      i
                    </span>
                    </HoverInfo>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="setup-actions" style={bidPending ? { display: 'none' } : undefined}>
          <span className="setup-picked">
            已选：<b>{selectedPair ? pairHeroes.map((hero) => hero.name).join(' / ') : selected?.name ?? '—'}</b>
          </span>
          <button
            type="button"
            className="btn primary big"
            disabled={selectedPair ? !pairHeroes.length : !picked}
            onClick={() =>
              selectedPair ? confirm(selectedPair.primary, selectedPair.secondary) : confirm(picked)
            }
          >
            进入对局
          </button>
        </div>
      </div>
      {detailHero && (
        <HeroDetailModal
          heroId={detailHero}
          showRole={false}
          onClose={() => setDetailHero(null)}
        />
      )}
    </div>
  );
}
