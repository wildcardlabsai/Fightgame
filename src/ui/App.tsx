import { useEffect } from 'react'
import { useGame } from '../store/gameStore'
import { Shell } from './Shell'
import { TitleScreen } from './screens/TitleScreen'

export function App() {
  const game = useGame((s) => s.game)
  const sync = useGame((s) => s.syncRouteFromHash)
  useEffect(() => {
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [sync])
  return (
    <>
      {game ? <Shell /> : <TitleScreen />}
      <Toasts />
    </>
  )
}

function Toasts() {
  const notices = useGame((s) => s.notices)
  const dismiss = useGame((s) => s.dismissNotice)
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {notices.map((n) => (
        <button key={n.id} type="button" data-sfx="none" data-testid="toast" className={`toast ${n.tone}`} onClick={() => dismiss(n.id)} aria-label={`${n.text} Dismiss`}>{n.text}</button>
      ))}
    </div>
  )
}
