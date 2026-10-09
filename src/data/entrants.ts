import type { AiStrategy, Promotion } from '../engine/types'

/** Promotions that can be founded as the world ages (see engine/world/lifecycle.ts). Names are used in order; none duplicates the six launch promotions. */
export interface EntrantSeed { name: string; promoter: string; country: string; strategy: AiStrategy; color: string; emblem: Promotion['logo']['emblem'] }

export const ENTRANTS: EntrantSeed[] = [
  { name: 'Harbour Lights Boxing', promoter: 'Gareth Pryce', country: 'WAL', strategy: 'regional', color: '#2bb0c4', emblem: 'bolt' },
  { name: 'Iron Gate Promotions', promoter: 'Declan Murphy', country: 'IRL', strategy: 'prospectFactory', color: '#8f9aa8', emblem: 'shield' },
  { name: 'Sunbelt Boxing Club', promoter: 'Marisol Vega', country: 'MEX', strategy: 'regional', color: '#e8892b', emblem: 'star' },
  { name: 'Red Tide Fight Co.', promoter: 'Tomasz Nowak', country: 'POL', strategy: 'traditional', color: '#d6334a', emblem: 'glove' },
  { name: 'Kingsway Prizefights', promoter: 'Sean Aldridge', country: 'ENG', strategy: 'money', color: '#c9a227', emblem: 'crown' },
  { name: 'Outback Boxing League', promoter: 'Craig Mulholland', country: 'AUS', strategy: 'prospectFactory', color: '#4caf6a', emblem: 'bolt' },
  { name: 'Lagos Gloves', promoter: 'Emeka Obi', country: 'NGA', strategy: 'regional', color: '#2f9e44', emblem: 'glove' },
  { name: 'Black Rose Boxing', promoter: 'Colleen Rafferty', country: 'USA', strategy: 'traditional', color: '#a03b6c', emblem: 'star' },
  { name: 'Eastern Promise Fights', promoter: 'Viktor Hnatiuk', country: 'UKR', strategy: 'prospectFactory', color: '#3d6fd1', emblem: 'shield' },
  { name: 'Pacific Rim Boxing', promoter: 'Kenji Arai', country: 'JPN', strategy: 'money', color: '#e6e6e6', emblem: 'crown' },
]
