import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './ui/App'
import { audio } from './audio/audioManager'
import { WebAudioBackend } from './audio/synth'
import { initAudio } from './audio/bindings'
import './store/prefs'
import './store/artWorld'
import { startNavHistory } from './store/navHistory'
import { startTrends } from './store/trends'
import { installDiagnostics } from './store/diagnostics'

// A lazily loaded screen asks for its stylesheet before it renders. If only the STYLESHEET is missing (blocked, or not published next to the page)
// the screen can still work, so that failure is logged instead of aborting the whole screen (which used to leave a black page).
window.addEventListener('vite:preloadError', (e) => {
  const msg = String((e as unknown as { payload?: { message?: string } }).payload?.message ?? '')
  if (/css/i.test(msg)) { e.preventDefault(); console.warn('Stylesheet did not load:', msg) }
})
installDiagnostics()
startNavHistory()
startTrends()
audio.setBackend(new WebAudioBackend())
initAudio()
// Exposed so browser checks can observe which cues the game asked for (the sounds themselves are not asserted).
;(window as unknown as { __audio: typeof audio }).__audio = audio
// Test hook, only with ?e2e in the URL: lets the browser tests load fixture saves. Not available in normal play.
if (new URLSearchParams(window.location.search).has('e2e')) {
  void import('./store/gameStore').then((m) => { ;(window as unknown as { __fe: unknown }).__fe = { useGame: m.useGame } })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
