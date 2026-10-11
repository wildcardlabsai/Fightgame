import type { BoutTitleView, TitleStanding } from '../../engine/business/titleStanding'

const ROLE_CLASS: Record<TitleStanding['role'], string> = { champion: 'gold', mandatory: 'blue', eliminator: 'blue', contender: 'good', former: '', unranked: '' }

/** Where a fighter stands in the championship picture, from the live title records and ranking lists. Unranked fighters show nothing unless `always`. */
export function StandingChip({ s, always = false }: { s: TitleStanding; always?: boolean }) {
  if (s.role === 'unranked' && !always) return null
  return <span className={`chip standing ${ROLE_CLASS[s.role]}`} data-testid="standing-chip" data-role={s.role} title={s.note ?? undefined}>{s.label}</span>
}

/** What a bout between two fighters could be for. Says nothing for an ordinary bout unless a reason is on hand. */
export function BoutTitleNote({ b, compact = false }: { b: BoutTitleView; compact?: boolean }) {
  if (b.couldContest) {
    const what = b.kind === 'eliminator' ? 'Eliminator' : b.kind === 'unification' ? 'Unification' : b.vacant ? 'Vacant title' : b.mandatory ? 'Mandatory defence' : 'Title bout'
    return (
      <span className="bout-title" data-testid="bout-title" data-kind={b.kind}>
        <span className="stake-chip"><b>{what}</b><span> · {b.belts.map((x) => x.short).join(' / ')} {b.tier}</span></span>
        {!compact && b.name && <small className="dim bout-name">{b.name}</small>}
      </span>
    )
  }
  if (b.reason && !compact) return <small className="dim bout-reason" data-testid="bout-reason">Not a title bout: {b.reason}</small>
  return null
}
