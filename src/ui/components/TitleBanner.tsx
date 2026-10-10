import type { TitleStakeView } from '../../engine/fightViews'

/** The belt at stake, in the gold championship styling. Everything shown is read from the fight's own title record: nothing here is invented. */
export function TitleBanner({ stake, compact = false }: { stake: TitleStakeView; compact?: boolean }) {
  const done = stake.outcome.length > 0
  return (
    <section className={`title-banner${compact ? ' compact' : ''}`} data-testid="title-banner" data-kind={stake.kind} aria-label={`${stake.kindLabel}: ${stake.name}`}>
      <div className="tb-top">
        <span className="tb-tier caps">{stake.label}</span>
        <span className="tb-kind caps">{stake.kindLabel}</span>
      </div>
      <h2 className="tb-name display">{stake.name}</h2>
      {stake.line && <p className="tb-line">{stake.line}</p>}
      {(stake.champion || stake.challenger) && (
        <div className="tb-roles" data-testid="title-roles">
          {stake.champion && <span className="tb-role champ"><span className="caps">{stake.vacant ? '' : 'Champion'}</span><b>{stake.champion.name}</b></span>}
          {stake.challenger && <span className="tb-role chall"><span className="caps">Challenger</span><b>{stake.challenger.name}</b></span>}
        </div>
      )}
      {done && (
        <ul className="tb-outcome" data-testid="title-outcome" aria-label="What happened to the belt">
          {stake.outcome.map((o) => <li key={o}>{o}</li>)}
        </ul>
      )}
    </section>
  )
}

/** A small marker for a card row. */
export function StakeChip({ label, name }: { label: string; name: string }) {
  return <span className="stake-chip" data-testid="stake-chip"><b>{label}</b><span> · {name}</span></span>
}
