import { useEffect, useRef, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { isAndroidApp, isTauri } from '../../net/lan';
import { prepareBackgroundImage } from '../background';
import { applyDataDir, pickDataDir, readDataDirInfo, writeDataSnapshot } from '../dataStorage';
import { useGameStore } from '../store';

export function SettingsModal() {
  const open = useGameStore((s) => s.settingsOpen);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const close = useGameStore((s) => s.closeSettings);
  const openChangelog = useGameStore((s) => s.openChangelog);
  const openAbout = useGameStore((s) => s.openAbout);
  const openTutorial = useGameStore((s) => s.openTutorial);
  const appVersion = useGameStore((s) => s.appVersion);
  const aiSpeed = useGameStore((s) => s.aiSpeed);
  const setAiSpeed = useGameStore((s) => s.setAiSpeed);
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

  const browseDir = async () => {
    setDirBusy(true);
    setDirError(null);
    setDirMessage(null);
    try {
      const path = await pickDataDir();
      if (!path) return;
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
      setDirMessage('已备份到当前目录');
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
              <div className="settings-dir">
                <span className="settings-dir-label">当前目录</span>
                <code className="settings-dir-path" title={dataDir}>
                  {dataDir || '读取中…'}
                </code>
              </div>
              <div className="settings-actions">
                {!isAndroidApp() && (
                  <button type="button" className="btn ghost" disabled={dirBusy} onClick={() => void browseDir()}>
                    {dirBusy ? '处理中…' : '浏览文件夹…'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={dirBusy || !defaultDir}
                  onClick={() => void applyDir(defaultDir)}
                >
                  使用默认目录
                </button>
                <button type="button" className="btn ghost" disabled={dirBusy} onClick={() => void saveNow()}>
                  备份当前数据
                </button>
              </div>
              <div className="bg-setting-hint">
                浏览并确认新目录后，当前数据会复制过去；「备份当前数据」只写入当前目录，不改变位置。
                {isAndroidApp() ? ' 手机端受系统限制，固定使用应用数据目录。' : ` 默认目录：${defaultDir || '读取中…'}`}
              </div>
              {dirMessage && <div className="settings-ok">{dirMessage}</div>}
              {dirError && <div className="net-error">{dirError}</div>}
            </>
          ) : (
            <div className="bg-setting-hint">网页版由浏览器保存；桌面版和安卓版可以修改目录。</div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">AI 出牌速度</div>
          <p className="settings-section-desc">
            对局中也可以打开设置调整。数值越小，电脑响应越快；调到 0 时电脑立即行动。
          </p>
          <div className="bg-setting-row">
            <span>等待间隔</span>
            <input
              type="range"
              min={0}
              max={1200}
              step={30}
              value={aiSpeed}
              onChange={(e) => setAiSpeed(Number(e.target.value))}
            />
            <b>{aiSpeed === 0 ? '即时' : `${aiSpeed}ms`}</b>
          </div>
          <div className="settings-actions">
            <button type="button" className="btn ghost small" onClick={() => setAiSpeed(180)}>
              快
            </button>
            <button type="button" className="btn ghost small" onClick={() => setAiSpeed(420)}>
              标准
            </button>
            <button type="button" className="btn ghost small" onClick={() => setAiSpeed(800)}>
              慢
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">版本与更新</div>
          <p className="settings-section-desc">
            当前版本 v{appVersion}。查看每个版本新增的功能、修复的问题和体验优化。
          </p>
          <div className="settings-actions">
            <button type="button" className="btn ghost" onClick={openChangelog}>
              查看更新日志
            </button>
            <button type="button" className="btn ghost" onClick={openAbout}>
              关于
            </button>
            <button type="button" className="btn ghost" onClick={openTutorial}>
              玩法说明
            </button>
          </div>
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
