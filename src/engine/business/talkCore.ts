/**
 * Shared machinery for conversations: state access, the log, mood, and the manager's voice. Pure helpers; the moves live in
 * contractTalks.ts and fightTalks.ts. Nothing here reads a hidden value without turning it into words first.
 */
import { keyedRng } from '../rng'
import type { Fighter, GameState, Id } from '../types'
import { fighterName } from '../fighters'
import { BUSINESS_LIMITS, emptyBusiness, type BusinessState, type Demand, type Talk, type TalkLine } from './types'
import { PRIORITY_LABEL, type Manager, type Priority } from './manager'

export function biz(state: GameState): BusinessState {
  if (!state.business) state.business = emptyBusiness()
  return state.business
}

export function nextBizId(state: GameState, prefix: string): string {
  const b = biz(state)
  b.n += 1
  return `${prefix}${b.n.toString(36)}`
}

export function pushLine(talk: Talk, day: number, who: TalkLine['who'], tag: TalkLine['tag'], text: string): void {
  talk.log.push({ who, text, turn: talk.turn, day, tag })
  if (talk.log.length > BUSINESS_LIMITS.log) talk.log.splice(0, talk.log.length - BUSINESS_LIMITS.log)
}

/** Keep the conversation list bounded: closed talks go first, oldest first. */
export function trimTalks(state: GameState): void {
  const b = biz(state)
  const ids = Object.keys(b.talks)
  if (ids.length <= BUSINESS_LIMITS.talks) return
  const closed = ids.filter((id) => b.talks[id].status !== 'open').sort((x, y) => (b.talks[x].closedDay ?? 0) - (b.talks[y].closedDay ?? 0))
  for (const id of closed) { if (Object.keys(b.talks).length <= BUSINESS_LIMITS.talks) break; delete b.talks[id] }
}

/** Remember something the camp has told the player (drives expected-terms confidence and what the UI may show). */
export function learn(state: GameState, fighterId: Id, tag: string): void {
  const b = biz(state)
  const list = (b.learned[fighterId] ??= [])
  if (!list.includes(tag)) { list.push(tag); if (list.length > BUSINESS_LIMITS.learnedPerFighter) list.shift() }
}

export function moodOf(ratio: number): Talk['mood'] {
  return ratio >= 1 ? 'eager' : ratio >= 0.92 ? 'warm' : ratio >= 0.82 ? 'lukewarm' : 'cold'
}

export const tension = (t: Talk, startPatience: number): 'Calm' | 'Rising' | 'Tense' => {
  const f = t.patience / Math.max(1, startPatience)
  return f > 0.66 ? 'Calm' : f > 0.33 ? 'Rising' : 'Tense'
}

const pick = (rng: ReturnType<typeof keyedRng>, xs: string[]) => xs[Math.floor(rng.next() * xs.length)]

// ----------------------------------------------------------------- The voice

const WANT: Record<Priority, string[]> = {
  money: ['the money has to reflect where {n} is heading', 'the financial package is not there yet', 'we need to see more on the table financially'],
  title: ['{n} needs to see a genuine route to a title', 'there has to be a clear title pathway', 'we want something concrete on titles'],
  activity: ['{n} wants to be busy — more guaranteed fights', 'we need a firmer commitment on activity', 'sitting around is not an option for {n}'],
  exposure: ['{n} wants the big stages and the cameras', 'we need to know this puts {n} in front of an audience', 'exposure matters as much as the money here'],
  career: ['we want to see the plan for the next three years', 'this has to fit the long-term picture for {n}', 'where does this lead? That is the real question'],
  loyalty: ['we are looking for a promoter who will stand by {n}', 'it comes down to trust, and that has to be earned', 'show us you are in this for the long haul'],
  development: ['{n} needs the right opponents at the right time', 'we want careful, steady development, not a rush', 'protect the progress {n} has made'],
  security: ['we want guarantees, not promises', 'security matters — what is locked in?', 'put the guarantees in writing and we can talk'],
}

const TONE: Record<string, { open: string[]; accept: string[]; reject: string[]; hold: string[]; counter: string[] }> = {
  MONEY_FOCUSED: {
    open: ['{n} is interested, but we are not convinced the financial package reflects where this career is heading.', 'Let us talk numbers. That is where this starts and ends.'],
    accept: ['That works. Draw up the paperwork.', 'Now that is a proper offer. We have a deal.'],
    reject: ['That is not a serious number for {n}. We will not insult anyone by countering it.', 'No. {n} does not work for that.'],
    hold: ['Same number? Then we are done talking about it.', 'You are repeating yourself. The money has not changed.'],
    counter: ['Closer. Here is what it takes to get this done.', 'We can do business, but only here.'],
  },
  TITLE_FOCUSED: {
    open: ['{n} is interested, but the question is where this goes. Titles. Not just fights.', 'Before money, tell me about the pathway.'],
    accept: ['That is the right pathway. We are in.', 'Put the title route in the contract and we have a deal.'],
    reject: ['This does not take {n} anywhere near a belt. No.', 'We are not signing on for fights that go nowhere.'],
    hold: ['Nothing has changed on the pathway. Neither has our answer.', 'Show us the route and we will move.'],
    counter: ['We are nearly there — but the route has to be real.', 'We can make this work if the title path is in writing.'],
  },
  ACTIVITY_FOCUSED: {
    open: ['{n} is interested, but a fighter needs to fight. How busy will this keep {n}?', 'The first question is activity.'],
    accept: ['Busy is what we wanted. We have a deal.', 'That keeps {n} working. Agreed.'],
    reject: ['Not enough fights, not enough money. No.', 'That would leave {n} sitting at home. We cannot take it.'],
    hold: ['The schedule is still too thin.', 'Same offer, same problem: not enough dates.'],
    counter: ['Give {n} more dates and we can do this.', 'Closer. The calendar is what has to change.'],
  },
  EXPOSURE_FOCUSED: {
    open: ['{n} is interested if the stage is right. Who sees these fights?', 'Cameras, crowds, the big nights — what are you offering?'],
    accept: ['Big stages and a fair deal. We are in.', 'That is a platform worth signing for.'],
    reject: ['We are not signing for small rooms and no coverage.', 'There is nothing in that for {n}’s profile. No.'],
    hold: ['The platform is the same. So is our position.', 'We have heard it. Where is the exposure?'],
    counter: ['We like the direction. Put {n} in front of more people and this is done.', 'Almost. The profile side needs work.'],
  },
  CAREER_FOCUSED: {
    open: ['{n} is interested in the opportunity, but we want to understand the whole career plan.', 'We think long-term. Tell me about the plan.'],
    accept: ['That is a sensible plan and a fair price. We have a deal.', 'This fits where {n} is heading. Agreed.'],
    reject: ['That does not fit the plan for {n}. We have to pass.', 'We are not rushing into something that does not build a career.'],
    hold: ['The plan has not changed, so our view has not either.', 'We would need to see something different.'],
    counter: ['We are close. A few adjustments and it builds the career properly.', 'It is a reasonable base. Here is what completes it.'],
  },
  LOYAL: {
    open: ['{n} is open to this. We value people who treat a fighter properly.', 'We would like to make this work. Tell us what you have in mind.'],
    accept: ['Fair, and it feels right. We are happy to sign.', 'You have treated us well. We have a deal.'],
    reject: ['We wanted to say yes, but that is not fair to {n}.', 'That is not what we expected from you. No.'],
    hold: ['We would like to help, but the offer has to move.', 'Please — give us something to work with.'],
    counter: ['We are willing to meet you. Here is what would get us there.', 'We would like to do this. This would make it work.'],
  },
  AGGRESSIVE: {
    open: ['{n} has options. Do not waste my time.', 'Put a real offer on the table or we are leaving.'],
    accept: ['Finally. Done.', 'About time. We will sign.'],
    reject: ['No. Next.', 'That is a joke. We are done unless it changes.'],
    hold: ['I said no.', 'Same offer? Then goodbye.'],
    counter: ['Here is my number. Take it or leave it.', 'This is the price. Do not make me repeat it.'],
  },
  CAUTIOUS: {
    open: ['{n} is interested, but we want to be careful. What exactly are you proposing?', 'Take your time — we want everything spelled out.'],
    accept: ['Everything is clear and fair. We can sign.', 'We are comfortable with that. Agreed.'],
    reject: ['We are not comfortable with those terms.', 'There is too much risk for {n} in that offer.'],
    hold: ['We would need more certainty than that.', 'Nothing has changed for us. We need guarantees.'],
    counter: ['We could be comfortable with this version.', 'With these changes, we would feel safe.'],
  },
  DEVELOPMENT_FOCUSED: {
    open: ['{n} is interested. We want to know who the opponents will be and how fast this moves.', 'Development comes first. How will you look after {n}?'],
    accept: ['That is a sensible plan for development. We have a deal.', 'Good. Careful and ambitious. Agreed.'],
    reject: ['That does not protect {n}’s progress. No.', 'We will not trade a career for a quick payday.'],
    hold: ['No change on the development side. No change from us.', 'Show us the care in the plan.'],
    counter: ['We can work with this if the plan is right.', 'Close. Here is what keeps {n} on track.'],
  },
}

export type Verdict4 = 'open' | 'accept' | 'reject' | 'hold' | 'counter'

export function voiceLine(state: GameState, talk: Talk, f: Fighter, mgr: Manager, verdict: Verdict4, unmet: Priority | null): string {
  const rng = keyedRng(state.seed, 'talkline', talk.id, talk.turn, verdict)
  const tone = TONE[mgr.archetype]
  const n = f.firstName
  const base = pick(rng, tone[verdict]).replace(/\{n\}/g, n)
  if ((verdict === 'counter' || verdict === 'hold') && unmet) {
    const why = pick(rng, WANT[unmet]).replace(/\{n\}/g, n)
    return `${base} Specifically: ${why}.`
  }
  return base
}

export const wantsText = (state: GameState, f: Fighter, p: Priority, turn: number, talkId: string): string => {
  const rng = keyedRng(state.seed, 'want', talkId, turn, p)
  return pick(rng, WANT[p]).replace(/\{n\}/g, f.firstName)
}

export function demandFor(p: Priority, text: string): Demand {
  const kind: Demand['kind'] = p === 'money' || p === 'security' ? 'money' : p === 'title' || p === 'career' ? 'title' : p === 'activity' ? 'activity' : p === 'exposure' ? 'exposure' : p === 'development' ? 'role' : 'status'
  return { kind, text }
}

/** What the camp says when asked what they are looking for. Reveals the top two priorities in the manager’s own words. */
export function expectationsLine(state: GameState, f: Fighter, mgr: Manager, top: Priority[]): string {
  const rng = keyedRng(state.seed, 'expect', f.id, state.today)
  const intro = pick(rng, ['Honestly?', 'Since you ask —', 'The way we see it,', 'Straight answer:'])
  const a = PRIORITY_LABEL[top[0]], b = top[1] ? PRIORITY_LABEL[top[1]] : null
  void mgr
  return `${intro} ${f.lastName}’s camp cares most about ${a}${b ? `, and then ${b}` : ''}.`
}

export const evasiveLine = (state: GameState, f: Fighter): string => pick(keyedRng(state.seed, 'evade', f.id, state.today), [
  'We would rather see an offer first.', 'Put something in front of us and we will tell you what we think.', 'That is a conversation for when there is trust.',
])

export const nameOf = (state: GameState, id: Id): string => (state.fighters[id] ? fighterName(state.fighters[id]) : 'a fighter')
