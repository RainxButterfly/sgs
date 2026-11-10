import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

const PROFILE_INIT_KEY = 'sgk-profile-init-v1';

export function isProfileInitialized(): boolean {
  try {
    return localStorage.getItem(PROFILE_INIT_KEY) === '1';
  } catch {
    return true;
  }
}

export function ProfileSetupModal() {
  const profile = useGameStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.name);

  useEffect(() => {
    if (isProfileInitialized()) return;
    const timer = window.setTimeout(() => {
      setName(useGameStore.getState().profile.name);
      setOpen(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;

  const finish = () => {
    const value = name.trim();
    if (!value) return;
    useGameStore.getState().setProfileName(value);
    try {
      localStorage.setItem(PROFILE_INIT_KEY, '1');
    } catch {
      // ignore storage failures
    }
    setOpen(false);
    let tutorialSeen = false;
    try {
      tutorialSeen = localStorage.getItem('sgk-tutorial-seen') === '1';
    } catch {
      // ignore storage failures
    }
    if (!tutorialSeen) {
      window.setTimeout(() => useGameStore.getState().openTutorial(), 260);
    }
  };

  return (
    <div className="modal-backdrop profile-init-backdrop">
      <div className="modal profile-init-modal" role="dialog" aria-modal="true" aria-labelledby="profile-init-title">
        <div className="profile-init-kicker">首次启动 · PLAYER ID</div>
        <h2 id="profile-init-title">给自己取一个固定 ID</h2>
        <p>
          联机座次、观战席和战绩都会使用这个昵称。之后可以在主菜单点「修改 ID」随时更换。
        </p>
        <label className="profile-init-field">
          <span>固定 ID</span>
          <input
            value={name}
            maxLength={12}
            autoFocus
            placeholder="输入 1–12 个字符"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') finish();
            }}
          />
        </label>
        <div className="profile-init-hint">不需要账号，也不会上传到服务器；只保存在本机。</div>
        <button type="button" className="btn primary profile-init-submit" disabled={!name.trim()} onClick={finish}>
          开始使用
        </button>
      </div>
    </div>
  );
}
