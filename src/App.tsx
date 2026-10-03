import { lazy, Suspense } from 'react';
import { useGame } from './game/store';
import MainMenu from './components/MainMenu';

// The game and results screens pull in Leaflet + three.js, so they are split
// into their own chunks and the menu can paint immediately.
const GameScreen = lazy(() => import('./components/GameScreen'));
const ResultsScreen = lazy(() => import('./components/ResultsScreen'));

function Fallback() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-void">
      <p className="animate-pulse font-mono text-xs tracking-[0.3em] text-doom uppercase">Opening portal…</p>
    </div>
  );
}

/** Top-level screen router driven by the game state machine. */
export default function App() {
  const screen = useGame((s) => s.screen);
  return (
    <Suspense fallback={<Fallback />}>
      {screen === 'game' ? <GameScreen /> : screen === 'results' ? <ResultsScreen /> : <MainMenu />}
    </Suspense>
  );
}
