import { mulberry32 } from '../sim/rng';
import type { Attributes, Look, PlayerTemplate, Role, Team } from '../sim/types';

const FIRST = [
  'Mateo', 'Ari', 'Levi', 'Soren', 'Nico', 'Ellis', 'Hugo', 'Rowan', 'Idris', 'Felix',
  'Callum', 'Owen', 'Rhys', 'Tane', 'Mali', 'Sefa', 'Keoni', 'Luca', 'Micah', 'Oscar',
  'Peni', 'Sione', 'Iosefa', 'Tamati', 'Eroni', 'Josua', 'Kelepi', 'Marcellin', 'Teo', 'Hari',
  'Ned', 'Fraser', 'Alden', 'Bryce', 'Colm', 'Dex', 'Evan', 'Gareth', 'Harvey', 'Innes',
  'Jonty', 'Kit', 'Laurie', 'Moss', 'Niall', 'Paddy', 'Quill', 'Raff', 'Sol', 'Toby',
];

const LAST = [
  'Adler', 'Bellamy', 'Crowe', 'Dalton', 'Elwood', 'Farrow', 'Greer', 'Havel', 'Ibbott', 'Juno',
  'Keene', 'Larkin', 'Moreau', 'Nash', 'Okoro', 'Pelle', 'Quayle', 'Rennie', 'Sato', 'Tua',
  'Ulrich', 'Vale', 'Walsh', 'Xiao', 'Yates', 'Zimmer', 'Aiono', 'Bale', 'Cairns', 'Dunn',
  'Esera', 'Faito', 'Galea', 'Hemi', 'Iuta', 'Koro', 'Loto', 'Mata', 'Nui', 'Oka',
  'Pule', 'Ratu', 'Sefo', 'Tui', 'Ulu', 'Vea', 'Waru', 'Yani',
];

interface RoleSpec {
  role: Role;
  side: -1 | 0 | 1;
  number: number;
}

const STARTERS: RoleSpec[] = [
  { role: 'fullback', side: 0, number: 1 },
  { role: 'wing', side: 1, number: 2 },
  { role: 'centre', side: 1, number: 3 },
  { role: 'centre', side: -1, number: 4 },
  { role: 'wing', side: -1, number: 5 },
  { role: 'five_eighth', side: 1, number: 6 },
  { role: 'halfback', side: -1, number: 7 },
  { role: 'prop', side: -1, number: 8 },
  { role: 'hooker', side: 0, number: 9 },
  { role: 'prop', side: 1, number: 10 },
  { role: 'second_row', side: -1, number: 11 },
  { role: 'second_row', side: 1, number: 12 },
  { role: 'lock', side: 0, number: 13 },
];

const BENCH: RoleSpec[] = [
  { role: 'prop', side: 0, number: 14 },
  { role: 'hooker', side: 0, number: 15 },
  { role: 'second_row', side: 0, number: 16 },
  { role: 'centre', side: 0, number: 17 },
];

const ROLE_ATTR: Record<Role, Attributes> = {
  fullback: pack(0.9, 0.84, 0.86, 0.62, 0.78, 0.8, 0.62, 0.74, 0.7, 0.86, 0.78, 0.74, 0.72, 0.84, 0.8),
  wing: pack(0.94, 0.9, 0.84, 0.64, 0.72, 0.74, 0.6, 0.7, 0.62, 0.78, 0.55, 0.5, 0.58, 0.66, 0.6),
  centre: pack(0.84, 0.8, 0.78, 0.74, 0.76, 0.76, 0.74, 0.78, 0.72, 0.76, 0.6, 0.55, 0.7, 0.74, 0.72),
  five_eighth: pack(0.78, 0.76, 0.8, 0.66, 0.74, 0.74, 0.66, 0.72, 0.86, 0.78, 0.8, 0.78, 0.88, 0.8, 0.84),
  halfback: pack(0.76, 0.78, 0.84, 0.6, 0.72, 0.72, 0.64, 0.66, 0.9, 0.76, 0.88, 0.9, 0.92, 0.82, 0.86),
  prop: pack(0.62, 0.6, 0.52, 0.92, 0.7, 0.66, 0.86, 0.88, 0.55, 0.62, 0.4, 0.35, 0.55, 0.6, 0.58),
  hooker: pack(0.74, 0.78, 0.8, 0.7, 0.74, 0.78, 0.8, 0.7, 0.84, 0.74, 0.5, 0.48, 0.86, 0.8, 0.84),
  second_row: pack(0.78, 0.76, 0.7, 0.82, 0.74, 0.8, 0.84, 0.8, 0.62, 0.68, 0.45, 0.4, 0.66, 0.74, 0.72),
  lock: pack(0.76, 0.74, 0.72, 0.8, 0.76, 0.82, 0.84, 0.82, 0.66, 0.7, 0.5, 0.45, 0.72, 0.78, 0.8),
};

function pack(
  speed: number,
  acceleration: number,
  agility: number,
  strength: number,
  balance: number,
  endurance: number,
  tackling: number,
  ballCarry: number,
  passing: number,
  catching: number,
  kickPower: number,
  kickAccuracy: number,
  decision: number,
  positioning: number,
  awareness: number,
): Attributes {
  return {
    speed, acceleration, agility, strength, balance, endurance, tackling, ballCarry,
    passing, catching, kickPower, kickAccuracy, decision, positioning, awareness,
  };
}

function clamp01(n: number): number {
  return Math.max(0.35, Math.min(0.97, n));
}

function vary(base: Attributes, rng: () => number, star: boolean, role: Role): Attributes {
  const out = { ...base };
  (Object.keys(out) as (keyof Attributes)[]).forEach((k) => {
    out[k] = clamp01(out[k] + (rng() - 0.5) * 0.1);
  });
  if (star) {
    if (role === 'halfback' || role === 'five_eighth') {
      out.passing = clamp01(out.passing + 0.06);
      out.kickAccuracy = clamp01(out.kickAccuracy + 0.07);
      out.decision = clamp01(out.decision + 0.05);
    } else if (role === 'wing' || role === 'fullback') {
      out.speed = clamp01(out.speed + 0.05);
      out.catching = clamp01(out.catching + 0.05);
    } else {
      out.strength = clamp01(out.strength + 0.05);
      out.tackling = clamp01(out.tackling + 0.04);
      out.ballCarry = clamp01(out.ballCarry + 0.04);
    }
  }
  return out;
}

function lookFor(role: Role, rng: () => number): Look {
  const forward = role === 'prop' || role === 'second_row' || role === 'lock';
  const bodyRoll = rng();
  let body = 1;
  if (forward) body = bodyRoll > 0.35 ? 2 : 3;
  else if (role === 'wing' || role === 'fullback') body = bodyRoll > 0.7 ? 1 : 0;
  else body = bodyRoll > 0.75 ? 2 : 1;
  return {
    skin: Math.floor(rng() * 6),
    hair: Math.floor(rng() * 5),
    hairStyle: Math.floor(rng() * 5),
    facialHair: forward ? (rng() > 0.3 ? 1 + Math.floor(rng() * 2) : 0) : rng() > 0.55 ? 1 : 0,
    body,
    boot: Math.floor(rng() * 4),
  };
}

function uniqueName(rng: () => number, used: Set<string>): string {
  for (let n = 0; n < 40; n++) {
    const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const name = `Player ${used.size + 1}`;
  used.add(name);
  return name;
}

function buildSquad(seed: number): PlayerTemplate[] {
  const rng = mulberry32(seed);
  const used = new Set<string>();
  const specs = [...STARTERS, ...BENCH];
  return specs.map((spec, index) => {
    const star = index === 1 || index === 6 || index === 8 || index === 12;
    return {
      name: uniqueName(rng, used),
      number: spec.number,
      role: spec.role,
      side: spec.side,
      attrs: vary(ROLE_ATTR[spec.role], rng, star, spec.role),
      look: lookFor(spec.role, rng),
      star,
    };
  });
}

interface ClubSeed {
  id: string;
  name: string;
  short: string;
  city: string;
  stadiumId: string;
  home: string;
  away: string;
  accent: string;
  text: string;
  seed: number;
}

const CLUBS: ClubSeed[] = [
  { id: 'wolves', name: 'Harbour Wolves', short: 'HBW', city: 'Harrow Bay', stadiumId: 'harbour', home: '#0c2340', away: '#f4f1ea', accent: '#f0b429', text: '#f7f3e8', seed: 11 },
  { id: 'steel', name: 'Ironridge Steel', short: 'IRS', city: 'Ironridge', stadiumId: 'ironridge', home: '#241416', away: '#d9dde3', accent: '#e23d3d', text: '#f6f1ee', seed: 29 },
  { id: 'rangers', name: 'Redgum Rangers', short: 'RGR', city: 'Redgum', stadiumId: 'redgum', home: '#6e1e2a', away: '#f7f1e4', accent: '#e7c27a', text: '#fff8ef', seed: 47 },
  { id: 'breakers', name: 'Cape Breakers', short: 'CBR', city: 'Cape Meridian', stadiumId: 'cape', home: '#0e6b6b', away: '#f3f7f6', accent: '#f2d07b', text: '#f3fffd', seed: 71 },
  { id: 'thunder', name: 'Northline Thunder', short: 'NLT', city: 'Northline', stadiumId: 'northline', home: '#3a2066', away: '#f4efe4', accent: '#e6c15a', text: '#f8f3ea', seed: 83 },
  { id: 'kings', name: 'Vale Kings', short: 'VLK', city: 'Vale', stadiumId: 'vale', home: '#1d4d32', away: '#f6f1e6', accent: '#d4b483', text: '#f4fff6', seed: 97 },
  { id: 'mastiffs', name: 'Westmere Mastiffs', short: 'WSM', city: 'Westmere', stadiumId: 'mastiff', home: '#8c3a2f', away: '#f3e6d8', accent: '#1d2430', text: '#fff6ee', seed: 113 },
  { id: 'mariners', name: 'Portside Mariners', short: 'PSM', city: 'Portside', stadiumId: 'portside', home: '#143d66', away: '#e7eef5', accent: '#7ec8e3', text: '#f3f8fc', seed: 131 },
];

export function createTeams(): Team[] {
  return CLUBS.map((club) => ({
    id: club.id,
    name: club.name,
    short: club.short,
    city: club.city,
    stadiumId: club.stadiumId,
    home: club.home,
    away: club.away,
    accent: club.accent,
    text: club.text,
    squad: buildSquad(club.seed),
  }));
}

export function teamById(id: string): Team {
  const team = createTeams().find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

export const STADIUMS = [
  { id: 'harbour', name: 'Harbour Ground', city: 'Harrow Bay', bowl: '#101820', seatA: '#0c2340', seatB: '#f0b429', accent: '#d7e2ea', night: true, capacity: '28,400' },
  { id: 'ironridge', name: 'Ironridge Arena', city: 'Ironridge', bowl: '#1a1212', seatA: '#2a2a2a', seatB: '#e23d3d', accent: '#c5c8ce', night: true, capacity: '32,100' },
  { id: 'redgum', name: 'Redgum Park', city: 'Redgum', bowl: '#2a2118', seatA: '#6e1e2a', seatB: '#e7c27a', accent: '#efe6d6', night: false, capacity: '18,600' },
  { id: 'cape', name: 'Cape Oval', city: 'Cape Meridian', bowl: '#12343a', seatA: '#0e6b6b', seatB: '#f2d07b', accent: '#d5ecec', night: false, capacity: '22,000' },
  { id: 'northline', name: 'Northline Stadium', city: 'Northline', bowl: '#1a1424', seatA: '#3a2066', seatB: '#e6c15a', accent: '#ddd4ea', night: true, capacity: '26,800' },
  { id: 'vale', name: 'Vale Park', city: 'Vale', bowl: '#14241c', seatA: '#1d4d32', seatB: '#d4b483', accent: '#e5efe6', night: false, capacity: '16,200' },
  { id: 'mastiff', name: 'Mastiff Ground', city: 'Westmere', bowl: '#241816', seatA: '#8c3a2f', seatB: '#1d2430', accent: '#f0e2d6', night: true, capacity: '20,500' },
  { id: 'portside', name: 'Portside Stadium', city: 'Portside', bowl: '#10202c', seatA: '#143d66', seatB: '#7ec8e3', accent: '#d5e4ee', night: true, capacity: '24,750' },
] as const;

export type StadiumInfo = (typeof STADIUMS)[number];

export function stadiumById(id: string): StadiumInfo {
  return STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'fullback': return 'Fullback';
    case 'wing': return 'Wing';
    case 'centre': return 'Centre';
    case 'five_eighth': return 'Five-eighth';
    case 'halfback': return 'Halfback';
    case 'prop': return 'Prop';
    case 'hooker': return 'Hooker';
    case 'second_row': return 'Second row';
    case 'lock': return 'Lock';
  }
}
