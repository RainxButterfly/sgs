import { useEffect, useState } from 'react';
import { openDevtoolPage } from '../../dev/toolWindow';
import { useGameStore } from '../store';

export function DevNotice() {
  const status = useGameStore((s) => s.devStatus);
  const message = useGameStore((s) => s.devMessage);
  const batch = useGameStore((s) => s.devBatch);
  const [hidden, setHidden] = useState(false);

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
  if (status === 'active') {
    return (
      <div className="dev-badge">
        测试授权 · {batch}
        <button type="button" onClick={() => void openDevtoolPage()}>
          工具页（Ctrl+Shift+D）
        </button>
      </div>
    );
  }
  return null;
}