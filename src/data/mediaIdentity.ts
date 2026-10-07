/**
 * MEDIA_IDENTITY — the names, colours and logo keys of every media organisation, broadcaster, sanctioning body and ranking
 * list in the game. The ENGINE never reads a name from here for logic: behaviour lives in engine/media/orgs.ts and is keyed
 * by id. Replacing this pack (see docs/MEDIA_WORLD.md → Licensed Media Integration) renames the whole media world without
 * touching a line of simulation code.
 *
 * Every organisation below is FICTIONAL. None of them is, represents, or is endorsed by a real company.
 */
import type { MediaIdentity } from '../engine/media/types'

export interface BroadcasterIdentity { id: string; name: string; shortName: string; tagline: string; colour: string; logoAsset: string | null }
export interface BodyIdentity { id: string; name: string; shortName: string; titleName: string; colour: string; logoAsset: string | null }
export interface RankingIdentity { id: string; name: string; shortName: string; colour: string; logoAsset: string | null }

export interface IdentityPack {
  id: string
  label: string
  /** True only for a pack used under a formal licence. The default pack is never licensed. */
  licensed: boolean
  media: Record<string, MediaIdentity>
  broadcasters: Record<string, BroadcasterIdentity>
  bodies: Record<string, BodyIdentity>
  rankings: Record<string, RankingIdentity>
}

const m = (id: string, name: string, shortName: string, tagline: string, colour: string, accent: string, handle: string): MediaIdentity =>
  ({ id, name, shortName, tagline, colour, accent, logoAsset: null, handle })

export const DEFAULT_PACK: IdentityPack = {
  id: 'default-fictional',
  label: 'Fight Empire (fictional)',
  licensed: false,
  media: {
    ringside: m('ringside', 'Ringside Magazine', 'RINGSIDE', 'The boxing magazine of record', '#b3202a', '#d4a24c', '@ringsidemag'),
    fightwire: m('fightwire', 'FightWire', 'FIGHTWIRE', 'Boxing news, first', '#e11d2a', '#ffffff', '@fightwire'),
    fightwiretv: m('fightwiretv', 'FightWire TV', 'FIGHTWIRE TV', 'Every punch, every night', '#ff6a1a', '#ffffff', '@fightwiretv'),
    fightroom: m('fightroom', 'The Fight Room', 'FIGHT ROOM', 'Where boxing argues', '#7d3cff', '#ffffff', '@thefightroom'),
    insideropes: m('insideropes', 'Inside the Ropes', 'INSIDE THE ROPES', 'Features and interviews from the gym to the ring', '#2a7fba', '#ffffff', '@insidetheropes'),
    boxingdaily: m('boxingdaily', 'Boxing Daily', 'BOXING DAILY', 'All of boxing, every day', '#1b8f5a', '#ffffff', '@boxingdaily'),
    boxingpodcast: m('boxingpodcast', 'The Boxing Podcast', 'BOXING PODCAST', 'Long-form talk from people who watch every round', '#8d8b95', '#ffffff', '@theboxingpodcast'),
    worlddesk: m('worlddesk', 'World Boxing Desk', 'WORLD DESK', 'Boxing news from every corner of the world', '#3b82f6', '#ffffff', '@worldboxingdesk'),
    clipcorner: m('clipcorner', 'Clip Corner', 'CLIP CORNER', 'The best 30 seconds in boxing', '#f0a23a', '#111111', '@clipcorner'),
    boxingindex: m('boxingindex', 'The Boxing Index', 'BOXING INDEX', 'Numbers-driven rankings', '#5fd1c9', '#111111', '@boxingindex'),
  },
  broadcasters: {
    meridian: { id: 'meridian', name: 'Meridian Sports Network', shortName: 'MERIDIAN', tagline: 'Live sport, nationwide', colour: '#1f4fa8', logoAsset: null },
    worldfight: { id: 'worldfight', name: 'WorldFight Stream', shortName: 'WORLDFIGHT', tagline: 'Fight sport, streamed', colour: '#e11d2a', logoAsset: null },
    ringpass: { id: 'ringpass', name: 'RingPass', shortName: 'RINGPASS', tagline: 'Pay-per-view boxing', colour: '#d4a24c', logoAsset: null },
    unionsports: { id: 'unionsports', name: 'Union Sports', shortName: 'UNION SPORTS', tagline: 'Sport on every screen', colour: '#1b8f5a', logoAsset: null },
    globeintl: { id: 'globeintl', name: 'Globe International Sports', shortName: 'GLOBE', tagline: 'Sport without borders', colour: '#7d3cff', logoAsset: null },
  },
  bodies: {
    atlas: { id: 'atlas', name: 'Atlas Boxing Council', shortName: 'ATLAS', titleName: 'Atlas World', colour: '#0f7a4a', logoAsset: null },
    pioneer: { id: 'pioneer', name: 'Pioneer Boxing Federation', shortName: 'PIONEER', titleName: 'Pioneer World', colour: '#b3202a', logoAsset: null },
    crown: { id: 'crown', name: 'Crown Boxing Association', shortName: 'CROWN', titleName: 'Crown World', colour: '#d4a24c', logoAsset: null },
  },
  rankings: {
    atlas: { id: 'atlas', name: 'Atlas Boxing Council Rankings', shortName: 'ATLAS', colour: '#0f7a4a', logoAsset: null },
    pioneer: { id: 'pioneer', name: 'Pioneer Boxing Federation Rankings', shortName: 'PIONEER', colour: '#b3202a', logoAsset: null },
    crown: { id: 'crown', name: 'Crown Boxing Association Rankings', shortName: 'CROWN', colour: '#d4a24c', logoAsset: null },
    ringside: { id: 'ringside', name: 'Ringside Magazine Ratings', shortName: 'RINGSIDE RATINGS', colour: '#b3202a', logoAsset: null },
    index: { id: 'index', name: 'The Boxing Index', shortName: 'BOXING INDEX', colour: '#5fd1c9', logoAsset: null },
  },
}

let active: IdentityPack = DEFAULT_PACK

/** Install a different identity pack (e.g. a licensed one). Behaviour is untouched. */
export function setIdentityPack(pack: IdentityPack): void { active = pack }
export function identityPack(): IdentityPack { return active }

const fallback = (id: string): MediaIdentity => ({ id, name: id, shortName: id.toUpperCase(), tagline: '', colour: '#8d8b95', accent: '#ffffff', logoAsset: null, handle: '' })
export const mediaIdentity = (id: string): MediaIdentity => active.media[id] ?? DEFAULT_PACK.media[id] ?? fallback(id)
export const broadcasterIdentity = (id: string): BroadcasterIdentity => active.broadcasters[id] ?? DEFAULT_PACK.broadcasters[id] ?? { id, name: id, shortName: id.toUpperCase(), tagline: '', colour: '#8d8b95', logoAsset: null }
export const bodyIdentity = (id: string): BodyIdentity => active.bodies[id] ?? DEFAULT_PACK.bodies[id] ?? { id, name: id, shortName: id.toUpperCase(), titleName: id, colour: '#8d8b95', logoAsset: null }
export const rankingIdentity = (id: string): RankingIdentity => active.rankings[id] ?? DEFAULT_PACK.rankings[id] ?? { id, name: id, shortName: id.toUpperCase(), colour: '#8d8b95', logoAsset: null }
