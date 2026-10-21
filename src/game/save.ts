import type { AttackStyle, DefenceStyle, Difficulty, KickStyle, Role } from '../sim/types';

export interface Settings {
  difficulty: Difficulty;
  halfMinutes: number;
  clockScale: number;
  quality: 'low' | 'medium' | 'high';
  camera: 'behind' | 'broadcast' | 'tactical';
  leftHanded: boolean;
  assistedPass: boolean;
  showTen: boolean;
  shake: boolean;
  largeHud: boolean;
  music: number;
  effects: number;
  crowd: number;
  showFps: boolean;
  colorblind: boolean;
}

export interface CareerState {
  playerName: string;
  role: Role;
  teamId: string;
  attrs: Record<string, number>;
  age: number;
  matches: number;
  tries: number;
  goals: number;
  tackles: number;
  metres: number;
  seasonYear: number;
}

export interface SeasonState {
  year: number;
  teamIds: string[];
  userTeamId: string;
  fixtures: {
    id: string;
    round: number;
    home: string;
    away: string;
    score: [number, number] | null;
    stage: 'regular' | 'semi' | 'final';
  }[];
}

export interface HistoryItem {
  at: string;
  home: string;
  away: string;
  score: [number, number];
  competition: boolean;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  season: SeasonState | null;
  career: CareerState | null;
  history: HistoryItem[];
  achievements: string[];
}

export const SAVE_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    difficulty: 'club',
    halfMinutes: 8,
    clockScale: 4,
    quality: 'medium',
    camera: 'behind',
    leftHanded: false,
    assistedPass: true,
    showTen: true,
    shake: true,
    largeHud: false,
    music: 0.25,
    effects: 0.8,
    crowd: 0.55,
    showFps: false,
    colorblind: false,
  };
}

export function freshSave(): SaveData {
  return {
    version: 1,
    settings: defaultSettings(),
    season: null,
    career: null,
    history: [],
    achievements: [],
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

const ATTACK: AttackStyle[] = ['middle', 'wide', 'tempo', 'completion', 'territory'];
const DEFENCE: DefenceStyle[] = ['aggressive', 'compressed', 'slide', 'edge'];
const KICK: KickStyle[] = ['deep', 'short', 'contest'];

export function tacticAllowed(attack: string, defence: string, kick: string): boolean {
  return (ATTACK as string[]).includes(attack) && (DEFENCE as string[]).includes(defence) && (KICK as string[]).includes(kick);
}

/** Rejects corrupt payloads and returns a valid save. Unknown future versions start fresh. */
export function parseSave(raw: string | null | undefined): SaveData {
  if (!raw) return freshSave();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_VERSION) return freshSave();
    const base = freshSave();
    if (isRecord(parsed.settings)) {
      const s = parsed.settings;
      const difficulty = s.difficulty === 'rookie' || s.difficulty === 'representative' || s.difficulty === 'club'
        ? s.difficulty
        : base.settings.difficulty;
      base.settings = {
        ...base.settings,
        difficulty,
        halfMinutes: [5, 8, 10, 20, 40].includes(Number(s.halfMinutes)) ? Number(s.halfMinutes) : base.settings.halfMinutes,
        clockScale: [1, 2, 4, 6, 8].includes(Number(s.clockScale)) ? Number(s.clockScale) : base.settings.clockScale,
        quality: s.quality === 'low' || s.quality === 'high' || s.quality === 'medium' ? s.quality : 'medium',
        camera: s.camera === 'broadcast' || s.camera === 'tactical' || s.camera === 'behind' ? s.camera : 'behind',
        leftHanded: s.leftHanded === true,
        assistedPass: s.assistedPass !== false,
        showTen: s.showTen !== false,
        shake: s.shake !== false,
        largeHud: s.largeHud === true,
        music: clampNum(s.music, 0, 1, 0.25),
        effects: clampNum(s.effects, 0, 1, 0.8),
        crowd: clampNum(s.crowd, 0, 1, 0.55),
        showFps: s.showFps === true,
        colorblind: s.colorblind === true,
      };
    }
    if (Array.isArray(parsed.achievements)) {
      base.achievements = parsed.achievements.filter((a): a is string => typeof a === 'string').slice(0, 64);
    }
    if (Array.isArray(parsed.history)) {
      base.history = parsed.history.filter(isHistory).slice(0, 40);
    }
    if (isRecord(parsed.career) && typeof parsed.career.playerName === 'string' && typeof parsed.career.teamId === 'string') {
      base.career = {
        playerName: parsed.career.playerName.slice(0, 32),
        role: typeof parsed.career.role === 'string' ? parsed.career.role as Role : 'halfback',
        teamId: parsed.career.teamId,
        attrs: isRecord(parsed.career.attrs) ? Object.fromEntries(
          Object.entries(parsed.career.attrs).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, clampNum(v, 0.3, 0.98, 0.6)]),
        ) : {},
        age: clampNum(parsed.career.age, 18, 40, 22),
        matches: clampNum(parsed.career.matches, 0, 1000, 0),
        tries: clampNum(parsed.career.tries, 0, 5000, 0),
        goals: clampNum(parsed.career.goals, 0, 5000, 0),
        tackles: clampNum(parsed.career.tackles, 0, 20000, 0),
        metres: clampNum(parsed.career.metres, 0, 500000, 0),
        seasonYear: clampNum(parsed.career.seasonYear, 2020, 2100, 2026),
      };
    }
    if (isRecord(parsed.season) && Array.isArray(parsed.season.teamIds) && Array.isArray(parsed.season.fixtures)) {
      base.season = {
        year: clampNum(parsed.season.year, 2020, 2100, 2026),
        teamIds: parsed.season.teamIds.filter((id): id is string => typeof id === 'string').slice(0, 16),
        userTeamId: typeof parsed.season.userTeamId === 'string' ? parsed.season.userTeamId : '',
        fixtures: parsed.season.fixtures.filter(isFixture).slice(0, 80),
      };
    }
    return base;
  } catch {
    return freshSave();
  }
}

function isHistory(value: unknown): value is HistoryItem {
  if (!isRecord(value)) return false;
  return typeof value.at === 'string'
    && typeof value.home === 'string'
    && typeof value.away === 'string'
    && Array.isArray(value.score)
    && value.score.length === 2
    && typeof value.score[0] === 'number'
    && typeof value.score[1] === 'number';
}

function isFixture(value: unknown): value is SeasonState['fixtures'][number] {
  if (!isRecord(value)) return false;
  const stageOk = value.stage === 'regular' || value.stage === 'semi' || value.stage === 'final';
  const scoreOk = value.score === null || (Array.isArray(value.score) && value.score.length === 2);
  return typeof value.id === 'string' && typeof value.home === 'string' && typeof value.away === 'string' && stageOk && scoreOk && typeof value.round === 'number';
}

const ACHIEVEMENTS: { id: string; label: string; test: (history: HistoryItem[], career: CareerState | null) => boolean }[] = [
  { id: 'first-try', label: 'First try', test: (_h, c) => (c?.tries ?? 0) > 0 },
  { id: 'first-win', label: 'First win', test: (h) => h.some((m) => m.score[0] !== m.score[1]) },
  { id: 'century', label: '100 metres in a career', test: (_h, c) => (c?.metres ?? 0) >= 100 },
  { id: 'ten-matches', label: 'Ten matches', test: (_h, c) => (c?.matches ?? 0) >= 10 },
];

export function achievementCatalog(): { id: string; label: string }[] {
  return ACHIEVEMENTS.map(({ id, label }) => ({ id, label }));
}

export function unlockAchievements(data: SaveData): string[] {
  const gained: string[] = [];
  for (const item of ACHIEVEMENTS) {
    if (data.achievements.includes(item.id)) continue;
    if (item.test(data.history, data.career)) {
      data.achievements.push(item.id);
      gained.push(item.id);
    }
  }
  return gained;
}

export function storeSave(data: SaveData, storage: Pick<Storage, 'setItem'> = localStorage): void {
  const payload = serializeSave(data);
  storage.setItem('meridian-league-save', payload);
  storage.setItem('meridian-league-save-backup', payload);
}

export function loadSave(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  const primary = storage.getItem('meridian-league-save');
  const parsed = parseSave(primary);
  if (primary && parsed.version === SAVE_VERSION && primary.includes('"version"')) return parsed;
  return parseSave(storage.getItem('meridian-league-save-backup'));
}
