import { formatDay, weekOfYear } from '../engine/calendar'
import { OfficeScreen } from './screens/OfficeScreen'
import { cashRunwayWeeks, financialHealth, player, unreadCount } from '../engine/selectors'
import { lazy, Suspense, useLayoutEffect } from 'react'
import { useGame } from '../store/gameStore'
import { BottomNav, SectionBar, TopNav } from './Navigation'
import { PromoMark } from './visual/PromoMark'
import { AudioToggle } from './components/AudioStatus'
import { TierUpNotice } from './components/TierUpNotice'
import { money } from './format'
const MediaScreen = lazy(() => import('./screens/MediaScreen').then((m) => ({ default: m.MediaScreen })))
const RankingsScreen = lazy(() => import('./screens/RankingsScreen').then((m) => ({ default: m.RankingsScreen })))
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
// Development-only: compiled out of production builds, so the gallery is neither reachable nor shipped.
const AssetGallery = import.meta.env.DEV ? lazy(() => import('./screens/AssetGallery').then((m) => ({ default: m.AssetGallery }))) : null
const NewsScreen = lazy(() => import('./screens/NewsScreen').then((m) => ({ default: m.NewsScreen })))
const AdvisorScreen = lazy(() => import('./screens/AdvisorScreen').then((m) => ({ default: m.AdvisorScreen })))
const VenuesScreen = lazy(() => import('./screens/VenuesScreen').then((m) => ({ default: m.VenuesScreen })))

export function Shell() {
  const route = useGame((s) => s.route)
  const game = useGame((s) => s.game)!
  const advance = useGame((s) => s.advance)
  const simulating = useGame((s) => s.simulating)
  const p = player(game)
  const runway = cashRunwayWeeks(game)
  const unread = unreadCount(game)
  const health = financialHealth(game)


  // Every navigation lands on the relevant part of the new screen: the top of it, or the section the link named.
  useLayoutEffect(() => {
    const target = route.screen === 'settings' && route.param === 'saves' ? 'save-slots' : route.screen === 'contracts' && route.param === 'payroll' ? 'payroll' : null
    window.scrollTo(0, 0)
    if (!target) return
    const t = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView?.({ block: 'start' }))
    return () => cancelAnimationFrame(t)
  }, [route.screen, route.param])

  return (
    <div className="app">
      <TopNav unread={unread} />
      <SectionBar />
      <header className="hud">
        <div className="hud-id">
          <PromoMark p={p} size={34} />
          <div>
            <div className="display name">{p.name}</div>
            <div className="caps">{p.tier} promotion</div>
          </div>
        </div>
        <div className="hud-stat"><span className="caps">Date</span><span className="v num">{formatDay(game.today)}</span></div>
        <div className="hud-stat hide-sm"><span className="caps">Week</span><span className="v num">{weekOfYear(game.today)}</span></div>
        <div className="hud-stat"><span className="caps">Cash</span><span className={`v num ${p.cash < 0 ? 'red' : ''}`}>{money(p.cash)}</span></div>
        <div className="hud-stat hide-sm"><span className="caps">Runway</span><span className={`v num ${runway !== null && runway < 8 ? 'red' : runway !== null && runway < 26 ? 'warn' : ''}`}>{runway === null ? '—' : `${runway}w`}</span></div>
        <div className="hud-stat hide-sm"><span className="caps">Finances</span><span className={`v num hp ${health.state}`} title={health.reason}>{health.label}</span></div>
        <div className="hud-spacer" />
        <div className="hud-actions mobile-only">
          <AudioToggle compact />
          <button className="btn primary small hud-advance" onClick={() => advance(1)} aria-label="Advance one week">Week ▸</button>
        </div>
      </header>
      <main className="page fade-in" key={route.screen + (route.param ?? '')}>
        <Suspense fallback={<div className="dim" style={{ padding: 24 }}>Loading…</div>}><Screen /></Suspense>
      </main>
      <BottomNav unread={unread} />
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
    case 'office': return <OfficeScreen />
    case 'venues': return <VenuesScreen />
    case 'sponsors': return <SponsorsScreen />
    case 'news': return <NewsScreen />
    case 'advisor': return <AdvisorScreen />
    case 'media': return <MediaScreen tab={route.param} />
    case 'rankings': return <RankingsScreen mode="rankings" param={route.param} />
    case 'titles': return <RankingsScreen mode="titles" param={route.param} />
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
    case 'assets': return AssetGallery ? <AssetGallery /> : <Dashboard />
  }
}
