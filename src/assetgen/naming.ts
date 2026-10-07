/** Deterministic asset names. The ONLY place filenames are formed; the runtime registry uses the same functions. */
import type { AssetType } from './types'

export const DIR: Record<AssetType, string> = {
  'fighter.profile': 'fighters/profile', 'fighter.action': 'fighters/action', 'fighter.celebration': 'fighters/celebration',
  'promotion.logo': 'promotions/logos', 'promotion.mark': 'promotions/logos', venue: 'venues', news: 'news', eventTemplate: 'events/templates',
}
export const SIZE: Record<AssetType, [number, number]> = {
  'fighter.profile': [960, 1200], 'fighter.action': [1600, 900], 'fighter.celebration': [1600, 900],
  'promotion.logo': [1024, 1024], 'promotion.mark': [512, 512], venue: [1600, 900], news: [1280, 720], eventTemplate: [1600, 2000],
}
export function fileName(type: AssetType, entityId: string): string {
  switch (type) {
    case 'fighter.profile': return `fighter_${entityId}_profile.webp`
    case 'fighter.action': return `fighter_${entityId}_action.webp`
    case 'fighter.celebration': return `fighter_${entityId}_celebration.webp`
    case 'promotion.logo': return `promotion_${entityId}_logo.webp`
    case 'promotion.mark': return `promotion_${entityId}_mark.webp`
    case 'venue': return `venue_${entityId}.webp`
    case 'news': return `news_${entityId}.webp`
    case 'eventTemplate': return `poster_${entityId}.webp`
  }
}
export const outputPath = (type: AssetType, entityId: string) => `${DIR[type]}/${fileName(type, entityId)}`
export const assetId = (type: AssetType, entityId: string) => `${type}.${entityId}`
