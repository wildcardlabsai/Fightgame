import { formatDay, weekOfYear } from '../../engine/calendar'
import { opViews } from '../../engine/quotes'
import {
  attentionItems, cashRunwayWeeks, player, unreadCount, weeklyBurn,
} from '../../engine/selectors'
import { STAGE_LABEL } from '../../engine/systems/contracts'
import { FOCUS_LABELS } from '../../engine/systems/development'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { Avatar, Meter, Section } from '../components/Bits'
import { AreaChart } from '../components/Charts'
import { RangeText } from '../components/Estimates'
import { compactNumber, money } from '../format'

const LOOP: { name: string; status: 'live' | 'partial' | 'locked'; note: string }[] = [
  { name: 'Scout', status: 'live', note: 'Reports & searches live' },
  { name: 'Sign', status: 'live', note: 'Negotiation live' },
  { name: 'Develop', status: 'live', note: 'Training live' },
  { name: 'Arrange fights', status: 'locked', note: 'Phase 3' },
  { name: 'Build events', status: 'locked', note: 'Phase 4' },
  { name: 'Earn', status: 'partial', note: 'Costs live · income P4–5' },
  { name: 'Rankings', status: 'locked', note: 'Phase 6' },
]

export function Dashboard() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const openLink = useGame((s) => s.openLink)
  const advance = useGame((s) => s.advance)
  const p = player(game)
  const views = useViews()
  const roster = views.mine().sort((a, b) => b.grade.mid - a.grade.mid)
  const hot = views.freeAgents().filter((v) => v.status === 'active').sort((a, b) => b.reputation + b.popularity - (a.reputation + a.popularity)).slice(0, 4)
  const ops = opViews(game).filter((o) => o.status === 'active')
  const attention = attentionItems(game)
  const runway = cashRunwayWeeks(game)
  const burn = weeklyBurn(game)
  const unread = unreadCount(game)
  const mail = game.inbox.slice(0, 4)

  return (
    <>
      <div className="hero">
        <div className="caps">Week {weekOfYear(game.today)} · {formatDay(game.today)}</div>
        <h1 className="display">{p.name.split(' ').slice(0, -1).join(' ') || p.name} <em>{p.name.split(' ').slice(-1)[0] !== p.name ? p.name.split(' ').slice(-1)[0] : ''}</em></h1>
        <div className="dim" style={{ marginTop: 8 }}>Promoter {p.promoterName} · {p.tier} promotion · {p.homeCountry === 'USA' ? 'United States' : 'United Kingdom'}</div>
        <div className="hero-row">
          <button className="btn primary big" onClick={() => advance(1)}>Advance Week ▸</button>
          <button className="btn ghost big" onClick={() => advance(4)}>+4 Weeks</button>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="caps">Cash</div><div className={`v num ${p.cash < 0 ? 'red' : ''}`}>{money(p.cash)}</div><div className="s">{runway === null ? 'No running costs' : `${runway} weeks of runway`}</div></div>
          <div className="kpi"><div className="caps">Weekly burn</div><div className="v num">{money(burn.total, false)}</div><div className="s">{money(burn.overheads, false)} overheads</div></div>
          <div className="kpi"><div className="caps">Reputation</div><div className="v num">{Math.round(p.reputation)}<span className="dim" style={{ fontSize: 20 }}>/100</span></div><div className="s">{p.tier}</div></div>
          <div className="kpi"><div className="caps">Fanbase</div><div className="v num">{compactNumber(p.fanbase)}</div><div className="s">followers</div></div>
          <div className="kpi"><div className="caps">Roster</div><div className="v num">{roster.length}</div><div className="s">fighters under contract</div></div>
        </div>
      </div>

      <Section title="The empire pipeline" right={<span className="dim" style={{ fontSize: 13 }}>What’s playable now vs. what’s coming</span>}>
        <div className="pipeline">
          {LOOP.map((s) => (
            <div key={s.name} className={`pipe-step ${s.status}`}>
              <div className="n">{s.name}</div>
              <div className="dim" style={{ fontSize: 12.5 }}>{s.note}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Needs your attention" right={attention.length > 0 ? <span className="chip red">{attention.length}</span> : undefined}>
          {attention.length === 0 ? (
            <p className="empty">Nothing urgent. The gym is quiet — advance the week.</p>
          ) : attention.slice(0, 7).map((a) => (
            <div key={a.id} className={`attn ${a.severity}`}>
              <div>
                <div className="t">{a.title}</div>
                <div className="d">{a.detail}</div>
              </div>
              {a.link && (
                <button className="btn small go" onClick={() => openLink(a.link!)}>
                  {a.actionLabel ?? 'Open'}
                </button>
              )}
            </div>
          ))}
        </Section>

        <Section title="Your fighters" right={<button className="linkbtn" onClick={() => navigate('fighters')}>View all</button>}>
          {roster.length === 0 ? <p className="empty">No fighters under contract.</p> : (
            <table className="table">
              <tbody>
                {roster.map((f) => (
                  <tr key={f.id} className="row" onClick={() => navigate('fighter', f.id)}>
                    <td>
                      <div className="fighter-cell">
                        <Avatar f={f} />
                        <div>
                          <div className="fighter-name">{f.name}</div>
                          <div className="fighter-sub">{f.recordText} · {f.age} · {FOCUS_LABELS[f.own!.trainingFocus]}</div>
                        </div>
                      </div>
                    </td>
                    <td><RangeText r={f.grade} /></td>
                    <td className="mini-meters">
                      <Meter value={f.own!.fitness.value} tone="good" label="Fitness" />
                      <Meter value={f.own!.morale.value} label="Morale" />
                    </td>
                    <td className="dim" style={{ fontSize: 13 }}>{f.contract.kind === 'own' && f.contract.stage !== 'healthy' ? <span className="warn">{STAGE_LABEL[f.contract.stage]}</span> : f.own!.mood}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <div className="grid-2">
        <Section title="Cash trajectory" right={<button className="linkbtn" onClick={() => navigate('finances')}>Finances</button>}>
          <AreaChart points={game.financeHistory.map((h) => ({ x: h.day, y: h.cash }))} />
        </Section>
        <Section title="Inbox" right={<button className="linkbtn" onClick={() => navigate('inbox')}>{unread > 0 ? `${unread} unread` : 'Open'}</button>}>
          {mail.length === 0 ? <p className="empty">No messages.</p> : mail.map((m) => (
            <button key={m.id} className="msg-row" style={{ borderLeftColor: m.priority === 'urgent' ? 'var(--red)' : m.priority === 'important' ? 'var(--gold)' : 'transparent' }} onClick={() => navigate('inbox')}>
              <div className="s" style={{ fontWeight: m.read ? 400 : 700 }}>{m.subject}</div>
              <div className="m"><span>{m.from}</span><span>{formatDay(m.day, false)}</span></div>
            </button>
          ))}
        </Section>
      </div>

      <div className="grid-2">
        <Section title="Market watch" right={<button className="linkbtn" onClick={() => navigate('scouting')}>Scouting</button>}>
          {hot.length === 0 ? <p className="empty">Nobody notable is on the market. Send your scout looking.</p> : hot.map((v) => (
            <div key={v.id} className="attn" style={{ cursor: 'pointer' }} onClick={() => navigate('fighter', v.id)}>
              <div><div className="t">{v.name}</div><div className="d">{v.division} · {v.age} · {v.recordText} · {v.market.tags[0]}</div></div>
              <span className="go"><RangeText r={v.grade} scouted={v.knowledge.reports > 0} /></span>
            </div>
          ))}
        </Section>
        <Section title="Scouting desk" right={<button className="linkbtn" onClick={() => navigate('scouting')}>Open</button>}>
          {ops.length === 0 ? <p className="empty">Your scout is idle. Reports cost money — pick your targets carefully.</p> : ops.map((o) => (
            <div key={o.id} className="op"><div><div className="fighter-name">{o.title}</div><div className="dim" style={{ fontSize: 13 }}>{o.scoutName}</div></div><div className="caps" style={{ alignSelf: 'center' }}>{o.weeksLeft} wk left</div></div>
          ))}
        </Section>
      </div>

      <Section title="Boxing news">
        {game.news.length === 0 ? <p className="empty">The world is quiet. Advance time and the headlines will follow.</p> : (
          <div style={{ display: 'grid', gap: 0 }}>
            {game.news.slice(0, 8).map((n) => (
              <div key={n.id} className="attn" style={{ cursor: n.fighterId ? 'pointer' : 'default' }} onClick={() => n.fighterId && navigate('fighter', n.fighterId)}>
                <span className="caps" style={{ minWidth: 64 }}>{formatDay(n.day, false)}</span>
                <span>{n.headline}</span>
                <span className="chip" style={{ marginLeft: 'auto' }}>{n.category}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
