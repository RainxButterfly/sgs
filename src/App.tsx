import { useEffect } from 'react';
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
      <UpdateModal />
    </div>
  );
}
