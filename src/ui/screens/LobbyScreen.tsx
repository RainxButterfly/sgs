import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { HERO_MAP } from '../../core/deck';
import { DEFAULT_RULES } from '../../core/types';
import { LanPickPanel } from '../components/LanPickPanel';
import { RulesEditor } from '../components/RulesEditor';
import { useGameStore } from '../store';

export function LobbyScreen() {
  const lobby = useGameStore((s) => s.lobby);
  const lanRole = useGameStore((s) => s.lanRole);
  const netError = useGameStore((s) => s.netError);
  const startLanGame = useGameStore((s) => s.startLanGame);
  const startLanPick = useGameStore((s) => s.startLanPick);
  const cancelLanPick = useGameStore((s) => s.cancelLanPick);
  const setLanRules = useGameStore((s) => s.setLanRules);
  const leaveLan = useGameStore((s) => s.leaveLan);
  const pickLanHero = useGameStore((s) => s.pickLanHero);
  const lanConnId = useGameStore((s) => s.lanConnId);
  const [count, setCount] = useState(8);
  const [copied, setCopied] = useState<string | null>(null);
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
  const maxTotal = lobby.maxPlayers;
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
  const startCount = Math.max(minPlayers, Math.min(8, Math.max(count, players.length)));
  const picking = lobby.picking === true;
  const pickCount = Math.max(lobby.targetCount ?? startCount, players.length);
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
              startCount={pickCount}
              code={lobby.room.code}
              lordPlayerId={lobby.lordPlayerId}
              lordSeat={lobby.lordSeat}
              lordHeroId={lobby.lordHeroId}
              revealed={lobby.revealed}
              onPick={pickLanHero}
              onStart={() => startLanGame(pickCount)}
              onCancel={cancelLanPick}
            />
          ) : null
        ) : (
          <>
        <div className="lobby-grid">
          <section className="room-card">
            <div className="room-card-title">房间信息</div>
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
            <div className="room-row">
              <span className="room-label">房间码</span>
              <span className="room-value code">{lobby.room.code}</span>
              <button type="button" className="btn ghost small" onClick={() => copy(lobby.room.code, 'code')}>
                {copied === 'code' ? '已复制' : '复制'}
              </button>
            </div>
            <div className="address-hint">
              二维码使用当前选中的地址。ZeroTier 地址打不开时，请允许四国闪通过 Windows 防火墙，或切换到局域网地址。
            </div>
            {host && (
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
            )}
          </section>

          <section className="player-list-card">
            <div className="room-card-title">座次（{players.length}/{maxTotal}）</div>
            <div className="player-list">
              {players.map((player) => (
                <div key={player.connId} className={`lobby-player ${player.isHost ? 'is-host' : ''}`}>
                  <span className="lobby-seat">{player.isHost ? '房主' : '玩家'}</span>
                  <span className="lobby-name">{player.name}</span>
                  <span className="lobby-hero-tag">
                    {player.heroId ? `已选 · ${HERO_MAP.get(player.heroId)?.name ?? ''}` : '待选将'}
                  </span>
                  <span className="lobby-status">{player.connected ? '已入座' : '掉线'}</span>
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
          </section>
        </div>

        {host ? (
          <>
            <div className="lobby-rules">
              <div className="lobby-rules-head">
                <span className="setup-label">对局模式</span>
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
                          else if (id === 'identity') setLanRules('standard', { ...rules, mode: 'identity' });
                          else setLanRules('custom', { ...rules, mode: id });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={`count-btn ${rules.military ? 'on' : ''}`}
                  onClick={() => setLanRules(mode, { ...rules, military: !rules.military })}
                >
                  军争篇
                </button>
                <span className="setup-hint">
                  {gameMode === 'guozhan'
                    ? '魏蜀吴群阵营团战，存活到最后的势力获胜'
                    : gameMode === 'landlord'
                      ? '地主 1 · 农民 2'
                      : gameMode === 'duel'
                        ? '1v1 单挑 · 双方没有身份'
                        : mode === 'custom'
                          ? '自定义规则对所有玩家生效'
                          : '主公 +1 体力，身份随机隐藏'}
                </span>
              </div>
              {mode === 'custom' && (
                <>
                  <RulesEditor rules={rules} onChange={(next) => setLanRules('custom', next)} />
                  <span className="setup-hint">
                    2 人为无身份单挑；3–4 人为主公/忠臣/反贼；5 人以上使用标准身份配置。
                  </span>
                </>
              )}
            </div>
            <div className="start-row">
              <div className="count-group">
                {counts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`count-btn ${startCount === n ? 'on' : ''}`}
                    disabled={n < players.length}
                    onClick={() => setCount(n)}
                  >
                    {n} 人
                  </button>
                ))}
              </div>
              <span className="setup-hint">实际开局人数 {startCount} · 空位由电脑补足</span>
              <button
                type="button"
                className="btn primary big"
                disabled={players.some((p) => !p.connected)}
                onClick={() => startLanPick(startCount)}
              >
                开始选将
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="lobby-rules-summary">
              模式：{gameModeLabel}
              {mode === 'custom' || gameMode !== 'identity' ? ` · ${ruleSummary}` : ' · 5–8 人'}
            </div>
            <div className="start-row waiting-row">
              <span className="waiting-dot" />
              <span>等待房主开始选将…</span>
            </div>
          </>
        )}
          </>
        )}

        {netError && <div className="net-error">{netError}</div>}
      </div>
    </div>
  );
}
