import { useState } from 'react'
import { FIGHTER_TAGS, type FighterView } from '../../engine/view'
import { useGame } from '../../store/gameStore'

/** Your private tags and note on a fighter: shown as a column in the tables and searchable. Never affects the simulation. */
export function FighterNotes({ v }: { v: FighterView }) {
  const set = useGame((s) => s.setFighterNote)
  const [text, setText] = useState(v.myNote)
  const [custom, setCustom] = useState('')
  const toggle = (t: string) => set(v.id, { tags: v.myTags.includes(t) ? v.myTags.filter((x) => x !== t) : [...v.myTags, t] })
  return (
    <section className="fighter-notes" aria-label="My notes" data-testid="fighter-notes">
      <div className="fn-tags" role="group" aria-label="My tags">
        {[...FIGHTER_TAGS, ...v.myTags.filter((t) => !(FIGHTER_TAGS as readonly string[]).includes(t))].map((t) => (
          <button key={t} type="button" className={`chip tag-chip${v.myTags.includes(t) ? ' on' : ''}`} aria-pressed={v.myTags.includes(t)} onClick={() => toggle(t)}>{t}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const t = custom.trim(); if (t) { set(v.id, { tags: [...v.myTags, t] }); setCustom('') } }}>
          <input className="input compact" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ tag" aria-label="New tag" maxLength={24} />
        </form>
      </div>
      <textarea className="input fn-text" rows={2} value={text} maxLength={600} placeholder="Private note (only you see this)…" aria-label="My note" onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== v.myNote) set(v.id, { text }) }} />
    </section>
  )
}
