import { useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import type { MessageCategory } from '../../engine/types'
import { useGame } from '../../store/gameStore'

const CATS: (MessageCategory | 'all')[] = ['all', 'contract', 'fighter', 'finance', 'system', 'world']

export function InboxScreen() {
  const game = useGame((s) => s.game)!
  const read = useGame((s) => s.readMessage)
  const readAll = useGame((s) => s.readAll)
  const remove = useGame((s) => s.removeMessage)
  const openLink = useGame((s) => s.openLink)
  const [cat, setCat] = useState<MessageCategory | 'all'>('all')
  const [selId, setSelId] = useState<string | null>(null)

  const list = useMemo(() => game.inbox.filter((m) => cat === 'all' || m.category === cat), [game.inbox, cat])
  const sel = game.inbox.find((m) => m.id === selId) ?? null
  const unread = game.inbox.filter((m) => !m.read).length

  const open = (id: string) => { setSelId(id); read(id, true) }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Inbox</h1>
          <p className="sub">{unread > 0 ? `${unread} unread` : 'All caught up'} · {game.inbox.length} messages</p>
        </div>
        <button className="btn ghost" onClick={readAll} disabled={unread === 0}>Mark all read</button>
      </div>
      <div className="tabs">
        {CATS.map((c) => (
          <button key={c} className={`tab${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="inbox">
        <div className="inbox-list">
          {list.length === 0 && <p className="empty" style={{ padding: 20 }}>No messages here.</p>}
          {list.map((m) => (
            <button key={m.id} className={`msg-row ${m.priority}${m.read ? '' : ' unread'}${sel?.id === m.id ? ' sel' : ''}`} onClick={() => open(m.id)}>
              <div className="s">{m.subject}</div>
              <div className="m"><span>{m.from}</span><span>{formatDay(m.day, false)}</span>{m.priority !== 'normal' && <span className={m.priority === 'urgent' ? 'red' : 'gold'}>{m.priority}</span>}</div>
            </button>
          ))}
        </div>
        <div className="msg-body">
          {sel ? (
            <>
              <div className="caps">{sel.from} · {formatDay(sel.day)}</div>
              <h3 className="display">{sel.subject}</h3>
              <p>{sel.body}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                {sel.link && (
                  <button className="btn primary" onClick={() => openLink(sel.link!)}>
                    {sel.link.kind === 'fighter' ? 'View fighter' : 'Go there'}
                  </button>
                )}
                <button className="btn ghost" onClick={() => read(sel.id, false)}>Mark unread</button>
                <button className="btn ghost" onClick={() => { remove(sel.id); setSelId(null) }}>Delete</button>
              </div>
            </>
          ) : <p className="empty">Select a message to read it.</p>}
        </div>
      </div>
    </>
  )
}
