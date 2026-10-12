import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Avatar, Flag } from './Bits'
import { StatusStrip } from './StatusStrip'

/**
 * A quick look at any fighter without leaving the page: hover (or keyboard-focus) a name or portrait anywhere that carries `data-fighter-id`.
 * Shows who they are, how they stand, your tags and note, and the next steps. Pointer devices only; on touch the tap opens the profile as before.
 */
export function FighterPopover() {
  const views = useViews()
  const navigate = useGame((s) => s.navigate)
  const toggleShortlist = useGame((s) => s.toggleShortlist)
  const [at, setAt] = useState<{ id: string; x: number; y: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const over = useRef(false)
  useEffect(() => {
    let fine = true
    try { fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches } catch { /* assume a pointer */ }
    if (!fine) return
    const target = (e: Event): HTMLElement | null => (e.target as HTMLElement | null)?.closest?.('[data-fighter-id]') ?? null
    const show = (el: HTMLElement) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect(), id = el.getAttribute('data-fighter-id')
        if (!id) return
        const w = 330, left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), below = r.bottom + 8, top = below + 280 > window.innerHeight ? Math.max(8, r.top - 288) : below
        setAt({ id, x: left, y: top })
      }, 420)
    }
    const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { if (!over.current) setAt(null) }, 160) }
    const mo = (e: MouseEvent) => { const el = target(e); if (el) show(el) }
    const mout = (e: MouseEvent) => { if (target(e)) hide() }
    const fin = (e: FocusEvent) => { const el = target(e); if (el) show(el) }
    const away = () => { window.clearTimeout(timer.current); setAt(null) }
    document.addEventListener('mouseover', mo); document.addEventListener('mouseout', mout); document.addEventListener('focusin', fin)
    window.addEventListener('scroll', away, true); window.addEventListener('hashchange', away); document.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement | null)?.closest?.('.fpop')) away() })
    return () => { document.removeEventListener('mouseover', mo); document.removeEventListener('mouseout', mout); document.removeEventListener('focusin', fin); window.removeEventListener('scroll', away, true); window.removeEventListener('hashchange', away); window.clearTimeout(timer.current) }
  }, [])
  const v = at ? views.fighter(at.id) : null
  if (!at || !v) return null
  const mine = v.own !== null
  return (
    <div className="fpop" style={{ left: at.x, top: at.y }} role="dialog" aria-label={`${v.name} summary`} data-testid="fighter-popover"
      onMouseEnter={() => { over.current = true }} onMouseLeave={() => { over.current = false; setAt(null) }}>
      <div className="fpop-head">
        <Avatar f={v} large />
        <div className="fpop-id">
          {v.nickname && <small className="gold">“{v.nickname}”</small>}
          <b className="display">{v.name}</b>
          <span className="dim">{v.recordText} · age {v.age} · {v.division} <Flag code={v.nationKey} /></span>
        </div>
      </div>
      <StatusStrip v={v} />
      {(v.myTags.length > 0 || v.myNote) && <div className="fpop-notes">{v.myTags.map((t) => <span key={t} className="chip tag-chip on">{t}</span>)}{v.myNote && <p className="dim">{v.myNote}</p>}</div>}
      <div className="fpop-actions">
        <button type="button" className="btn small primary" onClick={() => { setAt(null); navigate('fighter', v.id) }}>Open profile</button>
        <button type="button" className="btn small" aria-pressed={v.shortlisted} onClick={() => toggleShortlist(v.id)}>{v.shortlisted ? '★ Shortlisted' : '☆ Shortlist'}</button>
        {mine && <button type="button" className="btn small ghost" onClick={() => { setAt(null); navigate('matchmaking', v.id) }}>Find opponent</button>}
      </div>
    </div>
  )
}
