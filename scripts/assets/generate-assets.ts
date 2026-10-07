/**
 * Offline asset-generation CLI. NEVER runs from the game, the dev server or the build.
 *
 *   npm run generate-assets -- --dry-run            report what would be needed (generates and writes nothing)
 *   npm run generate-assets -- --plan               (re)build asset-pipeline/generation-manifest.json (statuses are preserved)
 *   npm run generate-assets -- [--batch-size 25] [--missing] [--force] [--yes] [--require-review] [--type fighter.profile]
 *   npm run generate-assets -- --approve [assetId …]   mark PENDING_REVIEW assets COMPLETE
 *   npm run generate-assets -- --sync               publish COMPLETE assets to public/assets/manifest.json
 *   Options: --seed <world seed> (default fight-empire-canon) --scenario groundUp|regional|national|champion
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { buildRequirements } from '../../src/assetgen/requirements'
import { providerFromEnv } from '../../src/assetgen/provider'
import { approve, costSummary, DEFAULT_BATCH, mergeManifest, needsConfirmation, remaining, runBatch, selectBatch, type RunnerIO } from '../../src/assetgen/runner'
import { dryRunReport } from '../../src/assetgen/report'
import { applyRuntimeIndex } from '../../src/assetgen/runtimeIndex'
import type { AssetType, GenManifest } from '../../src/assetgen/types'
import { CANON_SEED, canonWorld } from '../../src/assetgen/world'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '../..')
const MANIFEST = join(ROOT, 'asset-pipeline/generation-manifest.json')
const PUBLIC = join(ROOT, 'public/assets')
const PUBLIC_MANIFEST = join(PUBLIC, 'manifest.json')

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

const seed = opt('seed', CANON_SEED)!
const scenario = opt('scenario', 'groundUp')!
const batchSize = Number(opt('batch-size', String(DEFAULT_BATCH)))

const world = () => canonWorld(seed, scenario)
const load = (): GenManifest | null => (existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as GenManifest) : null)
const saveManifest = (m: GenManifest) => { mkdirSync(dirname(MANIFEST), { recursive: true }); writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n') }
const exists = (p: string) => existsSync(join(PUBLIC, p))
const io: RunnerIO = {
  exists,
  write: (p, data) => { const full = join(PUBLIC, p); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, data) },
  save: saveManifest,
  log: (l) => console.log(l),
  now: () => new Date().toISOString(),
}
function sync(m: GenManifest) {
  const pub = JSON.parse(readFileSync(PUBLIC_MANIFEST, 'utf8'))
  writeFileSync(PUBLIC_MANIFEST, JSON.stringify(applyRuntimeIndex(pub, m, exists), null, 1) + '\n')
  console.log('Runtime art index updated (public/assets/manifest.json).')
}

async function main() {
  const provider = providerFromEnv(process.env)
  const status = await provider.checkStatus()
  const { manifest: fresh, classified } = buildRequirements(world(), scenario)
  const existing = load()
  const m = mergeManifest(existing, fresh)

  if (flag('dry-run')) {
    const providerLine = status.configured ? `${status.provider} / ${status.model}` : 'not configured (generation would be refused)'
    console.log(dryRunReport(m, classified, batchSize, providerLine))
    return
  }
  if (flag('plan')) { saveManifest(m); console.log(`Wrote ${MANIFEST} (${m.assets.length} assets).`); return }
  if (flag('approve')) {
    const ids = args.filter((a) => !a.startsWith('--') && a !== opt('seed') && a !== opt('scenario'))
    const cur = load() ?? m
    console.log(`Approved ${approve(cur, ids.length ? ids : undefined)} asset(s).`); saveManifest(cur); sync(cur); return
  }
  if (flag('sync')) { sync(load() ?? m); return }

  if (!status.ready) { console.error(`Cannot generate: ${status.detail}\nThe game itself does not need a provider.`); process.exitCode = 2; return }
  const types = opt('type') ? (opt('type')!.split(',') as AssetType[]) : undefined
  const o = { batchSize, dryRun: false, missing: flag('missing'), force: flag('force'), requireReview: flag('require-review'), types }
  const batch = selectBatch(m, io, o)
  if (batch.length === 0) { console.log('Nothing to generate: every asset is complete (use --force to regenerate).'); return }
  console.log(costSummary(batch, status, remaining(m)))
  if (needsConfirmation(batch.length) && !flag('yes')) {
    if (!process.stdin.isTTY) { console.error(`Refusing a ${batch.length}-asset batch without --yes (non-interactive).`); process.exitCode = 3; return }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = (await rl.question(`Generate ${batch.length} images? Type "yes" to continue: `)).trim().toLowerCase()
    rl.close()
    if (ans !== 'yes') { console.log('Cancelled.'); return }
  }
  saveManifest(m)
  const s = await runBatch(m, provider, io, o)
  sync(m)
  console.log(`Done: ${s.complete} complete, ${s.pendingReview} pending review, ${s.failed} failed, ${s.remaining} remaining.${s.stoppedEarly ? ' (stopped early)' : ''}`)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
