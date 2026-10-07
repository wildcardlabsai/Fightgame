/**
 * Prompt builders. They use public facts only (name-free: images must contain no text), describe FICTIONAL people and
 * places, and never mention real boxers, promotions, brands or venues.
 */
import type { FighterView } from '../engine/view'
import type { Promotion, Venue } from '../engine/types'
import { NEWS_KIND_LABEL, VENUE_KIND_LABEL, venueKind, type NewsKind, type PosterTemplateId } from '../assets/registry'

const NO_TEXT = 'No text, letters, numbers, logos, watermarks or brand marks anywhere in the image.'
const FICTION = 'A fictional person; not a real boxer and not a likeness of any real person.'
const STYLE = 'Cinematic professional sports photography, dramatic lighting, shallow depth of field, photorealistic.'

const ageBand = (age: number) => (age <= 22 ? 'early twenties' : age <= 27 ? 'mid-to-late twenties' : age <= 32 ? 'early thirties' : age <= 37 ? 'mid thirties' : 'veteran, late thirties')
const build = (division: string) => (/minimum|fly|bantam/i.test(division) ? 'lean, compact and quick' : /feather|light(?!.*heavy)|welter/i.test(division) ? 'athletic, mid-weight build' : /middle|super mid/i.test(division) ? 'strong, broad-shouldered middleweight build' : /cruiser|light heavy/i.test(division) ? 'powerful, heavily muscled build' : /heavy/i.test(division) ? 'very large, heavyweight build' : 'athletic build')
const styleLine = (style: string) => `fighting style: ${style.toLowerCase()}`

function fighterBase(v: FighterView): string {
  return `${FICTION} A ${v.division} professional boxer, ${ageBand(v.age)}, ${build(v.division)}, ${v.stance.toLowerCase()} stance, about ${v.heightCm} cm tall, ${styleLine(v.style)}.`
}

export function fighterPrompt(v: FighterView, kind: 'profile' | 'action' | 'celebration'): string {
  const base = fighterBase(v)
  switch (kind) {
    case 'profile': return `${base} Head-and-shoulders portrait, 4:5 vertical framing, in boxing gloves and trunks, tense focused expression, dark gym background with rim light. ${STYLE} ${NO_TEXT}`
    case 'action': return `${base} In the ring mid-fight, throwing a punch against an unseen opponent, motion and sweat, ropes and bright overhead lights, wide 16:9 frame. ${STYLE} ${NO_TEXT}`
    case 'celebration': return `${base} Victory celebration in the ring, arms raised, confetti and a roaring blurred crowd, wide 16:9 frame. ${STYLE} ${NO_TEXT}`
  }
}

export function promotionPrompt(p: Pick<Promotion, 'name' | 'logo'>, kind: 'logo' | 'mark'): string {
  const colour = p.logo.color
  return kind === 'logo'
    ? `Original fictional boxing promotion emblem inspired by the idea "${p.name}", built around a ${p.logo.emblem} motif and the colour ${colour}, bold modern sports-brand logo on a transparent or plain dark background, flat vector style, centred. Do not copy any real promotion's logo. The only lettering allowed is the initials "${p.logo.monogram}".`
    : `Compact square badge mark for a fictional boxing promotion, ${p.logo.emblem} motif in the colour ${colour}, simple enough to read at 32px, flat vector style, centred on a plain dark background. Do not copy any real logo. No lettering except the initial "${p.logo.monogram[0] ?? ''}".`
}

const VENUE_SCENE: Record<string, string> = {
  'local-hall': 'a small community hall with a modest boxing ring, folding chairs and a low ceiling',
  'sports-centre': 'a municipal sports centre hall with a boxing ring, retractable seating and bright strip lighting',
  theatre: 'a classic theatre converted for boxing, a ring on the stage, red velvet seats and balconies',
  'regional-arena': 'a mid-sized regional indoor arena with a ring under a lighting rig and tiered seating',
  'national-arena': 'a large national indoor arena packed with fans, a spotlit ring and big screens',
  'major-arena': 'a major world-class indoor arena, huge crowd, dramatic lighting and a spotlit ring',
  stadium: 'a stadium prepared for boxing with the ring on the pitch and tiered stands filling the frame',
  'outdoor-stadium': 'a giant open-air stadium at dusk with a ring on the pitch and a vast crowd under floodlights',
  international: 'an international sports arena with flags-free neutral decor, a spotlit ring and a global-event feel',
  'vegas-arena': 'a glitzy desert-resort casino arena with a spotlit ring, neon lighting and a high-roller crowd',
  'uk-arena': 'a British indoor arena with steep terraces, a spotlit ring and a loud partisan crowd',
}
export function venuePrompt(v: Pick<Venue, 'name' | 'city' | 'country' | 'tier' | 'capacity'>, kindKey: string): string {
  return `Wide exterior-free interior view of ${VENUE_SCENE[kindKey] ?? VENUE_SCENE['regional-arena']}, a fictional venue in the style of ${v.city}, seating roughly ${v.capacity.toLocaleString('en-GB')} people, empty ring ready for a fight night, 16:9. ${STYLE} ${NO_TEXT}`
}

export function newsPrompt(k: NewsKind): string {
  return `Editorial illustration-style photograph for a boxing news story about "${NEWS_KIND_LABEL[k].toLowerCase()}", fictional unnamed people only, dramatic lighting, 16:9. ${STYLE} ${NO_TEXT}`
}

export function templatePrompt(t: PosterTemplateId): string {
  return `Abstract boxing event poster BACKGROUND for the "${t.replace('-', ' ')}" style: textured dark gradient, light beams and subtle ring-rope motifs, empty centre for fighter cut-outs, vertical 4:5. ${NO_TEXT}`
}
export { venueKind, VENUE_KIND_LABEL }
