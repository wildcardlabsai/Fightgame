import { useMemo, useState, type ReactNode } from 'react'
import { VENUE_KIND_LABEL, venueKind } from '../../assets/registry'
import { formatDay } from '../../engine/calendar'
import { Stars, RiskChip } from '../components/Bits'
import { VenueImage } from '../business/VenueImage'
import { money } from '../format'
import { VenueFacts } from './VenueFacts'
import { CAP_BUCKETS, filterRows, type Filters, type VenueRow, NO_FILTERS } from './venueInfo'
import '../../styles/venues54.css'

const num = (n: number) => Math.round(n).toLocaleString('en-GB')
const marketWord = (m: number) => (m >= 1.3 ? 'Huge' : m >= 1.05 ? 'Strong' : m >= 0.85 ? 'Average' : 'Small')
const range = (r: { lo: number; hi: number }) => (Math.round(r.lo) === Math.round(r.hi) ? num(r.lo) : `${num(r.lo)} to ${num(r.hi)}`)

export const BROWSE_SORTS = [['capacity', 'Capacity (small first)'], ['capacity-desc', 'Capacity (large first)'], ['cost', 'Booking cost'], ['name', 'Name']] as const
export const FIT_SORTS = [['fit', 'Best fit first'], ['attendance', 'Expected attendance'], ['capacity', 'Capacity (small first)'], ['capacity-desc', 'Capacity (large first)'], ['cost', 'Booking cost'], ['name', 'Name']] as const

export function VenueFilters({ rows, f, set, sorts, showFree }: { rows: VenueRow[]; f: Filters; set: (p: Partial<Filters>) => void; sorts: readonly (readonly [string, string])[]; showFree?: boolean }) {
  const countries = useMemo(() => [...new Set(rows.map((r) => r.place.countryName))].sort(), [rows])
  return (
    <div className="vn-filters" role="search" aria-label="Filter venues">
      <label className="field vn-f-q"><span className="caps">Search</span>
        <input className="input" type="search" data-testid="venue-search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name, city, region" aria-label="Search venues" /></label>
      <label className="field"><span className="caps">Tier</span>
        <select className="select" data-testid="venue-filter-tier" value={f.tier} onChange={(e) => set({ tier: e.target.value })} aria-label="Filter by tier">
          {['all', 'local', 'regional', 'national', 'arena', 'stadium'].map((t) => <option key={t} value={t}>{t === 'all' ? 'All tiers' : t[0].toUpperCase() + t.slice(1)}</option>)}</select></label>
      <label className="field"><span className="caps">Country</span>
        <select className="select" data-testid="venue-filter-country" value={f.country} onChange={(e) => set({ country: e.target.value })} aria-label="Filter by country">
          <option value="all">All countries</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="field"><span className="caps">Capacity</span>
        <select className="select" data-testid="venue-filter-capacity" value={f.cap} onChange={(e) => set({ cap: e.target.value })} aria-label="Filter by capacity">
          {CAP_BUCKETS.map((b) => <option key={b.k} value={b.k}>{b.label}</option>)}</select></label>
      <label className="field"><span className="caps">Real or generic</span>
        <select className="select" data-testid="venue-filter-type" value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="Real or generic venues">
          <option value="all">Real and generic</option><option value="real">Real venues</option><option value="generic">Generic halls</option></select></label>
      <label className="field"><span className="caps">Sort by</span>
        <select className="select" data-testid="venue-sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort venues">
          {sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="vn-checks">
        <label className="vn-check"><input type="checkbox" data-testid="venue-filter-avail" checked={f.avail} onChange={(e) => set({ avail: e.target.checked })} /> Available to my promotion</label>
        {showFree && <label className="vn-check"><input type="checkbox" data-testid="venue-filter-free" checked={f.free} onChange={(e) => set({ free: e.target.checked })} /> Free on the event date</label>}
      </div>
    </div>
  )
}

/** Filter state + the filtered rows, with a "show more" window so at most `page` cards render at first. */
export function useVenueList(rows: VenueRow[], defaultSort: string, page = 40) {
  const [f, setF] = useState<Filters>({ ...NO_FILTERS, sort: defaultSort })
  const [shown, setShown] = useState(page)
  const set = (p: Partial<Filters>) => { setF((x) => ({ ...x, ...p })); setShown(page) }
  const list = useMemo(() => filterRows(rows, f), [rows, f])
  return { f, set, list, visible: list.slice(0, shown), more: list.length - shown > 0 ? list.length - shown : 0, showMore: () => setShown((n) => n + page) }
}

export function ShowMore({ more, onClick }: { more: number; onClick: () => void }) {
  return more > 0 ? <div className="vn-more"><button type="button" className="btn" data-testid="venue-more" onClick={onClick}>Show more ({more} more)</button></div> : null
}

export function VenueRowCard({ r, mode, best, action, selected }: { r: VenueRow; mode: 'browse' | 'fit'; best?: boolean; action?: ReactNode; selected?: boolean }) {
  const { v, place, fit } = r
  const kind = venueKind(v)
  const where = [v.city, place.region && place.region !== v.city ? place.region : null, place.countryName].filter(Boolean).join(', ')
  return (
    <article className={`vn-card${v.locked ? ' locked' : ''}${best ? ' best' : ''}${selected ? ' sel' : ''}`} data-testid={mode === 'fit' ? 'venue-fit-row' : 'venue-card'} data-venue-id={v.id} data-real={place.real ? 'yes' : 'no'}>
      <VenueImage venue={v} />
      <div className="vn-body">
        <div className="vn-top">
          <h3 className="vn-name">{v.name}</h3>
          <div className="vn-chips">
            {best && <span className="chip good" data-testid="venue-best">Best fit</span>}
            <span className="chip">{v.tierLabel}</span>
            <span className={`chip ${place.real ? 'gold' : ''}`}>{place.real ? 'Real venue' : 'Generic hall'}</span>
          </div>
        </div>
        <div className="dim vn-where">{where} · {place.kind ? place.kind[0].toUpperCase() + place.kind.slice(1) : VENUE_KIND_LABEL[kind]}</div>
        <dl className="vn-stats">
          <div><dt>Boxing capacity</dt><dd className="num">{num(v.capacity)}</dd></div>
          <div><dt>Booking cost</dt><dd className="num">{money(v.hireCost, false)}</dd></div>
          {mode === 'browse' && <>
            <div><dt>Production</dt><dd className="num">{v.production}/5</dd></div>
            <div><dt>Prestige</dt><dd><Stars n={v.prestige} /></dd></div>
            <div><dt>Market</dt><dd>{marketWord(v.market)} (×{v.market.toFixed(2)})</dd></div>
            <div><dt>Card size</dt><dd className="num">{v.minFights}–{v.maxFights} fights</dd></div>
          </>}
          {fit && <>
            <div><dt>Expected attendance</dt><dd className="num" data-testid="venue-attendance">{range(fit.attendance)}</dd></div>
            <div><dt>Break-even</dt><dd className="num" data-testid="venue-breakeven">{fit.breakEven === null ? 'n/a' : num(fit.breakEven)}</dd></div>
            <div><dt>Travel bill</dt><dd className="num" data-testid="venue-travel">{money(fit.travel, false)}</dd></div>
            <div><dt>Forecast profit</dt><dd className="num">{money(fit.profit.lo)} to {money(fit.profit.hi)}</dd></div>
          </>}
        </dl>
        {fit && (
          <div className="vn-verdict">
            <span className={`chip ${fit.verdict === 'good fit' ? 'good' : fit.verdict === 'too big' || fit.verdict === 'loses money' ? 'red' : 'gold'}`} data-testid="venue-verdict">{fit.verdict}</span>
            <span data-testid="venue-risk"><RiskChip risk={fit.risk} /></span>
            <span className={`chip ${fit.free ? 'good' : 'red'}`}>{fit.free ? 'Free on the date' : 'Booked on the date'}</span>
          </div>
        )}
        {fit?.homeNote && <p className="vn-home">{fit.homeNote}</p>}
        {mode === 'browse' && (
          <div className="vn-avail dim">
            {v.locked ? null : v.freeDates.length ? `Next free: ${v.freeDates.slice(0, 3).map((d) => formatDay(d, false)).join(' · ')}` : 'No free Saturdays soon'}
            {v.bookedBy.length > 0 && <div>Bookings: {v.bookedBy.slice(0, 3).map((b) => `${formatDay(b.day, false)}${b.mine ? ' (you)' : ''}`).join(' · ')}</div>}
          </div>
        )}
        {v.locked && <p className="warn vn-lock" data-testid="venue-locked">🔒 {v.locked}</p>}
        <VenueFacts place={place} />
        {action}
      </div>
    </article>
  )
}
