import { useMemo, useState } from 'react'
import { formatDay } from '../../engine/calendar'
import type { MessageCategory } from '../../engine/types'
import { useGame } from '../../store/gameStore'
import { KIND_CLASS, msgKind } from '../inboxKinds'
import { foldItems, inboxItems, inboxSummary, TIER_HELP, TIER_LABEL, TIER_ORDER, type InboxItem, type InboxTier } from '../../engine/inboxViews'

const CATS: (MessageCategory | 'all')[] = ['all', 'contract', 'fighter', 'finance', 'system', 'world']

export function InboxScreen() {
  const game = useGame((s) => s.game)!
  const read = useGame((s) => s.readMessage)
  const readAll = useGame((s) => s.readAll)
  const remove = useGame((s) => s.removeMessage)
  const openLink = useGame((s) => s.openLink)
  const [cat, setCat] = useState<MessageCategory | 'all'>('all')
  const [tier, setTier] = useState<InboxTier | 'all'>('all')
  const [selId, setSelId] = useState<string | null>(null)
  const [openFolds, setOpenFolds] = useState<Record<string, boolean>>({})

  const items = useMemo(() => inboxItems(game), [game])
  const summary = useMemo(() => inboxSummary(game, items), [game, items])
  const list = useMemo(() => items.filter((it) => (cat === 'all' || it.msg.category === cat) && (tier === 'all' || it.tier === tier)), [items, cat, tier])
  // Decisions still waiting come first (in the whole inbox, and in the Needs action tab); everything else follows by date. Nothing is hidden.
  const waiting = useMemo(() => list.filter((it) => it.open), [list])
  const rest = useMemo(() => foldItems(list.filter((it) => !it.open)), [list])
  const sel = game.inbox.find((m) => m.id === selId) ?? null
  const selItem = items.find((it) => it.msg.id === selId) ?? null
  const unread = game.inbox.filter((m) => !m.read).length
  const readThese = () => { for (const it of list) if (!it.msg.read) read(it.msg.id, true) }

  const open = (id: string) => { setSelId(id); read(id, true) }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="display">Inbox</h1>
          <p className="sub" data-testid="inbox-summary">{summary.open > 0 ? <b className="red">{summary.open} waiting for a decision</b> : 'Nothing is waiting for a decision'} · {unread > 0 ? `${unread} unread` : 'all read'} · {game.inbox.length} messages</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={readThese} disabled={!list.some((it) => !it.msg.read)} data-testid="inbox-read-view">Mark these read</button>
          <button className="btn ghost" onClick={readAll} disabled={unread === 0}>Mark all read</button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Message priority" data-testid="inbox-tiers">
        <button role="tab" aria-selected={tier === 'all'} className={`tab${tier === 'all' ? ' active' : ''}`} onClick={() => setTier('all')}>All{unread > 0 && <span className="count">{unread}</span>}</button>
        {TIER_ORDER.map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} title={TIER_HELP[t]} data-tier={t} className={`tab${tier === t ? ' active' : ''}`} onClick={() => setTier(t)}>
            {TIER_LABEL[t]}{(t === 'action' ? summary.open : summary.unread[t]) > 0 && <span className={`count${t === 'action' ? ' hot' : ''}`}>{t === 'action' ? summary.open : summary.unread[t]}</span>}
          </button>
        ))}
      </div>
      <div className="tabs" role="group" aria-label="Topic">
        {CATS.map((c) => (
          <button key={c} className={`tab${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="inbox">
        <div className="inbox-list">
          {list.length === 0 && <p className="empty" style={{ padding: 20 }}>No messages here.</p>}
          {waiting.length > 0 && <div className="inbox-group caps" data-testid="inbox-waiting">Waiting for a decision · {waiting.length}</div>}
          {waiting.map((it) => <Row key={it.msg.id} it={it} selId={sel?.id ?? null} open={open} />)}
          {waiting.length > 0 && rest.length > 0 && <div className="inbox-group caps">Everything else</div>}
          {rest.map((r) => r.kind === 'one'
            ? <Row key={r.item.msg.id} it={r.item} selId={sel?.id ?? null} open={open} />
            : (
              <div key={r.label} className="inbox-fold" data-testid="inbox-fold">
                <button type="button" className="msg-row fold" aria-expanded={!!openFolds[r.label]} onClick={() => setOpenFolds((o) => ({ ...o, [r.label]: !o[r.label] }))}>
                  <div className="s">{r.unread > 0 && <i className="unread-dot" aria-label="Unread" />}<b>{r.label}</b> <span className="dim">×{r.items.length}</span></div>
                  <div className="m"><span>{r.unread > 0 ? `${r.unread} unread` : 'all read'}</span>{r.open > 0 && <span className="red">{r.open} waiting</span>}<span>{openFolds[r.label] ? 'Hide' : 'Show all'}</span></div>
                </button>
                {openFolds[r.label] && r.items.map((it) => <Row key={it.msg.id} it={it} selId={sel?.id ?? null} open={open} nested />)}
              </div>
            ))}
        </div>
        <div className="msg-body">
          {sel ? (
            <>
              <div className="caps"><span className={`catpill ${KIND_CLASS[msgKind(sel)]}`}>{msgKind(sel)}</span> {sel.from} · {formatDay(sel.day)}</div>
              <h3 className="display">{sel.subject}</h3>
              {selItem && selItem.tier === 'action' && <p className={selItem.open ? 'inbox-open' : 'dim'} role="status" data-testid="inbox-decision">{selItem.open ? 'This is still waiting for your decision.' : 'This decision is closed (answered, withdrawn or lapsed). The message stays here for your records.'}</p>}
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
          ) : (
            <>
            <p className="empty inbox-select-hint">Select a message to read it.</p>
            <div className="inbox-desk" data-testid="inbox-desk">
              {waiting.length > 0 ? (
                <>
                  <div className="caps red">{waiting.length} decision{waiting.length === 1 ? '' : 's'} waiting for you</div>
                  <h3 className="display">Start here</h3>
                  {waiting.slice(0, 4).map((it) => (
                    <button key={it.msg.id} type="button" className="desk-pick" onClick={() => open(it.msg.id)}>
                      <span className="dp-s"><span className={`catpill ${KIND_CLASS[msgKind(it.msg)]}`}>{msgKind(it.msg)}</span> {it.msg.subject}</span>
                      <span className="dim dp-m">{it.msg.from} · {formatDay(it.msg.day, false)}{it.msg.priority !== 'normal' ? ` · ${it.msg.priority}` : ''}</span>
                      <span className="dp-go">Open ▸</span>
                    </button>
                  ))}
                  <p className="dim">Results and updates never need an answer; they can wait. Select any message in the list to read it.</p>
                </>
              ) : <p className="empty">{list.length === 0 ? 'No messages here.' : 'Nothing is waiting for your decision. Select a message to read it.'}</p>}
            </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ it, selId, open, nested }: { it: InboxItem; selId: string | null; open: (id: string) => void; nested?: boolean }) {
  const m = it.msg
  return (
    <button className={`msg-row ${m.priority}${m.read ? '' : ' unread'}${selId === m.id ? ' sel' : ''}${nested ? ' nested' : ''}`} onClick={() => open(m.id)} data-tier={it.tier} data-open={it.open ? 'true' : undefined}>
      <div className="s">{!m.read && <i className="unread-dot" aria-label="Unread" />}<span className={`catpill ${KIND_CLASS[msgKind(m)]}`}>{msgKind(m)}</span> {m.subject}</div>
      <div className="m"><span>{m.from}</span><span>{formatDay(m.day, false)}</span>{m.priority !== 'normal' && <span className={m.priority === 'urgent' ? 'red' : 'gold'}>{m.priority}</span>}{it.open && <span className="red">decision needed</span>}</div>
    </button>
  )
}
