import { useState, type ReactNode } from 'react'

/** Sources that already failed once: never requested again, so a missing file costs one request per session at most. */
const failed = new Set<string>()
const preloaded = new Set<string>()

/** Warm the cache for images the player is about to see (e.g. the main event). Each URL is only ever requested once. */
export function preloadImages(urls: (string | null | undefined)[]): void {
  if (typeof Image === 'undefined') return
  for (const u of urls) {
    if (!u || preloaded.has(u) || failed.has(u)) continue
    preloaded.add(u)
    const im = new Image()
    im.decoding = 'async'
    im.onerror = () => failed.add(u)
    im.src = u
  }
}

export function Img({ src, alt, width, height, className, eager, fallback }: { src: string | null; alt: string; width?: number; height?: number; className?: string; eager?: boolean; fallback: ReactNode }) {
  const [bad, setBad] = useState(() => !src || failed.has(src))
  if (!src || bad) return <>{fallback}</>
  return (
    <img
      className={className} src={src} alt={alt} width={width} height={height} draggable={false}
      loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' as const } : {})}
      onError={() => { failed.add(src); setBad(true) }}
    />
  )
}
