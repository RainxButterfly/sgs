import { useEffect } from 'react';
import { useGameStore } from '../store';

/** 联机中别人使用测试工具时的全场通报弹窗（同时会写进战报） */
export function DevActionNotice() {
  const notice = useGameStore((s) => s.devNotice);
  const close = useGameStore((s) => s.closeDevNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(close, 9000);
    return () => window.clearTimeout(timer);
  }, [notice, close]);

  if (!notice) return null;

  return (
    <div className="dev-notice-backdrop" role="alertdialog" aria-live="assertive" onClick={close}>
      <div className="dev-notice" onClick={(event) => event.stopPropagation()}>
        <div className="dev-notice-head">
          <span className="dev-notice-badge">测试工具</span>
          <b>{notice.name}</b>
          <button type="button" className="dev-notice-close" onClick={close} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="dev-notice-text">{notice.text}</p>
        <div className="dev-notice-foot">该操作已写入战报，所有玩家可见。</div>
      </div>
    </div>
  );
}
