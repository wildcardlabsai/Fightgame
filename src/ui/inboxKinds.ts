import type { MessageCategory } from '../engine/types'

export type MsgKind = 'FIGHTER' | 'CONTRACT' | 'EVENT' | 'MEDIA' | 'FINANCE' | 'MEDICAL' | 'SCOUTING' | 'PROMOTION' | 'WORLD'
/** A message's display category: its recorded category, refined by what the subject is plainly about. */
export function msgKind(m: { category: MessageCategory; subject: string }): MsgKind {
  const s = m.subject.toLowerCase()
  if (/injur|medical|suspension|doctor/.test(s)) return 'MEDICAL'
  if (/scout|report on|talent search/.test(s)) return 'SCOUTING'
  if (/sponsor|press|media|interview|headline/.test(s)) return 'MEDIA'
  if (/show|event|card|ticket|venue|fight night|sold/.test(s) && m.category !== 'contract') return 'EVENT'
  switch (m.category) {
    case 'contract': return 'CONTRACT'
    case 'fighter': return 'FIGHTER'
    case 'finance': return 'FINANCE'
    case 'world': return 'WORLD'
    default: return 'PROMOTION'
  }
}
export const KIND_CLASS: Record<MsgKind, string> = { FIGHTER: 'k-fighter', CONTRACT: 'k-contract', EVENT: 'k-event', MEDIA: 'k-media', FINANCE: 'k-finance', MEDICAL: 'k-medical', SCOUTING: 'k-scouting', PROMOTION: 'k-promotion', WORLD: 'k-world' }
