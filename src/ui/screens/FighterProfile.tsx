import { nation } from '../../data/nations'
import { weightClassLabel, weightLimitLabel } from '../../data/weightClasses'
import { formatDay, weeksBetween } from '../../engine/calendar'
import {
  ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, careerStage, fighterAge, fighterRating, koRate,
  potentialBand, totalFights,
} from '../../engine/fighters'
import { contractOf, promotionOf } from '../../engine/selectors'
import { FOCUS_BLURBS, FOCUS_LABELS } from '../../engine/systems/development'
import type { TrainingFocus } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { Avatar, Flag, Meter, Section } from '../components/Bits'
import { Ring } from '../components/Charts'
import { money, moodLabel } from '../format'

export function FighterProfile({ id }: { id: string }) {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const setTraining = useGame((s) => s.setTraining)
  const f = game.fighters[id]

  if (!f) {
    return (
      <>
        <h1 className="display" style={{ fontSize: 48 }}>Fighter not found</h1>
        <p className="dim" style={{ margin: '12px 0 20px' }}>That profile doesn’t exist in this save.</p>
        <button className="btn" onClick={() => navigate('fighters')}>Back to fighters</button>
      </>
    )
  }

  const age = fighterAge(f, game.today)
  const rating = fighterRating(f)
  const contract = contractOf(game, f)
  const promo = promotionOf(game, f)
  const mine = !!promo?.isPlayer
  const stage = careerStage(f, game.today)
  const fights = totalFights(f)
  const weeksLeft = contract ? weeksBetween(game.today, contract.endDay) : null

  return (
    <>
      <div className="profile-hero">
        <Avatar f={f} large />
        <div style={{ flex: 1, minWidth: 260 }}>
          <button className="linkbtn" onClick={() => navigate('fighters')}>◂ All fighters</button>
          <div className="caps" style={{ marginTop: 8 }}>
            {f.nickname ? `“${f.nickname}”` : stage}
          </div>
          <h1 className="display">{f.firstName} <span className="red">{f.lastName}</span></h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <Flag code={f.nationality} />
            <span>{weightClassLabel(f.weightClass)} <span className="dim">({weightLimitLabel(f.weightClass)})</span></span>
            <span className="chip">{stage}</span>
            <span className="chip">{f.style}</span>
            {mine && <span className="chip gold">On your roster</span>}
            {f.status === 'retired' && <span className="chip red">Retired</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="caps">Record</div>
            <div className="display num" style={{ fontSize: 52 }}>{f.record.wins}-{f.record.losses}-{f.record.draws}</div>
            <div className="dim" style={{ fontSize: 13 }}>{f.record.koWins} KOs · {koRate(f)}% KO rate</div>
          </div>
          <div className="ring">
            <Ring value={rating} />
            <div className="c"><div><div className="num">{rating}</div><div className="caps" style={{ fontSize: 11 }}>Overall</div></div></div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 6 }}>
        <div>
          <Section title="In-ring attributes" right={mine ? <span className="dim" style={{ fontSize: 13 }}><span className="gold">▮</span> potential ceiling</span> : undefined}>
            {ATTRIBUTE_KEYS.map((k) => {
              const v = f.attributes[k]
              return (
                <div className="attr-row" key={k}>
                  <span>{ATTRIBUTE_LABELS[k]}</span>
                  <Meter value={v} potential={mine ? f.potential : undefined} label={ATTRIBUTE_LABELS[k]} tone={k === 'marketability' ? 'gold' : undefined} />
                  <span className="num" style={{ fontSize: 20, textAlign: 'right' }}>{Math.round(v)}</span>
                </div>
              )
            })}
            <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>
              {mine
                ? `Potential: ${Math.round(f.potential)} — ${potentialBand(f.potential)}. ${rating >= f.potential - 2 ? 'Fully developed.' : `${Math.round(f.potential - rating)} points of growth still to come.`}`
                : 'Potential: unknown — scouting reports arrive in Phase 2.'}
            </p>
          </Section>

          <Section title="Biography">
            <p style={{ lineHeight: 1.6, maxWidth: '62ch' }}>{f.bio}</p>
            <dl style={{ marginTop: 14 }}>
              <div className="kv"><dt>Personality</dt><dd>{f.personality}</dd></div>
              <div className="kv"><dt>Hometown</dt><dd>{f.hometown}, {nation(f.nationality).name}</dd></div>
              <div className="kv"><dt>Age</dt><dd>{age} <span className="dim">(born {formatDay(f.birthDay)})</span></dd></div>
              <div className="kv"><dt>Height / reach</dt><dd>{f.heightCm} cm / {f.reachCm} cm</dd></div>
              <div className="kv"><dt>Stance</dt><dd>{f.stance}</dd></div>
              <div className="kv"><dt>Career</dt><dd>{fights} fights · {f.record.koWins} KO wins · {f.record.koLosses} stopped</dd></div>
            </dl>
          </Section>
        </div>

        <div>
          <Section title="Condition & standing">
            {([
              ['Fitness', f.fitness, 'good'], ['Conditioning', f.conditioning, 'good'],
              ['Confidence', f.confidence, 'blue'], ['Morale', f.morale, undefined],
              ['Popularity', f.popularity, 'gold'], ['Reputation', f.reputation, 'gold'],
            ] as const).map(([label, value, tone]) => (
              <div className="attr-row" key={label}>
                <span>{label}</span>
                <Meter value={value} tone={tone} label={label} />
                <span className="num" style={{ fontSize: 20, textAlign: 'right' }}>{Math.round(value)}</span>
              </div>
            ))}
            <p className="dim" style={{ marginTop: 8, fontSize: 13 }}>Mood: <b style={{ color: 'var(--text)' }}>{moodLabel(f.morale)}</b></p>
          </Section>

          <Section title="Contract">
            {contract && promo ? (
              <dl>
                <div className="kv"><dt>Promotion</dt><dd>{promo.name}{mine && <span className="chip gold" style={{ marginLeft: 8 }}>You</span>}</dd></div>
                <div className="kv"><dt>Weekly retainer</dt><dd className="num" style={{ fontSize: 18 }}>{money(contract.weeklyRetainer, false)}</dd></div>
                <div className="kv"><dt>Minimum purse</dt><dd className="num" style={{ fontSize: 18 }}>{money(contract.minPurse, false)}</dd></div>
                <div className="kv"><dt>Fights remaining</dt><dd>{contract.fightsRemaining} of {contract.fightsTotal}</dd></div>
                <div className="kv"><dt>Expires</dt><dd>{formatDay(contract.endDay)} <span className={weeksLeft! <= 12 ? 'warn' : 'dim'}>({weeksLeft} weeks)</span></dd></div>
              </dl>
            ) : (
              <p className="dim">{f.status === 'retired' ? `Retired ${f.retiredDay ? formatDay(f.retiredDay) : ''}.` : 'Free agent — signing and contract negotiation arrive in Phase 2.'}</p>
            )}
          </Section>

          {mine && f.status === 'active' && (
            <Section title="Training focus">
              <div className="focus-grid">
                {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map((k) => (
                  <button key={k} className={`focus-opt${f.trainingFocus === k ? ' on' : ''}`} aria-pressed={f.trainingFocus === k} onClick={() => setTraining(f.id, k)}>
                    <div className="n">{FOCUS_LABELS[k]}</div>
                    <div className="d">{FOCUS_BLURBS[k]}</div>
                  </button>
                ))}
              </div>
              <p className="dim" style={{ marginTop: 10, fontSize: 13 }}>Applied every week you advance. Growth depends on age, remaining potential, morale and fitness.</p>
            </Section>
          )}

          <Section title="Fight history">
            <p className="empty">No bouts on file yet. Round-by-round history and fight statistics arrive with the fight engine in Phase 3 — until then the career record above is this fighter’s summary.</p>
          </Section>
        </div>
      </div>
    </>
  )
}
