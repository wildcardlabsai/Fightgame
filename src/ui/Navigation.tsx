import { useEffect, useMemo, useRef, useState } from 'react'
import { attentionItems } from '../engine/selectors'
import { HistoryButtons, SearchButton } from './components/Palette'
import '../styles/desktop.css'
import { createPortal } from 'react-dom'
import { useGame } from '../store/gameStore'
import { AudioToggle } from './components/AudioStatus'
import { Icon } from './components/Icons'
import { activeGroup, activeItem, BOTTOM, bottomActive, itemActive, NAV, type NavGroup, type NavItem } from './nav'

/**
 * Desktop: a compact, persistent left sidebar. One entry per primary destination (the same groups the phone's More sheet uses); the screens inside a
 * group are the tab strip directly under the top bar (SectionBar), so every screen is one click from its section and the sidebar stays short.
 * Choosing a group opens its first screen; choosing the group you are already in does nothing.
 */
export function SideNav({ unread }: { unread: number }) {
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const current = activeGroup(route)
  return (
    <nav className="sidenav" aria-label="Main" data-testid="topnav">
      <a className="sb-brand" href="#/dashboard" aria-label="The Promoter home"><img src={`${import.meta.env.BASE_URL}brand/the-promoter.png`} alt="The Promoter" /></a>
      <ul className="sb-list">
        {NAV.map((g) => {
          const active = current.id === g.id
          const first = g.items[0]
          return (
            <li key={g.id}>
              <button type="button" data-sfx="navigate" data-testid={`nav-${g.id}`} className={`sb-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}
                title={g.items.length > 1 ? `${g.label}: ${g.items.map((i) => i.label).join(', ')}` : g.label} data-label={g.label} data-sub={g.items.length > 1 ? g.items.map((i) => i.label).join(' · ') : undefined}
                onClick={() => { if (!active) navigate(first.screen, first.param) }}>
                <Icon name={g.icon} /><span className="sb-label">{g.label}</span>
                {g.id === 'inbox' && unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Desktop top-bar actions: inbox shortcut, sound, and time controls. (Phones use the bottom bar and the More sheet.) */
/** History, search, the next-thing-to-do hint and the save status: one strip under the top bar, on every screen. */
export function NavTools() {
  const navigate = useGame((s) => s.navigate)
  const game = useGame((s) => s.game)!
  const items = useMemo(() => attentionItems(game), [game])
  const urgent = items.filter((a) => a.severity !== 'info')
  const top = urgent[0] ?? items[0]
  const go = () => { if (!top) return navigate('dashboard'); if (top.link?.kind === 'fighter') navigate('fighter', top.link.id); else navigate((top.link?.screen ?? 'dashboard') as never) }
  return (
    <div className="nav-tools">
      <button type="button" className={`hud-next ${top ? top.severity : 'clear'}`} data-testid="continue-hint" onClick={go} title={top ? `${top.title}. ${top.detail}` : 'Nothing needs your attention'}>
        <span className="hn-dot" aria-hidden="true" />
        <span className="hn-text">{top ? top.title : 'All clear'}</span>
        {items.length > 1 && <b className="hn-count">+{items.length - 1}</b>}
      </button>
      <SearchButton />
      <HistoryButtons />
      <SavedIndicator />
    </div>
  )
}

/** "Saved 2m ago": reassurance that the career is safe on this device. */
function SavedIndicator() {
  const at = useGame((s) => s.savedAt)
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(t) }, [])
  if (!at) return <span className="hud-saved" title="Not saved yet">Not saved yet</span>
  const m = Math.floor((Date.now() - at) / 60_000)
  return <span className="hud-saved" data-testid="saved-indicator" title={`Last saved ${new Date(at).toLocaleTimeString()}`}>✓ Saved{m < 1 ? '' : ` ${m}m ago`}</span>
}

export function TopActions({ unread }: { unread: number }) {
  const advance = useGame((s) => s.advance)
  const navigate = useGame((s) => s.navigate)
  return (
    <div className="hud-desk">
      <button type="button" className="hud-bell" data-sfx="navigate" data-testid="hud-inbox" aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'} onClick={() => navigate('inbox')}>
        <Icon name="inbox" />{unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
      </button>
      <AudioToggle compact />
      <button className="btn ghost small" onClick={() => advance(4)} title="Advance four weeks (stops early if something urgent happens)">+4 Weeks</button>
      <button className="btn primary" data-guide="advance" onClick={() => advance(1)}>Advance Week ▸</button>
    </div>
  )
}

/** The row under the primary bar: the current section's screens, so moving around inside a section is one click. */
export function SectionBar() {
  const route = useGame((s) => s.route)
  const navigate = useGame((s) => s.navigate)
  const { group } = activeItem(route)
  return (
    <div className="subnav" role="navigation" aria-label={`${group.label} sections`} data-testid="subnav">
      <span className="sn-title caps">{group.label}</span>
      {group.items.length > 1 && group.items.map((it) => (
        <button key={it.id} type="button" data-sfx="tab" disabled={!!it.locked} title={it.locked} data-testid={`sub-${it.id}`}
          className={`sn-item${itemActive(group, it, route) ? ' active' : ''}${it.locked ? ' locked' : ''}`} aria-current={itemActive(group, it, route) ? 'page' : undefined}
          onClick={() => navigate(it.screen, it.param)}>{it.label}{it.locked && <span className="tag">soon</span>}</button>
      ))}
      <NavTools />
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
