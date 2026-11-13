import { useEffect, useState } from 'react';
import { openDevtoolPage } from '../../dev/toolWindow';
import { useGameStore } from '../store';

export function DevNotice() {
  const status = useGameStore((s) => s.devStatus);
  const message = useGameStore((s) => s.devMessage);
  const batch = useGameStore((s) => s.devBatch);
  const [hidden, setHidden] = useState(false);
  const [badgeHidden, setBadgeHidden] = useState(() => sessionStorage.getItem('xhs-dev-badge-hidden') === batch);

  useEffect(() => setHidden(false), [message]);

  if (status === 'blocked' && message && !hidden) {
    return (
      <div className="dev-warning" role="alert">
        <span>{message}</span>
        <button type="button" onClick={() => void openDevtoolPage()}>
          工具页
        </button>
        <button type="button" onClick={() => setHidden(true)}>
          知道了
        </button>
      </div>
    );
  }
  if (status === 'active' && !badgeHidden) {
    return (
      <div className="dev-badge">
        测试授权 · {batch}
        <button type="button" onClick={() => void openDevtoolPage()}>
          工具页（Ctrl+Shift+D）
        </button>
        <button
          type="button"
          className="dev-badge-close"
          title="隐藏本次启动的提示（工具仍可用，Ctrl+Shift+D 打开）"
          aria-label="隐藏测试授权提示"
          onClick={() => {
            sessionStorage.setItem('xhs-dev-badge-hidden', batch);
            setBadgeHidden(true);
          }}
        >
          ×
        </button>
      </div>
    );
  }
  return null;
}