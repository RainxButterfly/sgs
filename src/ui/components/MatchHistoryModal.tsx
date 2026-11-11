import { useEffect, useRef, useState } from 'react';
import { FACTION_NAME, ROLE_NAME } from '../../core/types';
import {
  formatHistoryTime,
  loadHistory,
  renameHistoryGroup,
  type HistoryGroup,
  type MatchRecord,
} from '../history';
import { useGameStore } from '../store';
import { NameChip } from './NameChip';

function roleName(record: MatchRecord, role: MatchRecord['players'][number]['role']): string {
  if (record.mode === 'duel') return '';
  if (record.mode === 'guozhan') return '';
  if (record.mode === 'landlord') return role === 'lord' ? '地主' : '农民';
  return ROLE_NAME[role];
}

export function MatchHistoryModal() {
  const open = useGameStore((s) => s.historyOpen);
  const close = useGameStore((s) => s.closeHistory);
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [matchId, open, replayIndex]);

  useEffect(() => {
    if (!open) return;
    const next = loadHistory();
    setGroups(next);
    setGroupKey(next[0]?.key ?? null);
    setMatchId(next[0]?.matches[0]?.id ?? null);
    setNameDraft(next[0]?.name ?? '');
  }, [open]);

  const group = groups.find((item) => item.key === groupKey) ?? groups[0];
  const match = group?.matches.find((item) => item.id === matchId) ?? group?.matches[0];
  const matchLog = match ? [...match.log].sort((a, b) => a.id - b.id) : [];

  useEffect(() => {
    setReplayIndex(null);
    setPlaying(false);
  }, [matchId]);

  useEffect(() => {
    if (!playing || replayIndex === null) return;
    if (replayIndex >= matchLog.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setReplayIndex((value) => (value === null ? 0 : Math.min(matchLog.length - 1, value + 1)));
    }, 720);
    return () => window.clearTimeout(timer);
  }, [playing, replayIndex, matchLog.length]);

  if (!open) return null;
  const maxTurn = matchLog.reduce((max, entry) => {
    const found = /第\s*(\d+)\s*回合/.exec(entry.text);
    return found ? Math.max(max, Number(found[1])) : max;
  }, 0);
  const replaying = replayIndex !== null;
  const currentIndex = replayIndex ?? matchLog.length - 1;
  const visibleLog = replaying ? matchLog.slice(0, replayIndex + 1) : matchLog;

  const beginReplay = () => {
    if (matchLog.length === 0) return;
    setReplayIndex(0);
    setPlaying(true);
  };
  const step = (delta: number) => {
    setPlaying(false);
    setReplayIndex((value) => {
      const base = value ?? 0;
      return Math.max(0, Math.min(matchLog.length - 1, base + delta));
    });
  };

  const selectGroup = (next: HistoryGroup) => {
    setGroupKey(next.key);
    setNameDraft(next.name);
    setMatchId(next.matches[0]?.id ?? null);
  };

  const saveName = () => {
    if (!group) return;
    const next = renameHistoryGroup(group.key, nameDraft);
    setGroups(next);
    const updated = next.find((item) => item.key === group.key);
    setNameDraft(updated?.name ?? group.key);
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal history-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">对局记录</div>
          <button type="button" className="btn ghost small history-close-btn" onClick={close}>
            关闭
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="history-empty">还没有对局记录，完成一局后会保存在这里。</div>
        ) : (
          <div className="history-layout">
            <aside className="history-groups">
              <div className="history-side-title">日期分组</div>
              {groups.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`history-group ${item.key === group?.key ? 'active' : ''}`}
                  onClick={() => selectGroup(item)}
                >
                  <span>{item.name}</span>
                  <em>{item.matches.length} 局</em>
                </button>
              ))}
            </aside>

            <section className="history-list">
              <div className="history-name-row">
                <input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                  maxLength={24}
                  aria-label="日期分组名称"
                />
                <span>{group?.matches.length ?? 0} 局</span>
              </div>
              <div className="history-match-list">
                {(group?.matches ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`history-match ${item.id === match?.id ? 'active' : ''}`}
                    onClick={() => setMatchId(item.id)}
                  >
                    <span className={`history-result ${item.result}`}>
                      {item.result === 'win' ? '胜' : item.result === 'lose' ? '负' : '平'}
                    </span>
                    <span className="history-match-mode">{item.modeLabel}</span>
                    <span className="history-match-hero">{item.humanHeroName}</span>
                    <span className="history-match-time">{formatHistoryTime(item.playedAt)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="history-detail">
              {match ? (
                <>
                  <div className="history-detail-head">
                    <span className={`history-result big ${match.result}`}>
                      {match.result === 'win' ? '胜' : match.result === 'lose' ? '负' : '平'}
                    </span>
                    <div>
                      <b>{match.modeLabel}</b>
                      <span>{match.playerCount} 人 · {formatHistoryTime(match.playedAt)}</span>
                    </div>
                  </div>
                  <div className="history-run-stats">
                    <span><b>{match.playerCount}</b> 人</span>
                    <span><b>{maxTurn}</b> 回合</span>
                    <span><b>{matchLog.length}</b> 条记录</span>
                    <span>首出 <b>{match.firstPlayerName || '未记录'}</b></span>
                  </div>
                  <div className="history-players">
                    {match.players.map((player, index) => (
                      <div key={`${player.name}-${index}`} className={`history-player faction-${player.faction}`}>
                        <span className="faction-badge">{FACTION_NAME[player.faction]}</span>
                        <span className="history-player-hero">{player.heroName}</span>
                        <NameChip
                          name={player.name}
                          level={player.level ?? 1}
                          size="sm"
                          showLevel={player.level != null}
                          className="history-player-name"
                        />
                        {roleName(match, player.role) && (
                          <span className={`role-tag role-${player.role}`}>{roleName(match, player.role)}</span>
                        )}
                        {!player.alive && <span className="history-player-dead">阵亡</span>}
                      </div>
                    ))}
                  </div>
                  <div className="history-log-title">
                    <span>战报</span>
                    <div className="history-replay-actions">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => (replaying ? setPlaying((value) => !value) : beginReplay())}
                        disabled={matchLog.length === 0}
                      >
                        {replaying ? (playing ? '暂停' : '继续') : '开始复盘'}
                      </button>
                      {replaying && (
                        <>
                          <button type="button" className="btn ghost small" onClick={() => step(-1)} disabled={currentIndex <= 0}>
                            上一条
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, matchLog.length - 1)}
                            value={currentIndex}
                            aria-label="复盘进度"
                            onChange={(event) => {
                              setPlaying(false);
                              setReplayIndex(Number(event.target.value));
                            }}
                          />
                          <span className="history-replay-count">
                            {currentIndex + 1} / {matchLog.length}
                          </span>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => step(1)}
                            disabled={currentIndex >= matchLog.length - 1}
                          >
                            下一条
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => {
                              setReplayIndex(null);
                              setPlaying(false);
                            }}
                          >
                            退出复盘
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`history-log ${replaying ? 'is-replaying' : ''}`} ref={logRef}>
                    {visibleLog.map((entry, index) => (
                      <div
                        key={entry.id}
                        className={`log-line log-${entry.kind} ${
                          replaying && index === currentIndex ? 'is-current' : ''
                        }`}
                      >
                        {entry.text}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="history-detail-empty">左侧选择一局查看详情</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
