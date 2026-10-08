import { useEffect, useRef, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import { LOGO_COLORS, LOGO_EMBLEMS, monogramFor } from '../../engine/promotions'
import { DEFAULT_SCENARIO, SCENARIOS, SCENARIO_ORDER, type CareerScenario, type ScenarioId } from '../../engine/scenarios'
import type { Promotion } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { EmblemGlyph } from '../components/Icons'
import { PromoLogo } from '../components/Bits'
import { artWorldSeed, hasFighterArt } from '../../assets/registry'

const money = (n: number) => (n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m` : `£${Math.round(n / 1000)}k`)
const DIFF_TONE: Record<CareerScenario['difficultyLabel'], string> = { Easy: 'good', Normal: '', Hard: 'gold', Expert: 'red' }

/** Five pips, no raw numbers: relative comparison between careers. */
function Pips({ n, label }: { n: number; label: string }) {
  return (
    <div className="pips" role="img" aria-label={`${label}: ${n} of 5`}>
      <span className="pip-label">{label}</span>
      <span className="pip-row">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`pip${i <= n ? ' on' : ''}`} />)}</span>
    </div>
  )
}

function ScenarioCard({ sc, on, pick }: { sc: CareerScenario; on: boolean; pick: () => void }) {
  const fighters = sc.roster.reduce((n, g) => n + g.count, 0)
  return (
    <button type="button" role="radio" aria-checked={on} className={`scen${on ? ' on' : ''}`} onClick={pick} data-scenario={sc.id}>
      <div className="scen-top"><span className="display scen-name">{sc.name}</span><span className={`chip ${DIFF_TONE[sc.difficultyLabel]}`}>{sc.difficultyLabel}</span></div>
      <div className="scen-tag">{sc.tagline}</div>
      <div className="scen-facts"><span><b>{money(sc.startingCash)}</b> cash</span><span><b>{fighters}</b> fighter{fighters === 1 ? '' : 's'}</span><span><b>{sc.reputation}</b> reputation</span></div>
      <div className="scen-bars">
        <Pips n={sc.bars.cash} label="Cash" /><Pips n={sc.bars.roster} label="Roster" /><Pips n={sc.bars.reputation} label="Reputation" /><Pips n={sc.bars.size} label="Size" />
      </div>
      <div className="scen-desc">{sc.description}</div>
      <div className="scen-goal"><span className="caps">Objective</span> {sc.objectives[0].label}</div>
    </button>
  )
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function TitleScreen() {
  const saves = useGame((s) => s.saves)
  const start = useGame((s) => s.startNewGame)
  const load = useGame((s) => s.loadSaved)
  const remove = useGame((s) => s.removeSave)
  const importGame = useGame((s) => s.importGame)
  const refresh = useGame((s) => s.refreshSaves)
  const storageKind = useGame((s) => s.storageKind)
  const [creating, setCreating] = useState(false)
  const [touched, setTouched] = useState(false)
  useEffect(() => { void refresh() }, [refresh])
  // Saves arrive asynchronously (IndexedDB): once we know there are none, open the new-game form.
  useEffect(() => { if (!touched && storageKind !== 'opening…') setCreating(saves.length === 0) }, [saves.length, storageKind, touched])
  const [name, setName] = useState('Iron Crown Promotions')
  const [promoter, setPromoter] = useState('')
  const [home, setHome] = useState<'ENG' | 'USA'>('ENG')
  const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO)
  const scenario = SCENARIOS[scenarioId]
  const [seed, setSeed] = useState(randomSeed)
  const [color, setColor] = useState(LOGO_COLORS[0])
  const [emblem, setEmblem] = useState<Promotion['logo']['emblem']>('crown')
  const fileRef = useRef<HTMLInputElement>(null)

  const valid = name.trim().length >= 3 && promoter.trim().length >= 2
  const logo = { monogram: monogramFor(name), color, emblem }

  return (
    <div className="title">
      <div className="title-art"><img src={`${import.meta.env.BASE_URL}brand/badge.png`} alt="Fight Empire — Boxing Management Simulation" /></div>
      <div className="title-panel">
        {!creating ? (
          <>
            <div>
              <h1 className="display" style={{ fontSize: 56 }}>Welcome back</h1>
              <p className="dim">Pick up where you left off, or start a new empire.</p>
            </div>
            <button className="btn primary big" onClick={() => load(saves[0].id)}>Continue ▸</button>
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="caps">Saved games</div>
              {saves.map((m) => (
                <div key={m.id} className="save-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{m.promotionName}{m.slot === 'auto' && <span className="chip" style={{ marginLeft: 8 }}>Autosave</span>}</div>
                    <div className="dim" style={{ fontSize: 13 }}>{formatDay(m.today)} · saved {new Date(m.savedAt).toLocaleString('en-GB')}</div>
                  </div>
                  <button className="btn small" onClick={() => load(m.id)}>Load</button>
                  <button className="linkbtn" onClick={() => { if (confirm(`Delete "${m.promotionName}"? This cannot be undone.`)) remove(m.id) }}>Delete</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => { setTouched(true); setCreating(true) }}>New Game</button>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import Save File</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="display" style={{ fontSize: 56 }}>Found your <span className="red">promotion</span></h1>
              <p className="dim">Choose how your career begins, then name your promotion.</p>
            </div>
            <div className="field"><label id="scen-label">Starting career</label>
              <div className="scen-grid" role="radiogroup" aria-labelledby="scen-label">
                {SCENARIO_ORDER.map((id) => <ScenarioCard key={id} sc={SCENARIOS[id]} on={scenarioId === id} pick={() => setScenarioId(id)} />)}
              </div>
              <span className="dim" style={{ fontSize: 13 }}>{scenario.opens}</span>
            </div>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (valid) start({ seed, promotionName: name.trim(), promoterName: promoter.trim(), homeCountry: home, difficulty: scenario.difficulty, logo, scenario: scenarioId }) }}>
              <div className="field"><label htmlFor="pn">Promotion name</label>
                <input id="pn" className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} /></div>
              <div className="field"><label htmlFor="pr">Your name</label>
                <input id="pr" className="input" value={promoter} maxLength={28} placeholder="e.g. Matt Taylor" onChange={(e) => setPromoter(e.target.value)} /></div>
              <div className="field"><label>Emblem &amp; colour</label>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <PromoLogo p={{ logo }} size={64} />
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="pick-row">{LOGO_EMBLEMS.map((e) => (
                      <button type="button" key={e} className={`emblem-btn${emblem === e ? ' on' : ''}`} onClick={() => setEmblem(e)} aria-label={e} aria-pressed={emblem === e}><EmblemGlyph emblem={e} /></button>
                    ))}</div>
                    <div className="pick-row">{LOGO_COLORS.map((c) => (
                      <button type="button" key={c} className={`swatch${color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} />
                    ))}</div>
                  </div>
                </div>
              </div>
              <div className="field"><label htmlFor="hm">Home base</label>
                <select id="hm" className="select" value={home} onChange={(e) => setHome(e.target.value as 'ENG' | 'USA')}>
                  <option value="ENG">United Kingdom</option><option value="USA">United States</option>
                </select></div>
              <div className="field"><label htmlFor="sd">World seed</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="sd" className="input" value={seed} maxLength={24} onChange={(e) => setSeed(e.target.value)} />
                  <button type="button" className="btn ghost small" onClick={() => setSeed(randomSeed())}>Randomise</button>
                  {hasFighterArt() && <button type="button" className="btn ghost small" data-testid="illustrated-world" onClick={() => setSeed(artWorldSeed()!)}>Illustrated world</button>}
                </div>
                <span className="dim" style={{ fontSize: 13 }}>The same seed always generates the same boxing world.</span></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn primary big" type="submit" disabled={!valid || seed.trim() === ''}>Open the doors ▸</button>
                {saves.length > 0 && <button type="button" className="btn ghost" onClick={() => { setTouched(true); setCreating(false) }}>Back</button>}
              </div>
            </form>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) importGame(await file.text())
          e.target.value = ''
        }} />
      </div>
    </div>
  )
}
