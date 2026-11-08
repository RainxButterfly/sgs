import { useEffect, useRef, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { isTauri } from '../../net/lan';
import { prepareBackgroundImage } from '../background';
import { applyDataDir, readDataDirInfo, writeDataSnapshot } from '../dataStorage';
import { useGameStore } from '../store';

export function SettingsModal() {
  const open = useGameStore((s) => s.settingsOpen);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const close = useGameStore((s) => s.closeSettings);
  const setBgImage = useGameStore((s) => s.setBgImage);
  const setBgDim = useGameStore((s) => s.setBgDim);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState('');
  const [defaultDir, setDefaultDir] = useState('');
  const [dirBusy, setDirBusy] = useState(false);
  const [dirMessage, setDirMessage] = useState<string | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isTauri()) return;
    let cancelled = false;
    readDataDirInfo()
      .then((info) => {
        if (!cancelled && info) {
          setDataDir(info.path);
          setDefaultDir(info.defaultPath);
        }
      })
      .catch((err) => {
        if (!cancelled) setDirError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const applyDir = async (path: string) => {
    setDirBusy(true);
    setDirError(null);
    setDirMessage(null);
    try {
      const info = await applyDataDir(path);
      setDataDir(info.path);
      setDefaultDir(info.defaultPath);
      setDirMessage('已切换，当前数据已写入新目录');
    } catch (err) {
      setDirError((err as Error).message);
    } finally {
      setDirBusy(false);
    }
  };

  const saveNow = async () => {
    setDirBusy(true);
    setDirError(null);
    setDirMessage(null);
    try {
      await writeDataSnapshot();
      setDirMessage('数据已保存');
    } catch (err) {
      setDirError((err as Error).message);
    } finally {
      setDirBusy(false);
    }
  };

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
    <div className="modal-backdrop" onClick={close}>
      <div className="modal settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">设置</div>
        <p className="modal-desc">界面和对局选项会保存在本机。</p>

        <div className="settings-section">
          <div className="settings-section-title">对局背景</div>
          <p className="settings-section-desc">选择一张喜欢的图片作为对局桌面背景，只保存在本机。</p>
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
          <div className="settings-actions">
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
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">数据保存位置</div>
          <p className="settings-section-desc">
            对局记录、对局背景和联机信息会保存到这里的 siguoshan-data.json。
          </p>
          {isTauri() ? (
            <>
              <div className="settings-dir-row">
                <input
                  value={dataDir}
                  onChange={(event) => setDataDir(event.target.value)}
                  placeholder="输入文件夹路径"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn ghost"
                  disabled={dirBusy || !dataDir.trim()}
                  onClick={() => void applyDir(dataDir.trim())}
                >
                  应用
                </button>
              </div>
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={dirBusy || !defaultDir}
                  onClick={() => void applyDir(defaultDir)}
                >
                  恢复默认
                </button>
                <button type="button" className="btn ghost" disabled={dirBusy} onClick={() => void saveNow()}>
                  立即保存
                </button>
              </div>
              <div className="bg-setting-hint">默认位置：{defaultDir || '读取中…'}</div>
              {dirMessage && <div className="settings-ok">{dirMessage}</div>}
              {dirError && <div className="net-error">{dirError}</div>}
            </>
          ) : (
            <div className="bg-setting-hint">网页版由浏览器保存；桌面版和安卓版可以修改目录。</div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
