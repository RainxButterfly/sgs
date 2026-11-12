import { useEffect, useState } from 'react';
import { HEROES, PLAYABLE_HEROES } from '../../core/deck';
import { effectiveBackground } from '../background';
import { FACTION_NAME } from '../../core/types';
import { isTauri } from '../../net/lan';
import { NameChip } from '../components/NameChip';
import { levelTitle, profileProgress, xpForLevel } from '../profile';
import { useGameStore } from '../store';

export function MainMenu() {
  const prepareLocal = useGameStore((s) => s.prepareLocal);
  const suspended = useGameStore((s) => s.suspended);
  const resumeGame = useGameStore((s) => s.resumeGame);
  const quitSuspendedGame = useGameStore((s) => s.quitSuspendedGame);
  const savedLanSession = useGameStore((s) => s.savedLanSession);
  const resumeSavedLanSession = useGameStore((s) => s.resumeSavedLanSession);
  const dismissSavedLanSession = useGameStore((s) => s.dismissSavedLanSession);
  const appVersion = useGameStore((s) => s.appVersion);
  const updateInfo = useGameStore((s) => s.updateInfo);
  const updateState = useGameStore((s) => s.updateState);
  const openUpdateModal = useGameStore((s) => s.openUpdateModal);
  const netError = useGameStore((s) => s.netError);
  const profile = useGameStore((s) => s.profile);
  const uiPalette = useGameStore((s) => s.uiPalette);
  const bgImage = useGameStore((s) => s.bgImage);
  const bgScope = useGameStore((s) => s.bgScope);
  const bgDim = useGameStore((s) => s.bgDim);
  const bgKind = useGameStore((s) => s.bgKind);
  const bgVideoUrl = useGameStore((s) => s.bgVideoUrl);
  const menuBg = effectiveBackground(bgImage, bgScope, 'menu');
  const menuVideo = bgKind === 'video' && bgVideoUrl && (bgScope === 'all' || bgScope === 'menu');
  const setUiPalette = useGameStore((s) => s.setUiPalette);
  const setUiTheme = useGameStore((s) => s.setUiTheme);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);
  useEffect(() => setNameDraft(profile.name), [profile.name]);
  const saveName = () => {
    useGameStore.getState().setProfileName(nameDraft);
    setEditingName(false);
  };
  const nextTier = [10, 20, 30, 40, 50, 60].find((level) => profile.level < level);
  const fanHeroes = ['diaochan', 'zhugeliang', 'simayi', 'sunce', 'huangyueying', 'yuji']
    .map((id) => PLAYABLE_HEROES.find((hero) => hero.id === id))
    .filter((hero): hero is NonNullable<typeof hero> => !!hero);
  const setScreen = (screen: 'setup') => useGameStore.setState({ screen });
  const canExit = isTauri();
  const quitApp = async () => {
    if (!window.confirm('确定退出四国闪吗？')) return;
    try {
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
    } catch {
      window.close();
    }
  };

  return (
    <div className="menu-screen">
      <div className="ink-bg" />
      {menuVideo && bgVideoUrl && (
        <>
          <video className="menu-custom-bg" src={bgVideoUrl} autoPlay loop muted playsInline />
          <div className="menu-custom-bg-shade" style={{ opacity: bgDim / 100 }} />
        </>
      )}
      {!menuVideo && menuBg && (
        <>
          <div className="menu-custom-bg" style={{ backgroundImage: `url(${menuBg})` }} />
          <div className="menu-custom-bg-shade" style={{ opacity: bgDim / 100 }} />
        </>
      )}
      <div className="menu-ambient" aria-hidden="true">
        <span className="ambient-stardust" />
        <span className="ambient-sigil">
          <i />
          <i />
          <i />
        </span>
        <span className="ambient-comet comet-a" />
        <span className="ambient-comet comet-b" />
        <span className="ambient-orb orb-a" />
        <span className="ambient-orb orb-b" />
        <span className="ambient-runes">
          <b>星</b>
          <b>虹</b>
          <b>魔</b>
          <b>法</b>
        </span>
        <i className="ambient-note note-a">♪</i>
        <i className="ambient-note note-b">✦</i>
        <i className="ambient-note note-c">✧</i>
      </div>
      {netError && (
        <div className="menu-net-error" role="alert">
          <span>{netError}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => useGameStore.setState({ netError: null })}
          >
            ×
          </button>
        </div>
      )}
      <div className="menu-content">
        <section className="menu-left">
          <div className="menu-eyebrow">RAINBOW · MAGIC · FRIENDS</div>
          <h1 className="menu-title" data-text="四国闪">
            四国闪
            <small>星 虹 魔 法 篇</small>
          </h1>
          <p className="menu-blurb">
            把身份场牌桌，做成一间会发光的 Live House。
            <br />
            <b>摇滚、魔法、彩虹色</b>，和朋友在同一张桌子上打牌。
          </p>
          <div className="menu-tags">
            <span className="on">♪ {PLAYABLE_HEROES.length} 名武将</span>
            <span>✦ 标准包 · 多模式</span>
            <span>⌁ 局域网联机</span>
            <span>☾ 手机 / 电脑</span>
          </div>
          {suspended && (
            <div className="suspended-banner">
              <div className="suspended-text">
                <b>房间对局仍在进行</b>
                <span>离开期间对局没有结束，可以随时回归。</span>
              </div>
              <div className="suspended-actions">
                <button type="button" className="btn primary" onClick={resumeGame}>
                  回归对局
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (window.confirm('退出房间后本局将无法再回归，确定吗？')) quitSuspendedGame();
                  }}
                >
                  退出房间
                </button>
              </div>
            </div>
          )}
          {!suspended && savedLanSession && (
            <div className="suspended-banner">
              <div className="suspended-text">
                <b>上次的房间还开着</b>
                <span>
                  {savedLanSession.address} · 房间码 {savedLanSession.code}
                </span>
              </div>
              <div className="suspended-actions">
                <button type="button" className="btn primary" onClick={() => void resumeSavedLanSession()}>
                  回归房间
                </button>
                <button type="button" className="btn ghost" onClick={dismissSavedLanSession}>
                  忽略
                </button>
              </div>
            </div>
          )}
          <div className="menu-profile">
            <div className="menu-profile-glow" />
            <div className="menu-profile-main">
              <div className="menu-profile-head">
                {editingName ? (
                  <input
                    className="menu-name-input"
                    value={nameDraft}
                    maxLength={12}
                    autoFocus
                    aria-label="修改固定昵称"
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={saveName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveName();
                      if (event.key === 'Escape') {
                        setNameDraft(profile.name);
                        setEditingName(false);
                      }
                    }}
                  />
                ) : (
                  <NameChip name={profile.name} level={profile.level} size="lg" />
                )}
                {!editingName && (
                  <>
                    <span className="menu-profile-tier">
                      {nextTier ? `Lv.${nextTier} 解锁新昵称颜色` : '星虹昵称已解锁'}
                    </span>
                    <button
                      type="button"
                      className="menu-profile-edit"
                      onClick={() => setEditingName(true)}
                    >
                      修改 ID
                    </button>
                  </>
                )}
              </div>
              <div className="menu-profile-level">
                {levelTitle(profile.level)}
                {profile.level >= 99
                  ? ' · 已满级'
                  : ` · 经验 ${profile.xp} / ${xpForLevel(profile.level)}`}
              </div>
              <div className="menu-profile-bar">
                <i style={{ width: `${profileProgress(profile)}%` }} />
                <span className="menu-profile-bar-text">
                  {profile.level >= 99 ? '已满级' : `${profile.xp} / ${xpForLevel(profile.level)}`}
                </span>
              </div>
              <div className="menu-profile-meta">
                <span>对局 {profile.totalGames}</span>
                <span>胜场 {profile.wins}</span>
                <span>
                  胜率{' '}
                  {profile.totalGames > 0 ? Math.round((profile.wins / profile.totalGames) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="menu-actions">
            <button
              type="button"
              className="menu-action primary"
              onClick={() => useGameStore.setState({ screen: 'lan' })}
            >
              <span className="menu-action-icon" aria-hidden="true">📡</span>
              <span className="menu-action-copy">
                <b>局域网联机</b>
                <small>LAN · 与友同乐 · 主打玩法</small>
              </span>
            </button>
            <button type="button" className="menu-action" onClick={() => setScreen('setup')}>
              <span className="menu-action-icon" aria-hidden="true">⚔</span>
              <span className="menu-action-copy">
                <b>单机对战</b>
                <small>SOLO · 选将 · 立即开局</small>
              </span>
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={() => {
                prepareLocal(8, { mode: 'identity' });
              }}
            >
              <span className="menu-action-icon" aria-hidden="true">⚡</span>
              <span className="menu-action-copy">
                <b>快速开局</b>
                <small>RANDOM · 八人身份场</small>
              </span>
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={() => useGameStore.setState({ screen: 'guandan' })}
            >
              <span className="menu-action-icon" aria-hidden="true">🃏</span>
              <span className="menu-action-copy">
                <b>掼蛋 2v2</b>
                <small>GUANDAN · 两副牌 · 对家为队友</small>
              </span>
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={() => useGameStore.setState({ screen: 'gallery' })}
            >
              <span className="menu-action-icon" aria-hidden="true">📖</span>
              <span className="menu-action-copy">
                <b>图鉴</b>
                <small>HEROES · CARDS</small>
              </span>
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={() => useGameStore.getState().openHistory()}
            >
              <span className="menu-action-icon" aria-hidden="true">🕘</span>
              <span className="menu-action-copy">
                <b>对局记录</b>
                <small>HISTORY · 战报</small>
              </span>
            </button>
          </div>
          <div className="menu-meta">
            <span>
              <b>{PLAYABLE_HEROES.length}</b> 名武将
            </span>
            <span>
              <b>160</b> 张牌
            </span>
            <span>身份 · 1v1 · 斗地主 · 国战 · 掼蛋</span>
          </div>
          <div className="menu-author">
            作者 星河一叶Roxy · 维护邮箱 ck_xuv@vip.qq.com
          </div>
          <div className="menu-utility">
            <button
              type="button"
              className="btn ghost small menu-settings-btn"
              onClick={() => useGameStore.getState().openSettings()}
            >
              设置
            </button>
            <button
              type="button"
              className={`menu-update ${updateInfo ? 'has-update' : ''}`}
              onClick={openUpdateModal}
            >
              {updateState === 'checking'
                ? '正在检查更新…'
                : updateInfo
                  ? `发现新版本 v${updateInfo.version} · 查看`
                  : `检查更新 · v${appVersion}`}
            </button>
            <div className="menu-palette" role="group" aria-label="魔法配色">
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
                  className={`menu-swatch swatch-${key} ${uiPalette === key ? 'on' : ''}`}
                  title={`魔法配色：${label}`}
                  aria-label={`魔法配色：${label}`}
                  onClick={() => {
                    setUiTheme('magic');
                    setUiPalette(key);
                  }}
                />
              ))}
            </div>
          </div>
        </section>
        <aside className="menu-side menu-side-fan">
          <div className="menu-fan-head">
            <div>
              <small>HERO ROSTER · 星虹名册</small>
              <div className="menu-side-title">武 将 名 录</div>
            </div>
            <span className="menu-equalizer" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </div>
          <div className="menu-fan">
            {fanHeroes.map((hero, index) => (
              <button
                key={hero.id}
                type="button"
                className={`menu-fan-card c${index + 1} faction-${hero.faction}`}
                onClick={() => useGameStore.setState({ screen: 'gallery' })}
                title={`${FACTION_NAME[hero.faction]} · ${hero.name} · ${hero.title}`}
              >
                <span className="fan-faction">{FACTION_NAME[hero.faction]}</span>
                <span className="fan-art">{hero.name.slice(0, 1)}</span>
                <span className="fan-name">{hero.name}</span>
                <i className="fan-stars">✦ ✦ ✦</i>
              </button>
            ))}
          </div>
          <div className="menu-fan-foot">
            <span>本次卡池 {PLAYABLE_HEROES.length} 名武将</span>
            <span>悬停卡牌查看动效 ✦</span>
          </div>
        </aside>
      </div>
      {canExit && (
        <button
          type="button"
          className="menu-exit-fab"
          title="退出游戏"
          aria-label="退出游戏"
          onClick={() => void quitApp()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5v8" />
            <path d="M7.1 6.1a8 8 0 1 0 9.8 0" />
          </svg>
        </button>
      )}
    </div>
  );
}
