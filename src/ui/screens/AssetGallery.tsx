/**
 * DEVELOPMENT-ONLY asset gallery (not reachable in production builds: the route and its code are compiled out).
 * Shows every asset class the registry knows, with the entity, filename/id, declared and measured size, and whether the
 * file loaded, is missing, or the fallback is in use.
 */
import { useState } from 'react'
import { galleryEntries, NEWS_KINDS, POSTER_TEMPLATES, resolveEventTemplate, resolveFighterImage, resolveNewsKind, resolvePromotionImage, resolveVenueKind, VENUE_KINDS, type ResolvedAsset } from '../../assets/registry'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { FighterPortrait } from '../visual/FighterPortrait'
import { PromoMark } from '../visual/PromoMark'

type Load = 'loading' | 'loaded' | 'missing' | 'fallback'
function Tile({ a, label, tall }: { a: ResolvedAsset; label: string; tall?: boolean }) {
  const [state, setState] = useState<Load>(a.url ? 'loading' : 'fallback')
  const [size, setSize] = useState('')
  return (
    <div className="v-gal" data-asset-id={a.assetId} data-load={state}>
      <div className={`v-gal-img${tall ? ' tall' : ''}`}>
        {a.url ? <img src={a.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onLoad={(e) => { setState('loaded'); setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`) }} onError={() => setState('missing')} /> : <span className="dim" style={{ padding: 8, display: 'block' }}>fallback in use</span>}
      </div>
      <b>{label}</b>
      <span>{a.assetId}</span>
      <span className="dim">{a.url ?? '(no file)'}</span>
      <span>declared {a.width}×{a.height}{size ? ` · measured ${size}` : ''}</span>
      <span className={state === 'loaded' ? 'good' : state === 'missing' ? 'red' : 'dim'}>{state}</span>
    </div>
  )
}

export function AssetGallery() {
  const game = useGame((s) => s.game)!
  const views = useViews()
  const fighters = views.mine().concat(views.freeAgents()).slice(0, 12)
  const promos = Object.values(game.promotions).slice(0, 6)
  const rows = galleryEntries()
  const counts = { real: rows.filter((r) => r.state === 'real').length, fallback: rows.filter((r) => r.state === 'fallback').length }
  return (
    <>
      <div className="page-head"><div><h1 className="display">Asset gallery</h1><p className="sub">Development only. {rows.length} registry entries · {counts.real} with real files · {counts.fallback} on fallbacks.</p></div></div>
      <section className="section"><div className="section-head"><h2>Fighters</h2></div>
        <div className="v-gallery">{fighters.map((f) => { const a = resolveFighterImage(f, 'profile'); return (
          <div key={f.id} className="v-gal" data-asset-id={a.assetId}><FighterPortrait f={f} size="large" /><b>{f.name}</b><span>{a.assetId}</span><span className="dim">{a.url ?? 'fallback: silhouette + initials'}</span><span>profile · action · celebration: {(['profile', 'action', 'celebration'] as const).map((v) => resolveFighterImage(f, v).state).join(' / ')}</span></div>) })}</div></section>
      <section className="section"><div className="section-head"><h2>Venues</h2></div>
        <div className="v-gallery">{VENUE_KINDS.map((k) => <Tile key={k} a={resolveVenueKind(k)} label={k} />)}</div></section>
      <section className="section"><div className="section-head"><h2>Promotions</h2></div>
        <div className="v-gallery">{promos.map((p) => { const a = resolvePromotionImage(p.id); return <div key={p.id} className="v-gal" data-asset-id={a.assetId}><PromoMark p={p} size={64} /><b>{p.name}</b><span>{a.assetId}</span><span className="dim">{a.state === 'real' ? a.url : 'fallback: generated monogram'}</span></div> })}</div></section>
      <section className="section"><div className="section-head"><h2>Event poster templates</h2></div>
        <div className="v-gallery">{POSTER_TEMPLATES.map((t) => <Tile key={t} a={resolveEventTemplate(t)} label={t} tall />)}</div></section>
      <section className="section"><div className="section-head"><h2>News</h2></div>
        <div className="v-gallery">{NEWS_KINDS.map((k) => <Tile key={k} a={resolveNewsKind(k)} label={k} />)}</div></section>
    </>
  )
}
