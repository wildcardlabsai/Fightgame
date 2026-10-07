/** Offline asset-generation pipeline: shared types. Nothing here runs in the game. */
export type FighterPriority = 'PREMIUM' | 'IMPORTANT' | 'STANDARD' | 'GENERIC'
export type EntityType = 'fighter' | 'promotion' | 'venue' | 'news' | 'eventTemplate'
export type AssetType = 'fighter.profile' | 'fighter.action' | 'fighter.celebration' | 'promotion.logo' | 'promotion.mark' | 'venue' | 'news' | 'eventTemplate'
export type GenStatus = 'QUEUED' | 'GENERATING' | 'COMPLETE' | 'FAILED' | 'SKIPPED' | 'PENDING_REVIEW'
export const GEN_STATUSES: GenStatus[] = ['QUEUED', 'GENERATING', 'COMPLETE', 'FAILED', 'SKIPPED', 'PENDING_REVIEW']

export interface GenAsset {
  assetId: string
  entityId: string
  entityType: EntityType
  assetType: AssetType
  /** Fighter priority for fighter assets; other entity types use STANDARD. */
  priority: FighterPriority
  prompt: string
  status: GenStatus
  /** Path under public/assets, e.g. fighters/profile/fighter_f_r_profile.webp */
  outputPath: string
  generationVersion: number
  width: number
  height: number
  /** Deterministic variation seed for providers that accept one. */
  seed: number
  error?: string
  updatedAt?: string
}

export interface GenManifest {
  schema: 1
  generationVersion: number
  /** The world the fighter art belongs to: art only shows in a game created with this seed. */
  world: { seed: string; scenario: string }
  assets: GenAsset[]
}

export const PRIORITY_RANK: Record<FighterPriority, number> = { PREMIUM: 0, IMPORTANT: 1, STANDARD: 2, GENERIC: 3 }
