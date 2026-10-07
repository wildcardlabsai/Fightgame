/**
 * DEVELOPMENT-ONLY asset gallery (compiled out of production builds).
 * Shows the shipped placeholder art, every asset in the generation queue with its status, and what is missing,
 * generated or failed. Missing assets are drawn with a dashed red frame so they are impossible to overlook.
 */
import { useMemo, useState } from 'react'
import { assetUrl, galleryEntries, MANIFEST, resolveFighterImage } from '../../assets/registry'
import type { GenAsset, GenManifest } from '../../assetgen/types'
import genJson from '../../../asset-pipeline/generation-manifest.json'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'

const GEN = genJson as unknown as GenManifest
type Tab = 'all' | 'fighters' | 'promotions' | 'venues' | 'news' | 'missing' | 'generated' | 'failed' | 'shipped'
const TABS: Tab[] = ['all', 'fighters', 'promotions', 'venues', 'news', 'missing', 'generated', 'failed', 'shipped']
type Load = 'loading' | 'loaded' | 'missing'

function Tile({ a, label }: { a: GenAsset; label?: string }) {
  const [state, setState] = useState<Load>('loading')
  const [size, setSize] = useState('')
  const hasFile = a.status === 'COMPLETE' || a.status === 'PENDING_REVIEW'
  const shown = hasFile && state !== 'missing'
  const tall = a.height > a.width
  return (
    <div className={`v-gal st-${a.status.toLowerCase()}${!shown ? ' is-missing' : ''}`} data-asset-id={a.assetId} data-status={a.status}>
      <div className={`v-gal-img${tall ? ' tall' : ''}`}>
        {hasFile ? <img src={assetUrl(a.outputPath)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onLoad={(e) => { setState('loaded'); setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`) }} onError={() => setState('missing')} /> : <span className="v-gal-miss">MISSING</span>}
      </div>
      <b>{label ?? a.entityId}</b>
      <span>{a.entityType} · {a.assetType} · {a.priority}</span>
      <span>{a.assetId}</span>
      <span className="dim">{a.outputPath}</span>
      <span>{a.width}×{a.height}{size ? ` · measured ${size}` : ''}</span>
      <span className={`chip ${a.status === 'COMPLETE' ? 'good' : a.status === 'FAILED' ? 'red' : a.status === 'PENDING_REVIEW' ? 'gold' : ''}`}>{a.status}{state === 'missing' ? ' · file not found' : ''}</span>
      {a.error && <span className="red">{a.error}</span>}
    </div>
  )
}

export function AssetGallery() {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const [tab, setTab] = useState<Tab>('all')
  const [limit, setLimit] = useState(60)
  const names = useMemo(() => new Map(views.known().map((v) => [v.id, v.name])), [views])
  const counts = useMemo(() => GEN.assets.reduce<Record<string, number>>((n, a) => { n[a.status] = (n[a.status] ?? 0) + 1; return n }, {}), [])
  const sameWorld = game.seed === GEN.world.seed
  const list = GEN.assets.filter((a) => {
    switch (tab) {
      case 'fighters': return a.entityType === 'fighter'
      case 'promotions': return a.entityType === 'promotion'
      case 'venues': return a.entityType === 'venue'
      case 'news': return a.entityType === 'news'
      case 'missing': return a.status !== 'COMPLETE' && a.status !== 'PENDING_REVIEW'
      case 'generated': return a.status === 'COMPLETE' || a.status === 'PENDING_REVIEW'
      case 'failed': return a.status === 'FAILED'
      case 'shipped': return false
      default: return true
    }
  })
  const shipped = galleryEntries()
  const fighterSample = views.mine().concat(views.freeAgents()).slice(0, 8)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Asset gallery</h1>
        <p className="sub">Development only. Queue for world “{GEN.world.seed}”{sameWorld ? ' (this game)' : ` — this game uses “${game.seed}”, so fighter art will not show here`}: {GEN.assets.length} assets · {Object.entries(counts).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ')}.</p></div></div>
      <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); setLimit(60) }}>{t}</button>)}</div>
      {tab === 'shipped' ? (
        <>
          <p className="dim" style={{ marginBottom: 10 }}>Placeholder SVG art that ships with the game ({shipped.length} registry entries).</p>
          <div className="v-gallery">{shipped.map((e) => (
            <div key={e.assetId} className="v-gal" data-asset-id={e.assetId}><div className="v-gal-img">{e.state !== 'real' || e.file.includes('{') || e.file.startsWith('(') ? <span className="v-gal-miss">FALLBACK</span> : <img src={e.file} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div><b>{e.entityId}</b><span>{e.type} · {e.kind}</span><span>{e.assetId}</span><span>{e.width}×{e.height}</span><span className="chip">{e.state}</span></div>))}
          </div>
          <h2 className="display" style={{ fontSize: 24, margin: '20px 0 8px' }}>Sample fighters (runtime resolution)</h2>
          <div className="v-gallery">{fighterSample.map((f) => { const a = resolveFighterImage(f); return <div key={f.id} className="v-gal"><b>{f.name}</b><span>{a.assetId}</span><span className="chip">{a.state}</span></div> })}</div>
          <p className="dim">Classes: {Object.entries(MANIFEST.classes).map(([k, c]) => `${k} (${c.ids.length})`).join(' · ')}</p>
        </>
      ) : (
        <>
          <div className="v-gallery" data-testid="gallery-list">{list.slice(0, limit).map((a) => <Tile key={a.assetId} a={a} label={a.entityType === 'fighter' && sameWorld ? `${names.get(a.entityId) ?? a.entityId}` : undefined} />)}</div>
          {list.length > limit && <p style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => setLimit(limit + 120)}>Show more ({list.length - limit} left)</button></p>}
          {list.length === 0 && <p className="empty">Nothing in this view.</p>}
        </>
      )}
    </>
  )
}
