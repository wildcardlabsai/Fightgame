import { deskAdvice } from '../../engine/advisor'
import { useGame } from '../../store/gameStore'
import { usePrefs } from '../../store/prefs'
import { AdvicePanel } from '../components/Advice'

/** The promoter's desk in full: every current piece of advice, not just the top few shown on the dashboard. */
export function AdvisorScreen() {
  const game = useGame((s) => s.game)!
  const navigate = useGame((s) => s.navigate)
  const mode = usePrefs((s) => s.advisor)
  const list = deskAdvice(game, 'full', 40)
  return (
    <>
      <div className="page-head"><div><h1 className="display">Advisor</h1><p className="sub">Your promoter’s desk. Advice only — it never changes prices, results or the rules. Level: <b>{mode}</b>. <button className="linkbtn" onClick={() => navigate('settings')}>Change in settings</button></p></div></div>
      {mode === 'off' ? <p className="empty">The advisor is switched off. Turn it back on in Settings to see advice here.</p> : <AdvicePanel list={list} cap={40} title="Promoter’s desk" />}
      {mode !== 'off' && list.length === 0 && <p className="empty">Nothing to flag right now.</p>}
    </>
  )
}
