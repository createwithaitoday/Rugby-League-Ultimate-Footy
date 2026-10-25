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

/** City names as club names. Jersey colours match current NRL clubs. Not an official NRL product. */
const CLUBS: ClubSeed[] = [
  { id: 'brisbane', name: 'Brisbane', short: 'BRI', city: 'Brisbane', stadiumId: 'brisbane', home: '#6B1024', away: '#F4F1EA', accent: '#C4A35A', text: '#FFF8F0', seed: 11 },
  { id: 'canberra', name: 'Canberra', short: 'CAN', city: 'Canberra', stadiumId: 'canberra', home: '#86C817', away: '#1A2B4A', accent: '#FFFFFF', text: '#0B1A0A', seed: 19 },
  { id: 'canterbury', name: 'Canterbury', short: 'CBY', city: 'Canterbury', stadiumId: 'canterbury', home: '#0055A5', away: '#FFFFFF', accent: '#C8102E', text: '#FFFFFF', seed: 29 },
  { id: 'cronulla', name: 'Cronulla', short: 'CRO', city: 'Cronulla', stadiumId: 'cronulla', home: '#00A9E0', away: '#FFFFFF', accent: '#000000', text: '#042433', seed: 37 },
  { id: 'goldcoast', name: 'Gold Coast', short: 'GLD', city: 'Gold Coast', stadiumId: 'goldcoast', home: '#009B9E', away: '#F7F3E8', accent: '#C5A35A', text: '#F4FFFE', seed: 47 },
  { id: 'manly', name: 'Manly', short: 'MAN', city: 'Manly', stadiumId: 'manly', home: '#6B1C23', away: '#FFFFFF', accent: '#FFFFFF', text: '#FFF8F2', seed: 53 },
  { id: 'melbourne', name: 'Melbourne', short: 'MEL', city: 'Melbourne', stadiumId: 'melbourne', home: '#0B1C3D', away: '#FFFFFF', accent: '#7A8CA8', text: '#F2F6FF', seed: 61 },
  { id: 'newcastle', name: 'Newcastle', short: 'NEW', city: 'Newcastle', stadiumId: 'newcastle', home: '#C8102E', away: '#0033A0', accent: '#FFFFFF', text: '#FFF5F5', seed: 71 },
  { id: 'northqld', name: 'North Queensland', short: 'NQL', city: 'Townsville', stadiumId: 'townsville', home: '#002B5C', away: '#FFFFFF', accent: '#F0B429', text: '#F5F8FF', seed: 79 },
  { id: 'parramatta', name: 'Parramatta', short: 'PAR', city: 'Parramatta', stadiumId: 'parramatta', home: '#0066B3', away: '#FFD100', accent: '#FFD100', text: '#FFFFFF', seed: 83 },
  { id: 'penrith', name: 'Penrith', short: 'PEN', city: 'Penrith', stadiumId: 'penrith', home: '#000000', away: '#FFFFFF', accent: '#00A9A5', text: '#F2FFFE', seed: 89 },
  { id: 'redcliffe', name: 'Redcliffe', short: 'RED', city: 'Redcliffe', stadiumId: 'redcliffe', home: '#C8102E', away: '#FFFFFF', accent: '#1A1A1A', text: '#FFF5F5', seed: 97 },
  { id: 'southsydney', name: 'South Sydney', short: 'SOU', city: 'South Sydney', stadiumId: 'souths', home: '#E31837', away: '#006B3F', accent: '#006B3F', text: '#FFF5F5', seed: 101 },
  { id: 'stgeorge', name: 'St George', short: 'STG', city: 'Wollongong', stadiumId: 'wollongong', home: '#C8102E', away: '#FFFFFF', accent: '#FFFFFF', text: '#FFF5F5', seed: 107 },
  { id: 'sydney', name: 'Sydney', short: 'SYD', city: 'Sydney', stadiumId: 'sydney', home: '#6EC1E4', away: '#0B1C3D', accent: '#0B1C3D', text: '#042433', seed: 113 },
  { id: 'auckland', name: 'Auckland', short: 'AUK', city: 'Auckland', stadiumId: 'auckland', home: '#1A1A1A', away: '#FFFFFF', accent: '#2E8B57', text: '#F4FFF8', seed: 127 },
  { id: 'wests', name: 'Wests', short: 'WES', city: 'Sydney West', stadiumId: 'wests', home: '#F57C00', away: '#1A1A1A', accent: '#FFFFFF', text: '#1A0A00', seed: 131 },
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
  { id: 'brisbane', name: 'Brisbane Stadium', city: 'Brisbane', bowl: '#1a1014', seatA: '#6B1024', seatB: '#C4A35A', accent: '#efe6d6', night: true, capacity: '52,500' },
  { id: 'canberra', name: 'Canberra Stadium', city: 'Canberra', bowl: '#142018', seatA: '#86C817', seatB: '#1A2B4A', accent: '#e8f5d0', night: true, capacity: '25,000' },
  { id: 'canterbury', name: 'Canterbury Ground', city: 'Canterbury', bowl: '#101820', seatA: '#0055A5', seatB: '#C8102E', accent: '#d7e2ea', night: true, capacity: '30,000' },
  { id: 'cronulla', name: 'Cronulla Ground', city: 'Cronulla', bowl: '#0e2430', seatA: '#00A9E0', seatB: '#FFFFFF', accent: '#d5ecec', night: false, capacity: '22,000' },
  { id: 'goldcoast', name: 'Gold Coast Stadium', city: 'Gold Coast', bowl: '#0e2a2c', seatA: '#009B9E', seatB: '#C5A35A', accent: '#d5ecec', night: true, capacity: '27,400' },
  { id: 'manly', name: 'Manly Ground', city: 'Manly', bowl: '#1a1214', seatA: '#6B1C23', seatB: '#FFFFFF', accent: '#efe6d6', night: false, capacity: '23,000' },
  { id: 'melbourne', name: 'Melbourne Stadium', city: 'Melbourne', bowl: '#0c1424', seatA: '#0B1C3D', seatB: '#7A8CA8', accent: '#d5e4ee', night: true, capacity: '30,050' },
  { id: 'newcastle', name: 'Newcastle Stadium', city: 'Newcastle', bowl: '#1a1214', seatA: '#C8102E', seatB: '#0033A0', accent: '#efe6d6', night: true, capacity: '33,000' },
  { id: 'townsville', name: 'Townsville Stadium', city: 'Townsville', bowl: '#0c1828', seatA: '#002B5C', seatB: '#F0B429', accent: '#d5e4ee', night: true, capacity: '25,000' },
  { id: 'parramatta', name: 'Parramatta Stadium', city: 'Parramatta', bowl: '#0c1828', seatA: '#0066B3', seatB: '#FFD100', accent: '#d5e4ee', night: true, capacity: '30,000' },
  { id: 'penrith', name: 'Penrith Stadium', city: 'Penrith', bowl: '#101010', seatA: '#000000', seatB: '#00A9A5', accent: '#d5ecec', night: true, capacity: '22,500' },
  { id: 'redcliffe', name: 'Redcliffe Stadium', city: 'Redcliffe', bowl: '#1a1214', seatA: '#C8102E', seatB: '#1A1A1A', accent: '#efe6d6', night: true, capacity: '11,500' },
  { id: 'souths', name: 'South Sydney Ground', city: 'South Sydney', bowl: '#1a1214', seatA: '#E31837', seatB: '#006B3F', accent: '#efe6d6', night: true, capacity: '45,500' },
  { id: 'wollongong', name: 'Wollongong Stadium', city: 'Wollongong', bowl: '#1a1214', seatA: '#C8102E', seatB: '#FFFFFF', accent: '#efe6d6', night: false, capacity: '20,000' },
  { id: 'sydney', name: 'Sydney Stadium', city: 'Sydney', bowl: '#0e2430', seatA: '#6EC1E4', seatB: '#0B1C3D', accent: '#d5e4ee', night: true, capacity: '45,000' },
  { id: 'auckland', name: 'Auckland Stadium', city: 'Auckland', bowl: '#101810', seatA: '#1A1A1A', seatB: '#2E8B57', accent: '#e5efe6', night: true, capacity: '25,000' },
  { id: 'wests', name: 'Wests Ground', city: 'Sydney West', bowl: '#241810', seatA: '#F57C00', seatB: '#1A1A1A', accent: '#f0e2d6', night: true, capacity: '20,000' },
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
