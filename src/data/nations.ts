export interface NationDef {
  key: string
  name: string
  /** Short code shown in flag badges. */
  code: string
  firstNames: string[]
  lastNames: string[]
  towns: string[]
  /** Relative share of the talent pool. */
  weight: number
}

export const NATIONS: NationDef[] = [
  {
    key: 'ENG', name: 'England', code: 'ENG', weight: 5,
    firstNames: ['Jack', 'Liam', 'Callum', 'Connor', 'Reece', 'Tyler', 'Declan', 'Josh', 'Harvey', 'Marcus', 'Danny', 'Kieran', 'Ellis', 'Ryan', 'Bradley', 'Jordan'],
    lastNames: ['Hartley', 'Brennan', 'Whitlock', 'Rowe', 'Okafor', 'Pritchard', 'Ashworth', 'Mercer', 'Kendrick', 'Dobson', 'Fenwick', 'Calloway', 'Thorne', 'Redfern', 'Stokes', 'Barrett'],
    towns: ['Manchester', 'Liverpool', 'Sheffield', 'Birmingham', 'Leeds', 'London', 'Newcastle', 'Bristol'],
  },
  {
    key: 'SCO', name: 'Scotland', code: 'SCO', weight: 1,
    firstNames: ['Craig', 'Calum', 'Euan', 'Ross', 'Fraser', 'Lewis', 'Gavin', 'Stuart'],
    lastNames: ['McAllister', 'Dunbar', 'Gillespie', 'Rennie', 'Cathcart', 'Lennox', 'Baird', 'Kinnear'],
    towns: ['Glasgow', 'Edinburgh', 'Dundee', 'Aberdeen'],
  },
  {
    key: 'WAL', name: 'Wales', code: 'WAL', weight: 1,
    firstNames: ['Rhys', 'Owain', 'Gethin', 'Dewi', 'Steffan', 'Iolo', 'Cai', 'Tomos'],
    lastNames: ['Pryce', 'Llewellyn', 'Bevan', 'Rees', 'Gwynne', 'Prosser', 'Vaughan', 'Thomas'],
    towns: ['Cardiff', 'Swansea', 'Newport', 'Merthyr'],
  },
  {
    key: 'IRL', name: 'Ireland', code: 'IRL', weight: 1.5,
    firstNames: ['Cian', 'Ronan', 'Eoin', 'Darragh', 'Tadhg', 'Fintan', 'Oisin', 'Colm'],
    lastNames: ['Donnelly', 'Keogh', 'Madden', 'Gallagher', 'Fitzpatrick', 'Brogan', 'Cullen', 'Rafferty'],
    towns: ['Belfast', 'Dublin', 'Cork', 'Limerick'],
  },
  {
    key: 'USA', name: 'United States', code: 'USA', weight: 6,
    firstNames: ['Terrell', 'Marcus', 'Devin', 'Caleb', 'Isaiah', 'Dante', 'Tyrese', 'Wyatt', 'Cole', 'Malik', 'Jalen', 'Brandon', 'Shawn', 'Darius', 'Austin', 'Elijah'],
    lastNames: ['Jackson', 'Whitfield', 'Maddox', 'Sutton', 'Prescott', 'Hawkins', 'Dalton', 'Banks', 'Coleman', 'Rutledge', 'Slater', 'Monroe', 'Fontaine', 'Tucker', 'Briggs', 'Lamar'],
    towns: ['Philadelphia', 'Houston', 'Detroit', 'Las Vegas', 'New York', 'Los Angeles', 'Chicago', 'Atlanta'],
  },
  {
    key: 'MEX', name: 'Mexico', code: 'MEX', weight: 4,
    firstNames: ['Alejandro', 'Emiliano', 'Rodrigo', 'Santiago', 'Mateo', 'Joaquín', 'Diego', 'Ricardo'],
    lastNames: ['Villanueva', 'Estrada', 'Ochoa', 'Barrientos', 'Cisneros', 'Montoya', 'Zamora', 'Quintero'],
    towns: ['Guadalajara', 'Tijuana', 'Monterrey', 'Mexico City'],
  },
  {
    key: 'PUR', name: 'Puerto Rico', code: 'PUR', weight: 1,
    firstNames: ['Xavier', 'Adrián', 'Hector', 'Luis', 'Orlando', 'Jesús', 'Ángel', 'Edwin'],
    lastNames: ['Colón', 'Santiago', 'Rosario', 'Cintrón', 'Maldonado', 'Figueroa', 'Quiles', 'Torres'],
    towns: ['San Juan', 'Ponce', 'Bayamón', 'Caguas'],
  },
  {
    key: 'CUB', name: 'Cuba', code: 'CUB', weight: 1.2,
    firstNames: ['Yuniel', 'Osvaldo', 'Lázaro', 'Roniel', 'Erislandy', 'Yordenis', 'Luis', 'Dariel'],
    lastNames: ['Pedroso', 'Savón', 'Lamela', 'Iglesias', 'Despaigne', 'Arguelles', 'Hurtado', 'Lara'],
    towns: ['Havana', 'Santiago de Cuba', 'Camagüey', 'Holguín'],
  },
  {
    key: 'DOM', name: 'Dominican Republic', code: 'DOM', weight: 0.8,
    firstNames: ['Julio', 'Pedro', 'Rafael', 'Wilfredo', 'Starling', 'Miguel', 'Leonel', 'Franklin'],
    lastNames: ['Peralta', 'Batista', 'Cabrera', 'Mejía', 'Reyes', 'Taveras', 'Guzmán', 'Núñez'],
    towns: ['Santo Domingo', 'Santiago', 'San Pedro', 'La Romana'],
  },
  {
    key: 'UKR', name: 'Ukraine', code: 'UKR', weight: 1.5,
    firstNames: ['Oleksandr', 'Taras', 'Bohdan', 'Mykola', 'Denys', 'Artem', 'Yaroslav', 'Vitaliy'],
    lastNames: ['Kovalenko', 'Hrytsenko', 'Marchuk', 'Savchenko', 'Tkachenko', 'Bondar', 'Melnyk', 'Shevchuk'],
    towns: ['Kyiv', 'Odesa', 'Lviv', 'Kharkiv'],
  },
  {
    key: 'POL', name: 'Poland', code: 'POL', weight: 1,
    firstNames: ['Kamil', 'Mateusz', 'Paweł', 'Łukasz', 'Tomasz', 'Bartosz', 'Michał', 'Damian'],
    lastNames: ['Nowak', 'Wójcik', 'Kaczmarek', 'Zieliński', 'Adamczyk', 'Dudek', 'Sikora', 'Pawlak'],
    towns: ['Warsaw', 'Kraków', 'Gdańsk', 'Wrocław'],
  },
  {
    key: 'GER', name: 'Germany', code: 'GER', weight: 1,
    firstNames: ['Jonas', 'Felix', 'Lukas', 'Maximilian', 'Tim', 'Dennis', 'Stefan', 'Jens'],
    lastNames: ['Brandt', 'Köhler', 'Reinhardt', 'Vogel', 'Hartmann', 'Lindner', 'Krüger', 'Albrecht'],
    towns: ['Hamburg', 'Berlin', 'Cologne', 'Munich'],
  },
  {
    key: 'NGA', name: 'Nigeria', code: 'NGA', weight: 1.2,
    firstNames: ['Chidi', 'Emeka', 'Tunde', 'Segun', 'Obinna', 'Femi', 'Kelechi', 'Ibrahim'],
    lastNames: ['Adeyemi', 'Okonkwo', 'Balogun', 'Eze', 'Ogunleye', 'Nwosu', 'Adebayo', 'Ibe'],
    towns: ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'],
  },
  {
    key: 'GHA', name: 'Ghana', code: 'GHA', weight: 0.8,
    firstNames: ['Kwame', 'Kofi', 'Yaw', 'Nii', 'Emmanuel', 'Isaac', 'Joseph', 'Kwesi'],
    lastNames: ['Mensah', 'Quaye', 'Addo', 'Tetteh', 'Boateng', 'Ofori', 'Annan', 'Lamptey'],
    towns: ['Accra', 'Kumasi', 'Tema', 'Takoradi'],
  },
  {
    key: 'AUS', name: 'Australia', code: 'AUS', weight: 1.5,
    firstNames: ['Jarrod', 'Blake', 'Kyle', 'Mitchell', 'Lachlan', 'Brodie', 'Nathan', 'Zane'],
    lastNames: ['Hennessy', 'Carmody', 'Treloar', 'Beckett', 'Macrae', 'Duffy', 'Sinclair', 'Gleeson'],
    towns: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  },
  {
    key: 'JPN', name: 'Japan', code: 'JPN', weight: 1.3,
    firstNames: ['Kenta', 'Ryota', 'Haruto', 'Daisuke', 'Takumi', 'Shun', 'Kazuki', 'Naoya'],
    lastNames: ['Tanabe', 'Fujimoto', 'Okada', 'Hayashi', 'Matsuda', 'Ishikawa', 'Nakagawa', 'Kuroda'],
    towns: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya'],
  },
  {
    key: 'PHI', name: 'Philippines', code: 'PHI', weight: 0.8,
    firstNames: ['Jerwin', 'Rey', 'Marlon', 'Jonas', 'Nonito', 'Carlo', 'Dennis', 'Mark'],
    lastNames: ['Dela Cruz', 'Bautista', 'Magsayo', 'Pacheco', 'Abelardo', 'Sison', 'Villar', 'Aquino'],
    towns: ['Manila', 'Cebu', 'General Santos', 'Davao'],
  },
  {
    key: 'ARG', name: 'Argentina', code: 'ARG', weight: 0.8,
    firstNames: ['Matías', 'Facundo', 'Nicolás', 'Sergio', 'Brian', 'Leandro', 'Ezequiel', 'Julián'],
    lastNames: ['Benítez', 'Maidana', 'Acosta', 'Sosa', 'Ledesma', 'Fernández', 'Ibarra', 'Giménez'],
    towns: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'],
  },
  {
    key: 'KAZ', name: 'Kazakhstan', code: 'KAZ', weight: 0.7,
    firstNames: ['Daulet', 'Yerlan', 'Aslan', 'Nurlan', 'Timur', 'Bakhyt', 'Arman', 'Serik'],
    lastNames: ['Abdrakhmanov', 'Nurgaliyev', 'Seitov', 'Kassymov', 'Zhunusov', 'Omarov', 'Baimukhanov', 'Tolegen'],
    towns: ['Almaty', 'Astana', 'Karaganda', 'Shymkent'],
  },
]

const BY_KEY = Object.fromEntries(NATIONS.map((n) => [n.key, n]))

export function nation(key: string): NationDef {
  return BY_KEY[key]
}

export const NICKNAMES = [
  'The Hammer', 'Ice', 'Showtime', 'The Ghost', 'Bulldog', 'The Surgeon', 'Hurricane', 'Smoke',
  'The Professor', 'Little Giant', 'The Butcher', 'Quicksilver', 'The Saint', 'Thunder', 'Iron',
  'The Prince', 'Wildcat', 'Lights Out', 'The Hawk', 'Sugar', 'Gravedigger', 'Pretty Boy', 'The Wall',
]

export type Region = 'UKI' | 'AMERICAS' | 'WORLD'
const REGION_BY_NATION: Record<string, Region> = {
  ENG: 'UKI', SCO: 'UKI', WAL: 'UKI', IRL: 'UKI',
  USA: 'AMERICAS', MEX: 'AMERICAS', PUR: 'AMERICAS', CUB: 'AMERICAS', DOM: 'AMERICAS', ARG: 'AMERICAS',
}
export function regionOf(nationKey: string): Region {
  return REGION_BY_NATION[nationKey] ?? 'WORLD'
}
