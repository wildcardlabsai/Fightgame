import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGame } from '../store/gameStore'
import { AudioToggle } from './components/AudioStatus'
import { Icon } from './components/Icons'
import { activeGroup, activeItem, BOTTOM, bottomActive, itemActive, NAV, type NavGroup, type NavItem } from './nav'

/** Desktop: primary destinations as cut-corner tabs, each opening a dropdown of the screens beneath it. */
export function TopNav({ unread }: { unread: number }) {
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const advance = useGame((s) => s.advance)
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  const current = activeGroup(route)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => setOpen(null), [route.screen, route.param])
  const go = (it: NavItem) => { if (it.locked) return; setOpen(null); navigate(it.screen, it.param) }

  return (
    <nav className="topnav" aria-label="Main" ref={ref} data-testid="topnav">
      <a className="tn-brand" href="#/dashboard" aria-label="Fight Empire home"><img src="/brand/wordmark.png" alt="Fight Empire" /></a>
      <ul className="tn-primary">
        {NAV.map((g) => {
          const single = g.items.length === 1
          const active = current.id === g.id
          return (
            <li key={g.id} className="tn-li">
              <button type="button" data-sfx="navigate" data-testid={`nav-${g.id}`} className={`tn-tab${active ? ' active' : ''}${open === g.id ? ' open' : ''}`}
                aria-current={active ? 'page' : undefined} aria-haspopup={single ? undefined : 'menu'} aria-expanded={single ? undefined : open === g.id}
                onClick={() => (single ? go(g.items[0]) : setOpen(open === g.id ? null : g.id))}>
                <Icon name={g.icon} /><span>{g.label}</span>
                {g.id === 'inbox' && unread > 0 && <b className="badge">{unread}</b>}
                {!single && <i className="caret" aria-hidden>▾</i>}
              </button>
              {open === g.id && !single && (
                <ul className="tn-menu" role="menu" aria-label={g.label}>
                  {g.items.map((it) => (
                    <li key={it.id} role="none">
                      <button type="button" role="menuitem" data-sfx="navigate" data-testid={`nav-item-${it.id}`} disabled={!!it.locked} title={it.locked}
                        className={`tn-item${itemActive(g, it, route) ? ' active' : ''}${it.locked ? ' locked' : ''}`} onClick={() => go(it)}>
                        <Icon name={it.icon} />{it.label}{it.locked && <span className="tag">soon</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="tn-right">
        <AudioToggle />
        <button className="btn ghost small" onClick={() => advance(4)} title="Advance four weeks (stops early if something urgent happens)">+4 Weeks</button>
        <button className="btn primary" onClick={() => advance(1)}>Advance Week ▸</button>
      </div>
    </nav>
  )
}

/** The row under the primary bar: the current section's screens, so moving around inside a section is one click. */
export function SectionBar() {
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const { group } = activeItem(route)
  if (group.items.length < 2) return null
  return (
    <div className="subnav" role="navigation" aria-label={`${group.label} sections`} data-testid="subnav">
      <span className="sn-title caps">{group.label}</span>
      {group.items.map((it) => (
        <button key={it.id} type="button" data-sfx="tab" disabled={!!it.locked} title={it.locked} data-testid={`sub-${it.id}`}
          className={`sn-item${itemActive(group, it, route) ? ' active' : ''}${it.locked ? ' locked' : ''}`} aria-current={itemActive(group, it, route) ? 'page' : undefined}
          onClick={() => navigate(it.screen, it.param)}>{it.label}{it.locked && <span className="tag">soon</span>}</button>
      ))}
    </div>
  )
}

/** Phones: a persistent bottom bar with five destinations; More opens the rest. */
export function BottomNav({ unread }: { unread: number }) {
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const [more, setMore] = useState(false)
  const active = bottomActive(route)
  useEffect(() => setMore(false), [route.screen, route.param])
  return (
    <>
      <nav className="bottomnav" aria-label="Main" data-testid="bottomnav">
        {BOTTOM.map((b) => (
          <button key={b.id} type="button" data-sfx="navigate" data-testid={`bn-${b.id}`} className={`bn-item${active === b.id ? ' active' : ''}${b.id === 'more' && more ? ' open' : ''}`}
            aria-current={active === b.id ? 'page' : undefined} aria-haspopup={b.id === 'more' ? 'dialog' : undefined} aria-expanded={b.id === 'more' ? more : undefined}
            onClick={() => (b.screen ? (setMore(false), navigate(b.screen)) : setMore((m) => !m))}>
            <span className="bn-icon"><Icon name={b.icon} />{b.id === 'inbox' && unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}</span>
            <span className="bn-label">{b.label}</span>
          </button>
        ))}
      </nav>
      {more && <MoreSheet onClose={() => setMore(false)} />}
    </>
  )
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const advance = useGame((s) => s.advance)
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // everything that is not one of the four primary tabs, grouped
  const sections: { group: NavGroup; items: NavItem[] }[] = NAV.filter((g) => g.id !== 'home' && g.id !== 'inbox').map((g) => ({
    group: g,
    // Fighters and Events are already in the bar: show only what is beneath them
    items: g.id === 'roster' ? g.items.filter((i) => i.id !== 'fighters') : g.id === 'events' ? g.items.filter((i) => i.id !== 'events') : g.items,
  }))
  return createPortal(
    <div className="sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} data-testid="more-sheet">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="More">
        <div className="sheet-head"><span className="display">More</span><button type="button" className="linkbtn" onClick={onClose}>Close</button></div>
        <button type="button" className="sheet-item" data-testid="more-plus4" onClick={() => { advance(4); onClose() }}><span>Advance four weeks</span></button>
        {sections.map(({ group, items }, gi) => (
          <div className="sheet-group" key={group.id}>
            <div className="caps">{group.label}</div>
            <div className="sheet-items">
              {items.map((it, ii) => (
                <button key={it.id} ref={gi === 0 && ii === 0 ? first : undefined} type="button" data-sfx="navigate" data-testid={`more-${it.id}`} disabled={!!it.locked}
                  className={`sheet-item${itemActive(group, it, route) ? ' active' : ''}${it.locked ? ' locked' : ''}`} onClick={() => navigate(it.screen, it.param)}>
                  <Icon name={it.icon} /><span>{it.label}</span>{it.locked && <span className="tag">soon</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>, document.body)
}
