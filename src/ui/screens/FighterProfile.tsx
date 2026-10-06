import { useState } from 'react'
import { fighterAdvice } from '../../engine/advisor'
import { formatDay } from '../../engine/calendar'
import { STAGE_LABEL } from '../../engine/systems/contracts'
import { FOCUS_BLURBS, FOCUS_LABELS } from '../../engine/systems/development'
import type { TrainingFocus } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { AdvicePanel } from '../components/Advice'
import { Avatar, Flag, Meter, Section } from '../components/Bits'
import { FormDots } from '../components/FightBits'
import { Ring } from '../components/Charts'
import { RangeText, TraitRow } from '../components/Estimates'
import { ScoutDialog } from '../components/ScoutDialog'
import { money } from '../format'

export function FighterProfile({ id }: { id: string }) {
  const navigate = useGame((s) => s.navigate)
  const setTraining = useGame((s) => s.setTraining)
  const toggleShortlist = useGame((s) => s.toggleShortlist)
  const views = useViews()
  const v = views.fighter(id)
  const [scouting, setScouting] = useState(false)

  if (!v) {
    return (
      <>
        <h1 className="display" style={{ fontSize: 48 }}>Fighter not found</h1>
        <p className="dim" style={{ margin: '12px 0 20px' }}>That profile doesn’t exist in this save.</p>
        <button className="btn" onClick={() => navigate('fighters')}>Back to fighters</button>
      </>
    )
  }
  const mine = v.own !== null
  const scouted = v.knowledge.reports > 0 || mine
  const c = v.contract

  return (
    <>
      <div className="profile-hero">
        <Avatar f={v} large />
        <div style={{ flex: 1, minWidth: 260 }}>
          <button className="linkbtn" onClick={() => navigate('fighters')}>◂ All fighters</button>
          <div className="caps" style={{ marginTop: 8 }}>{v.nickname ? `“${v.nickname}”` : v.stage}</div>
          <h1 className="display">{v.firstName} <span className="red">{v.lastName}</span></h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <Flag code={v.nationKey} />
            <span>{v.division}</span>
            <span className="chip">{v.stage}</span>
            <span className="chip">{v.style}</span>
            {mine && <span className="chip gold">On your roster</span>}
            {v.status === 'retired' && <span className="chip red">Retired</span>}
            {v.market.tags.filter((t) => t !== 'Looking for a promotion').map((t) => <span key={t} className="chip good">{t}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {v.status === 'active' && <button className="btn" onClick={() => setScouting(true)}>{v.knowledge.reports ? 'Scout again' : 'Scout this fighter'}</button>}
            {!mine && <button className="btn ghost" onClick={() => toggleShortlist(v.id)} aria-pressed={v.shortlisted}>{v.shortlisted ? '★ Shortlisted' : '☆ Shortlist'}</button>}
            {!mine && v.market.signable && <button className="btn primary" onClick={() => navigate('negotiation', v.id)}>{v.market.negotiation ? 'Continue negotiation' : 'Make an offer'}</button>}
            {mine && c.kind === 'own' && <button className={`btn${c.stage !== 'healthy' ? ' primary' : ''}`} onClick={() => navigate('negotiation', v.id)}>Renew contract</button>}
            {mine && <button className="btn primary" onClick={() => navigate('matchmaking', v.id)}>Find an opponent</button>}
            {v.activeFightId && <button className="btn ghost" onClick={() => navigate('fight', v.activeFightId!)}>Open booked fight</button>}
          </div>
          {!mine && !v.market.signable && v.status === 'active' && <p className="dim" style={{ marginTop: 8, fontSize: 13.5 }}>{v.market.unavailableReason}</p>}
        </div>
        <div style={{ display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="caps">Record</div>
            <div className="display num" style={{ fontSize: 52 }}>{v.recordText}</div>
            <div className="dim" style={{ fontSize: 13 }}>{v.record.koWins} KOs · {v.koRate}% KO rate</div>
          </div>
          <div className="ring" title="Scout's estimate of overall ability — a range, not a fact">
            <Ring value={v.grade.mid} color={scouted ? 'var(--red)' : '#55555f'} />
            <div className="c"><div>
              <div className="num" style={{ fontSize: 30 }}><RangeText r={v.grade} scouted={scouted} /></div>
              <div className="caps" style={{ fontSize: 11 }}>{scouted ? 'Scout grade' : 'Rough guess'}</div>
            </div></div>
          </div>
        </div>
      </div>
      <AdvicePanel list={fighterAdvice(v)} cap={2} />

      <div className="grid-2" style={{ marginTop: 6 }}>
        <div>
          <Section title="Scouting report" right={<span className="dim" style={{ fontSize: 13 }}>Intel: <b style={{ color: 'var(--text)' }}>{v.knowledge.level}</b> · {v.knowledge.confidence} confidence</span>}>
            {!scouted && <p className="dim" style={{ marginBottom: 10 }}>You have no scouting information on {v.firstName}. The “~” ranges below are guesses from the public record alone and could be well off.</p>}
            <div className="caps" style={{ margin: '6px 0 0' }}>Physical</div>
            {v.traits.physical.map((t) => <TraitRow key={t.key} t={t} />)}
            <div className="caps" style={{ margin: '14px 0 0' }}>Technical</div>
            {v.traits.technical.map((t) => <TraitRow key={t.key} t={t} />)}
            <div className="caps" style={{ margin: '14px 0 0' }}>Mental</div>
            {v.traits.mental.map((t) => <TraitRow key={t.key} t={t} />)}
            <div className="attr-row" style={{ gridTemplateColumns: '128px 1fr auto', marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <span className="gold">Potential ceiling</span>
              <span className="dim" style={{ fontSize: 13 }}>{scouted ? 'Hardest thing to judge — treat with care.' : 'Unknown without scouting.'}</span>
              <span><RangeText r={v.ceiling} scouted={scouted} /> <small className="dim">{scouted ? v.ceiling.label : ''}</small></span>
            </div>
            {v.knowledge.reportLog.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="caps">Reports on file</div>
                {v.knowledge.reportLog.map((r, i) => <div key={i} className="dim" style={{ fontSize: 13.5 }}>{r.depth} report by {r.scoutName} · {r.weeksAgo === 0 ? 'this week' : `${r.weeksAgo} wk ago`}</div>)}
              </div>
            )}
            {mine && <p className="dim" style={{ marginTop: 12, fontSize: 13 }}>Your coaches see {v.firstName} every day, so this picture sharpens by itself the longer they stay.</p>}
          </Section>

          <Section title="Personality">
            {v.personality.reveal === 'unknown' && <p className="dim">You don’t know {v.firstName} well enough to say. Deep scouting — or doing business with them — will reveal more.</p>}
            {v.personality.reveal === 'hint' && <p>First impression: <b>{v.personality.hint}</b>. <span className="dim">Not enough to know what really drives them.</span></p>}
            {v.personality.reveal === 'revealed' && <><p style={{ marginBottom: 6 }}><span className="chip gold">{v.personality.trait}</span> <span className="dim">· {v.personality.hint}</span></p><p style={{ maxWidth: '60ch' }}>{v.personality.note}</p></>}
          </Section>

          <Section title="Biography">
            <p style={{ lineHeight: 1.6, maxWidth: '62ch' }}>{v.bio}</p>
            {v.notes.length > 0 && <p style={{ marginTop: 10 }}><span className="caps">Scout notes </span>{v.notes.map((n, i) => <span key={i} className="chip" style={{ marginRight: 6 }}>{n}</span>)}</p>}
          </Section>
        </div>

        <div>
          <Section title="Identity">
            <dl>
              <div className="kv"><dt>Age</dt><dd>{v.age}</dd></div>
              <div className="kv"><dt>Nationality</dt><dd>{v.nationName} <span className="dim">· {v.hometown}</span></dd></div>
              <div className="kv"><dt>Division</dt><dd>{v.division}</dd></div>
              <div className="kv"><dt>Height / reach</dt><dd>{v.heightCm} cm / {v.reachCm} cm</dd></div>
              <div className="kv"><dt>Stance</dt><dd>{v.stance}</dd></div>
              <div className="kv"><dt>Style</dt><dd>{v.style}</dd></div>
            </dl>
          </Section>

          <Section title="Career">
            <dl>
              <div className="kv"><dt>Record</dt><dd>{v.recordText} <span className="dim">({v.fights} fights)</span></dd></div>
              <div className="kv"><dt>Knockouts</dt><dd>{v.record.koWins} wins · {v.koRate}% · stopped {v.record.koLosses}×</dd></div>
              <div className="kv"><dt>Last fought</dt><dd>{v.lastFightWeeksAgo === null ? 'No bouts on file' : `${v.lastFightWeeksAgo} weeks ago`}</dd></div>
              <div className="kv"><dt>Recent form</dt><dd><FormDots form={v.form} /> <span className="dim" style={{ marginLeft: 8 }}>{v.momentumLabel}</span></dd></div>
              <div className="kv"><dt>Career stage</dt><dd>{v.stage}</dd></div>
              <div className="kv"><dt>Availability</dt><dd className={v.availability.status === 'available' ? 'good' : 'warn'}>{v.availability.label}{v.availability.weeks ? ` · ${v.availability.weeks} weeks` : ''}</dd></div>
              <div className="kv"><dt>Division standing</dt><dd>{v.standing.rank > 0 ? `#${v.standing.rank} of ${v.standing.of}` : 'Unrated'} <span className="dim">(public form, not an official ranking)</span></dd></div>
              <div className="kv"><dt>Titles</dt><dd className="dim">None on record</dd></div>
            </dl>
          </Section>

          <Section title="Market">
            <div className="attr-row"><span>Popularity</span><Meter value={v.popularity} tone="gold" label="Popularity" /><span className="num" style={{ fontSize: 20, textAlign: 'right' }}>{v.popularity}</span></div>
            <div className="attr-row"><span>Reputation</span><Meter value={v.reputation} tone="gold" label="Reputation" /><span className="num" style={{ fontSize: 20, textAlign: 'right' }}>{v.reputation}</span></div>
            <div className="attr-row"><span>Marketability</span><span className="dim" style={{ fontSize: 13 }}>{scouted ? 'scout read' : 'rough guess'}</span><span><RangeText r={v.marketability} scouted={v.knowledge.reports > 0 || mine} /></span></div>
            <div className="kv" style={{ marginTop: 8 }}><dt>Value tier</dt><dd>{v.market.valueTier}</dd></div>
            {v.contract.kind !== 'own' && v.status === 'active' && (
              <div className="kv"><dt>Typical ask</dt><dd className="num" style={{ fontSize: 17 }}>{money(v.market.askBand.retainerLo, false)}–{money(v.market.askBand.retainerHi, false)}/wk · {money(v.market.askBand.purseLo)}–{money(v.market.askBand.purseHi)}/fight</dd></div>
            )}
          </Section>

          <Section title="Contract">
            {c.kind === 'own' && (
              <dl>
                <div className="kv"><dt>Status</dt><dd><span className={`pill ${c.stage}`}>{STAGE_LABEL[c.stage]}</span></dd></div>
                <div className="kv"><dt>Term</dt><dd>{formatDay(c.contract.startDay)} → {formatDay(c.contract.endDay)} <span className="dim">({c.weeksLeft} weeks left)</span></dd></div>
                <div className="kv"><dt>Weekly retainer</dt><dd className="num" style={{ fontSize: 18 }}>{money(c.contract.weeklyRetainer, false)}</dd></div>
                <div className="kv"><dt>Base purse</dt><dd className="num" style={{ fontSize: 18 }}>{money(c.contract.basePurse, false)} <span className="dim" style={{ fontSize: 13 }}>+ {money(c.contract.winBonus, false)} win bonus</span></dd></div>
                <div className="kv"><dt>Fights</dt><dd>{c.contract.fightsRemaining} of {c.contract.fightsTotal} remaining · min {c.contract.minFightsPerYear}/yr</dd></div>
                <div className="kv"><dt>PPV share</dt><dd>{c.contract.ppvShare > 0 ? `${(c.contract.ppvShare * 100).toFixed(1)}%` : 'None'}</dd></div>
                <div className="kv"><dt>Signing bonus</dt><dd>{money(c.contract.signingBonus, false)} <span className="dim">(paid)</span></dd></div>
                <div className="kv"><dt>Promises</dt><dd>{c.contract.titlePromise ? <span className="gold">Title opportunity owed</span> : 'None'}</dd></div>
              </dl>
            )}
            {c.kind === 'rival' && <p>Under contract with <b>{c.promotionName}</b> — expected to run for roughly {c.approxMonthsLeft} more months.</p>}
            {c.kind === 'none' && <p className="dim">{v.status === 'retired' ? 'Retired.' : `Free agent${v.market.availableWeeks !== null ? ` for ${v.market.availableWeeks} weeks` : ''}.`}</p>}
          </Section>

          {v.own && (
            <Section title="Condition & training">
              {([['Fitness', v.own.fitness, 'good'], ['Conditioning', v.own.conditioning, 'good'], ['Confidence', v.own.confidence, 'blue'], ['Morale', v.own.morale, undefined]] as const).map(([label, b, tone]) => (
                <div className="attr-row" key={label}><span>{label}</span><Meter value={b.value} tone={tone} label={label} /><span className="dim" style={{ textAlign: 'right', fontSize: 13 }}>{b.label}</span></div>
              ))}
              <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13 }}>Mood: <b style={{ color: 'var(--text)' }}>{v.own.mood}</b></p>
              <div className="focus-grid">
                {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map((k) => (
                  <button key={k} className={`focus-opt${v.own!.trainingFocus === k ? ' on' : ''}`} aria-pressed={v.own!.trainingFocus === k} onClick={() => setTraining(v.id, k)}>
                    <div className="n">{FOCUS_LABELS[k]}</div><div className="d">{FOCUS_BLURBS[k]}</div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Fight history">
            {v.fightHistory.length === 0 ? <p className="empty">No recorded bouts yet in this game. Fights you arrange, and those you hear about, appear here.</p> : (
              <div className="table-wrap"><table className="table">
                <tbody>{v.fightHistory.map((h) => (
                  <tr key={h.fightId} className="row" onClick={() => navigate('fight', h.fightId)}>
                    <td className="num dim">{formatDay(h.day, true)}</td>
                    <td><b className={h.result === 'W' ? 'good' : h.result === 'L' ? 'red' : ''}>{h.result}</b> <span className="dim">{h.method}{h.method !== 'UD' && h.method !== 'MD' && h.method !== 'SD' && h.method !== 'Draw' ? ` R${h.round}` : ''}</span></td>
                    <td>vs {h.opponentName}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="Career history">
            {v.history.length === 0 ? <p className="empty">Nothing on record.</p> : (
              <ul className="history">{v.history.map((h, i) => <li key={i}><span className="caps" style={{ marginRight: 10 }}>{formatDay(h.day, true)}</span>{h.text}</li>)}</ul>
            )}
            <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Titles and achievements arrive with championships in a later phase.</p>
          </Section>
        </div>
      </div>
      {scouting && <ScoutDialog id={v.id} onClose={() => setScouting(false)} />}
    </>
  )
}
