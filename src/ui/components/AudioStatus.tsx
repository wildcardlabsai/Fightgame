import { useSyncExternalStore } from 'react'
import { audio } from '../../audio/audioManager'

const sub = (cb: () => void) => audio.subscribeStatus(cb)
export const useAudioStatus = () => useSyncExternalStore(sub, () => audio.status(), () => 'locked' as const)

/** Subtle indicator shown only while the browser is still blocking sound (until the first click/tap). Clicking it unlocks audio. */
export function AudioStatus({ compact }: { compact?: boolean }) {
  const st = useAudioStatus()
  if (st !== 'locked') return null
  return (
    <button type="button" className={`audio-lock${compact ? ' compact' : ''}`} data-testid="audio-locked" data-sfx="none" onClick={() => audio.unlock()} aria-label="Sound is waiting for your first click or tap. Press to enable sound.">
      <span aria-hidden>🔇</span>{!compact && <span>Tap to enable sound</span>}
    </button>
  )
}
