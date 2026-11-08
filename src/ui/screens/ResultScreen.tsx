import { useGameSnapshot, useGameStore } from '../store';
import { HERO_MAP } from '../../core/deck';
import { FACTION_NAME, ROLE_NAME } from '../../core/types';

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
  const restart = useGameStore((s) => s.restart);
  const back = useGameStore((s) => s.backToMenu);
  if (!game || !result) return null;

  const human = game.state.players[humanId];
  const mode = game.state.rules.mode;
  const humanWon =
    mode === 'guozhan'
      ? result.winner === human.faction
      : mode === 'landlord'
        ? (result.winner === 'lord' && human.role === 'lord') ||
          (result.winner === 'rebel' && human.role !== 'lord')
        : (result.winner === 'lord' && (human.role === 'lord' || human.role === 'loyalist')) ||
          (result.winner === 'rebel' && human.role === 'rebel') ||
          (result.winner === 'traitor' && human.role === 'traitor');
  const winnerLabel =
    mode === 'guozhan' && result.winner in FACTION_NAME
      ? `${FACTION_NAME[result.winner as keyof typeof FACTION_NAME]}势力获胜`
      : mode === 'landlord'
        ? result.winner === 'lord'
          ? '地主获胜'
          : '农民获胜'
        : mode === 'duel'
          ? '单挑获胜'
          : WINNER_LABEL[result.winner] ?? '对局结束';
  const roleLabel = (role: typeof human.role) => {
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
        <div className="result-table">
          {game.state.players.map((p) => {
            const hero = HERO_MAP.get(p.heroId);
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
                <span className="result-hero">{hero?.name ?? p.heroName}</span>
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
          <button type="button" className="btn ghost big" onClick={back}>
            返回主菜单
          </button>
        </div>
      </div>
    </div>
  );
}
