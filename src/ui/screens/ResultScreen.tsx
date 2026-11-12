import { useGameSnapshot, useGameStore } from '../store';
import { FACTION_NAME, ROLE_NAME } from '../../core/types';
import { playerHeroNames } from '../labels';
import { levelTitle, modeLabel, profileProgress } from '../profile';

const WINNER_LABEL: Record<string, string> = {
  lord: '主公阵营获胜',
  rebel: '反贼阵营获胜',
  traitor: '内奸获胜',
  draw: '平局',
};

export function ResultScreen() {
  const { game } = useGameSnapshot();
  const humanId = useGameStore((s) => s.humanId);
  const result = useGameStore((s) => s.result);
  const profile = useGameStore((s) => s.profile);
  const xpGain = useGameStore((s) => s.xpGain);
  const devTainted = useGameStore((s) => s.devTainted);
  const restart = useGameStore((s) => s.restart);
  const back = useGameStore((s) => s.backToMenu);
  if (!game || !result) return null;

  const human = game.state.players[humanId];
  if (!human) return null;
  const mode = game.state.players.length === 2 ? 'duel' : game.state.rules.mode;
  const humanWon =
    mode === '2v2'
      ? result.winner === 'loyalist'
        ? human.role === 'loyalist'
        : result.winner === 'rebel'
          ? human.role === 'rebel'
          : false
      : mode === 'guozhan'
      ? result.winner === human.faction
      : mode === 'landlord'
        ? (result.winner === 'lord' && human.role === 'lord') ||
          (result.winner === 'rebel' && human.role !== 'lord')
        : (result.winner === 'lord' && (human.role === 'lord' || human.role === 'loyalist')) ||
          (result.winner === 'rebel' && human.role === 'rebel') ||
          (result.winner === 'traitor' && human.role === 'traitor');
  const winnerLabel =
    mode === '2v2'
      ? result.winner === 'loyalist'
        ? '甲队获胜'
        : result.winner === 'rebel'
          ? '乙队获胜'
          : '对局结束'
      : mode === 'guozhan' && result.winner in FACTION_NAME
      ? `${FACTION_NAME[result.winner as keyof typeof FACTION_NAME]}势力获胜`
      : mode === 'landlord'
        ? result.winner === 'lord'
          ? '地主获胜'
          : '农民获胜'
        : mode === 'duel'
          ? '单挑获胜'
          : WINNER_LABEL[result.winner] ?? '对局结束';
  const roleLabel = (role: typeof human.role) => {
    if (mode === '2v2') return role === 'loyalist' ? '甲队' : '乙队';
    if (mode === 'guozhan' || mode === 'duel') return '';
    if (mode === 'landlord') return role === 'lord' ? '地主' : '农民';
    return ROLE_NAME[role];
  };

  return (
    <div className={`result-screen ${humanWon ? 'win' : 'lose'}`}>
      <div className="ink-bg" />
      <div className="result-panel">
        <div className="result-kicker">{winnerLabel}</div>
        <h1 className="result-title">{humanWon ? '胜 利' : '败 北'}</h1>
        <p className="result-text">{result.text}</p>
        {xpGain && (
          <div className={`result-xp ${xpGain.levelsGained > 0 ? 'level-up' : ''}`}>
            <div className="result-xp-level">
              <small>Lv.{xpGain.levelBefore}</small>
              <span>→</span>
              <b>Lv.{profile.level}</b>
              <em>{levelTitle(profile.level)}</em>
            </div>
            <div className="result-xp-main">
              <div className="result-xp-head">
                <b>+{xpGain.total} 经验</b>
                <span>
                  {modeLabel(xpGain.mode)}
                  {xpGain.realPlayers > 1 ? ` · ${xpGain.realPlayers} 名真人` : ' · 人机对局'}
                </span>
              </div>
              <div className="result-xp-bar">
                <i style={{ width: `${profileProgress(profile)}%` }} />
              </div>
              <div className="result-xp-breakdown">
                <span>基础 {xpGain.base}</span>
                {xpGain.winBonus > 0 && <span>胜利 +{xpGain.winBonus}</span>}
                {xpGain.winExtra > 0 && <span>夺胜额外 +{xpGain.winExtra}</span>}
                {xpGain.realBonus > 0 && <span>真人 +{xpGain.realBonus}</span>}
                {xpGain.levelsGained > 0 && <b>升 {xpGain.levelsGained} 级</b>}
              </div>
            </div>
          </div>
        )}
        {!xpGain && devTainted && (
          <div className="result-dev-note">测试对局 · 使用过测试工具，本局不获得经验与等级</div>
        )}
        <div className="result-table">
          {game.state.players.map((p) => {
            
            return (
              <div
                key={p.id}
                className={[
                  'result-row',
                  `faction-${p.faction}`,
                  p.id === humanId ? 'is-human' : '',
                  p.alive ? 'alive' : 'dead',
                ].join(' ')}
              >
                <span className="faction-badge">{FACTION_NAME[p.faction]}</span>
                <span className="result-hero">{playerHeroNames(p)}</span>
                <span className="result-player">{p.name}</span>
                {roleLabel(p.role) && (
                  <span className={`role-tag role-${p.role}`}>{roleLabel(p.role)}</span>
                )}
                <span className="result-status">{p.alive ? `${Math.max(0, p.hp)} 体力` : '阵亡'}</span>
              </div>
            );
          })}
        </div>
        <div className="result-actions">
          <button type="button" className="btn primary big" onClick={restart}>
            再来一局
          </button>
          <button
            type="button"
            className="btn ghost big"
            onClick={() => useGameStore.getState().openHistory()}
          >
            查看战绩
          </button>
          <button type="button" className="btn ghost big" onClick={back}>
            返回主菜单
          </button>
        </div>
      </div>
    </div>
  );
}
