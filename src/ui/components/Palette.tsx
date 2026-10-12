import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../../store/gameStore'
import { goBack, goForward, recentRoutes, useNavHistory } from '../../store/navHistory'
import { useUi } from '../../store/ui'
import { searchAll, routeTitle, type ScreenEntry, type SearchHit } from '../../engine/search'
import { NAV } from '../nav'
import { Avatar } from './Bits'
import { Icon } from './Icons'

const SCREENS: ScreenEntry[] = NAV.flatMap((g) => g.items.filter((i) => !i.locked).map((i) => ({ id: i.id, label: i.label, screen: i.screen, param: i.param, group: g.label })))

const isTyping = (t: EventTarget | null): boolean => { const e = t as HTMLElement | null; return !!e && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable) }

/** Global keyboard shortcuts. Ignored while typing in a field. */
export function useShortcuts(): void {
  // Dropdown menus built on <details> (columns, views) close when you click elsewhere or press Esc.
  useEffect(() => {
    const closeAll = (except?: Element | null) => document.querySelectorAll('details.col-menu[open]').forEach((d) => { if (d !== except) d.removeAttribute('open') })
    const click = (e: MouseEvent) => closeAll((e.target as HTMLElement | null)?.closest?.('details.col-menu'))
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('click', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('click', click); document.removeEventListener('keydown', key) }
  }, [])
  const advance = useGame((s) => s.advance)
  const navigate = useGame((s) => s.navigate)
  useEffect(() => {
    let g = 0
    const GO: Record<string, [string, string?]> = { o: ['dashboard'], i: ['inbox'], r: ['fighters'], s: ['scouting'], e: ['events'], c: ['calendar'], m: ['matchmaking'], f: ['finances'], w: ['rankings'], t: ['titles'], n: ['news'] }
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); useUi.getState().openPalette(); return }
      if (mod && e.key === 'Enter') { e.preventDefault(); advance(e.shiftKey ? 4 : 1); return }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return }
      if (e.key === 'Escape') { if (useUi.getState().palette || useUi.getState().help) { useUi.setState({ palette: false, help: false }) } return }
      if (isTyping(e.target) || mod || e.altKey) return
      if (e.key === '/') { e.preventDefault(); useUi.getState().openPalette(); return }
      if (e.key === '?') { e.preventDefault(); useUi.getState().toggleHelp(); return }
      if (e.key === '[') { goBack(); return }
      if (e.key === ']') { goForward(); return }
      if (g && Date.now() - g < 1200 && GO[e.key]) { g = 0; const [s, p] = GO[e.key]; navigate(s as never, p); return }
      g = e.key === 'g' ? Date.now() : 0
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [advance, navigate])
}

/** Back / forward and the recent places list. */
export function HistoryButtons() {
  const { stack, index } = useNavHistory()
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const [open, setOpen] = useState(false)
  const recents = useMemo(() => (open ? recentRoutes(8).map((r) => ({ r, t: routeTitle(game, r.screen, r.param) ?? { title: SCREENS.find((s) => s.screen === r.screen && (s.param ?? undefined) === (r.param ?? undefined))?.label ?? SCREENS.find((s) => s.screen === r.screen)?.label ?? r.screen, sub: '' } })) : []), [open, game, stack, index])
  return (
    <div className="hud-history" role="group" aria-label="History">
      <button type="button" className="hist-btn" aria-label="Back" title="Back (Alt+←  or  [)" disabled={index <= 0} onClick={goBack} data-testid="nav-back">◂</button>
      <button type="button" className="hist-btn" aria-label="Forward" title="Forward (Alt+→  or  ])" disabled={index >= stack.length - 1} onClick={goForward} data-testid="nav-forward">▸</button>
      <span className="hist-recent">
        <button type="button" className="hist-btn" aria-label="Recent places" aria-expanded={open} title="Recent places" onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} data-testid="nav-recent">▾</button>
        {open && (
          <ul className="recent-menu" role="menu" data-testid="recent-menu">
            {recents.length === 0 && <li className="dim" style={{ padding: 10 }}>Nothing visited yet.</li>}
            {recents.map(({ r, t }, i) => <li key={i} role="none"><button type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); navigate(r.screen, r.param) }}><b>{t.title}</b>{t.sub && <small className="dim">{t.sub}</small>}</button></li>)}
          </ul>
        )}
      </span>
    </div>
  )
}

export function SearchButton() {
  const open = useUi((s) => s.openPalette)
  return <button type="button" className="hud-search" onClick={open} aria-label="Search (Ctrl+K)" title="Search fighters, events and screens (Ctrl+K or /)" data-testid="open-search"><Icon name="scouting" /><span className="hs-text">Search</span><kbd>Ctrl K</kbd></button>
}

/** The command palette: one box for fighters, events, screens and commands. */
export function CommandPalette() {
  const open = useUi((s) => s.palette)
  const close = useUi((s) => s.closePalette)
  const game = useGame((s) => s.game)
  const navigate = useGame((s) => s.navigate)
  const advance = useGame((s) => s.advance)
  const saveNow = useGame((s) => s.saveNow)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0) } }, [open])
  const hits = useMemo<SearchHit[]>(() => {
    if (!open || !game) return []
    if (!q.trim()) {
      const rec = recentRoutes(6).map((r, i): SearchHit | null => { const t = routeTitle(game, r.screen, r.param); return t ? { kind: r.screen === 'event' ? 'event' : 'fighter', id: `${r.screen}-${r.param}`, title: t.title, sub: `Recent · ${t.sub}`, route: { screen: r.screen, param: r.param }, score: 100 - i } : null }).filter((x): x is SearchHit => !!x)
      return [...rec, ...SCREENS.filter((s) => ['dashboard', 'fighters', 'scouting', 'matchmaking', 'events', 'finances'].includes(s.id)).map((s): SearchHit => ({ kind: 'screen', id: s.id, title: s.label, sub: `Go to · ${s.group}`, route: { screen: s.screen, param: s.param }, score: 1 }))]
    }
    return searchAll(game, q, SCREENS, 12)
  }, [open, q, game])
  useEffect(() => { setSel(0) }, [q])
  if (!open || !game) return null
  const run = (h: SearchHit) => {
    close()
    if (h.action === 'advance') advance(1); else if (h.action === 'advance4') advance(4); else if (h.action === 'save') void saveNow()
    else if (h.route) navigate(h.route.screen as never, h.route.param)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); run(hits[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }
  return (
    <div className="palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }} data-testid="palette">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <input ref={input} className="palette-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search fighters, events, screens…  (try: “welter”, “champion”, “finances”)" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={hits[sel] ? `pal-${sel}` : undefined} />
        <ul id="palette-list" className="palette-list" role="listbox">
          {hits.length === 0 && <li className="palette-empty dim">No match. Only fighters you have heard of appear: scout to discover more.</li>}
          {hits.map((h, i) => (
            <li key={h.kind + h.id} id={`pal-${i}`} role="option" aria-selected={i === sel} className={`palette-row${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); run(h) }} data-kind={h.kind}>
              {h.kind === 'fighter' && h.route?.param ? <Avatar f={{ id: h.route.param, firstName: h.title, lastName: '' }} /> : <span className={`palette-ico ${h.kind}`} aria-hidden="true">{h.kind === 'event' ? '▣' : h.kind === 'action' ? '⏵' : '→'}</span>}
              <span className="palette-main"><b>{h.title}</b><small className="dim">{h.sub}</small></span>
              {h.chip && <span className="chip gold palette-chip">{h.chip}</span>}
              <span className="palette-kind caps">{h.kind}</span>
            </li>
          ))}
        </ul>
        <div className="palette-foot dim"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span><kbd>?</kbd> shortcuts</span></div>
      </div>
    </div>
  )
}

const KEYS: [string, string][] = [
  ['Ctrl K  or  /', 'Search fighters, events, screens and commands'], ['Ctrl Enter', 'Advance one week (add Shift for four)'], ['Alt ←  /  Alt →   or   [  /  ]', 'Back / forward'],
  ['g then o / i / r / s', 'Go to Overview / Inbox / Roster / Scouting'], ['g then e / c / m', 'Go to Events / Calendar / Matchmaking'], ['g then f / w / t / n', 'Go to Finances / Rankings / Titles / News'], ['?', 'This sheet'], ['Esc', 'Close a panel or search'],
]
export function ShortcutHelp() {
  const on = useUi((s) => s.help)
  const toggle = useUi((s) => s.toggleHelp)
  if (!on) return null
  return (
    <div className="palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) toggle(false) }} data-testid="shortcut-help">
      <div className="palette help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <h2 className="display" style={{ padding: '14px 16px 4px' }}>Keyboard shortcuts</h2>
        <dl className="keys">{KEYS.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
        <div className="palette-foot dim"><span>Shortcuts are off while you type in a box.</span><button type="button" className="btn small ghost" onClick={() => toggle(false)}>Close</button></div>
      </div>
    </div>
  )
}
