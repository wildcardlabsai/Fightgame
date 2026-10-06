import { useRef } from 'react'
import { formatDay } from '../../engine/calendar'
import { useGame } from '../../store/gameStore'
import { Section } from '../components/Bits'

export function SettingsScreen() {
  const game = useGame((s) => s.game)!
  const saves = useGame((s) => s.saves)
  const saveNow = useGame((s) => s.saveNow)
  const load = useGame((s) => s.loadSaved)
  const remove = useGame((s) => s.removeSave)
  const setAutosave = useGame((s) => s.setAutosave)
  const exportGame = useGame((s) => s.exportGame)
  const importGame = useGame((s) => s.importGame)
  const quit = useGame((s) => s.quitToMenu)
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
        <div><h1 className="display">Save &amp; Settings</h1><p className="sub">Saves live in this browser. Export a file to back up or move your game.</p></div>
      </div>
      <div className="grid-2">
        <div>
          <Section title="This game">
            <dl>
              <div className="kv"><dt>World seed</dt><dd className="num" style={{ fontSize: 18 }}>{game.seed}</dd></div>
              <div className="kv"><dt>Difficulty</dt><dd style={{ textTransform: 'capitalize' }}>{game.settings.difficulty}</dd></div>
              <div className="kv"><dt>Game date</dt><dd>{formatDay(game.today)}</dd></div>
              <div className="kv"><dt>Fighters in world</dt><dd>{Object.keys(game.fighters).length}</dd></div>
              <div className="kv"><dt>Save version</dt><dd>{game.version}</dd></div>
            </dl>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0' }}>
              <input type="checkbox" checked={game.settings.autosave} onChange={(e) => setAutosave(e.target.checked)} />
              Autosave whenever time advances
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={saveNow}>Save now</button>
              <button className="btn ghost" onClick={download}>Export save file</button>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import save file</button>
              <button className="btn ghost" onClick={quit}>Save &amp; quit to menu</button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f && confirm('Importing replaces the game you are currently playing (it is autosaved first). Continue?')) {
                saveNow()
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
                      <div style={{ fontWeight: 600 }}>{m.promotionName}{m.id === game.saveId && <span className="chip gold" style={{ marginLeft: 8 }}>Current</span>}</div>
                      <div className="dim" style={{ fontSize: 13 }}>{formatDay(m.today)} · saved {new Date(m.savedAt).toLocaleString('en-GB')}</div>
                    </div>
                    {m.id !== game.saveId && <button className="btn small" onClick={() => load(m.id)}>Load</button>}
                    <button className="linkbtn" onClick={() => { if (confirm(`Delete "${m.promotionName}"?`)) remove(m.id) }}>Delete</button>
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
