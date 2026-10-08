/** Builds the full list of artwork a world needs (the generation queue), from public game data. */
import { NEWS_KINDS, POSTER_TEMPLATES, venueKind } from '../assets/registry'
import { viewsOf } from '../engine/view'
import type { GameState } from '../engine/types'
import { hashSeed } from '../engine/rng'
import { classifyFighters, FIGHTER_ASSETS } from './classify'
import { assetId, outputPath, SIZE } from './naming'
import { fighterPrompt, newsPrompt, promotionPrompt, templatePrompt, venuePrompt } from './prompts'
import { PRIORITY_RANK, type AssetType, type EntityType, type FighterPriority, type GenAsset, type GenManifest } from './types'

export const GENERATION_VERSION = 1

function make(type: AssetType, entityType: EntityType, entityId: string, priority: FighterPriority, prompt: string, worldSeed: string): GenAsset {
  const [width, height] = SIZE[type]
  return { assetId: assetId(type, entityId), entityId, entityType, assetType: type, priority, prompt, status: 'QUEUED', outputPath: outputPath(type, entityId), generationVersion: GENERATION_VERSION, width, height, seed: hashSeed(`${worldSeed}:${type}:${entityId}`) }
}

export function buildRequirements(state: GameState, scenario = 'groundUp'): { manifest: GenManifest; classified: ReturnType<typeof classifyFighters> } {
  const seed = state.seed
  const classified = classifyFighters(state)
  const assets: GenAsset[] = []
  for (const c of classified) for (const kind of FIGHTER_ASSETS[c.priority]) assets.push(make(`fighter.${kind}` as AssetType, 'fighter', c.view.id, c.priority, fighterPrompt(c.view, kind), seed))
  // Rival promotions only: the player's promotion is designed by the player (its own logo is their identity).
  for (const p of Object.values(state.promotions)) {
    if (p.isPlayer) continue
    assets.push(make('promotion.logo', 'promotion', p.id, 'STANDARD', promotionPrompt(p, 'logo'), seed), make('promotion.mark', 'promotion', p.id, 'STANDARD', promotionPrompt(p, 'mark'), seed))
  }
  // Real venues never go to the image generator: a generated picture of a real building would misrepresent it. They use the venue-kind
  // art or an approved asset (see assets/venueAssets.ts); only the generic placeholder halls are generated.
  for (const v of Object.values(state.venues).filter((x) => !x.realId && !x.legacy)) assets.push(make('venue', 'venue', v.id, 'STANDARD', venuePrompt(v, venueKind({ name: v.name, tier: v.tier, capacity: v.capacity, city: v.city, country: v.country })), seed))
  for (const k of NEWS_KINDS) assets.push(make('news', 'news', k, 'STANDARD', newsPrompt(k), seed))
  for (const t of POSTER_TEMPLATES) assets.push(make('eventTemplate', 'eventTemplate', t, 'STANDARD', templatePrompt(t), seed))
  assets.sort(order)
  void viewsOf
  return { manifest: { schema: 1, generationVersion: GENERATION_VERSION, world: { seed, scenario }, assets }, classified }
}

const TYPE_ORDER: Record<string, number> = { 'fighter.profile': 0, 'fighter.action': 1, 'fighter.celebration': 2, 'promotion.logo': 3, 'promotion.mark': 4, venue: 5, news: 6, eventTemplate: 7 }
/** Generation order: highest-priority fighters first, then non-fighter assets, stable by id. */
export function order(a: GenAsset, b: GenAsset): number {
  const pa = a.entityType === 'fighter' ? PRIORITY_RANK[a.priority] : 1.5, pb = b.entityType === 'fighter' ? PRIORITY_RANK[b.priority] : 1.5
  return pa - pb || (TYPE_ORDER[a.assetType] ?? 9) - (TYPE_ORDER[b.assetType] ?? 9) || a.assetId.localeCompare(b.assetId)
}
