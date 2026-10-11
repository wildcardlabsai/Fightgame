/**
 * OFFLINE PORTRAIT POOL GENERATOR — original, procedurally drawn vector portraits (stylised illustrations, not photographs and not
 * AI-image output). Every portrait is composed from a seeded "spec" (skin tone, face shape, hair, facial hair, brows, eyes, expression,
 * marks, kit), so the pool is reproducible, resumable and entirely licence-free. The game never calls this at runtime: it ships the
 * resulting SVG files and picks one per fighter by hashing the fighter id (see src/assets/registry.ts).
 *
 *   npx tsx scripts/assets/portraits.ts                  generate missing portraits (resumable; existing files with a matching spec are kept)
 *   npx tsx scripts/assets/portraits.ts --count 480      grow the pool (existing portraits keep their index and file; new ones are appended)
 *   npx tsx scripts/assets/portraits.ts --batch 60       generate at most 60 this run (run again to continue)
 *   npx tsx scripts/assets/portraits.ts --check          verify files and the manifest, write nothing (exit 1 on a problem)
 *   npx tsx scripts/assets/portraits.ts --force          regenerate everything
 *
 * Skin tone is deliberately independent of nationality and of every game attribute: a portrait carries no information about a fighter.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(ROOT, 'public', 'assets', 'portraits')
const POOL_FILE = join(DIR, 'pool.json')
const MANIFEST = join(ROOT, 'public', 'assets', 'manifest.json')
export const GENERATOR_VERSION = 1

// ------------------------------------------------------------------------------------------------ seeded random
function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const seedOf = (i: number): number => parseInt(createHash('sha256').update(`promoter-portrait-v${GENERATOR_VERSION}-${i}`).digest('hex').slice(0, 8), 16)

type R = () => number
const pick = <T,>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)]
const range = (r: R, lo: number, hi: number): number => lo + r() * (hi - lo)
const wpick = <T,>(r: R, a: readonly [T, number][]): T => { const t = a.reduce((s, x) => s + x[1], 0); let u = r() * t; for (const [v, w] of a) { u -= w; if (u <= 0) return v } return a[a.length - 1][0] }

// ------------------------------------------------------------------------------------------------ vocabulary
const SKIN = ['#f3d9c4', '#ecc6a6', '#e0ad84', '#d09a6c', '#bb8456', '#a06b43', '#855336', '#6a4029', '#4f2e1e', '#3a2217'] as const
const HAIR_STYLES = ['bald', 'buzz', 'crop', 'fade', 'slick', 'curly', 'afro', 'locs', 'bun', 'quiff', 'waves', 'shaved-part'] as const
const HAIR_COLOURS = ['#0d0b0a', '#1c1411', '#2b1d14', '#3d2a1b', '#5a3b22', '#7d5530', '#a67b45', '#c9a15f', '#8a8a8a', '#c9c5be', '#7a2e1c'] as const
const BEARDS = ['none', 'stubble', 'moustache', 'goatee', 'full', 'soul', 'chinstrap'] as const
const EYE_COLOURS = ['#2a1a10', '#3d2616', '#5b3b1d', '#6b7a45', '#5b7da0', '#3d6a8c', '#6d7378'] as const
const EXPRESSIONS = ['neutral', 'determined', 'stern', 'calm', 'smirk', 'tired'] as const
const KIT = ['tee', 'hoodie', 'robe', 'jacket', 'vest'] as const
const KIT_COLOURS = ['#1b1f2a', '#2a1a1e', '#16241f', '#2b2417', '#241a2e', '#1a2630', '#2d2d33', '#3a1c1c', '#18281c'] as const
const ACCENTS = ['#b8923a', '#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#e67e22', '#bdc3c7', '#d4af37'] as const
const MARKS = ['none', 'brow-scar', 'cheek-scar', 'lip-scar', 'swollen-brow', 'broken-nose'] as const

export interface Spec {
  index: number
  skin: number; tone: number
  hairStyle: (typeof HAIR_STYLES)[number]; hairColour: string; grey: boolean
  beard: (typeof BEARDS)[number]
  headW: number; jawW: number; chin: number; noseW: number; browThick: number; browTilt: number; eyeGap: number; eyeSize: number; mouthW: number
  eyeColour: string; expression: (typeof EXPRESSIONS)[number]
  mark: (typeof MARKS)[number]
  kit: (typeof KIT)[number]; kitColour: string; accent: string
  bgHue: number; light: -1 | 1; ears: number
}

export function makeSpec(index: number): Spec {
  const r = mulberry(seedOf(index))
  const skin = Math.floor(r() * SKIN.length)
  const hairStyle = wpick(r, [['bald', 6], ['buzz', 12], ['crop', 16], ['fade', 14], ['slick', 7], ['curly', 9], ['afro', 5], ['locs', 5], ['bun', 3], ['quiff', 7], ['waves', 7], ['shaved-part', 6]] as [Spec['hairStyle'], number][])
  const darkSkin = skin >= 6
  const hairColour = darkSkin && r() < 0.8 ? pick(r, HAIR_COLOURS.slice(0, 3)) : pick(r, HAIR_COLOURS)
  const beard = wpick(r, [['none', 36], ['stubble', 22], ['moustache', 6], ['goatee', 9], ['full', 14], ['soul', 4], ['chinstrap', 5]] as [Spec['beard'], number][])
  return {
    index, skin, tone: r(),
    hairStyle, hairColour, grey: r() < 0.05,
    beard,
    headW: range(r, 16.5, 21), jawW: range(r, 9.5, 17), chin: range(r, 74, 82), noseW: range(r, 2.6, 4.6), browThick: range(r, 0.9, 2.1), browTilt: range(r, -0.8, 1.6),
    eyeGap: range(r, 7.6, 10.4), eyeSize: range(r, 1.5, 2.1), mouthW: range(r, 5.5, 8.4),
    eyeColour: pick(r, EYE_COLOURS), expression: pick(r, EXPRESSIONS),
    mark: wpick(r, [['none', 62], ['brow-scar', 9], ['cheek-scar', 6], ['lip-scar', 4], ['swollen-brow', 9], ['broken-nose', 10]] as [Spec['mark'], number][]),
    kit: pick(r, KIT), kitColour: pick(r, KIT_COLOURS), accent: pick(r, ACCENTS),
    bgHue: Math.floor(r() * 360), light: r() < 0.5 ? -1 : 1, ears: range(r, 0.85, 1.2),
  }
}

/** Two portraits count as the same face only if every visible choice matches. */
export const specKey = (s: Spec): string => [s.skin, s.hairStyle, s.hairColour, s.beard, Math.round(s.headW), Math.round(s.jawW), Math.round(s.noseW * 2), s.eyeColour, s.expression, s.mark, Math.round(s.browThick * 2)].join('|')

// ------------------------------------------------------------------------------------------------ colour helpers
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${[c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
const skinOf = (s: Spec): string => {
  // A little within-tone variation (warm / cool) so two fighters of one tone are not the same colour.
  const base = SKIN[s.skin]
  const n = parseInt(base.slice(1), 16)
  const warm = (s.tone - 0.5) * 10
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[c(((n >> 16) & 255) + warm), c(((n >> 8) & 255)), c((n & 255) - warm)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

// ------------------------------------------------------------------------------------------------ drawing
export function render(s: Spec): string {
  const cx = 50, top = 28
  const skin = skinOf(s), skinDk = shade(skin, 0.78), skinHi = shade(skin, 1.08), skinLo = shade(skin, 0.62)
  const hw = s.headW, jw = s.jawW, chin = s.chin
  const hair = s.grey ? '#b9b5ae' : s.hairColour
  const hairDk = shade(hair, 0.6)
  const id = `p${s.index}`
  const head = `M${f1(cx - hw)} 48C${f1(cx - hw)} 34 ${f1(cx - hw * 0.62)} ${top} ${cx} ${top}C${f1(cx + hw * 0.62)} ${top} ${f1(cx + hw)} 34 ${f1(cx + hw)} 48C${f1(cx + hw)} 62 ${f1(cx + jw)} ${f1(chin - 2)} ${cx} ${f1(chin)}C${f1(cx - jw)} ${f1(chin - 2)} ${f1(cx - hw)} 62 ${f1(cx - hw)} 48Z`
  const bg1 = `hsl(${s.bgHue} 28% 20%)`, bg2 = `hsl(${(s.bgHue + 24) % 360} 30% 7%)`
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" width="400" height="500" role="img" aria-label="Fictional boxer portrait ${s.index}">`)
  out.push(`<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>`
    + `<linearGradient id="${id}l" x1="${s.light > 0 ? 1 : 0}" y1="0" x2="${s.light > 0 ? 0 : 1}" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>`
    + `<radialGradient id="${id}v" cx=".5" cy=".42" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`
    + `<clipPath id="${id}h"><path d="${head}"/></clipPath></defs>`)
  out.push(`<rect width="100" height="125" fill="url(#${id}b)"/>`)

  // hair behind the head
  if (s.hairStyle === 'afro') out.push(`<ellipse cx="${cx}" cy="${top + 8}" rx="${f1(hw + 8)}" ry="${f1(22 + (hw - 16) * 0.6)}" fill="${hair}"/>`)
  if (s.hairStyle === 'locs') {
    for (let i = 0; i < 9; i++) { const x = cx - hw - 3 + (i * (hw * 2 + 6)) / 8; const len = 24 + ((i * 7) % 6); out.push(`<rect x="${f1(x - 1.4)}" y="${top + 4}" width="2.8" height="${len}" rx="1.4" fill="${i % 2 ? hairDk : hair}"/>`) }
  }
  if (s.hairStyle === 'bun') out.push(`<circle cx="${cx}" cy="${top - 4}" r="7.5" fill="${hair}"/><circle cx="${cx}" cy="${top - 4}" r="7.5" fill="url(#${id}l)" opacity=".5"/>`)

  // body: neck, shoulders, kit
  const nw = Math.min(hw - 4, 12) + 1
  out.push(`<path d="M${cx - nw} 70 L${cx - nw - 1} 92 L${cx + nw + 1} 92 L${cx + nw} 70Z" fill="${skinDk}"/>`)
  out.push(`<path d="M${cx - nw} 80 Q${cx} 90 ${cx + nw} 80 L${cx + nw} 70 L${cx - nw} 70Z" fill="${skinLo}" opacity=".55"/>`)
  const sh = `M4 125C6 100 22 88 ${cx - nw - 2} 87L${cx + nw + 2} 87C${100 - 22} 88 94 100 96 125Z`
  out.push(`<path d="${sh}" fill="${s.kitColour}"/>`)
  switch (s.kit) {
    case 'robe': out.push(`<path d="M${cx - nw - 2} 87 L${cx} 112 L${cx + nw + 2} 87" fill="none" stroke="${s.accent}" stroke-width="2.2" stroke-linejoin="round"/><path d="M${cx - nw + 1} 87 L${cx} 104 L${cx + nw - 1} 87Z" fill="${skinDk}"/>`); break
    case 'hoodie': out.push(`<path d="M${cx - nw - 6} 88 Q${cx} 104 ${cx + nw + 6} 88" fill="none" stroke="${shade(s.kitColour, 1.6)}" stroke-width="3.4" stroke-linecap="round"/><path d="M${cx - 4} 98 L${cx - 4} 112M${cx + 4} 98 L${cx + 4} 112" stroke="${shade(s.kitColour, 1.9)}" stroke-width=".9"/>`); break
    case 'jacket': out.push(`<path d="M${cx - nw - 2} 87 L${cx - 2} 125M${cx + nw + 2} 87 L${cx + 2} 125" stroke="${shade(s.kitColour, 1.7)}" stroke-width="1"/><path d="M${cx - nw - 2} 87 L${cx - 14} 100 L${cx - 4} 98Z M${cx + nw + 2} 87 L${cx + 14} 100 L${cx + 4} 98Z" fill="${shade(s.kitColour, 1.35)}"/><rect x="${cx - 3}" y="104" width="6" height="2" fill="${s.accent}"/>`); break
    case 'vest': out.push(`<path d="M${cx - nw - 2} 87 Q${cx} 100 ${cx + nw + 2} 87" fill="${skinDk}"/><path d="M${cx - nw - 6} 87 Q${cx - 8} 112 8 125M${cx + nw + 6} 87 Q${cx + 8} 112 92 125" fill="none" stroke="${skinDk}" stroke-width="0"/>`); break
    default: out.push(`<path d="M${cx - nw - 2} 87 Q${cx} 97 ${cx + nw + 2} 87" fill="none" stroke="${shade(s.kitColour, 1.7)}" stroke-width="2"/><rect x="${cx + 12}" y="104" width="8" height="2" fill="${s.accent}" opacity=".85"/>`)
  }

  // ears then head
  const ey = 52, ew = 3.1 * s.ears, eh = 6.2 * s.ears
  out.push(`<ellipse cx="${f1(cx - hw - 0.4)}" cy="${ey}" rx="${f1(ew)}" ry="${f1(eh)}" fill="${skinDk}"/><ellipse cx="${f1(cx + hw + 0.4)}" cy="${ey}" rx="${f1(ew)}" ry="${f1(eh)}" fill="${skinDk}"/>`)
  out.push(`<path d="${head}" fill="${skin}"/>`)
  // jaw and cheek shading
  out.push(`<g clip-path="url(#${id}h)"><path d="M${cx - hw} 56 Q${cx - jw * 0.7} 74 ${cx} ${chin + 1} Q${cx + jw * 0.7} 74 ${cx + hw} 56 L${cx + hw} 90 L${cx - hw} 90Z" fill="${skinLo}" opacity=".16"/>`
    + `<ellipse cx="${cx}" cy="44" rx="${f1(hw * 0.55)}" ry="9" fill="${skinHi}" opacity=".28"/>`
    + `<ellipse cx="${f1(cx - hw * 0.62)}" cy="58" rx="4" ry="3" fill="${skinLo}" opacity=".12"/><ellipse cx="${f1(cx + hw * 0.62)}" cy="58" rx="4" ry="3" fill="${skinLo}" opacity=".12"/></g>`)

  // hair on the head (clipped to the head where it sits on the scalp)
  const hl = (y: number) => `<path d="M${cx - hw - 2} ${y + 4}Q${cx - hw * 0.5} ${y - 3} ${cx} ${y}Q${cx + hw * 0.5} ${y - 3} ${cx + hw + 2} ${y + 4}L${cx + hw + 2} 20L${cx - hw - 2} 20Z"`
  switch (s.hairStyle) {
    case 'buzz': out.push(`<g clip-path="url(#${id}h)">${hl(37)} fill="${hair}" opacity=".5"/></g>`); break
    case 'crop': out.push(`<g clip-path="url(#${id}h)">${hl(36)} fill="${hair}"/><path d="M${cx - hw} 40 L${cx - hw + 3} 50 L${cx - hw + 4} 40Z M${cx + hw} 40 L${cx + hw - 3} 50 L${cx + hw - 4} 40Z" fill="${hair}"/></g>`); break
    case 'fade': out.push(`<g clip-path="url(#${id}h)">${hl(34)} fill="${hair}"/><path d="M${cx - hw} 38 L${cx - hw} 52 L${cx - hw + 2.5} 48 L${cx - hw + 4} 38Z M${cx + hw} 38 L${cx + hw} 52 L${cx + hw - 2.5} 48 L${cx + hw - 4} 38Z" fill="${hair}" opacity=".45"/></g>`); break
    case 'shaved-part': out.push(`<g clip-path="url(#${id}h)">${hl(35)} fill="${hair}"/><path d="M${cx - 6} 28 L${cx - 5} 38" stroke="${skin}" stroke-width="1"/></g>`); break
    case 'slick': out.push(`<g clip-path="url(#${id}h)"><path d="M${cx - hw - 2} 46 Q${cx - hw + 1} 30 ${cx - 4} 26 Q${cx + hw} 26 ${cx + hw + 2} 44 L${cx + hw - 1} 38 Q${cx} 33 ${cx - hw + 3} 39Z" fill="${hair}"/><path d="M${cx - 10} 31 Q${cx} 28 ${cx + 8} 31" stroke="#fff" stroke-opacity=".25" stroke-width="1" fill="none"/></g>`); break
    case 'quiff': out.push(`<path d="M${cx - hw - 1} 44 Q${cx - hw} 24 ${cx - 2} 21 Q${cx + hw + 3} 20 ${cx + hw + 1} 44 L${cx + hw - 2} 37 Q${cx + 2} 31 ${cx - hw + 3} 38Z" fill="${hair}"/>`); break
    case 'waves': out.push(`<g clip-path="url(#${id}h)">${hl(35)} fill="${hair}"/><path d="M${cx - hw + 3} 33 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 0" stroke="${hairDk}" stroke-width=".8" fill="none"/></g>`); break
    case 'curly': for (let i = 0; i < 11; i++) { const a = Math.PI + (i / 10) * Math.PI; out.push(`<circle cx="${f1(cx + Math.cos(a) * (hw + 0.5))}" cy="${f1(46 + Math.sin(a) * 19)}" r="${i % 2 ? 4.4 : 3.8}" fill="${hair}"/>`) } out.push(`<g clip-path="url(#${id}h)">${hl(36)} fill="${hair}"/></g>`); break
    case 'afro': out.push(`<g clip-path="url(#${id}h)">${hl(36)} fill="${hair}"/></g>`); break
    case 'locs': out.push(`<g clip-path="url(#${id}h)">${hl(36)} fill="${hair}"/></g>`); break
    case 'bun': out.push(`<g clip-path="url(#${id}h)">${hl(36)} fill="${hair}"/></g>`); break
    default: break
  }

  // facial hair
  const bc = s.grey ? '#9d9a94' : shade(hair, 0.9)
  const lower = `M${cx - hw - 1} 56 Q${cx - hw + 1} 66 ${cx - jw * 0.9} 72 Q${cx - 4} ${f1(chin + 2)} ${cx} ${f1(chin + 2)} Q${cx + 4} ${f1(chin + 2)} ${cx + jw * 0.9} 72 Q${cx + hw - 1} 66 ${cx + hw + 1} 56 L${cx + hw + 1} 62 L${cx - hw - 1} 62Z`
  const mouthY = 66 + (chin - 78) * 0.25
  if (s.beard === 'stubble') out.push(`<g clip-path="url(#${id}h)"><path d="M${cx - hw - 1} 54 Q${cx - hw} 66 ${cx - jw * 0.9} 73 Q${cx} ${f1(chin + 2)} ${cx + jw * 0.9} 73 Q${cx + hw} 66 ${cx + hw + 1} 54 L${cx + hw + 1} 90 L${cx - hw - 1} 90Z" fill="${bc}" opacity=".3"/></g>`)
  if (s.beard === 'full') out.push(`<g clip-path="url(#${id}h)"><path d="M${cx - hw - 1} 50 Q${cx - hw + 1} 66 ${cx - jw * 0.85} 73 Q${cx} ${f1(chin + 3)} ${cx + jw * 0.85} 73 Q${cx + hw - 1} 66 ${cx + hw + 1} 50 L${cx + hw - 3} 56 Q${cx + 10} ${f1(mouthY - 3.5)} ${cx} ${f1(mouthY - 3.2)} Q${cx - 10} ${f1(mouthY - 3.5)} ${cx - hw + 3} 56Z" fill="${bc}"/><path d="${lower}" fill="none"/></g>`)
  if (s.beard === 'goatee') out.push(`<path d="M${cx - 6} ${f1(mouthY + 1)} Q${cx} ${f1(mouthY - 1)} ${cx + 6} ${f1(mouthY + 1)} Q${cx + 7} ${f1(chin - 1)} ${cx} ${f1(chin + 1)} Q${cx - 7} ${f1(chin - 1)} ${cx - 6} ${f1(mouthY + 1)}Z" fill="${bc}"/>`)
  if (s.beard === 'soul') out.push(`<path d="M${cx - 2.6} ${f1(mouthY + 3)} L${cx + 2.6} ${f1(mouthY + 3)} L${cx + 1.6} ${f1(mouthY + 7)} L${cx - 1.6} ${f1(mouthY + 7)}Z" fill="${bc}"/>`)
  if (s.beard === 'chinstrap') out.push(`<g clip-path="url(#${id}h)"><path d="M${cx - hw} 54 Q${cx - hw + 1} 70 ${cx - jw * 0.8} 75 Q${cx} ${f1(chin + 3)} ${cx + jw * 0.8} 75 Q${cx + hw - 1} 70 ${cx + hw} 54 L${cx + hw - 1.8} 56 Q${cx + hw - 3} 70 ${cx + jw * 0.8 - 2} 73 Q${cx} ${f1(chin - 2)} ${cx - jw * 0.8 + 2} 73 Q${cx - hw + 3} 70 ${cx - hw + 1.8} 56Z" fill="${bc}"/></g>`)
  if (s.beard === 'moustache' || s.beard === 'goatee' || s.beard === 'full') out.push(`<path d="M${cx - 7.5} ${f1(mouthY - 3)} Q${cx - 3} ${f1(mouthY - 6)} ${cx} ${f1(mouthY - 4.2)} Q${cx + 3} ${f1(mouthY - 6)} ${cx + 7.5} ${f1(mouthY - 3)} Q${cx + 4} ${f1(mouthY - 1.6)} ${cx} ${f1(mouthY - 2.4)} Q${cx - 4} ${f1(mouthY - 1.6)} ${cx - 7.5} ${f1(mouthY - 3)}Z" fill="${bc}"/>`)

  // eyes, brows, nose, mouth
  const eyeY = 50 + (s.expression === 'tired' ? 0.6 : 0)
  const ex = s.eyeGap
  const squint = s.expression === 'determined' || s.expression === 'stern' ? 0.62 : s.expression === 'tired' ? 0.7 : 0.9
  for (const side of [-1, 1] as const) {
    const x = cx + side * ex
    out.push(`<ellipse cx="${f1(x)}" cy="${eyeY}" rx="${f1(s.eyeSize * 1.9)}" ry="${f1(s.eyeSize * 1.05 * squint)}" fill="#ebe6dd"/>`)
    out.push(`<circle cx="${f1(x)}" cy="${eyeY}" r="${f1(s.eyeSize * 0.95 * (0.5 + squint * 0.5))}" fill="${s.eyeColour}"/><circle cx="${f1(x)}" cy="${eyeY}" r="${f1(s.eyeSize * 0.45)}" fill="#07070a"/>`)
    out.push(`<path d="M${f1(x - s.eyeSize * 2.1)} ${f1(eyeY - 0.2)} Q${f1(x)} ${f1(eyeY - s.eyeSize * 1.8 * squint)} ${f1(x + s.eyeSize * 2.1)} ${f1(eyeY - 0.2)}" fill="none" stroke="${skinLo}" stroke-width=".9"/>`)
    if (s.expression === 'tired') out.push(`<path d="M${f1(x - 3)} ${f1(eyeY + 2.4)} Q${f1(x)} ${f1(eyeY + 3.6)} ${f1(x + 3)} ${f1(eyeY + 2.4)}" stroke="${skinLo}" stroke-width=".7" fill="none" opacity=".6"/>`)
    const tilt = (s.expression === 'determined' ? 1.6 : s.expression === 'stern' ? 1.1 : s.expression === 'calm' ? -0.4 : 0.3) + s.browTilt * 0.2
    const by = eyeY - 5.2 - (s.expression === 'calm' ? 0.6 : 0)
    out.push(`<path d="M${f1(x - side * 4.2)} ${f1(by + tilt * side * -0.0 + (tilt))} L${f1(x + side * 4.6)} ${f1(by - 0.6)}" stroke="${s.grey ? '#8e8a84' : hairDk}" stroke-width="${f1(s.browThick)}" stroke-linecap="round" opacity=".92"/>`)
  }
  const ny = 55.5
  out.push(`<path d="M${cx} ${eyeY + 1} L${f1(cx - 0.8)} ${ny - 1.2}" stroke="${skinLo}" stroke-width=".9" opacity=".35"/>`)
  out.push(`<path d="M${f1(cx - s.noseW)} ${ny + 0.4} Q${cx} ${ny + 2.6} ${f1(cx + s.noseW)} ${ny + 0.4}" fill="none" stroke="${skinLo}" stroke-width="1.2" stroke-linecap="round" opacity=".75"/>`)
  out.push(`<ellipse cx="${f1(cx - s.noseW + 0.4)}" cy="${ny + 1.6}" rx=".9" ry=".6" fill="${skinLo}" opacity=".7"/><ellipse cx="${f1(cx + s.noseW - 0.4)}" cy="${ny + 1.6}" rx=".9" ry=".6" fill="${skinLo}" opacity=".7"/>`)
  const mw = s.mouthW
  const lipC = shade(skin, 0.7)
  const curve = s.expression === 'calm' ? 1.1 : s.expression === 'smirk' ? 0.6 : s.expression === 'stern' || s.expression === 'determined' ? -0.5 : 0.1
  const sm = s.expression === 'smirk' ? 1.1 : 0
  out.push(`<path d="M${f1(cx - mw)} ${f1(mouthY - curve * 0.2)} Q${cx} ${f1(mouthY + curve + 0.4)} ${f1(cx + mw)} ${f1(mouthY - curve * 0.2 - sm)}" fill="none" stroke="${lipC}" stroke-width="1.3" stroke-linecap="round"/>`)
  out.push(`<path d="M${f1(cx - mw * 0.55)} ${f1(mouthY + 1.6)} Q${cx} ${f1(mouthY + 2.8)} ${f1(cx + mw * 0.55)} ${f1(mouthY + 1.6)}" fill="none" stroke="${lipC}" stroke-width=".8" opacity=".45"/>`)

  // marks
  switch (s.mark) {
    case 'brow-scar': out.push(`<path d="M${f1(cx + ex - 1)} ${eyeY - 7} L${f1(cx + ex + 1.4)} ${eyeY - 3}" stroke="${shade(skin, 1.15)}" stroke-width=".9"/>`); break
    case 'cheek-scar': out.push(`<path d="M${f1(cx - ex - 4)} ${eyeY + 5} L${f1(cx - ex)} ${eyeY + 10}" stroke="${shade(skin, 1.12)}" stroke-width=".8"/>`); break
    case 'lip-scar': out.push(`<path d="M${f1(cx + mw - 1)} ${f1(mouthY - 2.5)} L${f1(cx + mw)} ${f1(mouthY + 2)}" stroke="${shade(skin, 1.15)}" stroke-width=".8"/>`); break
    case 'swollen-brow': out.push(`<ellipse cx="${f1(cx - ex)}" cy="${eyeY - 3.2}" rx="4.4" ry="1.7" fill="${skinDk}" opacity=".45"/>`); break
    case 'broken-nose': out.push(`<path d="M${f1(cx + 0.6)} ${eyeY + 3} L${f1(cx - 0.6)} ${ny - 1}" stroke="${skinHi}" stroke-width="1.2" opacity=".5"/>`); break
    default: break
  }

  // light and vignette
  out.push(`<rect width="100" height="125" fill="url(#${id}l)" opacity=".7"/><rect width="100" height="125" fill="url(#${id}v)"/>`)
  out.push('</svg>')
  return out.join('')
}

// ------------------------------------------------------------------------------------------------ pool management
export interface PoolEntry { index: number; file: string; sha: string; skin: number; hair: string; beard: string }
export interface Pool { version: number; generator: string; count: number; entries: PoolEntry[] }
export const fileOf = (i: number): string => `p${String(i).padStart(4, '0')}.svg`
const sha = (t: string): string => createHash('sha256').update(t).digest('hex').slice(0, 16)

/** Generates specs 0..count-1, skipping any whose file already exists with the recorded hash. Returns the new pool. */
export function build(count: number, opts: { batch?: number; force?: boolean } = {}): { pool: Pool; written: number; kept: number; remaining: number } {
  mkdirSync(DIR, { recursive: true })
  const prev: Pool | null = existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, 'utf8')) : null
  const byIndex = new Map<number, PoolEntry>((prev?.entries ?? []).map((e) => [e.index, e]))
  const seen = new Set<string>()
  const entries: PoolEntry[] = []
  let written = 0, kept = 0
  for (let i = 0; entries.length < count; i++) {
    const spec = makeSpec(i)
    const key = specKey(spec)
    if (seen.has(key)) continue // a repeated face is skipped, not drawn
    seen.add(key)
    const slot = entries.length
    const file = fileOf(slot)
    const old = byIndex.get(slot)
    const svg = render({ ...spec, index: slot })
    const h = sha(svg)
    const have = existsSync(join(DIR, file)) && old && old.sha === h && sha(readFileSync(join(DIR, file), 'utf8')) === h
    if (have && !opts.force) { entries.push(old as PoolEntry); kept++; continue }
    if (opts.batch !== undefined && written >= opts.batch) break // resumable: the next run continues from here
    writeFileSync(join(DIR, file), svg)
    entries.push({ index: slot, file, sha: h, skin: spec.skin, hair: spec.hairStyle, beard: spec.beard })
    written++
  }
  const remaining = count - entries.length
  entries.sort((a, b) => a.index - b.index)
  const pool: Pool = { version: 1, generator: `procedural-svg-v${GENERATOR_VERSION}`, count: entries.length, entries }
  writeFileSync(POOL_FILE, JSON.stringify(pool, null, 1) + '\n')
  return { pool, written, kept, remaining }
}

/** Checks the pool against the files on disk and the app manifest. Returns problems (empty = healthy). */
export function check(): string[] {
  const problems: string[] = []
  if (!existsSync(POOL_FILE)) return ['pool.json is missing']
  const pool: Pool = JSON.parse(readFileSync(POOL_FILE, 'utf8'))
  const files = new Set(readdirSync(DIR).filter((f) => f.endsWith('.svg')))
  pool.entries.forEach((e, k) => {
    if (e.index !== k) problems.push(`entry ${k} has index ${e.index}`)
    if (!files.has(e.file)) { problems.push(`missing file ${e.file}`); return }
    if (sha(readFileSync(join(DIR, e.file), 'utf8')) !== e.sha) problems.push(`${e.file} does not match its recorded hash`)
    files.delete(e.file)
  })
  for (const f of files) problems.push(`orphan file ${f}`)
  if (pool.count !== pool.entries.length) problems.push('count does not match entries')
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  if (m.portraitPool?.count !== pool.count) problems.push(`manifest.portraitPool.count (${m.portraitPool?.count}) != pool.count (${pool.count})`)
  return problems
}

function syncManifest(pool: Pool): void {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  m.portraitPool = { dir: 'portraits', file: 'p{n}.svg', pad: 4, count: pool.count, generator: pool.generator, kind: 'procedural-illustration' }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n')
}

if (process.argv[1] && process.argv[1].endsWith('portraits.ts')) {
  const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined }
  if (process.argv.includes('--check')) {
    const p = check()
    console.log(p.length ? p.join('\n') : 'portrait pool healthy')
    process.exit(p.length ? 1 : 0)
  }
  const count = Number(arg('--count') ?? 360)
  const batch = arg('--batch') !== undefined ? Number(arg('--batch')) : undefined
  const r = build(count, { batch, force: process.argv.includes('--force') })
  syncManifest(r.pool)
  // Stray files from an earlier, larger pool are removed so the manifest stays the single source of truth.
  for (const f of readdirSync(DIR)) if (f.endsWith('.svg') && !r.pool.entries.some((e) => e.file === f)) { if (r.remaining === 0) unlinkSync(join(DIR, f)) }
  console.log(`portrait pool: ${r.pool.count}/${count} present — ${r.written} written, ${r.kept} kept, ${r.remaining} remaining`)
}
