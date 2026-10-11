/**
 * INBOX PRIORITY (Phase 9). A derived reading of the existing inbox: nothing is stored, nothing is deleted, nothing is hidden. Each message gets a tier
 * — what needs a decision, what is a result, what is a championship development, what is only information — and a decision is "still open" only while
 * the thing it asks about really is (an offer that has since been agreed, withdrawn or has lapsed no longer asks for an answer, but stays readable).
 *
 * Classification uses the message's key, subject and category, plus the live game state for the open/closed test. Old saves are classified the same way.
 */
import type { GameState, InboxMessage } from './types'

export type InboxTier = 'action' | 'results' | 'championship' | 'updates'
export const TIER_ORDER: InboxTier[] = ['action', 'results', 'championship', 'updates']
export const TIER_LABEL: Record<InboxTier, string> = { action: 'Needs action', results: 'Results', championship: 'Championship', updates: 'Updates' }
export const TIER_HELP: Record<InboxTier, string> = {
  action: 'Offers, requests and warnings that ask for a decision.',
  results: 'How your shows and fights went.',
  championship: 'Title shots, mandatory challenges and belts.',
  updates: 'Information you can review later.',
}

export interface InboxItem { msg: InboxMessage; tier: InboxTier; /** For an action message: the decision is still waiting. */ open: boolean; group: string }

const keyOf = (m: InboxMessage, prefix: string): string | null => (m.key && m.key.startsWith(prefix) ? m.key.slice(prefix.length) : null)

/** Which tier a message belongs to, and whether the decision it asks for is still open. */
export function classify(state: GameState, m: InboxMessage): { tier: InboxTier; open: boolean } {
  const subject = m.subject.toLowerCase()
  // ---- championship first: a mandatory challenge or a stripped belt is never "just an update"
  if (/^(mand|strip|vacant|title)/.test(m.key ?? '') || /^(mandatory|title shot|stripped|vacant|belt|championship)/.test(subject) || /mandatory challenger|stripped of|title shot/.test(subject)) {
    const mandatory = /mandatory challenger|^mandatory|title shot/.test(subject)
    return { tier: 'championship', open: mandatory && m.priority !== 'normal' }
  }
  // ---- decisions that can be checked against the live game
  const offerId = keyOf(m, 'offer-')
  if (offerId !== null) return { tier: 'action', open: state.office?.offers[offerId]?.status === 'open' }
  const reqId = keyOf(m, 'req-')
  if (reqId !== null) return { tier: 'action', open: !!state.media?.requests.some((r) => r.id === reqId && r.status === 'open') }
  const sp = keyOf(m, 'sponsor-offer-')
  if (sp !== null) return { tier: 'action', open: !!state.sponsors?.offers.some((o) => o.sponsorId === sp && o.expiresDay >= state.today) }
  if (/wants a fight$/.test(subject) && m.link?.kind === 'fighter') {
    const f = state.fighters[m.link.id]
    return { tier: 'action', open: !!f && f.status === 'active' && !f.activeFightId && f.contractId !== null }
  }
  if (/^counter-offer from|^broadcast offer|would like to renew|is interested$/.test(subject) || /interested$/.test(subject)) return { tier: 'action', open: true }
  // money warnings are always actionable; they are never auto-closed
  if (m.category === 'finance' && m.priority !== 'normal') return { tier: 'action', open: true }
  if (m.category === 'contract' && m.priority !== 'normal') return { tier: 'action', open: true }
  // ---- results
  if (/^(result:|fight week|sold out|tickets on sale)/.test(subject) || /\bsettled:|\bwins?\b.*\bby\b|knocks out|stops|loses to/.test(subject) || /^(night|evnight|ts|brk|review)-/.test(m.key ?? '')) return { tier: 'results', open: false }
  return { tier: 'updates', open: false }
}

/** A short, stable label used to fold runs of similar messages into one row. */
export function groupLabel(m: InboxMessage): string {
  const s = m.subject
  if (/wants a fight$/i.test(s)) return 'Fighters asking for a fight'
  if (/^media request/i.test(s)) return 'Media requests'
  if (/^ranking update/i.test(s)) return 'Ranking updates'
  if (/^word on the circuit|^high-profile free agent/i.test(s)) return 'Scouting tips'
  if (/^fight offer:/i.test(s)) return 'Fight offers from rivals'
  if (/offer has been withdrawn|turn down your counter|accept your counter/i.test(s)) return 'Offer replies'
  if (/is interested$/i.test(s)) return 'Sponsor interest'
  if (/turns \d+$/i.test(s)) return 'Birthdays'
  return `${m.from}: ${s.replace(/[0-9£,.]+/g, '#')}`
}

export function inboxItems(state: GameState): InboxItem[] {
  return state.inbox.map((msg) => { const c = classify(state, msg); return { msg, tier: c.tier, open: c.open, group: groupLabel(msg) } })
}

export interface InboxSummary {
  /** Messages that still ask for a decision. */
  open: number
  /** Unread per tier. */
  unread: Record<InboxTier, number>
  total: Record<InboxTier, number>
}

export function inboxSummary(state: GameState, items: InboxItem[] = inboxItems(state)): InboxSummary {
  const unread = { action: 0, results: 0, championship: 0, updates: 0 }, total = { action: 0, results: 0, championship: 0, updates: 0 }
  let open = 0
  for (const it of items) { total[it.tier]++; if (!it.msg.read) unread[it.tier]++; if (it.open) open++ }
  return { open, unread, total }
}

/** Folded rows for a list: consecutive-or-not messages with the same group label become one row once there are three or more. Every message stays reachable. */
export interface InboxRow { kind: 'one'; item: InboxItem } 
export interface InboxFold { kind: 'fold'; label: string; items: InboxItem[]; unread: number; open: number }
export function foldItems(items: InboxItem[], minRun = 3): (InboxRow | InboxFold)[] {
  const byGroup = new Map<string, InboxItem[]>()
  for (const it of items) byGroup.set(it.group, [...(byGroup.get(it.group) ?? []), it])
  const out: (InboxRow | InboxFold)[] = []
  const done = new Set<string>()
  for (const it of items) {
    const g = byGroup.get(it.group)!
    if (g.length < minRun) { out.push({ kind: 'one', item: it }); continue }
    if (done.has(it.group)) continue
    done.add(it.group)
    out.push({ kind: 'fold', label: it.group, items: g, unread: g.filter((x) => !x.msg.read).length, open: g.filter((x) => x.open).length })
  }
  return out
}
