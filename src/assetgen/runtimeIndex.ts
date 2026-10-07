/** Publishes completed art into the runtime manifest (public/assets/manifest.json) so the game can find it. Pure. */
import type { GenManifest } from './types'

interface PublicManifest { artWorld: { seed: string | null }; classes: Record<string, { ids: string[]; thumbIds?: string[] }> }

/** Entity ids with a COMPLETE asset whose file exists, per runtime class. */
export function completedIds(m: GenManifest, exists: (path: string) => boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of m.assets) {
    if (a.status !== 'COMPLETE' || !exists(a.outputPath)) continue
    ;(out[a.assetType === 'news' || a.assetType === 'venue' || a.assetType === 'eventTemplate' ? a.assetType : a.assetType] ??= []).push(a.entityId)
  }
  for (const k of Object.keys(out)) out[k].sort()
  return out
}

export function applyRuntimeIndex<T extends PublicManifest>(pub: T, m: GenManifest, exists: (path: string) => boolean): T {
  const ids = completedIds(m, exists)
  const next = structuredClone(pub)
  for (const [cls, def] of Object.entries(next.classes)) def.ids = ids[cls] ?? []
  const anyFighter = ['fighter.profile', 'fighter.action', 'fighter.celebration'].some((c) => (ids[c] ?? []).length > 0)
  next.artWorld = { seed: anyFighter ? m.world.seed : next.artWorld?.seed ?? null }
  const prof = next.classes['fighter.profile']
  if (prof) prof.thumbIds = (ids['fighter.profile'] ?? []).filter((id) => exists(thumbPath(m, id)))
  return next
}
const thumbPath = (m: GenManifest, id: string) => (m.assets.find((a) => a.assetType === 'fighter.profile' && a.entityId === id)?.outputPath ?? '').replace(/\.webp$/, '_thumb.webp')
