import { useSyncExternalStore } from 'react'
import { audio } from '../../audio/audioManager'
import { usePrefs } from '../../store/prefs'

const sub = (cb: () => void) => audio.subscribeStatus(cb)
export const useAudioStatus = () => useSyncExternalStore(sub, () => audio.status(), () => 'locked' as const)

/**
 * The always-reachable sound button (header, top bar, Fight Night). One press does the sensible thing:
 *  - the browser is still blocking sound → unlock it (this is the "first tap" the browser needs);
 *  - sound is on → mute; muted/disabled → turn it back on.
 */
export function AudioToggle({ compact }: { compact?: boolean }) {
  const st = useAudioStatus()
  const a = usePrefs((s) => s.audio)
  const setAudio = usePrefs((s) => s.setAudio)
  const locked = st === 'locked'
  const off = !locked && (a.muted || !a.enabled || st === 'off')
  const label = locked ? 'Tap to enable sound' : off ? 'Sound off — tap to turn on' : 'Sound on — tap to mute'
  const onClick = () => {
    if (locked) { audio.unlock(); return }
    // The browser needs a tap to unlock sound. That tap (pointerdown) unlocks before this click lands, so it must not also mute.
    if (audio.justUnlocked()) return
    if (off) setAudio({ enabled: true, muted: false }); else setAudio({ muted: true })
    audio.unlock()
  }
  return (
    <button type="button" className={`audio-toggle${locked ? ' locked' : off ? ' off' : ' on'}${compact ? ' compact' : ''}`} data-sfx="none" data-testid={locked ? 'audio-locked' : 'audio-toggle'} aria-pressed={!off && !locked} aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9z" />
        {off || locked ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
      {!compact && <span>{locked ? 'Tap for sound' : off ? 'Sound off' : 'Sound on'}</span>}
    </button>
  )
}
