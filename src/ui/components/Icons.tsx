import type { ReactNode } from 'react'

const paths: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
  fighters: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v7H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  finances: <><path d="M3 20h18" /><path d="M5 20V10M10 20V4M15 20v-7M20 20V8" /></>,
  promotions: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></>,
  venues: <><path d="M3 21V10l9-6 9 6v11" /><path d="M9 21v-7h6v7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  scouting: <><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></>,
  contracts: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  events: <><path d="M4 4h16v6a4 4 0 0 0 0 8v2H4v-2a4 4 0 0 0 0-8z" /></>,
  rankings: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
  titles: <><path d="M7 4h10v6a5 5 0 0 1-10 0z" /><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 21h6M12 15v6" /></>,
  sponsors: <><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-3 5 5 0 0 1 8 3c0 6-8 11-8 11z" /></>,
  matchmaking: <><circle cx="8" cy="9" r="3.5" /><circle cx="17" cy="15" r="3.5" /><path d="M11 11l3 2" /></>,
  fights: <><path d="M6 14c0-5 2-9 6-9s6 4 6 9v3H6z" /><path d="M9 20h6" /></>,
  media: <><rect x="3" y="5" width="18" height="12" /><path d="M8 21h8M12 17v4" /></>,
}

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {paths[name] ?? paths.dashboard}
    </svg>
  )
}

export function EmblemGlyph({ emblem, size = 24 }: { emblem: string; size?: number }) {
  const common = { fill: 'currentColor' }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {emblem === 'crown' && <path {...common} d="M3 18l-1-10 5 4 5-8 5 8 5-4-1 10z" />}
      {emblem === 'bolt' && <path {...common} d="M13 2L4 14h6l-2 8 10-13h-6z" />}
      {emblem === 'glove' && <path {...common} d="M7 3h8a5 5 0 0 1 5 5v5a6 6 0 0 1-6 6H9l-3-3V6a3 3 0 0 1 1-3zM8 20h6v2H8z" />}
      {emblem === 'star' && <path {...common} d="M12 2l3 7 7 .8-5.3 4.8L18 22l-6-3.6L6 22l1.3-7.4L2 9.8 9 9z" />}
      {emblem === 'shield' && <path {...common} d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />}
    </svg>
  )
}
