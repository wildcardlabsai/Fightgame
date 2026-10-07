/** Resumable batch runner. All I/O is injected, so the whole thing is unit-testable without a provider or a disk. */
import { toRequest, type ImageGenerationProvider, type ProviderStatus } from './provider'
import { order } from './requirements'
import type { AssetType, GenAsset, GenManifest, GenStatus } from './types'

export const DEFAULT_BATCH = 25
export const LARGE_BATCH = 25
const MAX_CONSECUTIVE_FAILURES = 3

export interface RunnerIO {
  exists(path: string): boolean
  write(path: string, data: Uint8Array): void
  /** Persist the manifest. Called after every asset so an interrupted run resumes exactly where it stopped. */
  save(m: GenManifest): void
  log(line: string): void
  now(): string
}
export interface RunOptions { batchSize: number; dryRun: boolean; missing: boolean; force: boolean; requireReview?: boolean; types?: AssetType[] }

const RETRYABLE: GenStatus[] = ['QUEUED', 'FAILED', 'GENERATING']

/** Which assets this run would generate. Completed assets are never selected unless `force` (or `missing` and their file is gone). */
export function selectBatch(m: GenManifest, io: Pick<RunnerIO, 'exists'>, o: Pick<RunOptions, 'batchSize' | 'missing' | 'force' | 'types'>): GenAsset[] {
  const eligible = m.assets.filter((a) => {
    if (a.status === 'SKIPPED') return false
    if (o.types && !o.types.includes(a.assetType)) return false
    const fileGone = !io.exists(a.outputPath)
    if (o.force) return true
    if (o.missing) return fileGone
    return RETRYABLE.includes(a.status)
  })
  return eligible.sort(order).slice(0, Math.max(0, o.batchSize))
}

export interface RunSummary { attempted: number; complete: number; failed: number; pendingReview: number; remaining: number; stoppedEarly: boolean; dryRun: boolean; planned: GenAsset[] }

export const remaining = (m: GenManifest) => m.assets.filter((a) => RETRYABLE.includes(a.status)).length

export async function runBatch(m: GenManifest, provider: ImageGenerationProvider, io: RunnerIO, o: RunOptions): Promise<RunSummary> {
  const batch = selectBatch(m, io, o)
  if (o.dryRun) return { attempted: 0, complete: 0, failed: 0, pendingReview: 0, remaining: remaining(m), stoppedEarly: false, dryRun: true, planned: batch }
  const status = await provider.checkStatus()
  if (!status.ready) throw new Error(`Provider not ready: ${status.detail}`)
  const s: RunSummary = { attempted: 0, complete: 0, failed: 0, pendingReview: 0, remaining: 0, stoppedEarly: false, dryRun: false, planned: batch }
  let consecutive = 0
  for (const a of batch) {
    a.status = 'GENERATING'; a.updatedAt = io.now(); delete a.error
    io.save(m)
    s.attempted++
    const res = await provider.generateImage(toRequest(a))
    if (res.ok && res.data) {
      io.write(a.outputPath, res.data)
      a.status = o.requireReview ? 'PENDING_REVIEW' : 'COMPLETE'
      if (o.requireReview) s.pendingReview++; else s.complete++
      consecutive = 0
      io.log(`✓ ${a.assetId} → ${a.outputPath}`)
    } else {
      a.status = 'FAILED'; a.error = res.error ?? 'unknown error'; s.failed++; consecutive++
      io.log(`✗ ${a.assetId}: ${a.error}`)
    }
    a.updatedAt = io.now()
    io.save(m)
    if (consecutive >= MAX_CONSECUTIVE_FAILURES) { s.stoppedEarly = true; io.log(`Stopping: ${MAX_CONSECUTIVE_FAILURES} failures in a row.`); break }
  }
  s.remaining = remaining(m)
  return s
}

/** Moves PENDING_REVIEW assets to COMPLETE (after a human has looked at them). */
export function approve(m: GenManifest, ids?: string[]): number {
  let n = 0
  for (const a of m.assets) if (a.status === 'PENDING_REVIEW' && (!ids || ids.includes(a.assetId))) { a.status = 'COMPLETE'; n++ }
  return n
}

/** Merge a freshly built requirement list into an existing manifest: statuses and errors of known assets are preserved. */
export function mergeManifest(existing: GenManifest | null, fresh: GenManifest): GenManifest {
  if (!existing || existing.world.seed !== fresh.world.seed) return fresh
  const old = new Map(existing.assets.map((a) => [a.assetId, a]))
  const assets = fresh.assets.map((a) => {
    const o = old.get(a.assetId)
    if (!o) return a
    // same asset: keep progress unless the generation version moved on (then it must be regenerated)
    return o.generationVersion === a.generationVersion ? { ...a, status: o.status, error: o.error, updatedAt: o.updatedAt, prompt: o.status === 'COMPLETE' ? o.prompt : a.prompt } : a
  })
  return { ...fresh, assets }
}

// ------------------------------------------------------------------ reports
export interface Counts { total: number; byType: Record<string, number>; byStatus: Record<string, number> }
export function countAssets(assets: GenAsset[]): Counts {
  const c: Counts = { total: assets.length, byType: {}, byStatus: {} }
  for (const a of assets) { c.byType[a.assetType] = (c.byType[a.assetType] ?? 0) + 1; c.byStatus[a.status] = (c.byStatus[a.status] ?? 0) + 1 }
  return c
}

/** Pre-run summary shown before any real generation. */
export function costSummary(batch: GenAsset[], st: ProviderStatus, queuedTotal: number): string {
  const c = countAssets(batch)
  const lines = [
    'Generation run summary',
    `  assets queued overall : ${queuedTotal}`,
    `  assets in this run    : ${batch.length}`,
    ...Object.entries(c.byType).map(([t, n]) => `    ${t.padEnd(22)} ${n}`),
    `  provider / model      : ${st.provider} / ${st.model}`,
    `  estimated images      : ${batch.length}`,
    `  estimated cost        : ${st.costPerImage !== null ? `${(st.costPerImage * batch.length).toFixed(2)} (at ${st.costPerImage} per image)` : 'unknown (set IMAGE_GEN_COST_PER_IMAGE for an estimate)'}`,
  ]
  return lines.join('\n')
}
export const needsConfirmation = (batchCount: number) => batchCount > LARGE_BATCH
