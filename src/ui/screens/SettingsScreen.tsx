import { useEffect, useRef } from 'react'
import { ADVISOR_MODES, type AdvisorMode } from '../../engine/advisor'
import { formatDay } from '../../engine/calendar'
import { scenarioById } from '../../engine/scenarios'
import { tierLabel } from '../../engine/tiers'
import { useGame } from '../../store/gameStore'
import { useViews } from '../../store/hooks'
import { usePrefs } from '../../store/prefs'
import { Section } from '../components/Bits'

const ADVISOR_BLURB: Record<AdvisorMode, string> = {
  full: 'Show the most useful tips, as well as warnings.',
  standard: 'Important warnings and the occasional tip. (Default)',
  minimal: 'Only serious financial and career warnings.',
  off: 'No advisor. You are on your own.',
}
const SLIDERS = [['master', 'Master'], ['music', 'Music'], ['ui', 'UI'], ['sfx', 'Sound effects'], ['fight', 'Fight']] as const

function AdvisorSettings() {
  const mode = usePrefs((s) => s.advisor)
  const setAdvisor = usePrefs((s) => s.setAdvisor)
  const stepsHidden = usePrefs((s) => s.firstStepsHidden)
  const hideSteps = usePrefs((s) => s.hideFirstSteps)
  return (
    <Section title="Advisor">
      <p className="dim" style={{ fontSize: 13, marginBottom: 10 }}>Your promoter’s advisor points out financial and career risks. It never changes prices, results or the rules — you can always ignore it.</p>
      <div className="seg" role="radiogroup" aria-label="Advisor level">
        {ADVISOR_MODES.map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setAdvisor(m)}>{m}</button>)}
      </div>
      <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>{ADVISOR_BLURB[mode]}</p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '12px 0 0' }}>
        <input type="checkbox" checked={!stepsHidden} onChange={(e) => hideSteps(!e.target.checked)} /> Show “First steps” on the dashboard
      </label>
    </Section>
  )
}

function AudioSettings() {
  const a = usePrefs((s) => s.audio)
  const setAudio = usePrefs((s) => s.setAudio)
  const reset = usePrefs((s) => s.resetAudio)
  return (
    <Section title="Audio">
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <input type="checkbox" checked={a.enabled} onChange={(e) => setAudio({ enabled: e.target.checked })} data-testid="audio-enabled" /> Enable audio
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <input type="checkbox" checked={a.muted} onChange={(e) => setAudio({ muted: e.target.checked })} data-testid="audio-mute" /> Mute all
      </label>
      {SLIDERS.map(([k, label]) => (
        <div className="vol-row" key={k}>
          <label htmlFor={`vol-${k}`}>{label}</label>
          <input id={`vol-${k}`} type="range" min={0} max={100} step={1} value={a[k]} disabled={!a.enabled} onChange={(e) => setAudio({ [k]: Number(e.target.value) })} aria-valuetext={`${a[k]} percent`} />
          <span className="num">{a[k]}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button className="btn small ghost" data-sfx="click">Test UI</button>
        <button className="btn small ghost" data-sfx="notification">Test effects</button>
        <button className="btn small ghost" data-sfx="bell">Test fight bell</button>
        <button className="btn small ghost" data-sfx="none" onClick={reset}>Reset</button>
      </div>
      <p className="dim" style={{ fontSize: 13, marginTop: 10 }}>Every sound is paired with something you can see — nothing is conveyed by audio alone. Sound only starts after you click or tap something, and music has no tracks yet.</p>
    </Section>
  )
}

export function SettingsScreen() {
  const game = useGame((s) => s.game)!
  const saves = useGame((s) => s.saves)
  const storageKind = useGame((s) => s.storageKind)
  const refresh = useGame((s) => s.refreshSaves)
  useEffect(() => { void refresh() }, [refresh])
  const saveNow = useGame((s) => s.saveNow)
  const load = useGame((s) => s.loadSaved)
  const remove = useGame((s) => s.removeSave)
  const setAutosave = useGame((s) => s.setAutosave)
  const exportGame = useGame((s) => s.exportGame)
  const importGame = useGame((s) => s.importGame)
  const quit = useGame((s) => s.quitToMenu)
  const views = useViews()
  const fileRef = useRef<HTMLInputElement>(null)

  const download = () => {
    const json = exportGame()
    if (!json) return
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `fight-empire-${game.promotions[game.playerPromotionId].name.replace(/\W+/g, '-').toLowerCase()}-${formatDay(game.today).replace(/\s/g, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="display">Save &amp; Settings</h1><p className="sub">Saves live in this browser ({storageKind === 'indexeddb' ? 'IndexedDB, compressed' : storageKind}). Export a file to back up or move your game.</p></div>
      </div>
      <div className="grid-2">
        <div>
          <AdvisorSettings />
          <AudioSettings />
          <Section title="This game">
            <dl>
              <div className="kv"><dt>World seed</dt><dd className="num" style={{ fontSize: 18 }}>{game.seed}</dd></div>
              <div className="kv"><dt>Difficulty</dt><dd style={{ textTransform: 'capitalize' }}>{game.settings.difficulty}</dd></div>
              <div className="kv"><dt>Promotion tier</dt><dd>{tierLabel(game.promotions[game.playerPromotionId].tier)}</dd></div>
              {game.scenario && <div className="kv"><dt>Career</dt><dd>{scenarioById(game.scenario.id)?.name}</dd></div>}
              <div className="kv"><dt>Game date</dt><dd>{formatDay(game.today)}</dd></div>
              <div className="kv"><dt>Fighters you know of</dt><dd>{views.known().length}</dd></div>
              <div className="kv"><dt>Save version</dt><dd>{game.version}</dd></div>
            </dl>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0' }}>
              <input type="checkbox" checked={game.settings.autosave} onChange={(e) => setAutosave(e.target.checked)} />
              Autosave whenever time advances
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => void saveNow()}>Save now</button>
              <button className="btn ghost" onClick={() => { const n = prompt('Name this save slot'); if (n) void saveNow({ slotName: n }) }}>Save to new slot…</button>
              <button className="btn ghost" onClick={download}>Export save file</button>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import save file</button>
              <button className="btn ghost" onClick={() => void quit()}>Save &amp; quit to menu</button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f && confirm('Importing replaces the game you are currently playing (it is autosaved first). Continue?')) {
                await saveNow()
                importGame(await f.text())
              }
              e.target.value = ''
            }} />
          </Section>
        </div>
        <div>
          <Section title="Save slots">
            {saves.length === 0 ? <p className="empty">No saves yet.</p> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {saves.map((m) => (
                  <div key={m.id} className="save-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{m.name}{m.slot === 'auto' && <span className="chip" style={{ marginLeft: 8 }}>Autosave</span>}{m.id === game.saveId && <span className="chip gold" style={{ marginLeft: 8 }}>Current</span>}</div>
                      <div className="dim" style={{ fontSize: 13 }}>{formatDay(m.today)} · saved {new Date(m.savedAt).toLocaleString('en-GB')} · {(m.bytes / 1024 / (m.compressed ? 1 : 1)).toFixed(0)} kB{m.compressed ? ' (compressed)' : ''}</div>
                    </div>
                    <button className="btn small" onClick={() => void load(m.id)}>Load</button>
                    <button className="linkbtn" onClick={() => { if (confirm(`Delete "${m.name}"?`)) void remove(m.id) }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
