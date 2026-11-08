import { HEROES } from '../../core/deck';
import { FACTION_NAME } from '../../core/types';
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
  const setScreen = (screen: 'setup') => useGameStore.setState({ screen });

  return (
    <div className="menu-screen">
      <div className="ink-bg" />
      <div className="menu-content">
        <div className="menu-title-block">
          <div className="menu-seal">星河</div>
          <h1 className="menu-title">四國閃</h1>
          <p className="menu-subtitle">标准包 · 多种模式 · 与友同乐</p>
          <div className="menu-divider">
            <span />
            <i>◆</i>
            <span />
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
          <div className="menu-actions">
            <button type="button" className="btn primary big" onClick={() => setScreen('setup')}>
              单机对战
            </button>
            <button
              type="button"
              className="btn ghost big"
              onClick={() => useGameStore.setState({ screen: 'lan' })}
            >
              局域网联机
            </button>
            <button
              type="button"
              className="btn ghost big"
              onClick={() => {
                prepareLocal(8, { mode: 'identity' });
              }}
            >
              快速开局
            </button>
            <button
              type="button"
              className="btn ghost big"
              onClick={() => useGameStore.setState({ screen: 'gallery' })}
            >
              武将图鉴
            </button>
            <button
              type="button"
              className="btn ghost big"
              onClick={() => useGameStore.getState().openHistory()}
            >
              对局记录
            </button>
          </div>
          <div className="menu-foot">
            <span>武将 {HEROES.length}</span>
            <span>牌堆 160</span>
            <span>身份 · 1v1 · 斗地主 · 国战</span>
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
          </div>
        </div>
        <div className="menu-side">
          <div className="menu-side-title">武 将 名 录</div>
          <div className="hero-roll">
            {HEROES.map((hero) => (
              <span key={hero.id} className={`hero-roll-item faction-${hero.faction}`}>
                <i>{FACTION_NAME[hero.faction]}</i>
                {hero.name}
              </span>
            ))}
          </div>
          <div className="menu-side-note">
            煮酒论英雄
            <br />
            天下英雄，唯使君与操耳
          </div>
        </div>
      </div>
    </div>
  );
}
