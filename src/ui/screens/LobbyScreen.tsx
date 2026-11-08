import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { DEFAULT_RULES } from '../../core/types';
import { RulesEditor } from '../components/RulesEditor';
import { useGameStore } from '../store';

export function LobbyScreen() {
  const lobby = useGameStore((s) => s.lobby);
  const lanRole = useGameStore((s) => s.lanRole);
  const netError = useGameStore((s) => s.netError);
  const startLanGame = useGameStore((s) => s.startLanGame);
  const setLanRules = useGameStore((s) => s.setLanRules);
  const leaveLan = useGameStore((s) => s.leaveLan);
  const [count, setCount] = useState(8);
  const [copied, setCopied] = useState<string | null>(null);
  const host = lanRole === 'host';
  const joinUrl = lobby
    ? `http://${lobby.room.ip}:${lobby.room.port}/?room=${encodeURIComponent(lobby.room.code)}`
    : '';
  const [qr, setQr] = useState<string | null>(null);

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

  const address = `${lobby.room.ip}:${lobby.room.port}`;
  const otherAddresses = (lobby.room.ips ?? [])
    .filter((ip) => ip !== lobby.room.ip)
    .map((ip) => `${ip}:${lobby.room.port}`);
  const players = lobby.players;
  const maxTotal = lobby.maxPlayers;
  const mode = lobby.mode ?? 'standard';
  const rules = lobby.rules ?? DEFAULT_RULES;
  const minPlayers = mode === 'custom' ? 2 : 5;
  const counts = mode === 'custom' ? [2, 3, 4, 5, 6, 7, 8] : [5, 6, 7, 8];
  const startCount = Math.max(minPlayers, Math.min(8, Math.max(count, players.length)));
  const ruleSummary = `初始手牌 ${rules.initialHand} · 摸牌 ${rules.drawCount} · 体力 ${
    rules.hpModifier >= 0 ? '+' : ''
  }${rules.hpModifier} · 手牌上限 ${rules.handLimitModifier >= 0 ? '+' : ''}${rules.handLimitModifier} · 身份${
    rules.revealRoles ? '公开' : '隐藏'
  } · 技能${rules.skillsEnabled ? '开启' : '关闭'}`;

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
              {host ? '等待朋友加入，所有人到齐后开始。' : '已进入房间，等待房主开始对局。'}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={leaveLan}>
            离开
          </button>
        </div>

        <div className="lobby-grid">
          <section className="room-card">
            <div className="room-card-title">房间信息</div>
            <div className="room-row">
              <span className="room-label">房主地址</span>
              <span className="room-value">{address}</span>
              <button type="button" className="btn ghost small" onClick={() => copy(address, 'addr')}>
                {copied === 'addr' ? '已复制' : '复制'}
              </button>
            </div>
            <div className="room-row">
              <span className="room-label">房间码</span>
              <span className="room-value code">{lobby.room.code}</span>
              <button type="button" className="btn ghost small" onClick={() => copy(lobby.room.code, 'code')}>
                {copied === 'code' ? '已复制' : '复制'}
              </button>
            </div>
            {otherAddresses.length > 0 && (
              <div className="room-row">
                <span className="room-label">其他网卡</span>
                <span className="room-value small">{otherAddresses.join(' / ')}</span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => copy(otherAddresses[0], 'alt')}
                >
                  {copied === 'alt' ? '已复制' : '复制'}
                </button>
              </div>
            )}
            <div className="room-hint">
              同一 WiFi 下，输入以上地址与房间码即可加入。武将随机分配，身份随机隐藏。
              首次创建房间若出现 Windows 防火墙提示，请允许“专用网络”访问。
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
                  <span>手机与电脑连接同一 WiFi，用相机扫码即可进入房间。</span>
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
                  <button
                    type="button"
                    className={`count-btn ${mode === 'standard' ? 'on' : ''}`}
                    onClick={() => setLanRules('standard', rules)}
                  >
                    标准身份场
                  </button>
                  <button
                    type="button"
                    className={`count-btn ${mode === 'custom' ? 'on' : ''}`}
                    onClick={() => setLanRules('custom', rules)}
                  >
                    自定义对局
                  </button>
                </div>
                <span className="setup-hint">
                  {mode === 'custom' ? '自定义规则对所有玩家生效' : '主公 +1 体力，身份随机隐藏'}
                </span>
              </div>
              {mode === 'custom' && (
                <>
                  <RulesEditor rules={rules} onChange={(next) => setLanRules('custom', next)} />
                  <span className="setup-hint">
                    2 人为主公/反贼；3–4 人为主公/忠臣/反贼；5 人以上使用标准身份配置。
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
                onClick={() => startLanGame(startCount)}
              >
                开始对局
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="lobby-rules-summary">
              模式：{mode === 'custom' ? '自定义对局' : '标准身份场'}
              {mode === 'custom' ? ` · ${ruleSummary}` : ' · 5–8 人'}
            </div>
            <div className="start-row waiting-row">
              <span className="waiting-dot" />
              <span>等待房主开始对局…</span>
            </div>
          </>
        )}

        {netError && <div className="net-error">{netError}</div>}
      </div>
    </div>
  );
}
