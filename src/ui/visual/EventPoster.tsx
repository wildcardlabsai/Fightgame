import { useEffect } from 'react'
import { resolveEventTemplate, resolveFighterImage, type PosterTemplateId } from '../../assets/registry'
import { formatDay } from '../../engine/calendar'
import type { EventPosterView, PosterFighter } from '../../engine/eventPoster'
import { FighterPortrait } from './FighterPortrait'
import { Img, preloadImages } from './Img'
import { PromoMark, promoAccent } from './PromoMark'
import { VenueImage } from './VenueImage'

const TEMPLATE_BG: Record<PosterTemplateId, string> = {
  'fight-night': '#7a0f19', championship: '#4a3410', rivalry: '#3a0a14', 'main-event': '#1a1a2e', ppv: '#16103a', international: '#0e2a3a', 'next-generation': '#0f2a1c', 'big-event': '#2a1a05',
}

const surname = (f: PosterFighter) => f.lastName.toUpperCase()

/**
 * Event poster, ASSEMBLED from parts (template background + both main-event portraits + promotion mark + venue image +
 * show facts). There is no per-event artwork, so any show — including AI promotions' — always has a poster.
 */
export function EventPoster({ v, size = 'card', onClick }: { v: EventPosterView; size?: 'lead' | 'card' | 'mini'; onClick?: () => void }) {
  const tpl = resolveEventTemplate(v.templateId)
  const accent = promoAccent(v.promotion)
  useEffect(() => {
    if (size === 'lead' && v.main) preloadImages([tpl.url, resolveFighterImage(v.main.a, 'profile').url, resolveFighterImage(v.main.b, 'profile').url])
  }, [size, v.main, tpl.url])
  const pSize = size === 'lead' ? 'xl' : size === 'card' ? 'large' : 'card'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`v-poster ${size} t-${v.templateId}`} style={{ ['--accent' as string]: accent, ['--tbg' as string]: TEMPLATE_BG[v.templateId] }}
      {...(onClick ? { onClick, type: 'button' as const } : {})} data-template={v.templateId} data-event-id={v.id} data-asset-state={tpl.state}
      aria-label={`${v.name}${v.main ? `: ${v.main.a.name} versus ${v.main.b.name}` : ''}, ${formatDay(v.day, false)}, ${v.venue.name}`}
    >
      <span className="v-poster-bg" aria-hidden><Img src={tpl.url} alt="" fallback={null} /></span>
      <span className="v-poster-venue" aria-hidden><VenueImage venue={{ name: v.venue.name, tier: v.venue.tier, capacity: v.venue.capacity }} /></span>
      <span className="v-poster-top">
        <PromoMark p={{ id: v.promotion.id, logo: v.promotion.logo, name: v.promotion.name }} size={size === 'mini' ? 26 : 38} />
        <span className="v-poster-promo"><b>{v.promotion.name}</b><i>{v.templateLabel}</i></span>
        <span className="v-poster-badges">
          {v.championship && <em className="gold">TITLE FIGHT</em>}
          {v.ppv && <em className="ppv">PPV</em>}
          {!v.ppv && v.broadcastLabel && size !== 'mini' && <em>{v.broadcastLabel}</em>}
          {v.soldOut && <em className="good">SOLD OUT</em>}
        </span>
      </span>
      {v.main ? (
        <span className="v-poster-mid">
          <span className="v-poster-fighter a"><FighterPortrait f={v.main.a} size={pSize} eager={size === 'lead'} /><b>{surname(v.main.a)}</b>{size !== 'mini' && <i>{v.main.a.record}</i>}</span>
          <span className="v-poster-vs display">VS</span>
          <span className="v-poster-fighter b"><FighterPortrait f={v.main.b} size={pSize} eager={size === 'lead'} /><b>{surname(v.main.b)}</b>{size !== 'mini' && <i>{v.main.b.record}</i>}</span>
        </span>
      ) : <span className="v-poster-mid empty"><span className="dim">Main event to be announced</span></span>}
      <span className="v-poster-foot">
        <span className="v-poster-title display">{v.name}</span>
        <span className="v-poster-meta">{formatDay(v.day, false)} · {v.venue.name}, {v.city}</span>
        {size !== 'mini' && <span className="v-poster-meta dim">{v.fights} fight{v.fights === 1 ? '' : 's'} · {v.venue.capacity.toLocaleString('en-GB')} capacity{v.soldPct !== null ? ` · ${v.soldPct}% sold` : ''}</span>}
      </span>
    </Tag>
  )
}
