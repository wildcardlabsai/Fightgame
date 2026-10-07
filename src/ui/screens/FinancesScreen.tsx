import { useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { WEEKLY_COSTS } from '../../engine/config'
import { allAdvice, financeAdvisor } from '../../engine/advisor'
import { tierLabel } from '../../engine/tiers'
import { sponsorView } from '../../engine/sponsors'
import { cashRunwayWeeks, financialHealth, overheadCost, player, weeklyBurn } from '../../engine/selectors'
import { commitments, recentSpend } from '../../engine/quotes'
import type { GameState, TransactionCategory } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { AdvicePanel } from '../components/Advice'
import { Section } from '../components/Bits'
import { AreaChart } from '../components/Charts'
import { money } from '../format'

const CAT_LABEL: Record<TransactionCategory, string> = {
  startingFunds: 'Capital', office: 'Office', staff: 'Staff', gym: 'Gym', insurance: 'Insurance', retainers: 'Retainers',
  purses: 'Purses', tickets: 'Tickets', sponsorship: 'Event sponsorship', standingSponsor: 'Standing sponsors', ppv: 'PPV', venue: 'Venue', scouting: 'Scouting', signingBonus: 'Signing bonus', releaseFees: 'Release fee', other: 'Other',
  broadcast: 'Broadcast', marketing: 'Marketing', officials: 'Officials & medical', production: 'Production', security: 'Security',
}

export function FinancesScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const p = player(game)
  const burn = weeklyBurn(game)
  const runway = cashRunwayWeeks(game)
  const [cat, setCat] = useState<TransactionCategory | 'all'>('all')
  const scale = overheadCost(game) / (WEEKLY_COSTS.office + WEEKLY_COSTS.staff + WEEKLY_COSTS.gym + WEEKLY_COSTS.insurance)
  const lines: [string, number][] = [
    ['Office rent & utilities', WEEKLY_COSTS.office * scale], ['Admin & matchmaking staff', WEEKLY_COSTS.staff * scale],
    ['Gym lease', WEEKLY_COSTS.gym * scale], ['Insurance', WEEKLY_COSTS.insurance * scale], ['Scouting department', burn.scouting], ['Fighter retainers', burn.retainers],
  ]
  const ledger = game.ledger.filter((t) => cat === 'all' || t.category === cat)
  const cats = Array.from(new Set(game.ledger.map((t) => t.category)))
  const com = commitments(game)
  const health = financialHealth(game)
  const fin = financeAdvisor(game)
  const sv = sponsorView(game)
  const yearAgo = game.today - 365
  const sumCat = (c: TransactionCategory) => game.ledger.filter((t) => t.category === c && t.day > yearAgo).reduce((n, t) => n + t.amount, 0)
  const eventSpons = sumCat('sponsorship'), standingSpons = sumCat('standingSponsor')
  const finKey = fin.standing.split(' ')[0]
  const yearNet = game.ledger.filter((t) => t.day > yearAgo && t.category !== 'startingFunds').reduce((n, t) => n + t.amount, 0)
  const spent = game.ledger.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Finances</h1>
          <p className="sub">Every pound in and out is recorded. Shows are your income: tickets, sponsors, broadcast and PPV come in; venues, purses, marketing and production go out. Per-show profit lives on each event.</p>
        </div>
      </div>
      <div className="kpis fin-kpis" style={{ marginTop: 0 }}>
        <div className="kpi"><div className="caps">Cash in bank</div><div className={`v num ${p.cash < 0 ? 'red' : ''}`}>{money(p.cash, false)}</div></div>
        <div className="kpi"><div className="caps">12-month profit / loss</div><div className={`v num ${yearNet < 0 ? 'red' : 'good'}`}>{yearNet >= 0 ? '+' : '−'}{money(Math.abs(yearNet))}</div></div>
        <div className="kpi"><div className="caps">Weekly burn</div><div className="v num">{money(burn.total, false)}</div></div>
        <div className="kpi"><div className="caps">Runway</div><div className={`v num ${runway !== null && runway < 8 ? 'red' : ''}`}>{runway === null ? '—' : `${runway} wks`}</div></div>
        <div className="kpi"><div className="caps">Promotion tier</div><div className="v num">{tierLabel(p.tier)}</div></div>
        <div className="kpi"><div className="caps">Spent since launch</div><div className="v num">{money(spent)}</div></div>
      </div>

      <Section title="Promotion financial health" right={<span className={`standing ${finKey}`} style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{fin.standing}</span>}>
        <div className="finhealth">
          <ul style={{ margin: '0 0 0 18px', color: 'var(--text)' }}>{fin.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <AdvicePanel list={allAdvice(game).filter((a) => a.topic === 'event' || a.topic === 'contract')} cap={3} compact />
      </Section>

      <Section title="Sponsorship income" right={<button className="linkbtn" onClick={() => navigate('sponsors')}>Sponsors</button>}>
        <dl>
          <div className="kv"><dt>Event sponsorship (last 12 months)</dt><dd className="num good">+{money(eventSpons, false)}</dd></div>
          <div className="kv"><dt>Standing sponsors (last 12 months)</dt><dd className="num good">+{money(standingSpons, false)}</dd></div>
          <div className="kv"><dt>Standing sponsor run-rate</dt><dd className="num">{money(sv.annualRun, false)} a year across {sv.deals.length} deal{sv.deals.length === 1 ? '' : 's'}</dd></div>
          <div className="kv"><dt>Sponsor commitments</dt><dd>{sv.deals.length === 0 ? 'None' : sv.deals.map((d) => `${d.name}: ${d.needed} more qualifying show${d.needed === 1 ? '' : 's'} this contract year`).join(' · ')}</dd></div>
        </dl>
        <p className="dim" style={{ fontSize: 13 }}>Standing sponsor money arrives as quarterly instalments and per-show payments, each a line in the ledger below.</p>
      </Section>

      <Section title="Financial health" right={<span className={`chip hp ${health.state}`}>{health.label}</span>}>
        <p>{health.reason}</p>
        <dl style={{ marginTop: 8 }}>
          <div className="kv"><dt>Committed to open shows</dt><dd className="num">{money(health.commitments, false)}</dd></div>
          <div className="kv"><dt>Income, last 12 months</dt><dd className="num good">+{money(income12(game), false)}</dd></div>
          <div className="kv"><dt>Show costs, last 12 months</dt><dd className="num">−{money(showCosts12(game), false)}</dd></div>
        </dl>
        <p className="dim" style={{ fontSize: 13 }}>Healthy → Concern → Critical → Insolvent. Insolvency never ends the game, but you cannot book venues, sign fighters or commission scouting until cash recovers.</p>
      </Section>

      <Section title="Where the money went (last 12 months)">
        <div className="kpis" style={{ marginTop: 0 }}>
          <div className="kpi"><div className="caps">Signing bonuses</div><div className="v num">{money(recentSpend(game, 'signingBonus'))}</div></div>
          <div className="kpi"><div className="caps">Scouting</div><div className="v num">{money(recentSpend(game, 'scouting'))}</div></div>
          <div className="kpi"><div className="caps">Release fees</div><div className="v num">{money(recentSpend(game, 'releaseFees'))}</div></div>
          <div className="kpi"><div className="caps">Purses owed (guaranteed)</div><div className="v num">{money(com.guaranteedPurses)}</div><div className="s">committed, paid from Phase 3</div></div>
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Cash over time">
          <AreaChart points={game.financeHistory.map((h) => ({ x: h.day, y: h.cash }))} height={200} />
        </Section>
        <Section title="Weekly running costs">
          {lines.map(([label, v]) => (
            <div key={label} className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
              <dt style={{ color: 'var(--text)' }}>{label}</dt>
              <dd className="num" style={{ fontSize: 18 }}>{money(v, false)}</dd>
            </div>
          ))}
          <div className="kv" style={{ gridTemplateColumns: '1fr auto', borderBottom: 0 }}>
            <dt className="caps">Total per week</dt><dd className="num red" style={{ fontSize: 24 }}>{money(burn.total, false)}</dd>
          </div>
        </Section>
      </div>

      <Section title="Ledger" right={
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value as never)} aria-label="Category" style={{ minWidth: 160 }}>
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </select>
      }>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {ledger.slice(0, 40).map((t) => (
                <tr key={t.id}>
                  <td className="dim">{formatDay(t.day)}</td>
                  <td><span className="chip">{CAT_LABEL[t.category]}</span></td>
                  <td>{t.description}</td>
                  <td className={`r num ${t.amount < 0 ? 'red' : 'good'}`} style={{ fontSize: 18 }}>{t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount), false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ledger.length > 40 && <p className="dim" style={{ marginTop: 8, fontSize: 13 }}>Showing the latest 40 of {ledger.length} entries.</p>}
      </Section>
    </>
  )
}

const INCOME: TransactionCategory[] = ['tickets', 'sponsorship', 'ppv', 'broadcast']
const SHOW_COSTS: TransactionCategory[] = ['venue', 'marketing', 'production', 'purses', 'officials', 'security']
const income12 = (g: GameState) => g.ledger.filter((t) => t.day > g.today - 365 && INCOME.includes(t.category)).reduce((n, t) => n + t.amount, 0)
const showCosts12 = (g: GameState) => g.ledger.filter((t) => t.day > g.today - 365 && SHOW_COSTS.includes(t.category)).reduce((n, t) => n - Math.min(0, t.amount) + 0, 0)
