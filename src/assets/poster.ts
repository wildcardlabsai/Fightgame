/** Event poster template choice. Pure over public show facts: nothing here reads the simulation or its RNG. */
import type { PosterTemplateId } from './registry'

export interface PosterFacts {
  hasMain: boolean
  /** A title is on the line (no titles exist before the rankings phase, so this is currently always false). */
  championship: boolean
  ppv: boolean
  international: boolean
  rivalry: boolean
  nextGen: boolean
  bigVenue: boolean
  fights: number
}

/** Priority order: the most distinctive thing about the show wins. */
export function choosePosterTemplate(f: PosterFacts): PosterTemplateId {
  if (f.championship) return 'championship'
  if (f.ppv) return 'ppv'
  if (f.international) return 'international'
  if (f.rivalry) return 'rivalry'
  if (f.nextGen) return 'next-generation'
  if (f.bigVenue) return 'big-event'
  if (f.hasMain && f.fights >= 4) return 'main-event'
  return 'fight-night'
}
