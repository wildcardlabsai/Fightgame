import { formatDay, weekOfYear } from '../engine/calendar'
import { cashRunwayWeeks, player, unreadCount } from '../engine/selectors'
import { useGame, type ScreenId } from '../store/gameStore'
import { Icon } from './components/Icons'
import { PromoLogo } from './components/Bits'
import { money } from './format'
import { FightDealScreen } from './screens/FightDealScreen'
import { FightPage } from './screens/FightPage'
import { FightsScreen } from './screens/FightsScreen'
import { MatchmakingScreen } from './screens/MatchmakingScreen'
import { ContractsScreen } from './screens/ContractsScreen'
import { NegotiationScreen } from './screens/NegotiationScreen'
import { ScoutingScreen } from './screens/ScoutingScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { Dashboard } from './screens/Dashboard'
import { FinancesScreen } from './screens/FinancesScreen'
import { FighterProfile } from './screens/FighterProfile'
import { FightersScreen } from './screens/FightersScreen'
import { InboxScreen } from './screens/InboxScreen'
import { PromotionsScreen } from './screens/PromotionsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { VenuesScreen } from './screens/VenuesScreen'

interface NavDef { screen: ScreenId; label: string; icon: string }

const LIVE_NAV: NavDef[] = [
  { screen: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { screen: 'fighters', label: 'Fighters', icon: 'fighters' },
  { screen: 'scouting', label: 'Scouting', icon: 'scouting' },
  { screen: 'contracts', label: 'Contracts', icon: 'contracts' },
  { screen: 'matchmaking', label: 'Matchmaking', icon: 'matchmaking' },
  { screen: 'fights', label: 'Fights', icon: 'fights' },
  { screen: 'inbox', label: 'Inbox', icon: 'inbox' },
  { screen: 'calendar', label: 'Calendar', icon: 'calendar' },
  { screen: 'finances', label: 'Finances', icon: 'finances' },
  { screen: 'promotions', label: 'Promotions', icon: 'promotions' },
  { screen: 'venues', label: 'Venues', icon: 'venues' },
]

/** Planned areas. Shown disabled and labelled with the phase that delivers them — never faked. */
const LOCKED_NAV: { label: string; icon: string; phase: number }[] = [
  { label: 'Events', icon: 'events', phase: 4 },
  { label: 'Sponsors', icon: 'sponsors', phase: 5 },
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
  const activeScreen: ScreenId = route.screen === 'fighter' ? 'fighters' : route.screen === 'negotiation' ? 'contracts' : route.screen === 'fight' || route.screen === 'deal' ? 'fights' : route.screen

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <a className="rail-brand" href="#/dashboard" aria-label="Fight Empire home">
          <img src="/brand/wordmark.png" alt="Fight Empire" />
        </a>
        <div className="nav-group">
          <div className="nav-label caps">Run the promotion</div>
          {LIVE_NAV.map((n) => (
            <button key={n.screen} className={`nav-item${activeScreen === n.screen ? ' active' : ''}`} onClick={() => navigate(n.screen)}
              aria-current={activeScreen === n.screen ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.screen === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </div>
        <div className="nav-group">
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
          <button className={`nav-item${activeScreen === 'settings' ? ' active' : ''}`} style={{ padding: '6px 0', borderLeft: 0 }} onClick={() => navigate('settings')}>
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
          <div className="hud-spacer" />
          <div className="hud-actions">
            <button className="btn ghost small" onClick={() => advance(4)} title="Advance four weeks (stops early if something urgent happens)">+4 Weeks</button>
            <button className="btn primary" onClick={() => advance(1)}>Advance Week ▸</button>
          </div>
        </header>
        <main className="page fade-in" key={route.screen + (route.param ?? '')}>
          <Screen />
        </main>
      </div>
      {simulating && <div className="sim-flash" />}
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
    case 'settings': return <SettingsScreen />
    case 'scouting': return <ScoutingScreen />
    case 'contracts': return <ContractsScreen />
    case 'matchmaking': return <MatchmakingScreen fighterId={route.param} />
    case 'fights': return <FightsScreen />
    case 'fight': return <FightPage id={route.param ?? ''} />
    case 'deal': return <FightDealScreen id={route.param ?? ''} />
    case 'negotiation': return <NegotiationScreen id={route.param ?? ''} />
  }
}
