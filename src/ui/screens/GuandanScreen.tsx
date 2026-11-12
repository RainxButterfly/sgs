import { useCallback, useEffect, useRef, useState } from 'react';
import '../guandan.css';
import { GuandanMatch } from '../../core/guandan-match';
import { buildGdView } from '../../core/guandan-view';
import { GuandanBoard } from '../components/GuandanBoard';
import { useGameStore } from '../store';

const SEAT_NAMES = ['你', '右手对手', '对家', '左手对手'];

/** 单机 / 人机：本地持有一局掼蛋 */
function LocalGuandan({ onExit }: { onExit: () => void }) {
  const matchRef = useRef<GuandanMatch | null>(null);
  const [tick, setTick] = useState(0);
  if (!matchRef.current) matchRef.current = new GuandanMatch({ names: SEAT_NAMES });
  const match = matchRef.current;
  const bump = useCallback(() => setTick((v) => v + 1), []);

  /* 机器人自动行动 */
  useEffect(() => {
    if (match.phase !== 'play' || match.turn === 0) return;
    const timer = window.setTimeout(() => {
      match.autoPlay(1);
      bump();
    }, 560);
    return () => window.clearTimeout(timer);
  }, [match, bump, tick]);

  const view = buildGdView(match, 0);

  return (
    <GuandanBoard
      view={view}
      onExit={onExit}
      onPlay={(ids) => {
        const cards = match.seats[0].hand.filter((card) => ids.includes(card.id));
        match.play(0, cards);
        bump();
      }}
      onPass={() => {
        match.pass(0);
        bump();
      }}
      onNextRound={() => {
        if (match.nextRound()) bump();
      }}
      onRestart={() => {
        matchRef.current = new GuandanMatch({ names: SEAT_NAMES });
        bump();
      }}
    />
  );
}

/** 联机：所有状态来自房主广播的视图，动作上行 */
function LanGuandan({ view, host }: { view: ReturnType<typeof buildGdView>; host: boolean }) {
  const gdPlay = useGameStore((s) => s.gdPlay);
  const gdPass = useGameStore((s) => s.gdPass);
  const gdNextRound = useGameStore((s) => s.gdNextRound);
  const leaveLan = useGameStore((s) => s.leaveLan);

  return (
    <GuandanBoard
      view={view}
      subtitle={view.round > 0 ? ` · 第 ${view.round} 局` : ''}
      onExit={() => leaveLan()}
      onPlay={(ids) => gdPlay(ids)}
      onPass={() => gdPass()}
      onNextRound={host ? () => gdNextRound(false) : undefined}
      onRestart={host ? () => gdNextRound(true) : undefined}
      waitingText="等待房主开始下一局…"
    />
  );
}

export function GuandanScreen() {
  const lanView = useGameStore((s) => s.guandanView);
  const lanRole = useGameStore((s) => s.lanRole);
  const backToMenu = useGameStore((s) => s.backToMenu);

  if (lanView) {
    return <LanGuandan view={lanView} host={lanRole === 'host'} />;
  }
  return <LocalGuandan onExit={backToMenu} />;
}
