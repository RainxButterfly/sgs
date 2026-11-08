import { useRef, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { prepareBackgroundImage } from '../background';
import { useGameStore } from '../store';

export function BackgroundSettings() {
  const open = useGameStore((s) => s.bgPanelOpen);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const close = useGameStore((s) => s.closeBgPanel);
  const setBgImage = useGameStore((s) => s.setBgImage);
  const setBgDim = useGameStore((s) => s.setBgDim);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setBgImage(await prepareBackgroundImage(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal bg-settings">
        <div className="modal-title">对局背景</div>
        <p className="modal-desc">选择一张喜欢的图片作为对局桌面背景，只保存在本机。</p>
        <div
          className="bg-preview"
          style={{ backgroundImage: `url(${bgImage ?? defaultBg})` }}
        >
          <div className="bg-preview-shade" style={{ opacity: bgDim / 100 }} />
          <span className="bg-preview-label">预览</span>
        </div>
        <div className="bg-setting-row">
          <span>背景遮罩</span>
          <input
            type="range"
            min={0}
            max={90}
            value={bgDim}
            onChange={(e) => setBgDim(Number(e.target.value))}
          />
          <b>{bgDim}%</b>
        </div>
        <div className="bg-setting-hint">遮罩越深，桌面文字和卡牌越清晰。</div>
        {error && <div className="net-error">{error}</div>}
        <div className="modal-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? '处理中…' : '选择图片'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setBgImage(null);
              setError(null);
            }}
            disabled={!bgImage}
          >
            恢复默认
          </button>
          <button type="button" className="btn primary" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
