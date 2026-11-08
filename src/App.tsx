import { useEffect } from 'react';
import { BackgroundSettings } from './ui/components/BackgroundSettings';
import { UpdateModal } from './ui/components/UpdateModal';
import { useGameStore } from './ui/store';
import { GameScreen } from './ui/screens/GameScreen';
import { HeroGallery } from './ui/screens/HeroGallery';
import { LanScreen } from './ui/screens/LanScreen';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { ResultScreen } from './ui/screens/ResultScreen';
import { SetupScreen } from './ui/screens/SetupScreen';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const gameError = useGameStore((s) => s.error);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const timer = setTimeout(() => {
      if (useGameStore.getState().screen === 'menu') {
        void useGameStore.getState().checkUpdate(false);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app-root">
      {screen === 'menu' && <MainMenu />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'lan' && <LanScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'gallery' && <HeroGallery />}
      {screen === 'game' && <GameScreen />}
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
      <BackgroundSettings />
      <UpdateModal />
    </div>
  );
}
