/**
 * STORY COPY. Headlines, sub-headlines and bodies are assembled from a WorldEvent's `facts` — nothing else. Every sentence is
 * guarded by the fact it needs, so an absent fact simply produces no sentence (no invented quotes, ranks, figures or injuries).
 * Editorial style picks the tone; the relationship with the people involved can warm or cool it.
 */
import type { EditorialStyle, Facts, StoryKind } from './types'
import { ordinal } from './util'

export type Tone = 'neutral' | 'loud' | 'edgy' | 'warm'
export interface Composed { headline: string; sub: string; body: string }

export function toneOf(style: EditorialStyle, rel = 0): Tone {
  let t: Tone = style === 'BREAKING' || style === 'HYPE' || style === 'FAN_DRIVEN' ? 'loud' : style === 'CONTROVERSIAL' || style === 'NEGATIVE' ? 'edgy' : style === 'POSITIVE' ? 'warm' : 'neutral'
  if (rel >= 55 && t !== 'loud') t = 'warm'
  else if (rel <= -30 && t !== 'loud') t = 'edgy'
  return t
}

class Fx {
  constructor(private f: Facts) {}
  s(k: string, d = ''): string { const v = this.f[k]; return v === undefined || v === null || v === false ? d : String(v) }
  n(k: string, d = 0): number { const v = this.f[k]; return typeof v === 'number' ? v : d }
  has(k: string): boolean { const v = this.f[k]; return v !== undefined && v !== null && v !== false && v !== '' }
  num(k: string): string { return this.n(k).toLocaleString('en-GB') }
}

type Pair = { h: string; s: string }
type TplSet = Record<Tone, ((f: Fx) => Pair)[]>

const stopped = (f: Fx) => ['KO', 'TKO', 'RTD', 'INJ'].includes(f.s('mc'))
const atCity = (f: Fx) => (f.has('city') ? ` in ${f.s('city')}` : '')
const recs = (f: Fx) => `${f.s('w')} (${f.s('wrec')}) · ${f.s('l')} (${f.s('lrec')})`
const how = (f: Fx) => (stopped(f) ? `${f.s('m')} in round ${f.n('rd')}` : f.s('m'))

const TEMPLATES: Partial<Record<StoryKind, TplSet>> = {
  FIGHT_RESULT: {
    neutral: [(f) => ({ h: stopped(f) ? `${f.s('wl')} stops ${f.s('ll')} in round ${f.n('rd')}` : `${f.s('wl')} beats ${f.s('ll')} on points`, s: recs(f) }), (f) => ({ h: `${f.s('w')} defeats ${f.s('l')}${atCity(f)}`, s: `By ${f.s('m')}` })],
    loud: [(f) => ({ h: stopped(f) ? `${f.s('wl')} STOPS ${f.s('ll')}` : `${f.s('wl')} TAKES THE DECISION`, s: recs(f) }), (f) => ({ h: `${f.s('wl')} GETS IT DONE${atCity(f).toUpperCase()}`, s: `By ${f.s('m')}` })],
    edgy: [(f) => ({ h: `${f.s('wl')} gets the win over ${f.s('ll')} — but how convincing was it?`, s: recs(f) }), (f) => ({ h: `${f.s('wl')} takes the win${atCity(f)}`, s: `By ${f.s('m')}` })],
    warm: [(f) => ({ h: `Another step forward for ${f.s('wl')}`, s: `${f.s('w')} beats ${f.s('l')} by ${f.s('m')}` }), (f) => ({ h: `${f.s('wl')} does the job against ${f.s('ll')}`, s: recs(f) })],
  },
  UPSET: {
    neutral: [(f) => ({ h: `Upset: ${f.s('wl')} beats ${f.s('ll')}`, s: `${f.s('w')} wins by ${how(f)}` }), (f) => ({ h: `${f.s('wl')} surprises ${f.s('ll')}${atCity(f)}`, s: recs(f) })],
    loud: [(f) => ({ h: `SHOCK RESULT AS ${f.s('wl').toUpperCase()} STUNS ${f.s('ll').toUpperCase()}`, s: `By ${f.s('m')}` }), (f) => ({ h: `${f.s('wl').toUpperCase()} PULLS OFF THE UPSET`, s: recs(f) })],
    edgy: [(f) => ({ h: `Did ${f.s('ll')} see this coming? ${f.s('wl')} wins the upset`, s: recs(f) }), (f) => ({ h: `${f.s('ll')} embarrassed${atCity(f)} as ${f.s('wl')} spoils the script`, s: `By ${f.s('m')}` })],
    warm: [(f) => ({ h: `A famous night for ${f.s('wl')}`, s: `${f.s('w')} upsets ${f.s('l')}` }), (f) => ({ h: `${f.s('wl')} rises to the occasion against ${f.s('ll')}`, s: recs(f) })],
  },
  KNOCKOUT: {
    neutral: [(f) => ({ h: `${f.s('wl')} knocks out ${f.s('ll')} in round ${f.n('rd')}`, s: recs(f) }), (f) => ({ h: `${f.s('wl')} stops ${f.s('ll')} inside ${f.n('rd')} round${f.n('rd') === 1 ? '' : 's'}`, s: `By ${f.s('m')}` })],
    loud: [(f) => ({ h: `${f.s('wl').toUpperCase()} PRODUCES DEVASTATING ROUND ${f.n('rd')} KO`, s: recs(f) }), (f) => ({ h: `LIGHTS OUT! ${f.s('wl').toUpperCase()} FLATTENS ${f.s('ll').toUpperCase()}`, s: `Round ${f.n('rd')}${f.has('tm') ? ` · ${f.s('tm')}` : ''}` })],
    edgy: [(f) => ({ h: `${f.s('ll')} left in ruins as ${f.s('wl')} ends it in round ${f.n('rd')}`, s: recs(f) }), (f) => ({ h: `Brutal finish: ${f.s('wl')} ends ${f.s('ll')}'s night`, s: `By ${f.s('m')}` })],
    warm: [(f) => ({ h: `${f.s('wl')} shows his power with a round ${f.n('rd')} finish`, s: recs(f) }), (f) => ({ h: `Impressive stoppage for ${f.s('wl')}`, s: `${f.s('w')} beats ${f.s('l')}` })],
  },
  WAR: {
    neutral: [(f) => ({ h: `${f.s('wl')} outlasts ${f.s('ll')} in a ${f.n('kd')}-knockdown fight`, s: recs(f) })],
    loud: [(f) => ({ h: `WAR! ${f.s('wl').toUpperCase()} AND ${f.s('ll').toUpperCase()} TRADE ${f.n('kd')} KNOCKDOWNS`, s: `${f.s('w')} wins by ${f.s('m')}` })],
    edgy: [(f) => ({ h: `Wild fight: ${f.n('kd')} knockdowns and no defence from either man`, s: recs(f) })],
    warm: [(f) => ({ h: `A thriller: ${f.s('wl')} survives ${f.s('ll')}`, s: `${f.n('kd')} knockdowns in ${f.s('city') || 'the ring'}` })],
  },
  TITLE_CHANGE: {
    neutral: [(f) => ({ h: f.has('old') ? `${f.s('wl')} dethrones ${f.s('old')} to win the ${f.s('title')}` : `${f.s('wl')} wins the vacant ${f.s('title')}`, s: `${f.s('w')} by ${how(f)}` })],
    loud: [(f) => ({ h: f.has('old') ? `${f.s('wl').toUpperCase()} CLAIMS THE ${f.s('body')} CROWN` : `${f.s('wl').toUpperCase()} WINS THE VACANT ${f.s('body')} TITLE`, s: `${f.s('title')}` })],
    edgy: [(f) => ({ h: f.has('old') ? `${f.s('old')} loses the belt: what now for the ${f.s('div')} division?` : `${f.s('wl')} takes a vacant belt — a champion at last`, s: recs(f) })],
    warm: [(f) => ({ h: `${f.s('wl')} is champion: ${f.s('title')}`, s: `${f.s('w')} beats ${f.s('l')} by ${f.s('m')}` })],
  },
  TITLE_DEFENCE: {
    neutral: [(f) => ({ h: `${f.s('wl')} retains the ${f.s('body')} title against ${f.s('ll')}`, s: `Defence number ${f.n('def')} · ${f.s('m')}` })],
    loud: [(f) => ({ h: `${f.s('wl').toUpperCase()} RETAINS: DEFENCE ${f.n('def')} DONE`, s: `${f.s('title')}` })],
    edgy: [(f) => ({ h: `${f.s('wl')} survives ${f.s('ll')} to keep the ${f.s('body')} title`, s: `${f.s('m')}` })],
    warm: [(f) => ({ h: `${f.s('wl')} stays on top with title defence ${f.n('def')}`, s: `${f.s('title')}` })],
  },
  TITLE_FIGHT_SET: {
    neutral: [(f) => ({ h: `${f.s('a')} and ${f.s('b')} set for ${f.s('title')}`, s: `${f.s('date')}${f.has('city') ? ` · ${f.s('city')}` : ''}` })],
    loud: [(f) => ({ h: `TITLE SHOT: ${f.s('al').toUpperCase()} v ${f.s('bl').toUpperCase()}`, s: `${f.s('title')} · ${f.s('date')}` })],
    edgy: [(f) => ({ h: `${f.s('title')}: is ${f.s('bl')} ready, or is this a mismatch?`, s: `${f.s('a')} v ${f.s('b')}` })],
    warm: [(f) => ({ h: `A chance at the belt: ${f.s('a')} v ${f.s('b')}`, s: `${f.s('title')}` })],
  },
  CONTROVERSIAL_DECISION: {
    neutral: [(f) => ({ h: `${f.s('wl')} edges ${f.s('ll')} on a ${f.s('m')}`, s: f.has('sc') ? `Cards: ${f.s('sc')}` : recs(f) })],
    loud: [(f) => ({ h: `FANS LEFT FUMING AFTER ${f.s('wl').toUpperCase()} EDGES ${f.s('ll').toUpperCase()}`, s: f.has('sc') ? `Cards: ${f.s('sc')}` : f.s('m') })],
    edgy: [(f) => ({ h: `Split opinion: was ${f.s('ll')} unlucky to lose to ${f.s('wl')}?`, s: f.has('sc') ? `Cards: ${f.s('sc')}` : f.s('m') })],
    warm: [(f) => ({ h: `${f.s('wl')} gets a narrow win over ${f.s('ll')}`, s: f.s('m') })],
  },
  UNBEATEN_FELL: {
    neutral: [(f) => ({ h: `${f.s('ll')}'s unbeaten run ends against ${f.s('wl')}`, s: `${f.n('lwins')}-0 before the fight · ${f.s('m')}` })],
    loud: [(f) => ({ h: `UNBEATEN NO MORE: ${f.s('ll').toUpperCase()} FALLS TO ${f.s('wl').toUpperCase()}`, s: recs(f) })],
    edgy: [(f) => ({ h: `The zero goes: ${f.s('ll')} exposed by ${f.s('wl')}`, s: recs(f) })],
    warm: [(f) => ({ h: `${f.s('ll')} loses his unbeaten record, but not his future`, s: `Beaten by ${f.s('wl')}` })],
  },
  PROSPECT_BREAKOUT: {
    neutral: [(f) => ({ h: `${f.s('wl')} continues rapid rise`, s: `${f.s('w')} beats ${f.s('l')} · ${f.s('wrec')}` })],
    loud: [(f) => ({ h: `${f.s('wl').toUpperCase()} CONTINUES RAPID RISE`, s: `${f.n('streak')} straight wins` })],
    edgy: [(f) => ({ h: `Is ${f.s('wl')} the real thing? Another win over ${f.s('ll')}`, s: f.s('wrec') })],
    warm: [(f) => ({ h: `${f.s('wl')}: a name to remember`, s: `${f.n('streak')} straight wins and counting` })],
  },
  RETIREMENT: {
    neutral: [(f) => ({ h: `${f.s('n')} retires`, s: `${f.s('rec')}${f.has('peak') ? ` · ${f.s('peak')}` : ''}` })],
    loud: [(f) => ({ h: `${f.s('n').toUpperCase()} CALLS TIME ON CAREER`, s: f.s('rec') })],
    edgy: [(f) => ({ h: `${f.s('n')} hangs up the gloves`, s: f.s('rec') })],
    warm: [(f) => ({ h: `Thank you, ${f.s('n')}`, s: `A career ends: ${f.s('rec')}` })],
  },
  SIGNING: {
    neutral: [(f) => ({ h: `${f.s('n')} signs with ${f.s('promo')}`, s: `${f.s('rec')}${f.has('div') ? ` · ${f.s('div')}` : ''}` })],
    loud: [(f) => ({ h: `${f.s('n').toUpperCase()} JOINS ${f.s('promo').toUpperCase()}`, s: f.s('rec') })],
    edgy: [(f) => ({ h: `${f.s('promo')} land ${f.s('n')}: smart move or a gamble?`, s: f.s('rec') })],
    warm: [(f) => ({ h: `${f.s('n')} finds a new home at ${f.s('promo')}`, s: f.s('rec') })],
  },
  RELEASE: {
    neutral: [(f) => ({ h: `${f.s('n')} leaves ${f.s('promo')}`, s: f.s('rec') })],
    loud: [(f) => ({ h: `${f.s('n').toUpperCase()} HITS THE MARKET`, s: `Out of ${f.s('promo')} · ${f.s('rec')}` })],
    edgy: [(f) => ({ h: `${f.s('promo')} cut ties with ${f.s('n')}`, s: f.s('rec') })],
    warm: [(f) => ({ h: `${f.s('n')} is a free agent`, s: f.s('rec') })],
  },
  RANKING_CHANGE: {
    neutral: [(f) => ({ h: f.has('from') ? `${f.s('n')} moves to ${f.s('toText')} in the ${f.s('div')} ratings` : `${f.s('n')} enters the ${f.s('div')} ratings at ${f.s('toText')}`, s: `${f.s('list')}${f.has('why') ? ` · ${f.s('why')}` : ''}` })],
    loud: [(f) => ({ h: `${f.s('n').toUpperCase()} CLIMBS TO ${f.s('toText').toUpperCase()}`, s: `${f.s('list')} · ${f.s('div')}` })],
    edgy: [(f) => ({ h: `${f.s('n')} now ${f.s('toText')}: deserved?`, s: `${f.s('list')}${f.has('why') ? ` · ${f.s('why')}` : ''}` })],
    warm: [(f) => ({ h: `${f.s('n')} rewarded with a higher spot`, s: `${f.s('list')} · ${f.s('toText')} at ${f.s('div')}` })],
  },
  MANDATORY: {
    neutral: [(f) => ({ h: `${f.s('body')} order ${f.s('c')} to defend against ${f.s('ch')}`, s: `${f.s('div')} · deadline ${f.s('due')}` })],
    loud: [(f) => ({ h: `MANDATORY: ${f.s('c').toUpperCase()} MUST FACE ${f.s('ch').toUpperCase()}`, s: `${f.s('body')} ${f.s('div')}` })],
    edgy: [(f) => ({ h: `${f.s('c')} has been ordered to fight ${f.s('ch')} — will he?`, s: `${f.s('body')} deadline ${f.s('due')}` })],
    warm: [(f) => ({ h: `${f.s('ch')} earns a mandatory shot at ${f.s('c')}`, s: f.s('body') })],
  },
  STRIPPED: {
    neutral: [(f) => ({ h: `${f.s('n')} stripped of the ${f.s('title')}`, s: `Reason: ${f.s('how')}` })],
    loud: [(f) => ({ h: `${f.s('n').toUpperCase()} STRIPPED OF THE ${f.s('body')} BELT`, s: f.s('how') })],
    edgy: [(f) => ({ h: `Stripped: ${f.s('n')} loses the ${f.s('body')} title`, s: `Reason: ${f.s('how')}` })],
    warm: [(f) => ({ h: `${f.s('n')} loses the ${f.s('body')} title`, s: f.s('how') })],
  },
  TITLE_VACANT: {
    neutral: [(f) => ({ h: `${f.s('title')} is vacant`, s: `${f.s('n')} ${f.s('how')}` })],
    loud: [(f) => ({ h: `VACANT: ${f.s('title').toUpperCase()}`, s: f.s('how') })],
    edgy: [(f) => ({ h: `Who will take the vacant ${f.s('title')}?`, s: f.s('how') })],
    warm: [(f) => ({ h: `${f.s('n')} leaves the ${f.s('div')} division without a ${f.s('body')} champion`, s: f.s('how') })],
  },
  SELL_OUT: {
    neutral: [(f) => ({ h: `${f.s('promo')} sell out ${f.s('venue')}`, s: `${f.num('att')} in ${f.s('city')}` })],
    loud: [(f) => ({ h: `SELL-OUT! ${f.s('venue').toUpperCase()} PACKED FOR ${f.s('promo').toUpperCase()}`, s: `${f.num('att')} tickets` })],
    edgy: [(f) => ({ h: `Full house in ${f.s('city')}, but can ${f.s('promo')} repeat it?`, s: `${f.num('att')} attended` })],
    warm: [(f) => ({ h: `A packed ${f.s('venue')} for ${f.s('ev')}`, s: `${f.num('att')} fans` })],
  },
  RECORD_CROWD: {
    neutral: [(f) => ({ h: `Record crowd for ${f.s('promo')}`, s: `${f.num('att')} at ${f.s('venue')}` })],
    loud: [(f) => ({ h: `RECORD CROWD FOR ${f.s('promo').toUpperCase()}`, s: `${f.num('att')} IN ${f.s('city').toUpperCase()}` })],
    edgy: [(f) => ({ h: `${f.s('promo')} break their own attendance record`, s: `${f.num('att')}` })],
    warm: [(f) => ({ h: `${f.s('promo')} celebrate their biggest crowd`, s: `${f.num('att')} at ${f.s('venue')}` })],
  },
  PPV_SUCCESS: {
    neutral: [(f) => ({ h: `${f.s('ev')} reports ${f.num('buys')} pay-per-view buys`, s: `${f.s('promo')}` })],
    loud: [(f) => ({ h: `PPV SUCCESS: ${f.num('buys')} BUYS FOR ${f.s('ev').toUpperCase()}`, s: f.s('promo') })],
    edgy: [(f) => ({ h: `${f.num('buys')} buys: ${f.s('promo')} cash in`, s: f.s('ev') })],
    warm: [(f) => ({ h: `A strong pay-per-view night for ${f.s('promo')}`, s: `${f.num('buys')} buys` })],
  },
  PPV_FAILURE: {
    neutral: [(f) => ({ h: `${f.s('ev')} struggles on pay-per-view`, s: `${f.num('buys')} reported buys` })],
    loud: [(f) => ({ h: `PPV FLOP? ONLY ${f.num('buys')} BUYS FOR ${f.s('ev').toUpperCase()}`, s: f.s('promo') })],
    edgy: [(f) => ({ h: `${f.s('promo')} misjudged the market: ${f.num('buys')} buys`, s: f.s('ev') })],
    warm: [(f) => ({ h: `A tough night on pay-per-view for ${f.s('promo')}`, s: `${f.num('buys')} buys` })],
  },
  BROADCAST_DEAL: {
    neutral: [(f) => ({ h: `${f.s('promo')} agree a broadcast deal with ${f.s('org')}`, s: f.s('ev') })],
    loud: [(f) => ({ h: `${f.s('ev').toUpperCase()} HAS A BROADCAST HOME: ${f.s('org').toUpperCase()}`, s: f.s('promo') })],
    edgy: [(f) => ({ h: `${f.s('org')} land ${f.s('ev')}: what is it worth?`, s: f.s('promo') })],
    warm: [(f) => ({ h: `${f.s('ev')} will be shown on ${f.s('org')}`, s: f.s('promo') })],
  },
  WEIGH_IN: {
    neutral: [(f) => ({ h: `${f.s('n')} had trouble making weight`, s: `${f.s('div')} · ${f.s('ev')}` })],
    loud: [(f) => ({ h: `WEIGH-IN DRAMA: ${f.s('n').toUpperCase()} STRUGGLES`, s: f.s('div') })],
    edgy: [(f) => ({ h: `${f.s('n')} struggles on the scales — is the fight in danger?`, s: f.s('div') })],
    warm: [(f) => ({ h: `${f.s('n')} gets there in the end on the scales`, s: f.s('div') })],
  },
  CALL_OUT: {
    neutral: [(f) => ({ h: `${f.s('n')} calls out ${f.s('t')}`, s: `${f.s('div')}` })],
    loud: [(f) => ({ h: `CALL-OUT! ${f.s('n').toUpperCase()} WANTS ${f.s('t').toUpperCase()}`, s: f.s('div') })],
    edgy: [(f) => ({ h: `${f.s('n')} wants ${f.s('t')} next — will anyone say yes?`, s: f.s('div') })],
    warm: [(f) => ({ h: `${f.s('n')} sets his sights on ${f.s('t')}`, s: f.s('div') })],
  },
  RIVALRY: {
    neutral: [(f) => ({ h: `${f.s('a')} and ${f.s('b')} set for ${f.n('heat') >= 2 ? 'trilogy' : 'rematch'}`, s: `${f.s('date')}${f.has('city') ? ` · ${f.s('city')}` : ''}` })],
    loud: [(f) => ({ h: `${f.s('al').toUpperCase()} AND ${f.s('bl').toUpperCase()} SET FOR SHOWDOWN`, s: `${f.s('date')}` })],
    edgy: [(f) => ({ h: `Unfinished business: ${f.s('a')} v ${f.s('b')} again`, s: `${f.s('date')}` })],
    warm: [(f) => ({ h: `The rivalry continues: ${f.s('a')} v ${f.s('b')}`, s: f.s('date') })],
  },
  FIGHT_ANNOUNCED: {
    neutral: [(f) => ({ h: `${f.s('a')} to face ${f.s('b')}`, s: `${f.s('div')} · ${f.s('date')}${f.has('city') ? ` · ${f.s('city')}` : ''}` })],
    loud: [(f) => ({ h: `MADE: ${f.s('al').toUpperCase()} v ${f.s('bl').toUpperCase()}`, s: `${f.s('date')} · ${f.s('div')}` })],
    edgy: [(f) => ({ h: `${f.s('a')} v ${f.s('b')}: who needs this one more?`, s: f.s('date') })],
    warm: [(f) => ({ h: `A fight worth watching: ${f.s('a')} v ${f.s('b')}`, s: f.s('date') })],
  },
  PRESS_CONFERENCE: {
    neutral: [(f) => ({ h: `${f.s('a')} and ${f.s('b')} meet at the press conference`, s: f.s('ev') })],
    loud: [(f) => ({ h: `FACE-TO-FACE: ${f.s('a').toUpperCase()} v ${f.s('b').toUpperCase()}`, s: f.s('ev') })],
    edgy: [(f) => ({ h: `Press conference heats up for ${f.s('ev')}`, s: `${f.s('a')} v ${f.s('b')}` })],
    warm: [(f) => ({ h: `A respectful meeting before ${f.s('ev')}`, s: `${f.s('a')} v ${f.s('b')}` })],
  },
  EVENT_CANCELLED: {
    neutral: [(f) => ({ h: `${f.s('ev')} is cancelled`, s: `${f.s('promo')}${f.has('why') ? ` · ${f.s('why')}` : ''}` })],
    loud: [(f) => ({ h: `OFF: ${f.s('ev').toUpperCase()} CANCELLED`, s: f.s('promo') })],
    edgy: [(f) => ({ h: `${f.s('promo')} pull the plug on ${f.s('ev')}`, s: f.s('why') })],
    warm: [(f) => ({ h: `${f.s('ev')} will not go ahead`, s: f.s('promo') })],
  },
  VIRAL: {
    neutral: [(f) => ({ h: `${f.s('n')} clip spreads online`, s: f.s('what') })],
    loud: [(f) => ({ h: `VIRAL: ${f.s('n').toUpperCase()} CLIP EXPLODES`, s: f.s('what') })],
    edgy: [(f) => ({ h: `Everybody is talking about ${f.s('n')}`, s: f.s('what') })],
    warm: [(f) => ({ h: `${f.s('n')} finds a new audience`, s: f.s('what') })],
  },
  AWARD: {
    neutral: [(f) => ({ h: `${f.s('cat')} ${f.s('year')}: ${f.s('who')}`, s: f.s('why') })],
    loud: [(f) => ({ h: `${f.s('cat').toUpperCase()} ${f.s('year')}: ${f.s('who').toUpperCase()}`, s: f.s('why') })],
    edgy: [(f) => ({ h: `${f.s('who')} wins ${f.s('cat')} — agree?`, s: f.s('why') })],
    warm: [(f) => ({ h: `Congratulations to ${f.s('who')}: ${f.s('cat')}`, s: f.s('why') })],
  },
  FEATURE: {
    neutral: [(f) => ({ h: f.s('h'), s: f.s('s') })],
    loud: [(f) => ({ h: f.s('h').toUpperCase(), s: f.s('s') })],
    edgy: [(f) => ({ h: f.s('h'), s: f.s('s') })],
    warm: [(f) => ({ h: f.s('h'), s: f.s('s') })],
  },
}

// ------------------------------------------------------------------ bodies

function fightLines(f: Fx): string[] {
  const out: string[] = []
  if (f.has('w') && f.has('l')) {
    const draw = f.has('draw')
    if (draw) out.push(`${f.s('w')} and ${f.s('l')} fought to a ${f.s('m')}${atCity(f)}.`)
    else out.push(`${f.s('w')} (${f.s('wrec')}) beat ${f.s('l')} (${f.s('lrec')}) by ${f.s('m')}${stopped(f) ? ` in round ${f.n('rd')}${f.has('tm') ? ` (${f.s('tm')})` : ''}` : ` over ${f.n('sr')} rounds`}${atCity(f)}${f.has('venue') ? `, at ${f.s('venue')}` : ''}.`)
  }
  if (f.n('kd') > 0) out.push(`There ${f.n('kd') === 1 ? 'was one knockdown' : `were ${f.n('kd')} knockdowns`} in the fight.`)
  if (f.has('sc') && !stopped(f)) out.push(`The scorecards read ${f.s('sc')}.`)
  if (f.has('wrank')) out.push(`${f.s('wl')} came in rated #${f.n('wrank')} in the ${f.s('div')} division.`)
  if (f.has('lrank')) out.push(`${f.s('ll')} came in rated #${f.n('lrank')}.`)
  if (f.n('up') >= 0.62) out.push(`${f.s('ll')} had been the clear favourite on public form.`)
  if (f.n('streak') >= 3) out.push(`It was ${f.s('wl')}'s ${ordinal(f.n('streak'))} win in a row.`)
  if (f.has('att')) out.push(`The crowd was ${f.num('att')}.`)
  return out
}

const BODY: Partial<Record<StoryKind, (f: Fx) => string[]>> = {
  TITLE_CHANGE: (f) => [f.has('old') ? `${f.s('w')} took the ${f.s('title')} from ${f.s('old')}.` : `${f.s('w')} won the vacant ${f.s('title')}.`, ...fightLines(f)],
  TITLE_DEFENCE: (f) => [`${f.s('w')} retained the ${f.s('title')}; it was defence number ${f.n('def')} of the current reign.`, ...fightLines(f)],
  TITLE_FIGHT_SET: (f) => [`${f.s('a')} (${f.s('arec')}) will meet ${f.s('b')} (${f.s('brec')}) for the ${f.s('title')}${f.has('city') ? ` in ${f.s('city')}` : ''} on ${f.s('date')}.`, ...(f.has('arank') ? [`${f.s('al')} is rated #${f.n('arank')} in the ${f.s('div')} division.`] : []), ...(f.has('brank') ? [`${f.s('bl')} is rated #${f.n('brank')}.`] : [])],
  FIGHT_ANNOUNCED: (f) => [`${f.s('a')} (${f.s('arec')}) will meet ${f.s('b')} (${f.s('brec')}) over ${f.n('rounds')} rounds at ${f.s('div').toLowerCase()} on ${f.s('date')}${f.has('city') ? ` in ${f.s('city')}` : ''}.`, ...(f.has('ev') ? [`The fight is part of ${f.s('ev')}.`] : []), ...(f.has('arank') ? [`${f.s('al')} is rated #${f.n('arank')}.`] : []), ...(f.has('brank') ? [`${f.s('bl')} is rated #${f.n('brank')}.`] : [])],
  RIVALRY: (f) => [`${f.s('a')} and ${f.s('b')} have fought before, and they will meet again on ${f.s('date')}${f.has('city') ? ` in ${f.s('city')}` : ''}.`, `Their previous meetings left enough of a mark that the fight is being treated as a rivalry.`],
  RANKING_CHANGE: (f) => [`${f.s('n')} is now ${f.s('toText')} in the ${f.s('div')} division on the ${f.s('list')} list${f.has('from') ? `, up from ${f.s('fromText')}` : ''}.`, ...(f.has('why') ? [`${f.s('why')}.`] : [])],
  MANDATORY: (f) => [`${f.s('body')} have ordered ${f.s('c')} to defend the ${f.s('div')} title against ${f.s('ch')}, the leading contender.`, `The deadline is ${f.s('due')}; a champion who does not fight the mandatory challenger can be stripped.`],
  STRIPPED: (f) => [`${f.s('n')} has been stripped of the ${f.s('title')} for ${f.s('how')}.`, `The belt is now vacant.`],
  TITLE_VACANT: (f) => [`The ${f.s('title')} is vacant after ${f.s('n')} ${f.s('how')}.`],
  SELL_OUT: (f) => [`${f.s('promo')} filled ${f.s('venue')} in ${f.s('city')} for ${f.s('ev')}: ${f.num('att')} in the building.`],
  RECORD_CROWD: (f) => [`${f.s('promo')} drew ${f.num('att')} to ${f.s('venue')} for ${f.s('ev')}, the biggest crowd in their history.`],
  PPV_SUCCESS: (f) => [`${f.s('ev')} sold ${f.num('buys')} pay-per-view buys at £${f.n('price').toFixed(2)}.`],
  PPV_FAILURE: (f) => [`${f.s('ev')} sold ${f.num('buys')} pay-per-view buys at £${f.n('price').toFixed(2)}, below what a card of its kind needs.`],
  BROADCAST_DEAL: (f) => [`${f.s('promo')} have agreed terms with ${f.s('org')} to show ${f.s('ev')}.`],
  WEIGH_IN: (f) => [`${f.s('n')} struggled to make the ${f.s('div')} limit before ${f.s('ev')}.`],
  CALL_OUT: (f) => [`${f.s('n')} has called out ${f.s('t')} in the ${f.s('div')} division.`, ...(f.has('why') ? [`${f.s('why')}.`] : [])],
  RETIREMENT: (f) => [`${f.s('n')} has retired with a record of ${f.s('rec')}.`, ...(f.has('peak') ? [`${f.s('peak')}.`] : [])],
  SIGNING: (f) => [`${f.s('n')} (${f.s('rec')}) has signed with ${f.s('promo')}.`],
  RELEASE: (f) => [`${f.s('n')} (${f.s('rec')}) is no longer under contract with ${f.s('promo')}.`],
  EVENT_CANCELLED: (f) => [`${f.s('promo')} have cancelled ${f.s('ev')} at ${f.s('venue')}${f.has('why') ? ` (${f.s('why')})` : ''}.`],
  VIRAL: (f) => [f.s('what') + '.'],
  AWARD: (f) => [f.s('why') + '.'],
  FEATURE: (f) => [f.s('body')],
  PRESS_CONFERENCE: (f) => [f.s('what') + '.'],
}

/** Stories only flatten into the same tone family as the outlet; the facts never change. */
export function compose(kind: StoryKind, facts: Facts, tone: Tone, variant: number, depth = 3): Composed {
  const f = new Fx(facts)
  const set = TEMPLATES[kind] ?? TEMPLATES.FIGHT_RESULT!
  const list = set[tone] ?? set.neutral
  const t = list[variant % list.length](f)
  let lines = (BODY[kind] ?? fightLines)(f).filter((x) => x && x.trim().length > 1)
  if (variant % 2 === 1 && lines.length > 3) lines = [lines[0], ...lines.slice(2), lines[1]]
  return { headline: t.h, sub: t.s, body: lines.slice(0, Math.max(1, depth)).join(' ') }
}
