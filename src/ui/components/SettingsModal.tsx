import { useEffect, useRef, useState } from 'react';
import defaultBg from '../../assets/bg-default.jpg';
import { isAndroidApp, isTauri } from '../../net/lan';
import { prepareBackgroundMedia } from '../background';
import { applyDataDir, pickDataDir, readDataDirInfo, writeDataSnapshot } from '../dataStorage';
import { formatDiagnostics } from '../diagnostics';
import { levelTitle, profileProgress, xpForLevel } from '../profile';
import { NameChip } from './NameChip';
import { useGameStore } from '../store';
import { getCardVoicePack, setCardVoicePack, VOICE_PACKS } from '../voicePacks';

export function SettingsModal() {
  const open = useGameStore((s) => s.settingsOpen);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const selfCardSide = useGameStore((s) => s.selfCardSide);
  const uiTheme = useGameStore((s) => s.uiTheme);
  const setUiTheme = useGameStore((s) => s.setUiTheme);
  const uiPalette = useGameStore((s) => s.uiPalette);
  const setUiPalette = useGameStore((s) => s.setUiPalette);
  const close = useGameStore((s) => s.closeSettings);
  const openChangelog = useGameStore((s) => s.openChangelog);
  const openAbout = useGameStore((s) => s.openAbout);
  const openTutorial = useGameStore((s) => s.openTutorial);
  const appVersion = useGameStore((s) => s.appVersion);
  const profile = useGameStore((s) => s.profile);
  const aiSpeed = useGameStore((s) => s.aiSpeed);
  const setAiSpeed = useGameStore((s) => s.setAiSpeed);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const soundVolume = useGameStore((s) => s.soundVolume);
  const setSoundEnabled = useGameStore((s) => s.setSoundEnabled);
  const setSoundVolume = useGameStore((s) => s.setSoundVolume);
  const vibrationEnabled = useGameStore((s) => s.vibrationEnabled);
  const setVibrationEnabled = useGameStore((s) => s.setVibrationEnabled);
  const setBgImage = useGameStore((s) => s.setBgImage);
  const setBgVideo = useGameStore((s) => s.setBgVideo);
  const setBgDim = useGameStore((s) => s.setBgDim);
  const bgKind = useGameStore((s) => s.bgKind);
  const bgVideoUrl = useGameStore((s) => s.bgVideoUrl);
  const bgScope = useGameStore((s) => s.bgScope);
  const setBgScope = useGameStore((s) => s.setBgScope);
  const setSelfCardSide = useGameStore((s) => s.setSelfCardSide);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [dataDir, setDataDir] = useState('');
  const [defaultDir, setDefaultDir] = useState('');
  const [dirBusy, setDirBusy] = useState(false);
  const [dirMessage, setDirMessage] = useState<string | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [logMessage, setLogMessage] = useState<string | null>(null);

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

  const copyLog = async () => {
    setLogMessage(null);
    const text = formatDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      setLogMessage('运行日志已复制');
      return;
    } catch {
      // 部分 WebView 不开放剪贴板接口，退回 execCommand
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      area.style.pointerEvents = 'none';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      setLogMessage(ok ? '运行日志已复制' : '复制失败，请重试');
    } catch {
      setLogMessage('复制失败，请重试');
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
      const media = await prepareBackgroundMedia(file);
      if (media.kind === 'video') setBgVideo();
      else setBgImage(media.src);
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
        <div className="settings-hero">
          <div className="settings-hero-main">
            <div className="settings-hero-head">
              <NameChip name={profile.name} level={profile.level} size="lg" />
              <span className="settings-hero-title">{levelTitle(profile.level)}</span>
              <span className="settings-hero-xp">
                {profile.level >= 99 ? '已满级' : `经验 ${profile.xp} / ${xpForLevel(profile.level)}`}
              </span>
            </div>
            <div className="settings-hero-bar">
              <i style={{ width: `${profileProgress(profile)}%` }} />
            </div>
            <div className="settings-hero-meta">
              <span>对局 {profile.totalGames}</span>
              <span>胜场 {profile.wins}</span>
              <span>v{appVersion}</span>
            </div>
          </div>
          <button type="button" className="settings-hero-close" onClick={close} aria-label="关闭设置">
            ×
          </button>
        </div>
        <div className="modal-title">设置</div>
        <p className="modal-desc">界面和对局选项会保存在本机。</p>

        <div className="settings-section settings-theme-section">
          <div className="settings-section-title">界面主题</div>
          <p className="settings-section-desc">经典原版保留金色国风；星虹魔法使用紫黑玻璃、星点背景和固定的粉紫高光。</p>
          <div className="settings-actions settings-theme-actions">
            <button
              type="button"
              className={`btn ghost ${uiTheme === 'classic' ? 'on' : ''}`}
              onClick={() => setUiTheme('classic')}
            >
              经典原版
            </button>
            <button
              type="button"
              className={`btn ghost ${uiTheme === 'magic' ? 'on' : ''}`}
              onClick={() => setUiTheme('magic')}
            >
              星虹魔法
            </button>
          </div>
          <div className={`settings-palette-row ${uiTheme === 'magic' ? '' : 'is-disabled'}`}>
            <span className="settings-palette-label">魔法配色</span>
            {(
              [
                ['rainbow', '彩虹'],
                ['rock', '摇滚粉'],
                ['magic', '魔法紫'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`theme-swatch swatch-${key} ${uiPalette === key ? 'on' : ''}`}
                onClick={() => {
                  if (uiTheme !== 'magic') setUiTheme('magic');
                  setUiPalette(key);
                }}
                title={`魔法配色：${label}`}
                aria-label={`魔法配色：${label}`}
              />
            ))}
            <span className="settings-palette-hint">选择星虹魔法后可切换整体配色</span>
          </div>
        </div>

        <div className="settings-grid">

        <div className="settings-section">
          <div className="settings-section-title">壁纸</div>
          <p className="settings-section-desc">选择图片或动态视频作为壁纸，GIF 和视频会直接播放，只保存在本机。</p>
          <div
            className="bg-preview"
            style={bgKind === 'image' ? { backgroundImage: `url(${bgImage ?? defaultBg})` } : undefined}
          >
            {bgKind === 'video' && bgVideoUrl && (
              <video className="bg-preview-video" src={bgVideoUrl} autoPlay loop muted playsInline />
            )}
            <div className="bg-preview-shade" style={{ opacity: bgDim / 100 }} />
            <span className="bg-preview-label">预览{bgKind === 'video' ? ' · 动态' : ''}</span>
          </div>
          <div className="bg-setting-row">
            <span>应用范围</span>
            <div className="bg-scope-options">
              {([
                ['game', '仅对局'],
                ['menu', '非对局界面'],
                ['all', '全部界面'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`toggle-btn ${bgScope === value ? 'on' : ''}`}
                  onClick={() => setBgScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-setting-hint">
            「非对局界面」包含主菜单、大厅、图鉴、设置等；选「仅对局」时其它界面保持默认背景。
            动态壁纸（视频）只在主菜单与对局里播放。
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
          <div className="bg-setting-hint">遮罩越深，桌面文字和卡牌越清晰。动态壁纸支持 MP4/WebM（不超过 40MB）。</div>
          {error && <div className="net-error">{error}</div>}
          <div className="settings-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/webm"
              hidden
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? '处理中…' : '选择图片 / 视频'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setBgImage(null);
                setError(null);
              }}
              disabled={!bgImage && bgKind !== 'video'}
            >
              恢复默认
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">个人信息卡位置</div>
          <p className="settings-section-desc">决定对局中自己的武将信息卡放在牌桌左侧还是右侧。</p>
          <div className="settings-actions">
            <button
              type="button"
              className={`btn ghost ${selfCardSide === 'left' ? 'on' : ''}`}
              onClick={() => setSelfCardSide('left')}
            >
              放在左侧
            </button>
            <button
              type="button"
              className={`btn ghost ${selfCardSide === 'right' ? 'on' : ''}`}
              onClick={() => setSelfCardSide('right')}
            >
              放在右侧
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">语音包</div>
          <p className="settings-section-desc">
            出牌、技能、阵亡的语音包；卡牌语音包在此设置，武将语音包在武将图鉴详情里切换。
          </p>
          <div className="bg-setting-row">
            <span>卡牌语音包</span>
            <div className="bg-scope-options">
              {VOICE_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className={`toggle-btn ${getCardVoicePack() === pack.id ? 'on' : ''}`}
                  onClick={() => setCardVoicePack(pack.id)}
                >
                  {pack.name}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-setting-hint">当前仅有默认语音包，后续版本会提供更多语音包供切换。</div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">数据保存位置</div>
          <p className="settings-section-desc">
            对局记录、对局背景、等级经验和联机信息会备份到当前目录的数据快照中。
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
          <div className="settings-section-title">音效</div>
          <p className="settings-section-desc">
            点击按钮、选牌、出牌、响应、受伤和回复时会播放轻量音效；关闭后完全静音。
          </p>
          <div className="bg-setting-row">
            <span>音效开关</span>
            <button
              type="button"
              className={`count-btn ${soundEnabled ? 'on' : ''}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? '开启' : '关闭'}
            </button>
          </div>
          <div className="bg-setting-row">
            <span>音量</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(soundVolume * 100)}
              disabled={!soundEnabled}
              onChange={(event) => setSoundVolume(Number(event.target.value) / 100)}
            />
            <b>{Math.round(soundVolume * 100)}%</b>
          </div>
          <div className="bg-setting-row">
            <span>震动</span>
            <button
              type="button"
              className={`count-btn ${vibrationEnabled ? 'on' : ''}`}
              onClick={() => setVibrationEnabled(!vibrationEnabled)}
            >
              {vibrationEnabled ? '开启' : '关闭'}
            </button>
          </div>
          <div className="bg-setting-hint">手机端在受伤、濒死时会有震动反馈；桌面端无震动效果。</div>
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
          <div className="settings-actions settings-actions-grid">
            <button type="button" className="btn ghost" onClick={openChangelog}>
              查看更新日志
            </button>
            <button type="button" className="btn ghost" onClick={openAbout}>
              关于
            </button>
            <button type="button" className="btn ghost" onClick={openTutorial}>
              玩法说明
            </button>
            <button type="button" className="btn ghost" onClick={() => void copyLog()}>
              复制运行日志
            </button>
          </div>
          {logMessage && <div className="settings-ok">{logMessage}</div>}
          <div className="bg-setting-hint">遇到闪退或卡住时，可在重新打开后复制运行日志发给作者。</div>
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
