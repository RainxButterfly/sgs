import { useEffect } from 'react';
import { loadBackgroundSettings } from './ui/background';
import { initDevBridge } from './dev/bridge';
import { openDevtoolPage } from './dev/toolWindow';
import { ChatPanel } from './ui/components/ChatPanel';
import { AboutModal } from './ui/components/AboutModal';
import { AoePanel } from './ui/components/AoePanel';
import { ChangelogModal } from './ui/components/ChangelogModal';
import { ClickSparkles } from './ui/components/ClickSparkles';
import { PlayFly, TablePulse } from './ui/components/TableFx';
import { DamageFeedback } from './ui/components/DamageFeedback';
import { DevNotice } from './ui/components/DevNotice';
import { StartProtection } from './ui/components/StartProtection';
import { JudgeNotice } from './ui/components/JudgeNotice';
import { SkillNotice } from './ui/components/SkillNotice';
import { WuxieWindowNotice } from './ui/components/WuxieWindowNotice';
import { ResponseWindowNotice } from './ui/components/ResponseWindowNotice';
import { RevealNotice } from './ui/components/RevealNotice';
import { HarvestLayer } from './ui/components/HarvestModal';
import { SettingsModal } from './ui/components/SettingsModal';
import { initDataStorage } from './ui/dataStorage';
import { UpdateModal } from './ui/components/UpdateModal';
import { loadSavedLanSession, useGameStore } from './ui/store';
import { backfillProfileFromHistory, loadProfile } from './ui/profile';
import { GameScreen } from './ui/screens/GameScreen';
import { GuandanScreen } from './ui/screens/GuandanScreen';
import { HeroGallery } from './ui/screens/HeroGallery';
import { IdentityMarkModal } from './ui/components/IdentityMarkModal';
import { LanScreen } from './ui/screens/LanScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { MatchHistoryModal } from './ui/components/MatchHistoryModal';
import { MobileGameScreen } from './ui/screens/MobileGameScreen';
import { PickScreen } from './ui/screens/PickScreen';
import { ProfileSetupModal, isProfileInitialized } from './ui/components/ProfileSetupModal';
import { ResultScreen } from './ui/screens/ResultScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { SpectatorScreen } from './ui/screens/SpectatorScreen';
import { TutorialModal } from './ui/components/TutorialModal';
import { useIsMobile } from './ui/useIsMobile';
import { installClickSound } from './ui/sound';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const spectate = useGameStore((s) => s.spectate);
  const gameError = useGameStore((s) => s.error);
  const uiTheme = useGameStore((s) => s.uiTheme);
  const uiPalette = useGameStore((s) => s.uiPalette);
  const modalOpen = useGameStore(
    (s) =>
      s.settingsOpen ||
      s.historyOpen ||
      s.changelogOpen ||
      s.aboutOpen ||
      s.tutorialOpen ||
      s.updateModalOpen,
  );
  const mobile = useIsMobile();

  useEffect(() => {
    document.documentElement.classList.toggle('theme-magic', uiTheme === 'magic');
    document.documentElement.dataset.palette = uiPalette;
  }, [uiTheme, uiPalette]);

  useEffect(() => {
    document.documentElement.classList.toggle('modal-open', modalOpen);
  }, [modalOpen]);

  /* 自定义壁纸：主界面之外的界面统一走 .ink-bg 这一层 */
  const bgImage = useGameStore((s) => s.bgImage);
  const bgDim = useGameStore((s) => s.bgDim);
  const bgScope = useGameStore((s) => s.bgScope);
  const bgKind = useGameStore((s) => s.bgKind);
  useEffect(() => {
    const root = document.documentElement;
    const otherScreen = screen !== 'menu' && screen !== 'game' && screen !== 'guandan';
    const usable = bgKind === 'image' && !!bgImage && (bgScope === 'menu' || bgScope === 'all');
    if (usable && otherScreen) {
      root.style.setProperty('--wallpaper-image', `url("${bgImage}")`);
      root.style.setProperty('--wallpaper-dim', String(Math.min(0.9, bgDim / 100)));
      root.classList.add('has-wallpaper');
    } else {
      root.classList.remove('has-wallpaper');
    }
  }, [screen, bgImage, bgDim, bgScope, bgKind]);

  useEffect(() => installClickSound(), []);

  useEffect(() => initDevBridge(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        void openDevtoolPage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    void initDataStorage().then((restored) => {
      if (restored) {
        const background = loadBackgroundSettings();
        useGameStore.setState({
          bgImage: background.image,
          bgDim: background.dim,
          savedLanSession: loadSavedLanSession(),
        });
      }
      useGameStore.setState({ profile: backfillProfileFromHistory(loadProfile()) });
    });
  }, []);

  useEffect(() => {
    if (!isProfileInitialized()) return;
    let seen = false;
    try {
      seen = localStorage.getItem('sgk-tutorial-seen') === '1';
    } catch {
      // ignore storage failures
    }
    if (!seen) {
      const timer = window.setTimeout(() => useGameStore.getState().openTutorial(), 700);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const timer = setTimeout(() => {
      if (useGameStore.getState().screen === 'menu') {
        void useGameStore.getState().checkUpdate(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app-root">
      {screen === 'menu' && <MainMenu />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'pick' && <PickScreen />}
      {screen === 'lan' && <LanScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'gallery' && <HeroGallery />}
      {screen === 'game' &&
        (spectate ? (
          <SpectatorScreen />
        ) : mobile ? (
          <MobileGameScreen />
        ) : (
          <GameScreen />
        ))}
      {screen === 'guandan' && <GuandanScreen />}
      {screen === 'result' && <ResultScreen />}
      {gameError && (
        <div className="fatal-error">
          <div className="fatal-card">
            <h1>对局中断</h1>
            <p>{gameError}</p>
            <div className="fatal-actions">
              <button type="button" className="btn primary" onClick={() => useGameStore.getState().backToMenu()}>
                返回主菜单
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsModal />
      <ChangelogModal />
      <AboutModal />
      <TutorialModal />
      <AoePanel />
      <DamageFeedback />
      <RevealNotice />
      <JudgeNotice />
      <SkillNotice />
      <WuxieWindowNotice />
      <ResponseWindowNotice />
      <HarvestLayer />
      <ChatPanel />
      <MatchHistoryModal />
      <IdentityMarkModal />
      <UpdateModal />
      <ProfileSetupModal />
      <DevNotice />
      <StartProtection />
      <PlayFly />
      <TablePulse />
      <ClickSparkles />
    </div>
  );
}
