import { resolvePromotionImage } from '../../assets/registry'
import type { Promotion } from '../../engine/types'
import { PromoLogo } from '../components/Bits'
import { Img } from './Img'

/** The promotion's logo wherever it appears: real artwork when it exists, otherwise the generated monogram mark. */
export function PromoMark({ p, size = 40 }: { p: Pick<Promotion, 'logo'> & { id: string; name?: string }; size?: number }) {
  const a = resolvePromotionImage(p.id, 'logo')
  return (
    <span className="v-promo" style={{ width: size, height: size }} data-asset-state={a.state} data-asset-id={a.assetId}>
      <Img src={a.url} alt={p.name ?? 'Promotion logo'} width={size} height={size} fallback={<PromoLogo p={p} size={size} />} />
    </span>
  )
}

/** Colour identity for a promotion: one accent used for its posters, cards and headers. */
export function promoAccent(p: Pick<Promotion, 'logo'>): string { return p.logo.color }
