import type { Promotion, PromotionLogo, PromotionTier } from './types'

export const TIER_ORDER: PromotionTier[] = ['Startup', 'Regional', 'National', 'Major', 'Global']

export const LOGO_COLORS = ['#e11d2a', '#d4a24c', '#2f7de1', '#26a269', '#9b5de5', '#f2f2f2']
export const LOGO_EMBLEMS: PromotionLogo['emblem'][] = ['crown', 'bolt', 'glove', 'star', 'shield']

export function monogramFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'FE'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function playerPromotion(promotions: Record<string, Promotion>): Promotion {
  const p = Object.values(promotions).find((x) => x.isPlayer)
  if (!p) throw new Error('No player promotion in game state')
  return p
}
