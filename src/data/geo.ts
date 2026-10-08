/**
 * GEOGRAPHY. Approximate city-centre coordinates (degrees) for every fighter hometown in the game, and the great-circle distance used
 * for travel costs and home-crowd effects. Approximate on purpose: it feeds a modelling rule, not a map.
 */
export const HOMETOWN_COORDS: Record<string, [number, number]> = {
  'ENG:Manchester': [53.48, -2.24], 'ENG:Liverpool': [53.41, -2.99], 'ENG:Sheffield': [53.38, -1.47], 'ENG:Birmingham': [52.49, -1.89], 'ENG:Leeds': [53.80, -1.55], 'ENG:London': [51.51, -0.13], 'ENG:Newcastle': [54.98, -1.62], 'ENG:Bristol': [51.45, -2.59],
  'SCO:Glasgow': [55.86, -4.25], 'SCO:Edinburgh': [55.95, -3.19], 'SCO:Dundee': [56.46, -2.97], 'SCO:Aberdeen': [57.15, -2.09],
  'WAL:Cardiff': [51.48, -3.18], 'WAL:Swansea': [51.62, -3.94], 'WAL:Newport': [51.58, -3.0], 'WAL:Merthyr': [51.75, -3.38],
  'IRL:Belfast': [54.60, -5.93], 'IRL:Dublin': [53.35, -6.26], 'IRL:Cork': [51.90, -8.47], 'IRL:Limerick': [52.66, -8.63],
  'USA:Philadelphia': [39.95, -75.17], 'USA:Houston': [29.76, -95.37], 'USA:Detroit': [42.33, -83.05], 'USA:Las Vegas': [36.17, -115.14], 'USA:New York': [40.71, -74.01], 'USA:Los Angeles': [34.05, -118.24], 'USA:Chicago': [41.88, -87.63], 'USA:Atlanta': [33.75, -84.39],
  'MEX:Guadalajara': [20.67, -103.35], 'MEX:Tijuana': [32.51, -117.04], 'MEX:Monterrey': [25.69, -100.32], 'MEX:Mexico City': [19.43, -99.13],
  'PUR:San Juan': [18.47, -66.11], 'PUR:Ponce': [18.01, -66.61], 'PUR:Bayamón': [18.40, -66.16], 'PUR:Caguas': [18.23, -66.04],
  'CUB:Havana': [23.11, -82.37], 'CUB:Santiago de Cuba': [20.02, -75.83], 'CUB:Camagüey': [21.38, -77.92], 'CUB:Holguín': [20.89, -76.26],
  'DOM:Santo Domingo': [18.49, -69.93], 'DOM:Santiago': [19.45, -70.69], 'DOM:San Pedro': [18.46, -69.31], 'DOM:La Romana': [18.43, -68.97],
  'UKR:Kyiv': [50.45, 30.52], 'UKR:Odesa': [46.48, 30.73], 'UKR:Lviv': [49.84, 24.03], 'UKR:Kharkiv': [49.99, 36.23],
  'POL:Warsaw': [52.23, 21.01], 'POL:Kraków': [50.06, 19.94], 'POL:Gdańsk': [54.35, 18.65], 'POL:Wrocław': [51.11, 17.04],
  'GER:Hamburg': [53.55, 9.99], 'GER:Berlin': [52.52, 13.40], 'GER:Cologne': [50.94, 6.96], 'GER:Munich': [48.14, 11.58],
  'NGA:Lagos': [6.52, 3.38], 'NGA:Abuja': [9.06, 7.49], 'NGA:Ibadan': [7.38, 3.95], 'NGA:Port Harcourt': [4.82, 7.03],
  'GHA:Accra': [5.60, -0.19], 'GHA:Kumasi': [6.69, -1.62], 'GHA:Tema': [5.67, 0.0], 'GHA:Takoradi': [4.90, -1.76],
  'AUS:Sydney': [-33.87, 151.21], 'AUS:Melbourne': [-37.81, 144.96], 'AUS:Brisbane': [-27.47, 153.03], 'AUS:Perth': [-31.95, 115.86],
  'JPN:Tokyo': [35.68, 139.69], 'JPN:Osaka': [34.69, 135.50], 'JPN:Yokohama': [35.44, 139.64], 'JPN:Nagoya': [35.18, 136.91],
  'PHI:Manila': [14.60, 120.98], 'PHI:Cebu': [10.32, 123.89], 'PHI:General Santos': [6.11, 125.17], 'PHI:Davao': [7.07, 125.61],
  'ARG:Buenos Aires': [-34.60, -58.38], 'ARG:Córdoba': [-31.42, -64.18], 'ARG:Rosario': [-32.95, -60.64], 'ARG:Mendoza': [-32.89, -68.84],
  'KAZ:Almaty': [43.24, 76.89], 'KAZ:Astana': [51.17, 71.45], 'KAZ:Karaganda': [49.80, 73.10], 'KAZ:Shymkent': [42.32, 69.59],
}

/** A nation's rough centre, for hometowns and venue countries with no listed city. */
export const NATION_CENTRES: Record<string, [number, number]> = {
  ENG: [52.8, -1.5], SCO: [56.5, -4.2], WAL: [52.3, -3.7], IRL: [53.4, -8.0], USA: [39.8, -98.6], MEX: [23.6, -102.5], PUR: [18.2, -66.5], CUB: [21.5, -79.0], DOM: [18.9, -70.2],
  UKR: [49.0, 31.4], POL: [52.0, 19.1], GER: [51.2, 10.4], NGA: [9.1, 8.7], GHA: [7.9, -1.0], AUS: [-25.3, 133.8], JPN: [36.2, 138.3], PHI: [12.9, 121.8], ARG: [-38.4, -63.6], KAZ: [48.0, 66.9],
  KSA: [24.0, 45.0], UAE: [24.5, 54.4], ESP: [40.4, -3.7], FRA: [46.6, 2.2], ITA: [42.8, 12.6], NED: [52.1, 5.3], CAN: [56.1, -106.3],
}

export function hometownCoord(nation: string, town: string): [number, number] | null {
  return HOMETOWN_COORDS[`${nation}:${town}`] ?? NATION_CENTRES[nation] ?? null
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
