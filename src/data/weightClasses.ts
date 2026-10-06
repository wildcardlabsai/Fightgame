import type { WeightClassDef, WeightClassId } from '../engine/types'

export const WEIGHT_CLASSES: WeightClassDef[] = [
  { id: 'minimumweight', name: 'Minimumweight', limitLb: 105, heightMean: 156, heightSd: 4, weight: 0.4 },
  { id: 'lightFlyweight', name: 'Light Flyweight', limitLb: 108, heightMean: 159, heightSd: 4, weight: 0.5 },
  { id: 'flyweight', name: 'Flyweight', limitLb: 112, heightMean: 162, heightSd: 4, weight: 0.8 },
  { id: 'superFlyweight', name: 'Super Flyweight', limitLb: 115, heightMean: 165, heightSd: 4, weight: 0.8 },
  { id: 'bantamweight', name: 'Bantamweight', limitLb: 118, heightMean: 167, heightSd: 4, weight: 1.1 },
  { id: 'superBantamweight', name: 'Super Bantamweight', limitLb: 122, heightMean: 169, heightSd: 4, weight: 1.2 },
  { id: 'featherweight', name: 'Featherweight', limitLb: 126, heightMean: 171, heightSd: 4.5, weight: 1.3 },
  { id: 'superFeatherweight', name: 'Super Featherweight', limitLb: 130, heightMean: 173, heightSd: 4.5, weight: 1.3 },
  { id: 'lightweight', name: 'Lightweight', limitLb: 135, heightMean: 175, heightSd: 5, weight: 1.6 },
  { id: 'superLightweight', name: 'Super Lightweight', limitLb: 140, heightMean: 176, heightSd: 5, weight: 1.6 },
  { id: 'welterweight', name: 'Welterweight', limitLb: 147, heightMean: 178, heightSd: 5, weight: 1.7 },
  { id: 'superWelterweight', name: 'Super Welterweight', limitLb: 154, heightMean: 180, heightSd: 5, weight: 1.5 },
  { id: 'middleweight', name: 'Middleweight', limitLb: 160, heightMean: 182, heightSd: 5, weight: 1.4 },
  { id: 'superMiddleweight', name: 'Super Middleweight', limitLb: 168, heightMean: 184, heightSd: 5, weight: 1.3 },
  { id: 'lightHeavyweight', name: 'Light Heavyweight', limitLb: 175, heightMean: 186, heightSd: 5, weight: 1.0 },
  { id: 'cruiserweight', name: 'Cruiserweight', limitLb: 200, heightMean: 188, heightSd: 5.5, weight: 0.8 },
  { id: 'heavyweight', name: 'Heavyweight', limitLb: 999, heightMean: 191, heightSd: 6, weight: 1.5 },
]

const BY_ID = Object.fromEntries(WEIGHT_CLASSES.map((w) => [w.id, w])) as Record<WeightClassId, WeightClassDef>

export function weightClass(id: WeightClassId): WeightClassDef {
  return BY_ID[id]
}

export function weightClassLabel(id: WeightClassId): string {
  return BY_ID[id].name
}

export function weightLimitLabel(id: WeightClassId): string {
  const w = BY_ID[id]
  return w.limitLb >= 999 ? '200+ lb' : `${w.limitLb} lb`
}
