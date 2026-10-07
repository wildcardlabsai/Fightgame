import { fighterFallback, resolveFighterImage, type FighterRef, type FighterVariant } from '../../assets/registry'
import { Img } from './Img'

export type PortraitSize = 'thumb' | 'card' | 'large' | 'xl'
const DIM: Record<PortraitSize, [number, number]> = { thumb: [40, 50], card: [72, 90], large: [160, 200], xl: [240, 300] }

/** Elegant stand-in: division-coloured backdrop, silhouette and initials. Built from public data only. */
export function Silhouette({ f, size }: { f: FighterRef; size: PortraitSize }) {
  const fb = fighterFallback(f)
  const [w, h] = DIM[size]
  return (
    <svg className="v-portrait-fb" viewBox="0 0 100 125" width={w} height={h} role="img" aria-label={`${f.firstName} ${f.lastName}`}>
      <defs><linearGradient id={`pg${fb.hue}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={`hsl(${fb.hue} 42% 30%)`} /><stop offset="1" stopColor={`hsl(${fb.hue} 38% 9%)`} /></linearGradient></defs>
      <rect width="100" height="125" fill={`url(#pg${fb.hue})`} />
      <circle cx="50" cy="46" r="19" fill="#05050a" opacity=".78" />
      <path d="M12 125c2-30 18-44 38-44s36 14 38 44z" fill="#05050a" opacity=".78" />
      <text x="50" y="112" textAnchor="middle" fontFamily="var(--display)" fontWeight="800" fontSize="25" fill="#ece8e1" opacity=".92" letterSpacing="2">{fb.initials}</text>
    </svg>
  )
}

/** One fighter image. Thumbnails in lists, full size on profiles; falls back to the silhouette without ever showing a broken image. */
export function FighterPortrait({ f, size = 'card', variant = 'profile', eager, className = '' }: { f: FighterRef; size?: PortraitSize; variant?: FighterVariant; eager?: boolean; className?: string }) {
  const a = resolveFighterImage(f, variant)
  const [w, h] = DIM[size]
  const src = size === 'thumb' || size === 'card' ? a.thumbUrl : a.url
  return (
    <span className={`v-portrait ${size} ${className}`} style={{ width: w, height: h }} data-asset-state={src ? 'real' : 'fallback'} data-asset-id={a.assetId}>
      <Img src={src} alt={`${f.firstName} ${f.lastName}`} width={w} height={h} eager={eager} fallback={<Silhouette f={f} size={size} />} />
    </span>
  )
}
