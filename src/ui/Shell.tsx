import { formatDay, weekOfYear } from '../engine/calendar'
import { cashRunwayWeeks, financialHealth, player, unreadCount } from '../engine/selectors'
import { lazy, Suspense, useEffect } from 'react'
import { useGame, type ScreenId } from '../store/gameStore'
import { Icon } from './components/Icons'
import { PromoLogo } from './components/Bits'
import { TierUpNotice } from './components/TierUpNotice'
import { money } from './format'
const FightDealScreen = lazy(() => import('./screens/FightDealScreen').then((m) => ({ default: m.FightDealScreen })))
const FightPage = lazy(() => import('./screens/FightPage').then((m) => ({ default: m.FightPage })))
const FightsScreen = lazy(() => import('./screens/FightsScreen').then((m) => ({ default: m.FightsScreen })))
const EventsScreen = lazy(() => import('./screens/EventsScreen').then((m) => ({ default: m.EventsScreen })))
const EventPage = lazy(() => import('./screens/EventPage').then((m) => ({ default: m.EventPage })))
const MatchmakingScreen = lazy(() => import('./screens/MatchmakingScreen').then((m) => ({ default: m.MatchmakingScreen })))
const ContractsScreen = lazy(() => import('./screens/ContractsScreen').then((m) => ({ default: m.ContractsScreen })))
const NegotiationScreen = lazy(() => import('./screens/NegotiationScreen').then((m) => ({ default: m.NegotiationScreen })))
const ScoutingScreen = lazy(() => import('./screens/ScoutingScreen').then((m) => ({ default: m.ScoutingScreen })))
const CalendarScreen = lazy(() => import('./screens/CalendarScreen').then((m) => ({ default: m.CalendarScreen })))
import { Dashboard } from './screens/Dashboard'
const FinancesScreen = lazy(() => import('./screens/FinancesScreen').then((m) => ({ default: m.FinancesScreen })))
const FighterProfile = lazy(() => import('./screens/FighterProfile').then((m) => ({ default: m.FighterProfile })))
const FightersScreen = lazy(() => import('./screens/FightersScreen').then((m) => ({ default: m.FightersScreen })))
const InboxScreen = lazy(() => import('./screens/InboxScreen').then((m) => ({ default: m.InboxScreen })))
const PromotionsScreen = lazy(() => import('./screens/PromotionsScreen').then((m) => ({ default: m.PromotionsScreen })))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })))
const SponsorsScreen = lazy(() => import('./screens/SponsorsScreen').then((m) => ({ default: m.SponsorsScreen })))
const VenuesScreen = lazy(() => import('./screens/VenuesScreen').then((m) => ({ default: m.VenuesScreen })))

interface NavDef { screen: ScreenId; label: string; icon: string }

const LIVE_NAV: NavDef[] = [
  { screen: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { screen: 'fighters', label: 'Fighters', icon: 'fighters' },
  { screen: 'scouting', label: 'Scouting', icon: 'scouting' },
  { screen: 'contracts', label: 'Contracts', icon: 'contracts' },
  { screen: 'matchmaking', label: 'Matchmaking', icon: 'matchmaking' },
  { screen: 'fights', label: 'Fights', icon: 'fights' },
  { screen: 'events', label: 'Events', icon: 'events' },
  { screen: 'inbox', label: 'Inbox', icon: 'inbox' },
  { screen: 'calendar', label: 'Calendar', icon: 'calendar' },
  { screen: 'finances', label: 'Finances', icon: 'finances' },
  { screen: 'promotions', label: 'Promotions', icon: 'promotions' },
  { screen: 'venues', label: 'Venues', icon: 'venues' },
  { screen: 'sponsors', label: 'Sponsors', icon: 'sponsors' },
]

/** Planned areas. Shown disabled and labelled with the phase that delivers them — never faked. */
const LOCKED_NAV: { label: string; icon: string; phase: number }[] = [
  { label: 'Rankings', icon: 'rankings', phase: 6 },
  { label: 'Titles', icon: 'titles', phase: 6 },
  { label: 'Media', icon: 'media', phase: 7 },
]

export function Shell() {
  const route = useGame((s) => s.route)
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const advance = useGame((s) => s.advance)
  const simulating = useGame((s) => s.simulating)
  const p = player(game)
  const runway = cashRunwayWeeks(game)
  const unread = unreadCount(game)
  const health = financialHealth(game)
  const activeScreen: ScreenId = route.screen === 'fighter' ? 'fighters' : route.screen === 'negotiation' ? 'contracts' : route.screen === 'fight' || route.screen === 'deal' ? 'fights' : route.screen === 'event' ? 'events' : route.screen

  // On phones the nav is a sideways strip: keep the current section in view when the route changes.
  useEffect(() => { document.querySelector('.rail .nav-item.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }) }, [route.screen])

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <a className="rail-brand" href="#/dashboard" aria-label="Fight Empire home">
          <img src="/brand/wordmark.png" alt="Fight Empire" />
        </a>
        <div className="nav-group">
          <div className="nav-label caps">Run the promotion</div>
          {LIVE_NAV.map((n) => (
            <button key={n.screen} data-sfx="navigate" className={`nav-item${activeScreen === n.screen ? ' active' : ''}`} onClick={() => navigate(n.screen)}
              aria-current={activeScreen === n.screen ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.screen === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
          <button data-sfx="navigate" className={`nav-item nav-settings-mobile${activeScreen === 'settings' ? ' active' : ''}`} onClick={() => navigate('settings')} aria-current={activeScreen === 'settings' ? 'page' : undefined}>Settings</button>
        </div>
        <div className="nav-group nav-locked-group">
          <div className="nav-label caps">Coming soon</div>
          {LOCKED_NAV.map((n) => (
            <button key={n.label} className="nav-item locked" disabled title={`${n.label} arrives in Phase ${n.phase}`}>
              <Icon name={n.icon} />
              {n.label}
              <span className="tag">P{n.phase}</span>
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <button className={`nav-item${activeScreen === 'settings' ? ' active' : ''}`} style={{ padding: '6px 0', borderLeft: 0 }} data-sfx="navigate" onClick={() => navigate('settings')}>
            <Icon name="settings" />Save &amp; Settings
          </button>
        </div>
      </nav>

      <div className="main">
        <header className="hud">
          <div className="hud-id">
            <PromoLogo p={p} size={36} />
            <div>
              <div className="display name">{p.name}</div>
              <div className="caps">{p.tier} promotion</div>
            </div>
          </div>
          <div className="hud-stat">
            <span className="caps">Date</span>
            <span className="v num">{formatDay(game.today)}</span>
          </div>
          <div className="hud-stat">
            <span className="caps">Week</span>
            <span className="v num">{weekOfYear(game.today)}</span>
          </div>
          <div className="hud-stat">
            <span className="caps">Cash</span>
            <span className={`v num ${p.cash < 0 ? 'red' : ''}`}>{money(p.cash)}</span>
          </div>
          <div className="hud-stat">
            <span className="caps">Runway</span>
            <span className={`v num ${runway !== null && runway < 8 ? 'red' : runway !== null && runway < 26 ? 'warn' : ''}`}>{runway === null ? '—' : `${runway}w`}</span>
          </div>
          <div className="hud-stat">
            <span className="caps">Finances</span>
            <span className={`v num hp ${health.state}`} title={health.reason}>{health.label}</span>
          </div>
          <div className="hud-spacer" />
          <div className="hud-actions">
            <button className="btn ghost small" onClick={() => advance(4)} title="Advance four weeks (stops early if something urgent happens)">+4 Weeks</button>
            <button className="btn primary" onClick={() => advance(1)}>Advance Week ▸</button>
          </div>
        </header>
        <main className="page fade-in" key={route.screen + (route.param ?? '')}>
          <Suspense fallback={<div className="dim" style={{ padding: 24 }}>Loading…</div>}><Screen /></Suspense>
        </main>
      </div>
      {simulating && <div className="sim-flash" />}
      <TierUpNotice />
    </div>
  )
}

function Screen() {
  const route = useGame((s) => s.route)
  switch (route.screen) {
    case 'dashboard': return <Dashboard />
    case 'fighters': return <FightersScreen />
    case 'fighter': return <FighterProfile id={route.param ?? ''} />
    case 'inbox': return <InboxScreen />
    case 'calendar': return <CalendarScreen />
    case 'finances': return <FinancesScreen />
    case 'promotions': return <PromotionsScreen />
    case 'venues': return <VenuesScreen />
    case 'sponsors': return <SponsorsScreen />
    case 'settings': return <SettingsScreen />
    case 'scouting': return <ScoutingScreen />
    case 'contracts': return <ContractsScreen />
    case 'matchmaking': return <MatchmakingScreen fighterId={route.param} />
    case 'fights': return <FightsScreen />
    case 'fight': return <FightPage id={route.param ?? ''} />
    case 'events': return <EventsScreen />
    case 'event': return <EventPage id={route.param ?? ''} />
    case 'deal': return <FightDealScreen id={route.param ?? ''} />
    case 'negotiation': return <NegotiationScreen id={route.param ?? ''} />
  }
}
