export type TeamId = 0 | 1;

export type Role =
  | 'fullback'
  | 'wing'
  | 'centre'
  | 'five_eighth'
  | 'halfback'
  | 'prop'
  | 'hooker'
  | 'second_row'
  | 'lock';

export type Phase =
  | 'prematch'
  | 'kickoff'
  | 'open_play'
  | 'tackle'
  | 'play_the_ball'
  | 'in_flight'
  | 'loose'
  | 'scrum'
  | 'restart'
  | 'try'
  | 'conversion'
  | 'penalty'
  | 'half_time'
  | 'full_time';

export type KickKind =
  | 'punt'
  | 'grubber'
  | 'bomb'
  | 'chip'
  | 'touch_finder'
  | 'kickoff'
  | 'dropout'
  | 'conversion'
  | 'penalty_goal'
  | 'field_goal';

export type Difficulty = 'rookie' | 'club' | 'representative';

export type AttackStyle = 'middle' | 'wide' | 'tempo' | 'completion' | 'territory';
export type DefenceStyle = 'aggressive' | 'compressed' | 'slide' | 'edge';
export type KickStyle = 'deep' | 'short' | 'contest';

export interface Tactic {
  attack: AttackStyle;
  defence: DefenceStyle;
  kick: KickStyle;
}

export interface Weather {
  rain: number;
  windX: number;
  windZ: number;
}

export interface RuleSet {
  id: string;
  name: string;
  halfSeconds: number;
  extraTimeSeconds: number;
  tacklesPerSet: number;
  interchangeLimit: number;
  tenMetres: number;
  tryPoints: number;
  conversionPoints: number;
  penaltyGoalPoints: number;
  fieldGoalPoints: number;
  goldenPoint: boolean;
  sixAgain: boolean;
  fortyTwenty: boolean;
  /** Clock multiplier. Player movement stays in real time. */
  clockScale: number;
}

export interface Attributes {
  speed: number;
  acceleration: number;
  agility: number;
  strength: number;
  balance: number;
  endurance: number;
  tackling: number;
  ballCarry: number;
  passing: number;
  catching: number;
  kickPower: number;
  kickAccuracy: number;
  decision: number;
  positioning: number;
  awareness: number;
}

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  facialHair: number;
  body: number;
  boot: number;
}

export interface PlayerTemplate {
  name: string;
  number: number;
  role: Role;
  side: -1 | 0 | 1;
  attrs: Attributes;
  look: Look;
  star: boolean;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  city: string;
  stadiumId: string;
  home: string;
  away: string;
  accent: string;
  text: string;
  squad: PlayerTemplate[];
}

export type Action =
  | 'idle'
  | 'run'
  | 'sprint'
  | 'backpedal'
  | 'pass'
  | 'catch'
  | 'kick'
  | 'tackle'
  | 'wrap'
  | 'tackled'
  | 'play_ball'
  | 'dive'
  | 'celebrate'
  | 'jump'
  | 'marker'
  | 'stumble'
  | 'get_up';

export interface Decision {
  serial: number;
  type: 'carry' | 'pass' | 'kick' | 'dive' | 'hold';
  until: number;
  dirX: number;
  dirZ: number;
  targetId: number;
  kick: KickKind;
  power: number;
  intent: string;
}

export interface Player {
  id: number;
  team: TeamId;
  squadIndex: number;
  name: string;
  number: number;
  role: Role;
  side: -1 | 0 | 1;
  attrs: Attributes;
  look: Look;
  star: boolean;
  primary: string;
  secondary: string;
  onField: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  fatigue: number;
  hasBall: boolean;
  action: Action;
  actionUntil: number;
  targetX: number;
  targetZ: number;
  sprint: boolean;
  engage: boolean;
  lockPosition: boolean;
  travel: number;
  intent: string;
  decision: Decision | null;
  appliedSerial: number;
  decisionAt: number;
  stumbleUntil: number;
  burstUntil: number;
  offside: boolean;
  marker: boolean;
  groundTimer: number;
  metres: number;
  carries: number;
  tackles: number;
  tackleBreaks: number;
  misses: number;
  tries: number;
  goals: number;
  fieldGoals: number;
  kicks: number;
  errors: number;
  offloads: number;
  lineBreaks: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: 'held' | 'flight' | 'rolling' | 'dead';
  carrierId: number;
  lastPlayerId: number;
  kick: KickKind | null;
  kickTeam: TeamId | null;
  kickX: number;
  kickZ: number;
  bounced: boolean;
  inFieldBounce: boolean;
  forward: boolean;
  chargeDown: boolean;
  spin: number;
  intendedId: number;
}

export interface Ruck {
  x: number;
  z: number;
  tackledId: number;
  tacklerIds: number[];
  dominant: boolean;
}

export type EventType =
  | 'kickoff'
  | 'try'
  | 'conversion'
  | 'conversion_miss'
  | 'penalty_goal'
  | 'penalty_goal_miss'
  | 'field_goal'
  | 'field_goal_miss'
  | 'tackle'
  | 'tackle_break'
  | 'offload'
  | 'handover'
  | 'knock_on'
  | 'forward_pass'
  | 'penalty'
  | 'six_again'
  | 'touch'
  | 'forty_twenty'
  | 'dropout'
  | 'twenty_metre'
  | 'scrum'
  | 'held_up'
  | 'half_time'
  | 'full_time'
  | 'extra_time'
  | 'interchange'
  | 'line_break'
  | 'charge_down'
  | 'hooter'
  | 'error'
  | 'restart';

export interface MatchEvent {
  id: number;
  type: EventType;
  team: TeamId | -1;
  playerId: number;
  clock: number;
  half: number;
  text: string;
  x: number;
  z: number;
}

export interface ScoreEvent {
  team: TeamId;
  playerId: number;
  kind: 'try' | 'conversion' | 'penalty_goal' | 'field_goal';
  clock: number;
  half: number;
  points: number;
}

export interface Snapshot {
  t: number;
  ball: { x: number; y: number; z: number };
  players: { x: number; z: number; facing: number; action: Action; hasBall: boolean }[];
}

export interface HumanInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  pass: boolean;
  passDirX: number;
  passDirZ: number;
  assistedPass: boolean;
  kick: { kind: KickKind; power: number; dirX: number; dirZ: number } | null;
  tackle: boolean;
  dive: boolean;
  offload: boolean;
  switchPlayer: boolean;
  quickPlay: boolean;
  restartChoice: 'tap' | 'touch' | 'goal' | null;
  goalError: number | null;
  release: boolean;
}

export interface MatchView {
  players: Player[];
  ball: Ball;
  phase: Phase;
  possession: TeamId;
  tackleCount: number;
  half: number;
  score: [number, number];
  clock: number;
  rules: RuleSet;
  tactics: [Tactic, Tactic];
  difficulty: Difficulty;
  ruck: Ruck | null;
  weather: Weather;
  humanTeam: TeamId | null;
  controlledId: number | null;
  elapsed: number;
  phaseTime: number;
  teams: [Team, Team];
  attackSign(team: TeamId): number;
}

export interface CarrierDecision {
  serial: number;
  type: 'carry' | 'pass' | 'kick' | 'dive' | 'hold';
  until: number;
  dirX: number;
  dirZ: number;
  targetId: number;
  kick: KickKind;
  power: number;
  intent: string;
  score: number;
}

export interface TargetOrder {
  id: number;
  x: number;
  z: number;
  sprint: boolean;
  engage: boolean;
  marker: boolean;
  intent: string;
}

export const FIELD = {
  length: 50,
  width: 34,
  inGoal: 8,
  dead: 58,
  postHalf: 2.75,
  crossbar: 3,
} as const;

export const DEFAULT_RULES: RuleSet = {
  id: 'meridian',
  name: 'Meridian Cup',
  halfSeconds: 8 * 60,
  extraTimeSeconds: 5 * 60,
  tacklesPerSet: 6,
  interchangeLimit: 8,
  tenMetres: 10,
  tryPoints: 4,
  conversionPoints: 2,
  penaltyGoalPoints: 2,
  fieldGoalPoints: 1,
  goldenPoint: true,
  sixAgain: true,
  fortyTwenty: true,
  clockScale: 4,
};

export function makeRules(over: Partial<RuleSet> = {}): RuleSet {
  return { ...DEFAULT_RULES, ...over };
}

export function defaultTactic(): Tactic {
  return { attack: 'middle', defence: 'slide', kick: 'contest' };
}

export function emptyDecision(): Decision {
  return {
    serial: 0,
    type: 'hold',
    until: 0,
    dirX: 0,
    dirZ: 1,
    targetId: -1,
    kick: 'punt',
    power: 0.6,
    intent: 'hold',
  };
}
