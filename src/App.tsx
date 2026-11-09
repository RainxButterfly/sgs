import { useEffect } from 'react';
import { loadBackgroundSettings } from './ui/background';
import { ChatPanel } from './ui/components/ChatPanel';
import { AboutModal } from './ui/components/AboutModal';
import { AoePanel } from './ui/components/AoePanel';
import { ChangelogModal } from './ui/components/ChangelogModal';
import { DamageFeedback } from './ui/components/DamageFeedback';
import { JudgeNotice } from './ui/components/JudgeNotice';
import { SkillNotice } from './ui/components/SkillNotice';
import { WuxieWindowNotice } from './ui/components/WuxieWindowNotice';
import { RevealNotice } from './ui/components/RevealNotice';
import { HarvestLayer } from './ui/components/HarvestModal';
import { SettingsModal } from './ui/components/SettingsModal';
import { initDataStorage } from './ui/dataStorage';
import { UpdateModal } from './ui/components/UpdateModal';
import { loadSavedLanSession, useGameStore } from './ui/store';
import { GameScreen } from './ui/screens/GameScreen';
import { HeroGallery } from './ui/screens/HeroGallery';
import { IdentityMarkModal } from './ui/components/IdentityMarkModal';
import { LanScreen } from './ui/screens/LanScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { MatchHistoryModal } from './ui/components/MatchHistoryModal';
import { MobileGameScreen } from './ui/screens/MobileGameScreen';
import { PickScreen } from './ui/screens/PickScreen';
import { ResultScreen } from './ui/screens/ResultScreen';
import { SetupScreen } from './ui/screens/SetupScreen';
import { SpectatorScreen } from './ui/screens/SpectatorScreen';
import { TutorialModal } from './ui/components/TutorialModal';
import { useIsMobile } from './ui/useIsMobile';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const spectate = useGameStore((s) => s.spectate);
  const gameError = useGameStore((s) => s.error);
  const mobile = useIsMobile();

  useEffect(() => {
    void initDataStorage().then((restored) => {
      if (!restored) return;
      const background = loadBackgroundSettings();
      useGameStore.setState({
        bgImage: background.image,
        bgDim: background.dim,
        savedLanSession: loadSavedLanSession(),
      });
    });
  }, []);

  useEffect(() => {
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
      <HarvestLayer />
      <ChatPanel />
      <MatchHistoryModal />
      <IdentityMarkModal />
      <UpdateModal />
    </div>
  );
}
