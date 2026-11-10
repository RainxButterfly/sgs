import { useState } from 'react';
import { isTauri } from '../../net/lan';
import { useGameStore } from '../store';

export function LanScreen() {
  const createLanRoom = useGameStore((s) => s.createLanRoom);
  const joinLanRoom = useGameStore((s) => s.joinLanRoom);
  const netError = useGameStore((s) => s.netError);
  const preset = useGameStore((s) => s.joinPreset);
  const profileName = useGameStore((s) => s.profile.name);
  const desktop = isTauri();
  const canCreate = desktop || import.meta.env.DEV;
  const [createName, setCreateName] = useState(() => {
    try {
      return profileName || localStorage.getItem('sgk-name') || '房主';
    } catch {
      return profileName || '房主';
    }
  });
  const [joinName, setJoinName] = useState(() => {
    try {
      return profileName || localStorage.getItem('sgk-name') || '玩家';
    } catch {
      return profileName || '玩家';
    }
  });
  const [address, setAddress] = useState(preset?.address ?? (desktop ? '' : '127.0.0.1:8787'));
  const [code, setCode] = useState(preset?.code ?? (desktop ? '' : 'DEV'));
  const [spectate, setSpectate] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    await createLanRoom(createName);
    setBusy(false);
  };

  const join = async () => {
    const name = joinName.trim() || '玩家';
    try {
      localStorage.setItem('sgk-name', name);
    } catch {
      // ignore storage failures
    }
    setBusy(true);
    await joinLanRoom(address, code, name, spectate);
    setBusy(false);
  };

  return (
    <div className="lan-screen">
      <div className="ink-bg" />
      <div className="setup-panel lan-panel">
        <div className="setup-head">
          <div>
            <div className="setup-kicker">局域网联机</div>
            <h2 className="setup-title">風 雲 會</h2>
            <p className="setup-desc">
              房主创建房间后，把地址和房间码告诉朋友。同一局域网内直连，不需要登录，也不需要远程服务器。
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={() => useGameStore.setState({ screen: 'menu' })}>
            返回
          </button>
        </div>

        <div className="lan-grid">
          {canCreate ? (
            <section className="lan-card">
              <div className="lan-card-title">创建房间</div>
              <div className="lan-card-desc">你是房主，负责结算对局。房间码会自动生成，空位由电脑补足。</div>
              <label className="field">
                <span>你的名字</span>
                <input value={createName} maxLength={12} onChange={(e) => setCreateName(e.target.value)} />
              </label>
              <button type="button" className="btn primary" disabled={busy} onClick={create}>
                创建房间
              </button>
            </section>
          ) : (
            <section className="lan-card lan-card-disabled">
              <div className="lan-card-title">创建房间</div>
              <div className="lan-card-desc">创建房间需要桌面版。网页和手机端只能加入房主已经开好的房间。</div>
              <button type="button" className="btn ghost" disabled>
                桌面版可创建
              </button>
            </section>
          )}

          <section className="lan-card">
            <div className="lan-card-title">{preset ? '扫码加入' : '加入房间'}</div>
            <div className="lan-card-desc">
              {preset ? '已从二维码读取房间信息，输入名字即可加入。' : '输入房主显示的地址与房间码。'}
            </div>
            {preset && (
              <div className="join-preset">
                {address} · 房间码 {code}
              </div>
            )}
            <div className="lan-join-grid">
              <label className="field lan-field-wide">
                <span>房主地址</span>
                <input
                  value={address}
                  placeholder="192.168.1.5:49721"
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <label className="field">
                <span>房间码</span>
                <input
                  value={code}
                  placeholder="ABC123"
                  maxLength={12}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
              <label className="field">
                <span>你的名字</span>
                <input
                  value={joinName}
                  maxLength={12}
                  autoFocus={Boolean(preset)}
                  onChange={(e) => setJoinName(e.target.value)}
                />
              </label>
            </div>
            <label className="lan-spectate-toggle">
              <input
                type="checkbox"
                checked={spectate}
                onChange={(e) => setSpectate(e.target.checked)}
              />
              <span>
                <b>以观战身份加入</b>
                <em>不占玩家座位，对局开始后也能进入，观战席会显示你的名字与 IP。</em>
              </span>
            </label>
            <button type="button" className="btn primary" disabled={busy || !address.trim() || !code.trim()} onClick={join}>
              {spectate ? '加入观战' : '加入房间'}
            </button>
          </section>
        </div>

        {!canCreate && (
          <div className="lan-dev-hint">手机 / 浏览器端通过房主电脑创建的房间加入，不能自行建房。</div>
        )}
        <div className="lan-dev-hint">
          异地联机：先用 ZeroTier、Radmin VPN 等工具组成虚拟局域网，再填写房主的虚拟地址；也可以在路由器把房主端口转发后填写公网地址。
          手机浏览器打开房间地址后，可以「添加到主屏幕」，像 App 一样直接进入。
        </div>
        {!desktop && import.meta.env.DEV && (
          <div className="lan-dev-hint">
            开发模式：请另开终端运行 <code>npm run dev:relay</code>，然后使用 127.0.0.1:8787 / DEV 测试联机。
          </div>
        )}
        {netError && <div className="net-error">{netError}</div>}
      </div>
    </div>
  );
}
