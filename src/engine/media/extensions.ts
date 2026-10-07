/** What the pipeline does around the core: awards, requests, offers, relationships, notifications, promotion reputation. */
import { mediaIdentity } from '../../data/mediaIdentity'
import { weightClassLabel } from '../../data/weightClasses'
import { bodyIdentity } from '../../data/mediaIdentity'
import { formatDay, dayToDate } from '../calendar'
import { fighterName } from '../fighters'
import type { BoxingEvent, Fight, GameState } from '../types'
import { awardNominations, logComeback, logFight, logShow, yearEndAwards } from './awards'
import { weeklyOffers } from './broadcast'
import { mediaMessage } from './inbox'
import { findNarrative, open as openNarrative, resolve as resolveNarrative, touch } from './narratives'
import { MEDIA_BEHAVIOURS, MEDIA_ORDER } from './orgs'
import { updatePromotionMedia } from './promos'
import { postFightRequest, rosterOf, weeklyPressers, weeklyRequests } from './requests'
import { expandStory } from './stories'
import type { TitleEvent } from './titles'
import { titleName } from './titles'
import type { MediaState, StoredStory } from './types'
import type { WorldEvent } from './worldEvents'
import { weekIndex } from './util'

const mineIds = (state: GameState): Set<string> => new Set(rosterOf(state).map((f) => f.id))

function notifyFight(state: GameState, media: MediaState, ev: WorldEvent, stories: StoredStory[]): void {
  if (!ev.fightId || stories.length === 0) return
  const mine = mineIds(state)
  if (!ev.fighters.some((id) => mine.has(id))) return
  const lead = stories.slice().sort((a, b) => b.i - a.i)[0]
  const full = expandStory(media, lead)
  if (!full) return
  const breaking = stories.some((s) => s.b === 1)
  if (ev.sig >= 50 || breaking) {
    const org = mediaIdentity(lead.o)
    mediaMessage(state, media, {
      from: org.shortName, category: 'world', priority: breaking || ev.sig >= 75 ? 'important' : 'normal', key: `brk-${ev.fightId}`,
      subject: `${breaking ? 'BREAKING' : 'RINGSIDE REPORT'}: ${full.headline}`, body: `${full.subheadline}. ${full.body}`.trim(), link: { kind: 'fight', id: ev.fightId },
    })
  }
  const viral = media.viral.find((v) => v.fightId === ev.fightId && v.week === weekIndex(state))
  if (viral) mediaMessage(state, media, { from: 'Media desk', category: 'world', priority: 'normal', key: `viral-${viral.id}`, subject: `VIRAL ALERT: ${viral.headline}`, body: `A clip of ${ev.names[0]}${ev.names[1] ? ` v ${ev.names[1]}` : ''} is spreading fast. Expect a short spike in attention; it fades over about six weeks.`, link: { kind: 'fight', id: ev.fightId } })
}

export const runExtensions = {
  afterFight(state: GameState, media: MediaState, ev: WorldEvent, fight: Fight, stories: StoredStory[]): void {
    logFight(state, media, ev, fight)
    const w = state.fighters[ev.fighters[0]]
    if (w && findNarrative(media, 'COMEBACK', [w.id])?.startWeek === weekIndex(state)) logComeback(state, media, w.id, ev.sig)
    postFightRequest(state, media, ev)
    notifyFight(state, media, ev, stories)
  },

  afterShow(state: GameState, media: MediaState, ev: BoxingEvent): void {
    logShow(state, media, ev)
  },

  onTitleEvent(state: GameState, media: MediaState, te: TitleEvent): void {
    const mine = mineIds(state)
    const body = bodyIdentity(te.body)
    const div = weightClassLabel(te.wc)
    const champ = te.f ? state.fighters[te.f] : undefined
    const other = te.o ? state.fighters[te.o] : undefined
    const week = weekIndex(state)
    const link = (id?: string) => (id ? ({ kind: 'fighter', id } as const) : ({ kind: 'screen', screen: 'media' } as const))
    if (te.kind === 'MANDATORY' && champ && other) {
      const n = openNarrative(state, media, 'MANDATORY_CHALLENGE', [champ.id, other.id], 45, { body: body.shortName, div })
      touch(n.n, week, 6)
      if (mine.has(champ.id)) mediaMessage(state, media, { from: body.shortName, category: 'contract', priority: 'important', key: `mand-${te.body}-${te.wc}-${week}`, subject: `MANDATORY: ${body.shortName} order ${fighterName(champ)} to defend against ${fighterName(other)}`, body: `${body.name} have ordered ${fighterName(champ)} to defend the ${div} title against the leading contender, ${fighterName(other)}. A title fight with that opponent must be agreed within 26 weeks or the champion can be stripped.`, link: link(champ.id) })
      else if (mine.has(other.id)) mediaMessage(state, media, { from: body.shortName, category: 'contract', priority: 'important', key: `mand-${te.body}-${te.wc}-${week}`, subject: `TITLE SHOT: ${fighterName(other)} is the mandatory challenger`, body: `${body.name} have named ${fighterName(other)} mandatory challenger for ${fighterName(champ)}'s ${div} title. A title fight must be agreed within 26 weeks.`, link: link(other.id) })
    } else if (te.kind === 'MANDATORY_WARNING' && champ && other) {
      const n = openNarrative(state, media, 'AVOIDANCE', [champ.id, other.id], 40, { body: body.shortName, div })
      touch(n.n, week, 6)
      if (mine.has(champ.id)) mediaMessage(state, media, { from: body.shortName, category: 'contract', priority: 'important', key: `mandwarn-${te.body}-${te.wc}-${week}`, subject: `MANDATORY: eight weeks left for ${fighterName(champ)} to face ${fighterName(other)}`, body: `${body.name}'s deadline for ${fighterName(champ)} v ${fighterName(other)} is eight weeks away and no title fight has been made. Miss it and the ${div} title is declared vacant.`, link: link(champ.id) })
    } else if ((te.kind === 'STRIPPED' || te.kind === 'TITLE_VACANT') && champ) {
      for (const t of ['MANDATORY_CHALLENGE', 'AVOIDANCE', 'TITLE_REIGN', 'DIVISION_DOMINANCE'] as const) for (const nn of media.narratives.filter((x) => x.type === t && x.participants.includes(champ.id) && x.status === 'active')) resolveNarrative(state, media, nn, te.kind === 'STRIPPED' ? 'Stripped of the title' : 'The title became vacant')
      if (mine.has(champ.id)) mediaMessage(state, media, { from: body.shortName, category: 'contract', priority: 'important', key: `strip-${te.body}-${te.wc}-${week}`, subject: `${te.kind === 'STRIPPED' ? 'STRIPPED' : 'VACANT'}: ${fighterName(champ)} and the ${titleName(te.body, te.wc)}`, body: `${fighterName(champ)} is no longer ${body.shortName} ${div} champion (${te.how ?? 'title vacated'}).`, link: link(champ.id) })
    } else if (te.kind === 'TITLE_FIGHT_SET' && te.f && te.o) {
      const a = state.fighters[te.f], b = state.fighters[te.o]
      const fight = te.fightId ? state.fights[te.fightId] : undefined
      if (a && b && fight && (mine.has(a.id) || mine.has(b.id))) mediaMessage(state, media, { from: body.shortName, category: 'contract', priority: 'important', key: `ts-${fight.id}`, subject: `TITLE SHOT: ${fighterName(a)} v ${fighterName(b)} is a ${fight.title?.name ?? 'title'} fight`, body: `${body.name} recognise this bout as a championship fight: ${fight.title?.name ?? titleName(te.body, te.wc)}${fight.day ? `, on ${formatDay(fight.day)}` : ''}. A win would make the winner champion; the champion keeps the belt on a draw.`, link: { kind: 'fight', id: fight.id } })
    }
    void dayToDate
  },

  weekly(state: GameState, media: MediaState, week: number, steps = 1): void {
    // Relationships cool slowly toward neutral; audiences grow a little.
    for (const k of Object.keys(media.rel)) { const v = media.rel[k] * Math.pow(0.99, steps); if (Math.abs(v) < 0.5) delete media.rel[k]; else media.rel[k] = Math.round(v * 10) / 10 }
    for (const id of MEDIA_ORDER) { const o = media.orgs[id]; if (o) o.audience = Math.round(o.audience * (1 + (o.growth * steps) / 52)) }
    weeklyRequests(state, media, week, steps)
    weeklyPressers(state, media, week)
    weeklyOffers(state, media, week, steps)
    if (week % 4 === 0) updatePromotionMedia(state, media)  // every other pass
    const doy = (state.today - Date.UTC(dayToDate(state.today).getUTCFullYear(), 0, 1) / 86_400_000) / 7
    if (doy >= 48) awardNominations(state, media)
    void MEDIA_BEHAVIOURS
  },

  yearEnd(state: GameState, media: MediaState): void { yearEndAwards(state, media) },
}
