import { useGame } from './game/store';
import MainMenu from './components/MainMenu';
import GameScreen from './components/GameScreen';
import ResultsScreen from './components/ResultsScreen';

/** Top-level screen router driven by the game state machine. */
export default function App() {
  const screen = useGame((s) => s.screen);
  if (screen === 'game') return <GameScreen />;
  if (screen === 'results') return <ResultsScreen />;
  return <MainMenu />;
}
