import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './ui/App'
import { audio } from './audio/audioManager'
import { WebAudioBackend } from './audio/synth'
import { initAudio } from './audio/bindings'
import './store/prefs'

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
