import type { Classified } from './classify'
import type { GenManifest } from './types'

/** The dry-run report. Pure text; generating nothing. */
export function dryRunReport(m: GenManifest, classified: Classified[], batchSize: number, providerLine: string): string {
  const n = (p: string) => classified.filter((c) => c.priority === p).length
  const t = (type: string) => m.assets.filter((a) => a.assetType === type).length
  const queued = m.assets.filter((a) => ['QUEUED', 'FAILED', 'GENERATING'].includes(a.status)).length
  const rows: [string, number | string][] = [
    ['World seed', m.world.seed],
    ['Total fighters', classified.length],
    ['Premium fighters', n('PREMIUM')],
    ['Important fighters', n('IMPORTANT')],
    ['Standard fighters', n('STANDARD')],
    ['Generic fighters (silhouette fallback, no art)', n('GENERIC')],
    ['Profile assets required', t('fighter.profile')],
    ['Action assets required', t('fighter.action')],
    ['Celebration assets required', t('fighter.celebration')],
    ['Promotion logos required (rivals; player designs their own)', t('promotion.logo')],
    ['Promotion compact marks required', t('promotion.mark')],
    ['Venue assets required', t('venue')],
    ['News assets required', t('news')],
    ['Event poster templates required', t('eventTemplate')],
    ['Total assets', m.assets.length],
    ['Currently queued / failed / in progress', queued],
    ['Assets per batch', batchSize],
    ['Batches needed', Math.ceil(queued / batchSize)],
    ['Provider', providerLine],
  ]
  const w = Math.max(...rows.map((r) => r[0].length))
  return ['generate-assets --dry-run  (no images are generated; nothing is written)', '', ...rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`)].join('\n')
}
