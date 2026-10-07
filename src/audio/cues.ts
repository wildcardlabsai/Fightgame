/** Every sound the game can make. A cue is a NAME — what it sounds like lives in the synth backend, so assets can be swapped later. */
export type Bus = 'ui' | 'sfx' | 'fight' | 'music'

export const CUES = {
  // UI (subtle)
  click: { bus: 'ui', gain: 0.5, gap: 40 },
  navigate: { bus: 'ui', gain: 0.55, gap: 60 },
  tab: { bus: 'ui', gain: 0.5, gap: 60 },
  dropdown: { bus: 'ui', gain: 0.5, gap: 60 },
  toggle: { bus: 'ui', gain: 0.55, gap: 60 },
  modalOpen: { bus: 'ui', gain: 0.55, gap: 120 },
  modalClose: { bus: 'ui', gain: 0.5, gap: 120 },
  save: { bus: 'sfx', gain: 0.6, gap: 400 },
  // Feedback
  notification: { bus: 'sfx', gain: 0.55, gap: 250 },
  warning: { bus: 'sfx', gain: 0.65, gap: 600 },
  success: { bus: 'sfx', gain: 0.6, gap: 250 },
  error: { bus: 'sfx', gain: 0.6, gap: 250 },
  contractAccepted: { bus: 'sfx', gain: 0.7, gap: 400 },
  contractRejected: { bus: 'sfx', gain: 0.65, gap: 400 },
  fightScheduled: { bus: 'sfx', gain: 0.65, gap: 400 },
  // Event night
  eventIntro: { bus: 'sfx', gain: 0.75, gap: 2000 },
  eventStarted: { bus: 'sfx', gain: 0.75, gap: 2000 },
  mainEvent: { bus: 'sfx', gain: 0.8, gap: 2000 },
  fightTransition: { bus: 'sfx', gain: 0.6, gap: 600 },
  resultAnnounce: { bus: 'sfx', gain: 0.7, gap: 600 },
  eventCompleted: { bus: 'sfx', gain: 0.75, gap: 2000 },
  crowdAmbience: { bus: 'music', gain: 0.4, gap: 5000 },
  // Fight
  bell: { bus: 'fight', gain: 0.8, gap: 500 },
  roundEnd: { bus: 'fight', gain: 0.7, gap: 500 },
  crowd: { bus: 'fight', gain: 0.6, gap: 800 },
  knockdown: { bus: 'fight', gain: 0.85, gap: 400 },
  ko: { bus: 'fight', gain: 0.9, gap: 1000 },
  decision: { bus: 'fight', gain: 0.7, gap: 1000 },
  fightIntro: { bus: 'fight', gain: 0.8, gap: 3000 },
  punch: { bus: 'fight', gain: 0.6, gap: 220 },
  count: { bus: 'fight', gain: 0.55, gap: 120 },
  getUp: { bus: 'fight', gain: 0.6, gap: 500 },
  stoppage: { bus: 'fight', gain: 0.85, gap: 1000 },
  titleAnnounce: { bus: 'sfx', gain: 0.8, gap: 3000 },
  revenue: { bus: 'sfx', gain: 0.65, gap: 800 },
  majorResult: { bus: 'sfx', gain: 0.75, gap: 2000 },
} as const satisfies Record<string, { bus: Bus; gain: number; gap: number }>

export type CueId = keyof typeof CUES
export const CUE_IDS = Object.keys(CUES) as CueId[]
export const isCue = (x: string): x is CueId => x in CUES
