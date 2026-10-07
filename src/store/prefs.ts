/** Preferences store (advisor level, audio, hints). Persistence lives in engine/preferences; this only holds the live values. */
import { create } from 'zustand'
import type { AdvisorMode } from '../engine/advisor'
import { loadPreferences, savePreferences, type PlayMode, type Preferences } from '../engine/preferences'
import { audio, DEFAULT_AUDIO, type AudioSettings } from '../audio/audioManager'

interface Prefs extends Preferences {
  setAdvisor: (m: AdvisorMode) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  resetAudio: () => void
  hideFirstSteps: (hide: boolean) => void
  setFightMode: (m: PlayMode) => void
}

const initial = loadPreferences()
audio.configure(initial.audio)

const snapshot = (s: Prefs): Preferences => ({ advisor: s.advisor, audio: s.audio, firstStepsHidden: s.firstStepsHidden, fightMode: s.fightMode })

export const usePrefs = create<Prefs>((set, get) => ({
  ...initial,
  setAdvisor: (advisor) => { set({ advisor }); savePreferences(snapshot(get())) },
  setAudio: (patch) => { set({ audio: audio.configure(patch) }); savePreferences(snapshot(get())) },
  resetAudio: () => { set({ audio: audio.configure({ ...DEFAULT_AUDIO }) }); savePreferences(snapshot(get())) },
  setFightMode: (fightMode) => { set({ fightMode }); savePreferences(snapshot(get())) },
  hideFirstSteps: (firstStepsHidden) => { set({ firstStepsHidden }); savePreferences(snapshot(get())) },
}))
