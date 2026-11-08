import { useGameStore } from '../store';

function formatBytes(value: number): string {
  if (!value) return '0 MB';
  const mb = value / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function UpdateModal() {
  const open = useGameStore((s) => s.updateModalOpen);
  const state = useGameStore((s) => s.updateState);
  const info = useGameStore((s) => s.updateInfo);
  const progress = useGameStore((s) => s.updateProgress);
  const error = useGameStore((s) => s.updateError);
  const appVersion = useGameStore((s) => s.appVersion);
  const close = useGameStore((s) => s.closeUpdateModal);
  const install = useGameStore((s) => s.installUpdate);
  const check = useGameStore((s) => s.checkUpdate);

  if (!open) return null;
  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : 0;
  const busy = state === 'downloading' || state === 'installing';

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : close}>
      <div className="modal update-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">游戏更新</div>

        {state === 'checking' && (
          <>
            <div className="update-status">正在通过镜像检查更新…</div>
            <div className="update-bar indeterminate">
              <span />
            </div>
          </>
        )}

        {state === 'idle' && <div className="update-status">点击下方按钮检查新版本。</div>}

        {state === 'latest' && <div className="update-status">当前版本 v{appVersion} 已是最新。</div>}

        {state === 'available' && info && (
          <>
            <div className="update-version">
              发现新版本 <b>v{info.version}</b>
              <span>当前 v{info.currentVersion}</span>
            </div>
            {info.notes && <pre className="update-notes">{info.notes}</pre>}
            <div className="update-hint">
              下载完成后会自动替换程序并重启，不需要卸载旧版本。
            </div>
          </>
        )}

        {busy && (
          <>
            <div className="update-status">
              {state === 'downloading' ? '正在下载更新…' : '正在安装，应用即将重启…'}
            </div>
            <div className="update-bar">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="update-percent">
              {percent}%
              {progress.total > 0 && (
                <span>
                  {' '}
                  （{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}）
                </span>
              )}
            </div>
            {state === 'downloading' && <div className="update-hint">请保持应用开启。</div>}
          </>
        )}

        {state === 'error' && (
          <>
            <div className="update-error">{error ?? '更新失败，请稍后重试。'}</div>
            <div className="update-hint">
              如果当前网络无法访问镜像，可以稍后再试，或者让朋友把新的便携包发给你。
            </div>
          </>
        )}

        <div className="modal-actions">
          {busy ? null : state === 'available' ? (
            <>
              <button type="button" className="btn ghost" onClick={close}>
                稍后
              </button>
              <button type="button" className="btn primary" onClick={() => void install()}>
                下载并安装
              </button>
            </>
          ) : state === 'error' ? (
            <>
              <button type="button" className="btn ghost" onClick={close}>
                关闭
              </button>
              <button type="button" className="btn primary" onClick={() => void check(true)}>
                重试
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={close}>
                关闭
              </button>
              {state !== 'checking' && (
                <button type="button" className="btn primary" onClick={() => void check(true)}>
                  检查更新
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
