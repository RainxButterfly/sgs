import { useEffect, useState, type MouseEvent } from 'react';
import { toDataURL } from 'qrcode';
import { HERO_MAP } from '../../core/deck';
import { DEFAULT_RULES, ROLE_NAME, type Role } from '../../core/types';
import { LanPickPanel } from '../components/LanPickPanel';
import { LobbyChat } from '../components/LobbyChat';
import { KickMenu } from '../components/KickMenu';
import { NameChip } from '../components/NameChip';
import { RulesEditor } from '../components/RulesEditor';
import { matchXpBreakdown, profileProgress, xpForLevel, type MatchMode } from '../profile';
import { useGameStore } from '../store';

export function LobbyScreen() {
  const lobby = useGameStore((s) => s.lobby);
  const lanRole = useGameStore((s) => s.lanRole);
  const netError = useGameStore((s) => s.netError);
  const startLanGame = useGameStore((s) => s.startLanGame);
  const startLanPick = useGameStore((s) => s.startLanPick);
  const cancelLanPick = useGameStore((s) => s.cancelLanPick);
  const setLanRules = useGameStore((s) => s.setLanRules);
  const setLanCount = useGameStore((s) => s.setLanCount);
  const leaveLan = useGameStore((s) => s.leaveLan);
  const pickLanHero = useGameStore((s) => s.pickLanHero);
  const requestSeat = useGameStore((s) => s.requestSeat);
  const requestToSpectate = useGameStore((s) => s.requestToSpectate);
  const bidLan = useGameStore((s) => s.bidLan);
  const lanConnId = useGameStore((s) => s.lanConnId);
  const spectate = useGameStore((s) => s.spectate);
  const joinedRoom = useGameStore((s) => s.room);
  const lanHost = useGameStore((s) => s.lanHost);
  const myRole = useGameStore((s) => s.myRole);
  const profile = useGameStore((s) => s.profile);
  const [count, setCount] = useState(8);
  const [copied, setCopied] = useState<string | null>(null);
  const [spectatorOpen, setSpectatorOpen] = useState(false);
  const [advancedRules, setAdvancedRules] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [kickMenu, setKickMenu] = useState<{
    x: number;
    y: number;
    name: string;
    kind: 'player' | 'spectator';
    id: number;
  } | null>(null);
  const host = lanRole === 'host';
  const room = lobby?.room;
  const nicLabel = (name: string) =>
    /zerotier/i.test(name) ? 'ZeroTier' : /radmin/i.test(name) ? 'Radmin' : name || '局域网';
  const addressOptions = room
    ? [
        { ip: room.ip, name: room.names?.[0] ?? '' },
        ...(room.ips ?? [])
          .map((ip, index) => ({ ip, name: room.names?.[index] ?? '' }))
          .filter((entry) => entry.ip !== room.ip),
      ]
    : [];
  const [selectedIp, setSelectedIp] = useState(room?.ip ?? '');
  const selectedAddress =
    addressOptions.find((entry) => entry.ip === selectedIp) ?? addressOptions[0];
  const address = selectedAddress ? `${selectedAddress.ip}:${room?.port ?? 0}` : '';
  const joinUrl =
    lobby && address
      ? `http://${address}/?room=${encodeURIComponent(lobby.room.code)}`
      : '';
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    if (!addressOptions.some((entry) => entry.ip === selectedIp)) {
      setSelectedIp(room.ip);
    }
  }, [room, addressOptions, selectedIp]);

  useEffect(() => {
    if (!host || !joinUrl) {
      setQr(null);
      return;
    }
    let cancelled = false;
    toDataURL(joinUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#17130f', light: '#f2e8d3' },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [host, joinUrl]);

  if (!lobby) {
    return (
      <div className="lan-screen">
        <div className="ink-bg" />
        <div className="setup-panel lan-panel">
          <div className="lobby-loading">正在连接房间…</div>
          {netError && <div className="net-error">{netError}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={leaveLan}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  const players = lobby.players;
  const spectators = lobby.spectators ?? [];
  const fillBots = lobby.fillBots !== false;
  const bidding = lobby.bidding ?? null;
  const myPlayerId = host
    ? 0
    : players.find((player) => player.connId === lanConnId)?.playerId ?? -1;
  const bidName = (id: number) =>
    players.find((player) => player.playerId === id)?.name ?? `电脑${id}`;
  const currentBidder = bidding ? bidding.order[bidding.index] : undefined;
  const myBidTurn =
    !!bidding && !bidding.done && currentBidder !== undefined && currentBidder === myPlayerId;
  const maxTotal = lobby.seatCount ?? lobby.maxPlayers;
  const me = host ? players.find((player) => player.isHost) : players.find((player) => player.connId === lanConnId);
  const mode = lobby.mode ?? 'standard';
  const rules = lobby.rules ?? DEFAULT_RULES;
  const gameMode = rules.mode ?? 'identity';
  const minPlayers =
    gameMode === 'duel' ? 2 : gameMode === 'landlord' ? 3 : gameMode === 'guozhan' ? 4 : mode === 'custom' ? 2 : 5;
  const counts =
    gameMode === 'duel'
      ? [2]
      : gameMode === 'landlord'
        ? [3]
        : gameMode === 'guozhan'
          ? [4, 5, 6, 7, 8]
          : mode === 'custom'
            ? [2, 3, 4, 5, 6, 7, 8]
            : [5, 6, 7, 8];
  const startCount = fillBots
    ? Math.max(minPlayers, Math.min(8, Math.max(lobby.seatCount ?? count, players.length)))
    : Math.max(players.length, minPlayers);
  const picking = lobby.picking === true;
  const pickCount = Math.max(lobby.targetCount ?? startCount, players.length);
  const showRules = mode === 'custom' || advancedRules;
  const openKickMenu = (
    event: MouseEvent,
    kind: 'player' | 'spectator',
    id: number,
    name: string,
  ) => {
    event.stopPropagation();
    setKickMenu({ x: event.clientX, y: event.clientY, name, kind, id });
  };
  const applyKick = (permanent: boolean) => {
    if (!kickMenu) return;
    if (kickMenu.kind === 'player') lanHost?.kickPlayer(kickMenu.id, permanent);
    else lanHost?.kickSpectator(kickMenu.id, permanent);
    setKickMenu(null);
  };
  const gameModeLabel =
    gameMode === 'duel'
      ? '1v1 单挑'
      : gameMode === 'landlord'
        ? '斗地主'
        : gameMode === 'guozhan'
          ? '国战'
          : mode === 'custom'
            ? '自定义对局'
            : '标准身份场';
  const ruleSummary = `初始手牌 ${rules.initialHand} · 摸牌 ${rules.drawCount} · 体力 ${
    rules.hpModifier >= 0 ? '+' : ''
  }${rules.hpModifier} · 手牌上限 ${rules.handLimitModifier >= 0 ? '+' : ''}${rules.handLimitModifier} · 身份${
    rules.revealRoles ? '公开' : '隐藏'
  } · 技能${rules.skillsEnabled ? '开启' : '关闭'} · 军争${rules.military ? '开启' : '关闭'}`;
  const xpPreview = matchXpBreakdown(
    gameMode as MatchMode,
    'win',
    Math.max(1, players.length),
  );
  const xpNeed = xpForLevel(profile.level);
  let afterLevel = profile.level;
  let afterXp = profile.xp + xpPreview.total;
  while (afterLevel < 99) {
    const need = xpForLevel(afterLevel);
    if (afterXp < need) break;
    afterXp -= need;
    afterLevel += 1;
  }
  if (afterLevel >= 99) afterXp = 0;
  const afterNeed = xpForLevel(afterLevel);
  const currentProgress = profileProgress(profile);
  const afterProgress = afterLevel >= 99 ? 100 : (afterXp / afterNeed) * 100;

  const copy = async (text: string, key: string) => {
    const done = () => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand('copy');
        area.remove();
        done();
      } catch {
        setCopied(null);
      }
    }
  };

  return (
    <div className="lan-screen">
      <div className="ink-bg" />
      <div className="lobby-ambient" aria-hidden="true">
        <span className="ambient-stardust" />
        <span className="ambient-sigil">
          <i />
          <i />
          <i />
        </span>
        <span className="ambient-orb orb-a" />
        <span className="ambient-orb orb-b" />
        <span className="lobby-runes">
          <b>聚</b>
          <b>義</b>
          <b>廳</b>
        </span>
      </div>
      <div className="setup-panel lobby-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">局域网联机</div>
            <h2 className="setup-title">聚 義 廳</h2>
            <p className="setup-desc">
              {lobby.picking
                ? '所有人选择武将后，由房主进入对局。'
                : host
                  ? '等待朋友加入，到齐后点击「开始选将」。'
                  : '已进入房间，等待房主开始选将。'}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={leaveLan}>
            离开
          </button>
        </div>

        {picking ? (
          me ? (
            <LanPickPanel
              players={players}
              me={me}
              host={host}
              guozhan={gameMode === 'guozhan'}
              landlord={gameMode === 'landlord'}
              startCount={pickCount}
              code={lobby.room.code}
              lordPlayerId={lobby.lordPlayerId}
              lordSeat={lobby.lordSeat}
              lordHeroId={lobby.lordHeroId}
              revealed={lobby.revealed}
              onPick={pickLanHero}
              onStart={() => startLanGame(pickCount)}
              onCancel={cancelLanPick}
              role={gameMode === 'guozhan' ? undefined : (host ? (lanHost?.roles?.[0] ?? null) : myRole)}
            />
          ) : (
            <div className="lobby-spectator-wait">
              <b>观战中</b>
              <p>你正在观战席，房主开始对局后会自动进入观战画面。</p>
              <p className="muted">
                房间码 <b>{lobby.room.code}</b> · 观战席 {lobby.spectators?.length ?? 0} 人
              </p>
            </div>
          )
        ) : (
          <>
        <div className="lobby-grid lobby-grid-v2">
          <section className="room-card room-holo">
            <div className="room-holo-head">
              <div className="room-holo-code">
                <span className="room-holo-kicker">
                  <i className={`room-live-dot ${picking ? 'is-picking' : ''}`} />
                  {picking ? '全员选将中' : players.some((p) => !p.connected) ? '有玩家掉线' : '等待入座'}
                </span>
                <div className="hero-room-code" aria-label={`房间码 ${lobby.room.code}`}>
                  {lobby.room.code.split('').map((char, index) => (
                    <span
                      key={`${char}-${index}`}
                      className={`hero-room-char char-${index % 6}`}
                      style={{ animationDelay: `${index * -0.36}s` }}
                      aria-hidden="true"
                    >
                      {char}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="hero-room-copy"
                    onClick={() => copy(lobby.room.code, 'code')}
                  >
                    {copied === 'code' ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="hero-room-sub">房间码 · 手机输入即可加入，对局中也能进来观战</div>
              </div>
              <button
                type="button"
                className={`room-spectator-btn ${spectators.length ? 'has-people' : ''}`}
                onClick={() => setSpectatorOpen(true)}
              >
                <span>观战席</span>
                <b>{spectators.length}</b>
                <em>{spectators.length ? '查看名单' : '暂时无人'}</em>
              </button>
            </div>

            <div className="room-stat-grid">
              <div>
                <span>模式</span>
                <b>{gameModeLabel}</b>
              </div>
              <div>
                <span>座次</span>
                <b>
                  {players.length} / {maxTotal}
                </b>
              </div>
              <div>
                <span>开局人数</span>
                <b>{startCount} 人</b>
              </div>
              <div>
                <span>出牌方向</span>
                <b>开局随机</b>
              </div>
            </div>

            {bidding && !bidding.done && (
              <div className="lobby-bid">
                <div className="lobby-bid-head">
                  <b>斗地主叫分</b>
                  <span>
                    最高 {bidding.highest || '—'} 分 · 轮到 {bidName(currentBidder ?? -1)}
                  </span>
                </div>
                <div className="lobby-bid-players">
                  {bidding.order.map((id) => {
                    const score = bidding.bids[id];
                    const state =
                      score === undefined ? '等待' : score === 0 ? '不叫' : `${score} 分`;
                    return (
                      <div
                        key={id}
                        className={[
                          'lobby-bid-player',
                          id === currentBidder ? 'active' : '',
                          id === bidding.highestBidder ? 'leader' : '',
                        ].join(' ')}
                      >
                        <span>{bidName(id)}</span>
                        <b>{state}</b>
                      </div>
                    );
                  })}
                </div>
                {myBidTurn ? (
                  <div className="lobby-bid-actions">
                    <button type="button" className="btn ghost" onClick={() => bidLan(0)}>
                      不叫
                    </button>
                    {[1, 2, 3].map((score) => (
                      <button
                        key={score}
                        type="button"
                        className={`btn ${score > bidding.highest ? 'primary' : 'ghost'}`}
                        disabled={score <= bidding.highest}
                        onClick={() => bidLan(score)}
                      >
                        {score} 分
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="lobby-bid-wait">等待 {bidName(currentBidder ?? -1)} 叫分…</div>
                )}
              </div>
            )}

            {host ? (
              <>
                <div className="room-row">
                  <span className="room-label">联机地址</span>
                  <span className="room-value small">选择手机要使用的地址</span>
                  <button type="button" className="btn ghost small" onClick={() => copy(address, 'addr')}>
                    {copied === 'addr' ? '已复制' : '复制'}
                  </button>
                </div>
                <div className="address-list">
                  {addressOptions.map((entry) => {
                    const active = entry.ip === selectedAddress?.ip;
                    return (
                      <button
                        key={entry.ip}
                        type="button"
                        className={`address-item ${active ? 'on' : ''}`}
                        onClick={() => setSelectedIp(entry.ip)}
                      >
                        <span className="address-name">{nicLabel(entry.name)}</span>
                        <span className="address-value">
                          {entry.ip}:{lobby.room.port}
                        </span>
                        <span className="address-state">{active ? '使用中' : '切换'}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="room-row">
                <span className="room-label">房主地址</span>
                <span className="room-value">
                  {joinedRoom?.ip ?? lobby.room.ip}:{joinedRoom?.port ?? lobby.room.port}
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() =>
                    copy(
                      `${joinedRoom?.ip ?? lobby.room.ip}:${joinedRoom?.port ?? lobby.room.port}`,
                      'addr',
                    )
                  }
                >
                  {copied === 'addr' ? '已复制' : '复制'}
                </button>
              </div>
            )}
            {host && (
              <>
                <div className="room-qr">
                  {qr ? (
                    <img src={qr} alt="手机扫码加入" />
                  ) : (
                    <div className="qr-placeholder">二维码生成中…</div>
                  )}
                  <div className="qr-text">
                    <b>手机扫码加入</b>
                    <span>手机与电脑处于同一 WiFi 或虚拟局域网时，用相机扫码即可进入房间。</span>
                    <span className="qr-url">{joinUrl}</span>
                  </div>
                </div>
                <div className="room-hint compact">
                  二维码使用当前选中的地址。ZeroTier 地址打不开时，请允许四国闪通过 Windows 防火墙，或切换到局域网地址。
                </div>
              </>
            )}

            <div className={`room-config ${host ? '' : 'room-config-readonly'}`}>
              <div className="room-config-head">
                <span className="setup-label">对局配置</span>
                <em>
                  {gameModeLabel} · {startCount} 人
                </em>
                {host && (
                  <button
                    type="button"
                    className="btn ghost small room-config-toggle"
                    onClick={() => setConfigOpen((value) => !value)}
                  >
                    {configOpen ? '收起配置' : '调整配置'}
                  </button>
                )}
              </div>
              {host ? (
                <>
                  {configOpen && (
                    <>
                  <div className="room-config-grid">
                    <div className="room-config-block">
                      <span>模式</span>
                      <div className="count-group">
                        {([
                          ['identity', '身份场'],
                          ['duel', '1v1'],
                          ['landlord', '斗地主'],
                          ['guozhan', '国战'],
                          ['custom', '自定义'],
                        ] as const).map(([id, label]) => {
                          const active =
                            id === 'identity'
                              ? gameMode === 'identity' && mode === 'standard'
                              : id === 'custom'
                                ? mode === 'custom' && gameMode === 'identity'
                                : gameMode === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              className={`count-btn ${active ? 'on' : ''}`}
                              onClick={() => {
                                if (id === 'custom') setLanRules('custom', { ...rules, mode: 'identity' });
                                else if (id === 'identity')
                                  setLanRules('standard', { ...DEFAULT_RULES, military: rules.military, mode: 'identity' });
                                else setLanRules('custom', { ...rules, mode: id });
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="room-config-block">
                      <span>开局人数</span>
                      <div className="count-group">
                        {counts.map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`count-btn ${startCount === value ? 'on' : ''}`}
                            disabled={value < players.length}
                            onClick={() => {
                              setCount(value);
                              setLanCount(value);
                            }}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="room-config-row">
                    <button
                      type="button"
                      className={`count-btn ${rules.military ? 'on' : ''}`}
                      onClick={() => setLanRules(mode, { ...rules, military: !rules.military })}
                    >
                      军争篇
                    </button>
                    <button
                      type="button"
                      className={`count-btn ${showRules ? 'on' : ''}`}
                      onClick={() => setAdvancedRules((value) => !value)}
                    >
                      高级规则
                    </button>
                    <button
                      type="button"
                      className={`fill-switch ${fillBots ? 'on' : ''}`}
                      onClick={() => lanHost?.setFillBots(!fillBots)}
                      aria-pressed={fillBots}
                    >
                      <span>
                        <b>AI 补空位</b>
                        <em>{fillBots ? '空位由电脑补足' : '只用真实玩家'}</em>
                      </span>
                      <i />
                    </button>
                  </div>
                  {showRules && (
                    <>
                      <RulesEditor rules={rules} onChange={(next) => setLanRules('custom', next)} />
                      <span className="room-config-hint">
                        调整以上任意一项会把房间切换为自定义规则；2 人为无身份单挑，3–4 人为主公/忠臣/反贼。
                      </span>
                    </>
                  )}
                    </>
                  )}
                  <div className="room-config-hint">{ruleSummary}</div>
                  <div className="start-row room-start-row">
                    <span className="setup-hint">
                      实际开局 {startCount} 人
                      {fillBots ? ' · 空位由电脑补足' : ' · 不补电脑'}
                      {!fillBots && players.length < minPlayers ? ` · 至少需要 ${minPlayers} 人` : ''}
                    </span>
                    <button
                      type="button"
                      className="btn primary big"
                      disabled={
                        players.some((player) => !player.connected) ||
                        !!bidding ||
                        (!fillBots && players.length < minPlayers)
                      }
                      onClick={() => startLanPick(startCount)}
                    >
                      {bidding ? '叫分中…' : '开始选将'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="room-config-readonly-grid">
                    <span>规则</span>
                    <b>{ruleSummary}</b>
                  </div>
                  <div className="room-config-readonly-grid">
                    <span>空位</span>
                    <b>{fillBots ? '电脑补足' : '只用真实玩家'}</b>
                  </div>
                  <div className="room-config-hint">房主可切换模式、人数与规则；你这边会实时同步。</div>
                  <div className="start-row waiting-row">
                    <span className="waiting-dot" />
                    <span>
                      {spectate ? '你以观战身份加入，房主开始后会自动进入观战画面…' : '等待房主开始选将…'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="player-list-card">
            <div className="room-card-title">
              座次
              <span className="room-title-count">
                {players.length}/{maxTotal}
              </span>
            </div>
            <div className="player-list">
              {players.map((player) => (
                <div key={player.connId} className={`lobby-player ${player.isHost ? 'is-host' : ''}`}>
                  <span className="lobby-seat">{player.isHost ? '房主' : '玩家'}</span>
                  <span className="lobby-name">
                    <NameChip name={player.name} level={player.level ?? 1} size="sm" />
                  </span>
                  <span className="lobby-hero-tag">
                    {player.heroIds?.length
                      ? `已选 · ${player.heroIds.map((id) => HERO_MAP.get(id)?.name ?? '').join(' / ')}`
                      : player.heroId
                        ? `已选 · ${HERO_MAP.get(player.heroId)?.name ?? ''}`
                        : '待选将'}
                  </span>
                  <span className="lobby-status">{player.connected ? '已入座' : '掉线'}</span>
                  {!host && player.connId === lanConnId && (
                    <button
                      type="button"
                      className="lobby-switch"
                      onClick={requestToSpectate}
                      title="离开座次，进入观战席"
                    >
                      去观战
                    </button>
                  )}
                  {host && !player.isHost && (
                    <button
                      type="button"
                      className="lobby-kick"
                      onClick={(event) => openKickMenu(event, 'player', player.playerId, player.name)}
                    >
                      移出
                    </button>
                  )}
                </div>
              ))}
              {host &&
                Array.from({ length: Math.max(0, startCount - players.length) }, (_, i) => (
                  <div key={`empty-${i}`} className="lobby-player empty">
                    <span className="lobby-seat">空位</span>
                    <span className="lobby-name">电脑将补足</span>
                  </div>
                ))}
            </div>
            <button
              type="button"
              className="lobby-spectator-strip"
              onClick={() => setSpectatorOpen(true)}
            >
              <span className="lobby-spectator-icon">观</span>
              <span>
                <b>观战席 · {spectators.length} 人</b>
                <em>{spectators.length ? spectators.map((item) => item.name).join('、') : '点击查看，对局中也可进入观战'}</em>
              </span>
              <i>查看</i>
            </button>
            <LobbyChat />
            <div className="lobby-xp-card">
              <div className="lobby-xp-head">
                <span>你的经验</span>
                <em>本局最多 +{xpPreview.total}</em>
              </div>
              <div className="lobby-xp-bar">
                <i style={{ width: `${currentProgress}%` }} />
                <span className="lobby-xp-now">
                  Lv.{profile.level} · {profile.xp} / {xpNeed}
                </span>
                <span className="lobby-xp-after">
                  → {afterLevel > profile.level ? `Lv.${afterLevel} · ` : ''}
                  {afterXp} / {afterNeed}
                </span>
                {afterLevel === profile.level && (
                  <em
                    className="lobby-xp-delta"
                    style={{
                      left: `${currentProgress}%`,
                      width: `${Math.max(0, afterProgress - currentProgress)}%`,
                    }}
                  />
                )}
              </div>
              <div className="lobby-xp-chips">
                <span>模式基础 {xpPreview.base}</span>
                <span>胜利 +{xpPreview.winBonus}</span>
                <span>真人 +{xpPreview.realBonus}</span>
              </div>
              <div className="lobby-xp-tip">
                真人玩家越多经验越高；身份场、国战、斗地主和 1v1 的基础经验不同。
              </div>
            </div>
            <div className="lobby-side-summary">
              <div className="room-card-title">
                本局规则
                <span className="room-title-count">SUMMARY</span>
              </div>
              <div className="lobby-side-line">
                <span>模式</span>
                <b>{gameModeLabel} · {startCount} 人</b>
              </div>
              <div className="lobby-side-line">
                <span>初始手牌 / 摸牌</span>
                <b>{rules.initialHand} / {rules.drawCount}</b>
              </div>
              <div className="lobby-side-line">
                <span>身份</span>
                <b>{rules.revealRoles ? '公开' : '隐藏'}</b>
              </div>
              <div className="lobby-side-line">
                <span>空位</span>
                <b>{fillBots ? '电脑补足' : '只用真实玩家'}</b>
              </div>
            </div>
          </section>
        </div>

        {spectatorOpen && (
          <div className="modal-backdrop spectator-backdrop" onClick={() => setSpectatorOpen(false)}>
            <div
              className="modal spectator-list-modal lobby-spectator-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div className="modal-title">观战席 · {spectators.length} 人</div>
                <button type="button" className="modal-minimize" onClick={() => setSpectatorOpen(false)}>
                  关闭
                </button>
              </div>
              {spectators.length === 0 ? (
                <div className="spectator-empty">
                  <p>还没有人观战。</p>
                  <p className="muted">
                    把房间码 <b>{lobby.room.code}</b> 和地址分享给朋友，对局中也可以以观战身份进入。
                  </p>
                </div>
              ) : (
                <ul className="spectator-list">
                  {spectators.map((spectator) => (
                    <li key={spectator.connId}>
                      <span className="spectator-avatar">{spectator.name.slice(0, 1)}</span>
                      <span className="spectator-name">
                        <NameChip name={spectator.name} level={spectator.level ?? 1} size="sm" />
                      </span>
                      <code className="spectator-ip">{spectator.ip || 'IP 未知'}</code>
                      {!host && spectator.connId === lanConnId && players.length < maxTotal && (
                        <button
                          type="button"
                          className="lobby-switch"
                          onClick={() => {
                            requestSeat();
                            setSpectatorOpen(false);
                          }}
                        >
                          申请入座
                        </button>
                      )}
                      {host && players.length < maxTotal && (
                        <button
                          type="button"
                          className="lobby-switch"
                          onClick={() => {
                            lanHost?.seatSpectator(spectator.connId);
                            setSpectatorOpen(false);
                          }}
                        >
                          拉入座次
                        </button>
                      )}
                      {host && (
                        <button
                          type="button"
                          className="lobby-kick"
                          onClick={(event) => openKickMenu(event, 'spectator', spectator.connId, spectator.name)}
                        >
                          移出
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="modal-actions">
                <button type="button" className="btn primary" onClick={() => setSpectatorOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

          </>
        )}

        {netError && <div className="net-error">{netError}</div>}
        {kickMenu && (
          <KickMenu
            x={kickMenu.x}
            y={kickMenu.y}
            name={kickMenu.name}
            kind={kickMenu.kind}
            onKick={() => applyKick(false)}
            onPermanent={() => applyKick(true)}
            onClose={() => setKickMenu(null)}
          />
        )}
      </div>
    </div>
  );
}
