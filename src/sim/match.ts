import { acceleration, chooseReceiver, gradeTackle, legalReceivers, maxSpeed, metresToGoal, planCarrier, planTargets } from './ai';
import type { AimPreview } from './aim';
import { kickLaunch, KICK_SPECS, passLaunch } from './flight';
import type {
  Action,
  Ball,
  Difficulty,
  EventType,
  HumanInput,
  KickKind,
  MatchEvent,
  MatchView,
  Phase,
  Player,
  PlayerTemplate,
  Ruck,
  RuleSet,
  ScoreEvent,
  Snapshot,
  Tactic,
  Team,
  TeamId,
  Weather,
} from './types';
import { FIELD, defaultTactic, makeRules } from './types';

export interface MatchOptions {
  home: Team;
  away: Team;
  seed?: number;
  humanTeam?: TeamId | null;
  difficulty?: Difficulty;
  tactics?: [Tactic, Tactic];
  weather?: Weather;
  stadiumId?: string;
  rules?: Partial<RuleSet>;
  halfSeconds?: number;
  clockScale?: number;
}

export interface MatchResult {
  homeId: string;
  awayId: string;
  home: string;
  away: string;
  score: [number, number];
  scorers: ScoreEvent[];
  playerStats: Player[];
  motmId: number;
  faults: string[];
  abandoned: boolean;
  reason: string;
  interchanges: [number, number];
  possessionTime: [number, number];
  territoryTime: [number, number];
  completedSets: [number, number];
  errors: [number, number];
  events: MatchEvent[];
}

const KICKS = KICK_SPECS;

const CLEAR: Weather = { rain: 0, windX: 0, windZ: 0 };

export class Match implements MatchView {
  readonly rules: RuleSet;
  readonly teams: [Team, Team];
  readonly seed: number;
  readonly stadiumId: string;
  readonly players: Player[] = [];
  /** Drawn by the view. The step does not read it. */
  aim: AimPreview | null = null;
  readonly events: MatchEvent[] = [];
  readonly scorers: ScoreEvent[] = [];
  readonly faults: string[] = [];
  readonly weather: Weather;
  readonly difficulty: Difficulty;
  readonly humanTeam: TeamId | null;

  tactics: [Tactic, Tactic];
  ball: Ball;
  phase: Phase = 'prematch';
  possession: TeamId = 0;
  tackleCount = 0;
  half = 1;
  score: [number, number] = [0, 0];
  clock = 0;
  elapsed = 0;
  phaseTime = 0;
  ruck: Ruck | null = null;
  controlledId: number | null = null;
  hooter = false;
  aiEnabled = true;
  passiveDefence = false;
  holdPresentation = false;
  released = false;
  abandoned = false;
  endReason = '';
  interchanges: [number, number] = [0, 0];
  possessionTime: [number, number] = [0, 0];
  territoryTime: [number, number] = [0, 0];
  completedSets: [number, number] = [0, 0];
  errors: [number, number] = [0, 0];
  history: Snapshot[] = [];
  replay: Snapshot[] = [];
  tryInfo: { x: number; z: number; team: TeamId; playerId: number } | null = null;
  unstuckCount = 0;
  /** Mega / illegal tackle button is only armed for short windows. */
  megaArmed = false;
  megaArmedUntil = 0;
  timeScale = 1;
  private timeScaleUntil = 0;
  fightOpen = false;
  fightKind: 'duel' | 'brawl' | null = null;
  fightUntil = 0;
  lastImpact: { x: number; z: number; power: number; bloody: boolean; t: number } | null = null;
  private nextFightRoll = 18;
  private megaCooldownUntil = 0;

  get awardedTeam(): TeamId {
    return this.penaltyTeam;
  }

  /** Which kick the conversion phase is resolving. Null during open play. */
  get goalAttempt(): 'conversion' | 'penalty_goal' | 'field_goal' | null {
    return this.goalMode;
  }

  private pendingHalf = 2;
  private pendingHandover = false;
  private openingKicker: TeamId = 1;
  private kickerId = 21;
  private flightKind: 'pass' | 'kick' = 'kick';
  private goalMode: 'conversion' | 'penalty_goal' | 'field_goal' | null = null;
  private goalResolved = false;
  private penaltyTeam: TeamId = 0;
  private penaltyX = 0;
  private penaltyZ = 0;
  private hooterPenalty = false;
  private restartKind: 'tap' | 'dropout' | 'twenty' = 'tap';
  private scrumFeed: TeamId = 0;
  private quickPTB = false;
  private brokeThisCarry = false;
  private prevCarrierZ = 0;
  private carryId = -1;
  private prevBall = { x: 0, y: 0.2, z: 0 };
  private aiAcc = 0;
  private histAcc = 0;
  private eventId = 1;
  private lastLineBreak = -1;

  constructor(opts: MatchOptions) {
    this.teams = [opts.home, opts.away];
    this.seed = opts.seed ?? 1;
    this.humanTeam = opts.humanTeam === undefined ? 0 : opts.humanTeam;
    this.difficulty = opts.difficulty ?? 'club';
    this.weather = opts.weather ?? CLEAR;
    this.tactics = opts.tactics ?? [defaultTactic(), defaultTactic()];
    this.stadiumId = opts.stadiumId ?? opts.home.stadiumId;
    this.rules = makeRules({
      ...opts.rules,
      halfSeconds: opts.halfSeconds ?? opts.rules?.halfSeconds ?? 8 * 60,
      clockScale: opts.clockScale ?? opts.rules?.clockScale ?? 4,
    });
    this.holdPresentation = this.humanTeam !== null;
    this.ball = this.makeBall();
    this.spawnPlayers();
  }

  attackSign(team: TeamId): number {
    const base = team === 0 ? 1 : -1;
    return this.half % 2 === 1 ? base : -base;
  }

  /** Presentation lineup. The sim does not advance while the phase is prematch. */
  lineup(): void {
    this.phase = 'prematch';
    this.ball.x = 0;
    this.ball.y = 0.16;
    this.ball.z = 0;
    this.ball.mode = 'dead';
    for (const p of this.players) {
      if (!p.onField) {
        this.parkBench(p);
        continue;
      }
      p.x = (p.squadIndex - 6) * 2.15;
      p.z = p.team === 0 ? -7.5 : 7.5;
      p.vx = 0;
      p.vz = 0;
      p.facing = p.team === 0 ? 0 : Math.PI;
      p.action = 'idle';
      p.targetX = p.x;
      p.targetZ = p.z;
      p.hasBall = false;
    }
  }

  start(): void {
    this.half = 1;
    this.clock = 0;
    this.score = [0, 0];
    this.hooter = false;
    this.openingKicker = 1;
    this.placeKickoff(this.openingKicker);
    this.phase = 'kickoff';
    this.phaseTime = 0;
    this.emit('kickoff', this.openingKicker, 'Kick-off');
  }

  step(dt: number, input: HumanInput | null): void {
    if (this.phase === 'full_time' || this.phase === 'prematch') return;
    const scaled = this.tickPresentation(dt);
    const clamped = Math.max(0, Math.min(0.1, scaled));
    if (clamped <= 0) return;
    const slices = Math.max(1, Math.ceil(clamped / (1 / 60)));
    const h = clamped / slices;
    for (let i = 0; i < slices; i++) this.substep(h, input, i === 0);
  }

  carrier(): Player | null {
    return this.players.find((p) => p.hasBall) ?? null;
  }

  player(id: number): Player {
    const p = this.players.find((q) => q.id === id);
    if (!p) throw new Error(`No player ${id}`);
    return p;
  }

  giveBall(id: number): void {
    const p = this.player(id);
    for (const other of this.players) other.hasBall = false;
    p.hasBall = true;
    p.offside = false;
    this.possession = p.team;
    this.ball.mode = 'held';
    this.ball.carrierId = p.id;
    this.ball.lastPlayerId = p.id;
    this.ball.kick = null;
    this.ball.forward = false;
    this.ball.chargeDown = false;
    this.ball.x = p.x;
    this.ball.y = 1.05;
    this.ball.z = p.z;
    this.ball.vx = p.vx;
    this.ball.vz = p.vz;
    this.ball.vy = 0;
    if (this.carryId !== p.id) {
      p.carries += 1;
      this.carryId = p.id;
      this.prevCarrierZ = p.z;
      this.brokeThisCarry = false;
      p.decision = null;
    }
  }

  place(id: number, x: number, z: number): void {
    const p = this.player(id);
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
  }

  lock(id: number, on: boolean): void {
    this.player(id).lockPosition = on;
  }

  lockAll(on: boolean): void {
    for (const p of this.players) p.lockPosition = on;
  }

  /**
   * Places a clean midfield possession for drills and tests.
   * Defence is 12m goal-side and everyone except the carrier is locked.
   */
  scenario(team: TeamId, squadIndex: number, x: number, z: number, tackle = 0): void {
    this.phase = 'open_play';
    this.phaseTime = 0;
    this.possession = team;
    this.tackleCount = tackle;
    this.pendingHandover = false;
    this.hooter = false;
    this.ruck = null;
    const sign = this.attackSign(team);
    for (const p of this.players) {
      if (!p.onField) continue;
      p.vx = 0;
      p.vz = 0;
      p.hasBall = false;
      p.offside = false;
      p.marker = false;
      p.action = 'idle';
      p.groundTimer = 0;
      if (p.team === team && p.squadIndex === squadIndex) {
        p.x = x;
        p.z = z;
        p.lockPosition = false;
      } else if (p.team === team) {
        p.x = clamp((p.squadIndex - 6) * 3.1, -30, 30);
        p.z = z - sign * (3 + (p.squadIndex % 3));
        p.lockPosition = true;
      } else {
        p.x = clamp((p.squadIndex - 6) * 3.1, -30, 30);
        p.z = z + sign * 12;
        p.lockPosition = true;
      }
    }
    const carrier = this.players.find((p) => p.onField && p.team === team && p.squadIndex === squadIndex);
    if (!carrier) throw new Error('scenario carrier missing');
    this.giveBall(carrier.id);
    this.syncHeldBall();
  }

  requestPass(id: number, dirX: number, dirZ: number, assisted: boolean, targetId = -1): boolean {
    const p = this.player(id);
    if (!p.hasBall) return false;
    if (p.action === 'tackled' || this.phase === 'play_the_ball' || this.phase === 'scrum') return false;
    if (this.phase !== 'open_play' && this.phase !== 'kickoff' && this.phase !== 'tackle' && this.phase !== 'loose') {
      return false;
    }
    if (this.phase === 'tackle' && this.phaseTime > 0.4) return false;
    const sign = this.attackSign(p.team);
    const aimingForward = Math.hypot(dirX, dirZ) > 0.2 && dirZ * sign > 0.55 && Math.abs(dirZ) >= Math.abs(dirX) * 0.8;
    const locked = targetId >= 0 ? this.players.find((player) => player.id === targetId) : undefined;
    const lockedLegal = locked ? legalReceivers(this, p).some((player) => player.id === locked.id) : false;
    const target = locked && lockedLegal && !aimingForward ? locked : chooseReceiver(this, p, dirX, dirZ, assisted);
    if (assisted || !aimingForward) {
      if (!target) return false;
      const lead = 0.25;
      let tx = target.x + target.vx * lead;
      let tz = target.z + target.vz * lead;
      if ((tz - p.z) * sign > 0.15) tz = p.z - sign * Math.max(1.2, Math.abs(tx - p.x) * 0.05);
      this.releasePass(p, tx, tz, target.id, false);
      return true;
    }
    const dist = 8;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.releasePass(p, p.x + (dirX / len) * dist, p.z + (dirZ / len) * dist, target?.id ?? -1, true);
    return true;
  }

  /** Drop goal aimed by the player. `meter` is -1..1; 0 is through the middle from in front. */
  aimFieldGoal(meter: number): boolean {
    const p = this.carrier();
    if (!p?.hasBall) return false;
    if (this.phase !== 'open_play' && this.phase !== 'restart') return false;
    this.goalMode = 'field_goal';
    this.launchAtPosts(p.x, p.z, p.team, clamp(meter, -1, 1), 'field_goal', p);
    return true;
  }

  requestKick(id: number, kind: KickKind, power: number, dirX: number, dirZ: number): boolean {
    const p = this.player(id);
    if (!p.hasBall) return false;
    if (this.phase !== 'open_play' && this.phase !== 'kickoff' && this.phase !== 'restart') return false;
    if (kind === 'field_goal') {
      this.launchFieldGoal(p, power);
      return true;
    }
    this.releaseKick(p, kind, clamp(power, 0.15, 1), dirX, dirZ);
    return true;
  }

  requestDive(id: number): boolean {
    const p = this.player(id);
    if (!p.hasBall) return false;
    if (this.phase !== 'open_play' && this.phase !== 'tackle') return false;
    const sign = this.attackSign(p.team);
    this.setAction(p, 'dive', 0.65);
    p.vz += sign * 2.4;
    p.groundTimer = Math.max(p.groundTimer, 0.05);
    p.targetZ = p.z + sign * 5;
    p.targetX = p.x;
    return true;
  }

  applyCompletedTackle(kind: 'completed' | 'dominant' = 'completed'): void {
    const c = this.carrier();
    if (!c) return;
    const tacklers = this.players.filter((p) => p.onField && p.team !== c.team).slice(0, kind === 'dominant' ? 2 : 1);
    this.finishHeldTackle(c, tacklers, kind);
  }

  takeGoalKick(meter: number): void {
    if (this.goalResolved && this.phase !== 'conversion' && this.goalMode !== 'field_goal') return;
    const team = this.goalMode === 'penalty_goal' ? this.penaltyTeam : (this.tryInfo?.team ?? this.possession);
    const kicker = this.players.find((p) => p.id === this.kickerId) ?? this.bestKicker(team);
    const fromX = this.goalMode === 'penalty_goal' ? this.penaltyX : clamp(this.tryInfo?.x ?? 0, -30, 30);
    const sign = this.attackSign(team);
    const plane = FIELD.length * sign;
    const fromZ = this.goalMode === 'field_goal'
      ? kicker.z
      : plane - sign * clamp(12 + Math.abs(fromX) * 0.15, 12, 28);
    if (this.goalMode !== 'field_goal') {
      kicker.x = fromX;
      kicker.z = fromZ;
      kicker.hasBall = true;
    }
    this.launchAtPosts(fromX, fromZ, team, meter, this.goalMode ?? 'conversion', kicker);
  }

  chooseRestart(choice: 'tap' | 'touch' | 'goal'): void {
    if (this.phase !== 'penalty') return;
    const team = this.penaltyTeam;
    if (this.hooterPenalty && choice !== 'goal') {
      this.endPeriod();
      return;
    }
    if (choice === 'goal') {
      this.goalMode = 'penalty_goal';
      this.goalResolved = false;
      this.kickerId = this.bestKicker(team).id;
      this.phase = 'conversion';
      this.phaseTime = 0;
      this.released = false;
      return;
    }
    if (choice === 'touch') {
      const kicker = this.bestKicker(team);
      const sign = this.attackSign(team);
      const metres = 22 + kicker.attrs.kickPower * 24;
      const landZ = clamp(this.penaltyZ + sign * metres, -FIELD.length + 2, FIELD.length - 2);
      const landX = this.penaltyX >= 0 ? 14 : -14;
      this.emit('restart', team, 'Penalty kicked to touch', kicker.id, landX, landZ);
      this.startTap(team, landX, landZ);
      return;
    }
    this.startTap(team, this.penaltyX, this.penaltyZ);
  }

  releasePresentation(): void {
    this.released = true;
  }

  interchange(offId: number, onId: number): boolean {
    const off = this.player(offId);
    const on = this.player(onId);
    if (off.team !== on.team || !off.onField || on.onField) return false;
    if (off.hasBall || this.interchanges[off.team] >= this.rules.interchangeLimit) return false;
    if (this.phase === 'open_play' || this.phase === 'in_flight' || this.phase === 'tackle') return false;
    on.onField = true;
    off.onField = false;
    on.x = off.x;
    on.z = off.z;
    on.vx = 0;
    on.vz = 0;
    on.fatigue = Math.max(0, on.fatigue);
    this.parkBench(off);
    this.interchanges[off.team] += 1;
    if (this.controlledId === off.id) this.controlledId = on.id;
    this.emit('interchange', off.team, `${on.name} on for ${off.name}`, on.id, on.x, on.z);
    return true;
  }

  abandon(): void {
    this.abandoned = true;
    this.finish('abandoned');
  }

  result(): MatchResult {
    return {
      homeId: this.teams[0].id,
      awayId: this.teams[1].id,
      home: this.teams[0].name,
      away: this.teams[1].name,
      score: [this.score[0], this.score[1]],
      scorers: this.scorers.slice(),
      playerStats: this.players.map((p) => ({ ...p, attrs: { ...p.attrs }, look: { ...p.look } })),
      motmId: this.motm(),
      faults: this.faults.slice(),
      abandoned: this.abandoned,
      reason: this.endReason,
      interchanges: [...this.interchanges],
      possessionTime: [...this.possessionTime],
      territoryTime: [...this.territoryTime],
      completedSets: [...this.completedSets],
      errors: [...this.errors],
      events: this.events.slice(),
    };
  }

  motm(): number {
    let best = this.players[0];
    let bestScore = -999;
    for (const p of this.players) {
      if (!p.onField && p.tackles + p.metres < 1) continue;
      const rating = 6
        + p.tries * 1.25
        + p.goals * 0.35
        + p.fieldGoals * 0.8
        + p.metres / 90
        + p.tackles / 14
        + p.tackleBreaks * 0.35
        + p.offloads * 0.2
        + p.lineBreaks * 0.3
        - p.errors * 0.85;
      if (rating > bestScore) {
        bestScore = rating;
        best = p;
      }
    }
    return best.id;
  }

  private substep(dt: number, input: HumanInput | null, oneShots: boolean): void {
    this.elapsed += dt;
    this.phaseTime += dt;
    this.updateClock(dt);
    this.updateControlled();
    this.aiAcc += dt;
    if (this.aiEnabled && this.aiAcc >= 0.12) {
      this.aiAcc = 0;
      this.runAI();
    }
    if (input) this.applyHuman(input, oneShots);
    this.trackPossession(dt);

    if (this.phase === 'try') {
      this.celebrate(dt);
      this.autoPresent(this.holdPresentation ? 12 : 0.25, () => this.beginConversion());
    } else if (this.phase === 'conversion') {
      this.autoGoal(dt);
    } else if (this.phase === 'penalty') {
      this.autoPenalty(dt);
    } else if (this.phase === 'half_time') {
      this.autoPresent(this.holdPresentation ? 90 : 0.15, () => this.beginNextHalf());
    } else if (this.phase === 'kickoff') {
      this.integratePlayers(dt);
      this.separate();
      if (this.ball.mode !== 'flight' && this.phaseTime > 0.35) {
        const kicker = this.player(this.kickerId);
        const sign = this.attackSign(kicker.team);
        kicker.hasBall = true;
        this.ball.carrierId = kicker.id;
        this.releaseKick(kicker, 'kickoff', 0.74, (this.seed % 5 - 2) * 0.08, sign);
      }
    } else if (this.phase === 'open_play') {
      this.integratePlayers(dt);
      this.separate();
      this.syncHeldBall();
      this.noteMetres();
      if (!this.carriedDeadOrTouch()) {
        this.checkTry(dt);
        this.checkTackles();
        this.checkLineBreak();
      }
    } else if (this.phase === 'tackle') {
      this.integrateTackle(dt);
      this.separate();
      this.syncHeldBall();
      this.updateTackle(dt);
    } else if (this.phase === 'play_the_ball') {
      this.integratePlayers(dt);
      this.separate();
      this.updatePlayTheBall();
    } else if (this.phase === 'in_flight') {
      this.integratePlayers(dt);
      this.separate();
      this.updateFlight(dt);
    } else if (this.phase === 'loose') {
      this.integratePlayers(dt);
      this.separate();
      this.updateLoose(dt);
    } else if (this.phase === 'scrum') {
      this.updateScrum();
    } else if (this.phase === 'restart') {
      this.integratePlayers(dt);
      this.separate();
      this.updateRestart();
    }

    this.recoverFatigue(dt);
    this.recordHistory(dt);
    this.safety();
    this.checkInvariants();
  }

  private runAI(): void {
    if (this.phase === 'try' || this.phase === 'conversion' || this.phase === 'penalty' || this.phase === 'half_time') return;
    const orders = planTargets(this);
    for (const order of orders) {
      const p = this.player(order.id);
      if (p.lockPosition || this.steeredByHuman(p)) continue;
      p.targetX = order.x;
      p.targetZ = order.z;
      p.sprint = order.sprint;
      p.engage = order.engage;
      p.marker = order.marker;
      p.intent = order.intent;
    }
    const carrier = this.carrier();
    if (!carrier || this.steeredByHuman(carrier)) return;
    const decision = planCarrier(this, carrier);
    if (!decision) return;
    carrier.intent = decision.intent;
    if (decision.type === 'carry' || decision.type === 'dive') {
      const sign = this.attackSign(carrier.team);
      const dirZ = Math.abs(decision.dirZ) > 0.2 ? decision.dirZ : sign;
      carrier.targetX = carrier.x + decision.dirX * 11;
      carrier.targetZ = carrier.z + dirZ * 11;
      carrier.sprint = carrier.fatigue < 0.8;
    }
    if (decision.serial !== carrier.appliedSerial) {
      carrier.decision = decision;
      carrier.appliedSerial = decision.serial;
      carrier.decisionAt = this.elapsed;
      if (decision.type === 'pass') this.requestPass(carrier.id, decision.dirX, decision.dirZ, true);
      else if (decision.type === 'kick') this.requestKick(carrier.id, decision.kick, decision.power, decision.dirX, decision.dirZ);
      else if (decision.type === 'dive') this.requestDive(carrier.id);
    }
  }

  private steeredByHuman(p: Player): boolean {
    return this.humanTeam !== null && p.id === this.controlledId && p.team === this.humanTeam;
  }

  private applyHuman(input: HumanInput, oneShots: boolean): void {
    const p = this.controlledId === null ? null : this.players.find((q) => q.id === this.controlledId);
    if (p && !p.lockPosition && this.phaseAllowsMove()) {
      const mag = Math.hypot(input.moveX, input.moveZ);
      if (mag > 0.14) {
        p.targetX = p.x + input.moveX * 9;
        p.targetZ = p.z + input.moveZ * 9;
        p.sprint = input.sprint || mag > 0.9;
        p.intent = 'human';
      } else if (p.hasBall) {
        p.targetX = p.x;
        p.targetZ = p.z;
        p.sprint = false;
      }
      if (this.possession !== this.humanTeam) p.engage = input.tackle;
    }
    if (!oneShots || !p) return;
    if (input.pass) {
      const aimed = Math.abs(input.passDirX) + Math.abs(input.passDirZ) > 0.2;
      const dx = aimed ? input.passDirX : input.moveX;
      const dz = aimed ? input.passDirZ : input.moveZ;
      const locked = input.passTarget >= 0 && !aimed;
      this.requestPass(p.id, dx, dz, input.assistedPass || locked, locked ? input.passTarget : -1);
    }
    if (input.offload) this.requestPass(p.id, input.passDirX || input.moveX, input.passDirZ || -this.attackSign(p.team), true);
    if (input.kick && p.hasBall) this.requestKick(p.id, input.kick.kind, input.kick.power, input.kick.dirX, input.kick.dirZ);
    if (input.dive) this.requestDive(p.id);
    if (input.switchPlayer) this.switchDefender();
    if (input.quickPlay) this.quickPTB = true;
    if (input.restartChoice) this.chooseRestart(input.restartChoice);
    if (input.goalError !== null && this.phase === 'conversion') this.takeGoalKick(input.goalError);
    if (input.release) this.releasePresentation();
    if (input.megaTackle) this.tryMegaTackle(p);
    if (input.fightChoice) this.resolveFight(input.fightChoice);
  }

  private phaseAllowsMove(): boolean {
    return this.phase === 'open_play' || this.phase === 'loose' || this.phase === 'in_flight'
      || this.phase === 'tackle' || this.phase === 'kickoff' || this.phase === 'play_the_ball' || this.phase === 'restart';
  }

  private updateControlled(): void {
    if (this.humanTeam === null) {
      this.controlledId = null;
      return;
    }
    if (this.possession === this.humanTeam) {
      const c = this.carrier();
      if (c && c.team === this.humanTeam) this.controlledId = c.id;
      else if (this.ball.intendedId >= 0 && this.player(this.ball.intendedId).team === this.humanTeam) {
        this.controlledId = this.ball.intendedId;
      }
      return;
    }
    const current = this.controlledId === null ? null : this.players.find((p) => p.id === this.controlledId);
    if (!current || current.team !== this.humanTeam || !current.onField) {
      const nearest = this.nearestDefender();
      if (nearest) this.controlledId = nearest.id;
    }
  }

  private switchDefender(): void {
    if (this.humanTeam === null || this.possession === this.humanTeam) return;
    const defs = this.players
      .filter((p) => p.onField && p.team === this.humanTeam && p.id !== this.controlledId)
      .sort((a, b) => this.distToBall(a) - this.distToBall(b));
    if (defs[0]) this.controlledId = defs[0].id;
  }

  private nearestDefender(): Player | null {
    if (this.humanTeam === null) return null;
    const defs = this.players.filter((p) => p.onField && p.team === this.humanTeam);
    defs.sort((a, b) => this.distToBall(a) - this.distToBall(b));
    return defs[0] ?? null;
  }

  private distToBall(p: Player): number {
    return Math.hypot(p.x - this.ball.x, p.z - this.ball.z);
  }

  private integratePlayers(dt: number): void {
    for (const p of this.players) {
      if (!p.onField || p.lockPosition) continue;
      if (p.action === 'tackled') continue;
      const dx = p.targetX - p.x;
      const dz = p.targetZ - p.z;
      const dist = Math.hypot(dx, dz);
      const top = maxSpeed(p, this.elapsed) * (p.sprint ? 1 : 0.78);
      let speed = 0;
      if (dist > 0.28) speed = Math.min(top, dist * 3.1);
      const inv = dist > 0.001 ? 1 / dist : 0;
      const wishX = dx * inv * speed;
      const wishZ = dz * inv * speed;
      const accel = acceleration(p);
      const dvx = wishX - p.vx;
      const dvz = wishZ - p.vz;
      const dv = Math.hypot(dvx, dvz);
      const cap = accel * dt;
      const scale = dv > cap && dv > 0 ? cap / dv : 1;
      p.vx += dvx * scale;
      p.vz += dvz * scale;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.travel += Math.hypot(p.vx, p.vz) * dt;
      const moving = Math.hypot(p.vx, p.vz);
      if (moving > 0.8) {
        const want = Math.atan2(p.vx, p.vz);
        p.facing = turnToward(p.facing, want, (4.5 + p.attrs.agility * 4) * dt);
      }
      if (p.actionUntil < this.elapsed) {
        const sign = this.attackSign(p.team);
        const back = p.vz * sign < -0.8 && moving > 1.2 && !p.hasBall;
        p.action = moving > top * 0.86 ? 'sprint' : moving > 1.3 ? (back ? 'backpedal' : 'run') : 'idle';
      }
      if (!p.hasBall && dist > 2.5 && moving < 0.2) {
        p.groundTimer += dt;
        if (p.groundTimer > 1.8) {
          p.x += Math.sign(dx || 1) * 0.7;
          p.z += Math.sign(dz || 1) * 0.7;
          p.groundTimer = 0;
          this.unstuckCount += 1;
        }
      } else if (!p.hasBall) {
        p.groundTimer = 0;
      }
      p.x = clamp(p.x, -42, 42);
      p.z = clamp(p.z, -62, 62);
    }
  }

  private integrateTackle(dt: number): void {
    const c = this.carrier();
    if (!c) return;
    const hold = this.players.filter((p) => this.ruck?.tacklerIds.includes(p.id));
    const sign = this.attackSign(c.team);
    const push = (this.tackleDominant() ? -1.6 : -0.4) * sign;
    c.vx *= Math.exp(-6 * dt);
    c.vz = c.vz * Math.exp(-5 * dt) + push * dt;
    // Try-savers plant the carrier short of the line unless they have already crossed.
    const goal = FIELD.length * sign;
    const crossed = (c.z - goal) * sign >= 0;
    if (!crossed && Math.abs(goal - c.z) < 1.2 && this.tackleDominant()) {
      c.z = goal - sign * 0.45;
      c.vz = 0;
    }
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    for (const t of hold) {
      t.x += (c.x - t.x) * Math.min(1, dt * 6);
      t.z += (c.z + sign * 0.7 - t.z) * Math.min(1, dt * 6);
      t.action = 'wrap';
    }
    if (c.actionUntil < this.elapsed) c.action = 'wrap';
  }

  private tackleDominant(): boolean {
    return this.ruck?.dominant ?? false;
  }

  private separate(): void {
    const live = this.players.filter((p) => p.onField);
    for (let n = 0; n < 2; n++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          let min = 0.92;
          if (a.hasBall || b.hasBall) min = 0.78;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d >= min || d < 0.0001) continue;
          const push = (min - d) * 0.5;
          const ix = dx / d;
          const iz = dz / d;
          if (!a.lockPosition) {
            a.x -= ix * push;
            a.z -= iz * push;
          }
          if (!b.lockPosition) {
            b.x += ix * push;
            b.z += iz * push;
          }
        }
      }
    }
  }

  private syncHeldBall(): void {
    const c = this.carrier();
    if (!c || this.ball.mode === 'flight') return;
    const fx = Math.sin(c.facing);
    const fz = Math.cos(c.facing);
    const rx = Math.cos(c.facing);
    const rz = -Math.sin(c.facing);
    this.ball.x = c.x + fx * 0.32 + rx * 0.22;
    this.ball.z = c.z + fz * 0.32 + rz * 0.22;
    this.ball.y = c.action === 'dive' ? 0.42 : c.action === 'kick' ? 0.48 : 1.12;
    this.ball.vx = c.vx;
    this.ball.vz = c.vz;
    this.ball.mode = 'held';
    this.prevBall = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
  }

  private noteMetres(): void {
    const c = this.carrier();
    if (!c) return;
    const sign = this.attackSign(c.team);
    const gained = (c.z - this.prevCarrierZ) * sign;
    if (gained > 0) c.metres += gained;
    this.prevCarrierZ = c.z;
  }

  private checkTry(dt: number): void {
    const c = this.carrier();
    if (!c || c.team !== this.possession) return;
    if (!this.inAttackInGoal(c)) {
      if (c.action !== 'dive') c.groundTimer = 0;
      return;
    }
    const pressure = this.players.some((d) => d.onField && d.team !== c.team && Math.hypot(d.x - c.x, d.z - c.z) < 1.35);
    if (!pressure) {
      c.groundTimer += dt;
      if (c.action === 'dive' || c.groundTimer > 0.14) this.awardTry(c);
    }
  }

  private carriedDeadOrTouch(): boolean {
    const c = this.carrier();
    if (!c) return false;
    const sign = this.attackSign(c.team);
    if (Math.abs(c.x) > FIELD.width) {
      const over = (c.z - FIELD.length * sign) * sign >= 0;
      this.emit('touch', (1 - c.team) as TeamId, over ? 'Touch in-goal' : 'Carried into touch', c.id, c.x, c.z);
      if (this.stopForHooter()) return true;
      if (over) this.startDropout((1 - c.team) as TeamId);
      else this.startScrum((1 - c.team) as TeamId, clamp(c.z, -30, 30), Math.sign(c.x) * 12);
      return true;
    }
    if (Math.abs(c.z) > FIELD.dead) {
      this.emit('dropout', (1 - c.team) as TeamId, 'Dead in-goal', c.id, c.x, c.z);
      if (this.stopForHooter()) return true;
      this.startDropout((1 - c.team) as TeamId);
      return true;
    }
    return false;
  }

  private inAttackInGoal(p: Player): boolean {
    const sign = this.attackSign(p.team);
    const over = (p.z - FIELD.length * sign) * sign >= -0.05;
    const beforeDead = (FIELD.dead * sign - p.z) * sign >= 0;
    return over && beforeDead && Math.abs(p.x) <= FIELD.width;
  }

  private checkTackles(): void {
    if (this.passiveDefence) return;
    const c = this.carrier();
    if (!c || c.team !== this.possession) return;
    if (c.stumbleUntil > this.elapsed) return;
    const tacklers: Player[] = [];
    for (const d of this.players) {
      if (!d.onField || d.team === c.team || d.stumbleUntil > this.elapsed) continue;
      const dxy = Math.hypot(d.x - c.x, d.z - c.z);
      const wants = d.engage || dxy < 0.95;
      if (wants && dxy < 1.18 && !d.offside) tacklers.push(d);
    }
    if (!tacklers.length) return;
    if (this.phaseTime < 0.45 && tacklers.some((t) => t.offside)) {
      this.callPenalty(tacklers[0].team, c.x, c.z, 'Offside tackle');
      return;
    }
    const kind = gradeTackle(c, tacklers);
    if (kind === 'broken') {
      c.tackleBreaks += 1;
      c.burstUntil = this.elapsed + 0.55;
      this.setAction(c, 'sprint', 0.4);
      for (const t of tacklers) {
        t.misses += 1;
        t.stumbleUntil = this.elapsed + 0.48;
        this.setAction(t, 'stumble', 0.48);
        t.fatigue = Math.min(1, t.fatigue + 0.015);
      }
      this.emit('tackle_break', c.team, `Broken tackle — ${c.name}`, c.id, c.x, c.z);
      this.lastImpact = { x: c.x, z: c.z, power: 0.35, bloody: false, t: this.elapsed };
      this.maybeArmMega();
      return;
    }
    this.phase = 'tackle';
    this.phaseTime = 0;
    this.ruck = {
      x: c.x,
      z: c.z,
      tackledId: c.id,
      tacklerIds: tacklers.map((t) => t.id),
      dominant: kind === 'dominant',
    };
    this.setAction(c, 'wrap', 0.3);
    for (const t of tacklers) {
      this.setAction(t, 'wrap', 0.4);
      t.fatigue = Math.min(1, t.fatigue + 0.02);
    }
    const power = kind === 'dominant' ? 0.85 : 0.45;
    const bloody = kind === 'dominant' && Math.random() < 0.42;
    this.lastImpact = { x: c.x, z: c.z, power, bloody, t: this.elapsed };
    if (bloody) {
      this.setAction(c, 'injured', 0.8);
      this.emit('blood_bin', c.team, `Blood — ${c.name}`, c.id, c.x, c.z);
    }
    if (kind === 'dominant') {
      this.timeScale = 0.28;
      this.timeScaleUntil = this.elapsed + 0.85;
      this.emit('slow_mo', -1, 'Impact replay', c.id, c.x, c.z);
      this.captureSlowMoReplay();
    }
    this.maybeArmMega();
    this.maybeSparkFight(c, tacklers[0]);
  }

  private updateTackle(dt: number): void {
    const c = this.carrier();
    if (!c || !this.ruck) {
      this.phase = 'open_play';
      return;
    }
    const tacklers = this.players.filter((p) => this.ruck!.tacklerIds.includes(p.id));
    // While held, the ball is not grounded unless the carrier dives or the ball is already down.
    if (this.inAttackInGoal(c) && (c.action === 'dive' || this.ball.y < 0.42)) {
      this.awardTry(c);
      return;
    }
    void dt;
    const hold = this.ruck.dominant ? 0.3 : 0.5;
    if (this.phaseTime >= hold) {
      if (this.inAttackInGoal(c)) this.heldUp(c);
      else this.finishHeldTackle(c, tacklers, this.ruck.dominant ? 'dominant' : 'completed');
    }
  }

  private finishHeldTackle(carrier: Player, tacklers: Player[], kind: 'completed' | 'dominant'): void {
    if (this.phase === 'full_time' || this.phase === 'half_time') return;
    for (const t of tacklers) t.tackles += 1;
    carrier.fatigue = Math.min(1, carrier.fatigue + (kind === 'dominant' ? 0.035 : 0.02));
    carrier.hasBall = false;
    this.ball.mode = 'held';
    this.ball.carrierId = -1;
    this.carryId = -1;
    const spotZ = clamp(carrier.z, -FIELD.length + 2, FIELD.length - 2);
    this.ruck = {
      x: clamp(carrier.x, -FIELD.width + 2, FIELD.width - 2),
      z: spotZ,
      tackledId: carrier.id,
      tacklerIds: tacklers.map((t) => t.id),
      dominant: kind === 'dominant',
    };
    this.ball.x = this.ruck.x;
    this.ball.z = this.ruck.z;
    this.ball.y = 0.25;
    this.setAction(carrier, 'tackled', 1.5);
    this.tackleCount += 1;
    this.emit('tackle', carrier.team, kind === 'dominant' ? `Dominant tackle on ${carrier.name}` : `Tackle ${this.tackleCount}`, carrier.id, carrier.x, carrier.z);
    if (this.tackleCount >= this.rules.tacklesPerSet) this.pendingHandover = true;
    if (this.stopForHooter()) return;
    this.phase = 'play_the_ball';
    this.phaseTime = 0;
    this.quickPTB = false;
    this.maybeInterchange(carrier.team);
    this.maybeInterchange((1 - carrier.team) as TeamId);
  }

  private updatePlayTheBall(): void {
    if (!this.ruck) {
      this.phase = 'open_play';
      return;
    }
    const tackled = this.players.find((p) => p.id === this.ruck!.tackledId);
    if (tackled) {
      tackled.x = this.ruck.x;
      tackled.z = this.ruck.z;
      this.setAction(tackled, this.phaseTime > 0.45 ? 'play_ball' : 'get_up', 0.2);
    }
    this.ball.x = this.ruck.x;
    this.ball.z = this.ruck.z;
    this.ball.y = 0.22;
    this.ball.mode = 'held';
    this.retreatDefence(0.016);
    const ready = (this.ruck.dominant ? 1.05 : 0.85) * (this.quickPTB ? 0.45 : 1);
    if (this.phaseTime < ready) return;
    if (this.judgeEncroachment()) return;
    const attack = this.possession;
    if (this.pendingHandover || this.tackleCount >= this.rules.tacklesPerSet) {
      this.handover();
      return;
    }
    const dh = this.dummyHalf(attack, tackled?.id ?? -1);
    if (!dh) return;
    const sign = this.attackSign(attack);
    if (Math.hypot(dh.x - this.ruck.x, dh.z - this.ruck.z) > 2.4) {
      dh.x = this.ruck.x;
      dh.z = this.ruck.z - sign * 1.5;
    }
    this.settleDefence(attack);
    this.giveBall(dh.id);
    this.setAction(dh, 'catch', 0.2);
    this.phase = 'open_play';
    this.phaseTime = 0;
    this.quickPTB = false;
  }

  /** Markers may stand at the ruck. Everyone else is walked back toward the 10m line. */
  private retreatDefence(dt: number): void {
    if (!this.ruck) return;
    const sign = this.attackSign(this.possession);
    const tacklers = new Set(this.ruck.tacklerIds);
    for (const d of this.players) {
      if (!d.onField || d.team === this.possession) continue;
      if (tacklers.has(d.id)) {
        d.marker = true;
        const side = d.side === 0 ? 0.55 : d.side * 0.55;
        d.x = this.ruck.x + side;
        d.z = this.ruck.z + sign * 0.85;
        continue;
      }
      d.marker = false;
      if (d.lockPosition) continue;
      const goalSide = (d.z - this.ruck.z) * sign;
      if (goalSide < this.rules.tenMetres + 0.45) {
        d.z += sign * Math.min(this.rules.tenMetres + 0.55 - goalSide, 16 * dt);
      }
    }
  }

  private judgeEncroachment(): boolean {
    if (!this.ruck) return false;
    const sign = this.attackSign(this.possession);
    const tacklers = new Set(this.ruck.tacklerIds);
    for (const d of this.players) {
      if (!d.onField || d.team === this.possession || tacklers.has(d.id)) continue;
      const goalSide = (d.z - this.ruck.z) * sign;
      if (goalSide < 6.2) {
        if (this.rules.sixAgain) {
          this.sixAgain(d);
          return true;
        }
        this.callPenalty(d.team, this.ruck.x, this.ruck.z, 'Not ten metres');
        return true;
      }
    }
    return false;
  }

  private sixAgain(offender: Player): void {
    this.tackleCount = 0;
    this.pendingHandover = false;
    this.emit('six_again', this.possession, 'Six again — defensive offside', offender.id, this.ruck?.x ?? 0, this.ruck?.z ?? 0);
    const dh = this.dummyHalf(this.possession, this.ruck?.tackledId ?? -1);
    if (dh && this.ruck) {
      const sign = this.attackSign(this.possession);
      dh.x = this.ruck.x;
      dh.z = this.ruck.z - sign * 1.5;
      this.settleDefence(this.possession);
      this.giveBall(dh.id);
    }
    this.phase = 'open_play';
    this.phaseTime = 0;
  }

  private handover(): void {
    const previous = this.possession;
    const next = (1 - previous) as TeamId;
    this.completedSets[previous] += 1;
    this.pendingHandover = false;
    this.tackleCount = 0;
    this.possession = next;
    this.emit('handover', next, `Handover — ${this.teams[next].short} ball`, -1, this.ruck?.x ?? 0, this.ruck?.z ?? 0);
    const receiver = this.dummyHalf(next, -1);
    if (receiver && this.ruck) {
      const sign = this.attackSign(next);
      receiver.x = this.ruck.x;
      receiver.z = this.ruck.z - sign * 1.4;
      receiver.lockPosition = false;
      this.giveBall(receiver.id);
    }
    this.settleDefence(next);
    this.phase = 'open_play';
    this.phaseTime = 0;
    if (this.stopForHooter()) return;
  }

  private settleDefence(attack: TeamId): void {
    const sign = this.attackSign(attack);
    const originZ = this.ruck?.z ?? this.ball.z;
    let slot = 0;
    for (const d of this.players) {
      if (!d.onField || d.team === attack || d.marker) continue;
      const goalSide = (d.z - originZ) * sign;
      if (goalSide < this.rules.tenMetres + 0.4) {
        const x = clamp((slot - 5) * 4.2, -30, 30);
        d.z = originZ + sign * (this.rules.tenMetres + 0.7);
        if (Math.abs(d.x - x) > 8) d.x = x;
        slot += 1;
      }
      d.offside = false;
    }
  }

  private dummyHalf(team: TeamId, tackledId: number): Player | null {
    const hook = this.players.find((p) => p.onField && p.team === team && p.role === 'hooker' && p.id !== tackledId);
    if (hook) return hook;
    const mates = this.players.filter((p) => p.onField && p.team === team && p.id !== tackledId);
    mates.sort((a, b) => Math.hypot(a.x - (this.ruck?.x ?? 0), a.z - (this.ruck?.z ?? 0)) - Math.hypot(b.x - (this.ruck?.x ?? 0), b.z - (this.ruck?.z ?? 0)));
    return mates[0] ?? null;
  }

  private heldUp(carrier: Player): void {
    const defence = (1 - carrier.team) as TeamId;
    this.emit('held_up', defence, `Held up — ${carrier.name}`, carrier.id, carrier.x, carrier.z);
    carrier.hasBall = false;
    this.carryId = -1;
    if (this.stopForHooter()) return;
    this.startDropout(defence);
  }

  private awardTry(scorer: Player): void {
    if (this.phase === 'try' || this.phase === 'full_time') return;
    this.score[scorer.team] += this.rules.tryPoints;
    scorer.tries += 1;
    scorer.hasBall = false;
    this.carryId = -1;
    this.tryInfo = { x: clamp(scorer.x, -FIELD.width, FIELD.width), z: scorer.z, team: scorer.team, playerId: scorer.id };
    this.scorers.push({
      team: scorer.team,
      playerId: scorer.id,
      kind: 'try',
      clock: this.clock,
      half: this.half,
      points: this.rules.tryPoints,
    });
    this.setAction(scorer, 'celebrate', 3);
    this.replay = this.history.slice();
    this.emit('try', scorer.team, `Try — ${scorer.name}`, scorer.id, scorer.x, scorer.z);
    this.completedSets[scorer.team] += 1;
    if (this.half >= 3 && this.rules.goldenPoint) {
      this.finish('golden_point');
      return;
    }
    this.phase = 'try';
    this.phaseTime = 0;
    this.released = false;
    this.ball.mode = 'dead';
    this.ball.x = scorer.x;
    this.ball.z = scorer.z;
    this.ball.y = 0.2;
  }

  private beginConversion(): void {
    if (!this.tryInfo || this.phase === 'full_time') return;
    this.goalMode = 'conversion';
    this.goalResolved = false;
    this.kickerId = this.bestKicker(this.tryInfo.team).id;
    this.phase = 'conversion';
    this.phaseTime = 0;
    this.released = false;
    this.ball.mode = 'dead';
  }

  private autoGoal(dt: number): void {
    if (this.goalResolved) return;
    const wait = this.holdPresentation ? 8 : 0.35;
    if (!this.released && this.phaseTime < wait) return;
    const team = this.goalMode === 'penalty_goal' ? this.penaltyTeam : (this.tryInfo?.team ?? 0);
    const kicker = this.bestKicker(team);
    const width = this.goalMode === 'field_goal' ? Math.abs(kicker.x) : Math.abs(this.tryInfo?.x ?? this.penaltyX);
    const magnitude = (1 - kicker.attrs.kickAccuracy) * (0.28 + width / 90) + this.weather.rain * 0.08;
    const signed = magnitude * (kicker.id % 2 === 0 ? 1 : -1);
    if (dt >= 0) this.takeGoalKick(signed);
  }

  private launchAtPosts(fromX: number, fromZ: number, team: TeamId, meter: number, kind: 'conversion' | 'penalty_goal' | 'field_goal', kicker: Player): void {
    const sign = this.attackSign(team);
    const plane = FIELD.length * sign;
    const aimX = meter * (5.2 + Math.abs(fromX) * 0.12);
    const targetZ = plane + sign * 0.4;
    const dist = Math.max(8, Math.hypot(aimX - fromX, targetZ - fromZ));
    const time = dist / 19.5;
    const targetH = clamp(4.15 + meter * 2.4, 1.2, 12);
    this.clearCarriers();
    this.ball.x = fromX;
    this.ball.z = fromZ;
    this.ball.y = kind === 'field_goal' ? 0.42 : 0.22;
    this.ball.vx = (aimX - fromX) / time;
    this.ball.vz = (targetZ - fromZ) / time;
    this.ball.vy = (targetH + 0.5 * 9.81 * time * time) / time;
    this.ball.mode = 'flight';
    this.ball.kick = kind;
    this.ball.kickTeam = team;
    this.ball.kickX = fromX;
    this.ball.kickZ = fromZ;
    this.ball.lastPlayerId = kicker.id;
    this.ball.bounced = false;
    this.ball.inFieldBounce = false;
    this.ball.forward = false;
    this.ball.chargeDown = false;
    this.ball.intendedId = -1;
    this.flightKind = 'kick';
    this.goalMode = kind;
    this.goalResolved = false;
    this.phase = 'in_flight';
    this.phaseTime = 0;
    this.setAction(kicker, 'kick', 0.7);
    kicker.kicks += 1;
  }

  private launchFieldGoal(kicker: Player, power: number): void {
    const error = (1 - kicker.attrs.kickAccuracy) * 0.55 * (kicker.id % 2 === 0 ? 1 : -1) * (1.1 - power * 0.2);
    this.goalMode = 'field_goal';
    this.launchAtPosts(kicker.x, kicker.z, kicker.team, error + (1 - power) * 0.05, 'field_goal', kicker);
  }

  private updateFlight(dt: number): void {
    this.integrateBall(dt);
    if (this.ball.kick === 'conversion' || this.ball.kick === 'penalty_goal' || this.ball.kick === 'field_goal') {
      if (this.detectGoalCrossing()) return;
    }
    if (this.tryCatchOrTouch()) return;
    if (this.ball.mode === 'rolling') {
      if (this.ball.forward && this.flightKind === 'pass') {
        this.callForward(this.ball.lastPlayerId);
        return;
      }
      this.phase = 'loose';
      this.phaseTime = 0;
    }
  }

  private detectGoalCrossing(): boolean {
    const team = this.ball.kickTeam;
    if (team === null || this.goalResolved) return false;
    const sign = this.attackSign(team);
    const plane = FIELD.length * sign;
    const prev = this.prevBall.z;
    const crossed = (prev - plane) * (this.ball.z - plane) <= 0 && (this.ball.z - prev) * sign > 0;
    if (!crossed) return false;
    const t = Math.abs(this.ball.z - prev) < 0.0001 ? 1 : (plane - prev) / (this.ball.z - prev);
    const x = this.prevBall.x + (this.ball.x - this.prevBall.x) * t;
    const y = this.prevBall.y + (this.ball.y - this.prevBall.y) * t;
    const good = Math.abs(x) <= FIELD.postHalf && y >= FIELD.crossbar && y < 20;
    this.resolveGoal(good);
    return this.ball.kick !== 'field_goal' || good;
  }

  private resolveGoal(good: boolean): void {
    if (this.goalResolved && this.ball.kick !== 'field_goal') return;
    const team = this.ball.kickTeam ?? 0;
    const kicker = this.players.find((p) => p.id === this.ball.lastPlayerId);
    const kind = this.ball.kick;
    this.goalResolved = true;
    if (kind === 'field_goal') {
      if (!good) {
        this.emit('field_goal_miss', team, 'Field goal missed', kicker?.id ?? -1, this.ball.x, this.ball.z);
        this.ball.kick = 'punt';
        this.goalMode = null;
        return;
      }
      this.score[team] += this.rules.fieldGoalPoints;
      if (kicker) kicker.fieldGoals += 1;
      this.scorers.push({ team, playerId: kicker?.id ?? -1, kind: 'field_goal', clock: this.clock, half: this.half, points: 1 });
      this.emit('field_goal', team, `Field goal — ${kicker?.name ?? 'kick'}`, kicker?.id ?? -1, 0, FIELD.length * this.attackSign(team));
      if (this.half >= 3 && this.rules.goldenPoint) {
        this.finish('golden_point');
        return;
      }
      if (this.stopForHooter()) return;
      this.startKickoff((1 - team) as TeamId);
      return;
    }
    const points = kind === 'penalty_goal' ? this.rules.penaltyGoalPoints : this.rules.conversionPoints;
    if (good) {
      this.score[team] += points;
      if (kicker) kicker.goals += 1;
      this.scorers.push({
        team,
        playerId: kicker?.id ?? -1,
        kind: kind === 'penalty_goal' ? 'penalty_goal' : 'conversion',
        clock: this.clock,
        half: this.half,
        points,
      });
      this.emit(kind === 'penalty_goal' ? 'penalty_goal' : 'conversion', team, kind === 'penalty_goal' ? 'Penalty goal' : 'Conversion good', kicker?.id ?? -1, 0, 0);
    } else {
      this.emit(kind === 'penalty_goal' ? 'penalty_goal_miss' : 'conversion_miss', team, kind === 'penalty_goal' ? 'Penalty goal missed' : 'Conversion missed', kicker?.id ?? -1, this.ball.x, this.ball.z);
    }
    if (this.half >= 3 && this.rules.goldenPoint && good) {
      this.finish('golden_point');
      return;
    }
    if (this.stopForHooter()) return;
    if (kind === 'penalty_goal' && !good) this.startTwenty((1 - team) as TeamId, 0);
    else this.startKickoff((1 - team) as TeamId);
  }

  private tryCatchOrTouch(): boolean {
    if (Math.abs(this.ball.x) > FIELD.width) {
      this.onTouch();
      return true;
    }
    if (Math.abs(this.ball.z) > FIELD.dead) {
      this.onDead();
      return true;
    }
    const candidates: { p: Player; d: number }[] = [];
    for (const p of this.players) {
      if (!p.onField || p.lockPosition) continue;
      const fromKick = Math.hypot(this.ball.x - this.ball.kickX, this.ball.z - this.ball.kickZ);
      if (p.id === this.ball.lastPlayerId && fromKick < 2.4 && this.phaseTime < 0.4) continue;
      const d = this.segmentDistance(p.x, p.z);
      const reach = this.ball.y > 1.75 ? 1.2 : 1.4;
      if (d < reach && this.ball.y < 2.6 && this.ball.y > 0.05) candidates.push({ p, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    const nearest = candidates[0];
    if (!nearest) return false;
    if (nearest.p.offside && nearest.p.team === this.ball.kickTeam) {
      this.callPenalty(nearest.p.team, nearest.p.x, nearest.p.z, 'Offside at the kick');
      return true;
    }
    const score = this.catchScore(nearest.p);
    const second = candidates[1];
    const contest = second && second.d < 1.35 && Math.abs(this.catchScore(second.p) - score) < 0.05 && this.ball.y > 1.2;
    const threshold = this.flightKind === 'kick' || this.ball.kick ? 0.5 : 0.42;
    if (!contest && score >= threshold) {
      if (this.ball.forward && this.flightKind === 'pass') {
        this.callForward(this.ball.lastPlayerId);
        return true;
      }
      this.completeCatch(nearest.p);
      return true;
    }
    if (this.ball.kick && nearest.p.team !== this.ball.kickTeam && nearest.d < 1.15) {
      this.ball.chargeDown = true;
      this.ball.vx *= 0.35;
      this.ball.vz *= 0.2;
      this.ball.vy = Math.max(this.ball.vy, 1.2);
      this.emit('charge_down', nearest.p.team, `Charge-down — ${nearest.p.name}`, nearest.p.id, nearest.p.x, nearest.p.z);
      return false;
    }
    if (this.flightKind === 'pass' && !this.ball.kick) {
      if (this.ball.forward) {
        this.callForward(this.ball.lastPlayerId);
        return true;
      }
      const sign = this.attackSign(nearest.p.team);
      this.ball.vz += sign * 2.4;
      this.ball.vy = 1.1;
      if (this.ball.vz * sign > 0.7) {
        nearest.p.errors += 1;
        this.errors[nearest.p.team] += 1;
        this.callKnockOn(nearest.p);
        return true;
      }
    }
    return false;
  }

  private catchScore(p: Player): number {
    let score = p.attrs.catching * (1 - p.fatigue * 0.22);
    score -= this.weather.rain * 0.1;
    const pressure = this.nearestOpponentDistance(p);
    if (pressure < 1.45) score -= 0.16;
    else if (pressure < 2.5) score -= 0.06;
    if (this.ball.y > 2) score -= 0.1;
    if (p.id === this.ball.intendedId) score += 0.08;
    if (p.team === this.humanTeam && this.difficulty === 'rookie') score += 0.07;
    return score;
  }

  private completeCatch(p: Player): void {
    const wasKick = this.ball.kick !== null && this.flightKind === 'kick';
    const kickTeam = this.ball.kickTeam;
    this.setAction(p, this.ball.y > 1.6 ? 'jump' : 'catch', 0.35);
    this.giveBall(p.id);
    if (wasKick) this.tackleCount = 0;
    else if (kickTeam !== null && kickTeam !== p.team) this.tackleCount = 0;
    if (wasKick && kickTeam === p.team) this.tackleCount = 0;
    this.phase = 'open_play';
    this.phaseTime = 0;
    this.clearOffside();
    this.ball.intendedId = -1;
  }

  private updateLoose(dt: number): void {
    this.integrateBall(dt);
    if (Math.abs(this.ball.x) > FIELD.width) {
      this.onTouch();
      return;
    }
    if (Math.abs(this.ball.z) > FIELD.dead || (Math.abs(this.ball.z) > FIELD.length && this.ball.y <= 0.2 && Math.hypot(this.ball.vx, this.ball.vz) < 2)) {
      this.onDead();
      return;
    }
    let best: Player | null = null;
    let bestD = 1.15;
    for (const p of this.players) {
      if (!p.onField || p.lockPosition) continue;
      const d = Math.hypot(p.x - this.ball.x, p.z - this.ball.z);
      if (d < bestD && this.ball.y < 1.15) {
        best = p;
        bestD = d;
      }
    }
    if (best) {
      const sign = this.attackSign(best.team);
      const hot = Math.hypot(this.ball.vx, this.ball.vz) > 3 && this.ball.vz * sign > 1.4 && this.catchScore(best) < 0.48;
      if (hot && !this.ball.chargeDown) {
        best.errors += 1;
        this.errors[best.team] += 1;
        this.callKnockOn(best);
        return;
      }
      this.giveBall(best.id);
      this.phase = 'open_play';
      this.phaseTime = 0;
      this.setAction(best, 'catch', 0.2);
      return;
    }
    void dt;
    if (this.phaseTime > 4.5) {
      const nearest = this.players.filter((p) => p.onField).sort((a, b) => this.distToBall(a) - this.distToBall(b))[0];
      if (nearest) {
        nearest.x = this.ball.x;
        nearest.z = this.ball.z;
        this.giveBall(nearest.id);
        this.phase = 'open_play';
        this.phaseTime = 0;
      }
    }
    void dt;
  }

  private onTouch(): void {
    const kickTeam = this.ball.kickTeam;
    if (this.flightKind === 'pass' || kickTeam === null) {
      if (this.ball.forward) this.callForward(this.ball.lastPlayerId);
      else this.startScrum((1 - this.possession) as TeamId, clamp(this.ball.z, -30, 30), Math.sign(this.ball.x) * 12);
      return;
    }
    const onFull = !this.ball.inFieldBounce && !this.ball.bounced;
    if (onFull && this.ball.kick !== 'kickoff' && this.ball.kick !== 'dropout' && this.ball.kick !== 'conversion' && this.ball.kick !== 'penalty_goal') {
      this.callPenalty(kickTeam, this.ball.kickX, this.ball.kickZ, 'Kick into touch on the full');
      return;
    }
    if (this.rules.fortyTwenty && this.isFortyTwenty(kickTeam)) {
      const x = this.ball.x > 0 ? 14 : -14;
      this.emit('forty_twenty', kickTeam, 'Forty-twenty', this.ball.lastPlayerId, x, this.ball.z);
      if (this.stopForHooter()) return;
      this.startTap(kickTeam, x, clamp(this.ball.z, -FIELD.length + 2, FIELD.length - 2));
      return;
    }
    this.emit('touch', (1 - kickTeam) as TeamId, 'Into touch', this.ball.lastPlayerId, this.ball.x, this.ball.z);
    if (this.stopForHooter()) return;
    this.startTwenty((1 - kickTeam) as TeamId, this.ball.z);
  }

  private isFortyTwenty(team: TeamId): boolean {
    const sign = this.attackSign(team);
    const ownGoal = -FIELD.length * sign;
    const fromOwn = (this.ball.kickZ - ownGoal) * sign;
    if (fromOwn < 0 || fromOwn > 40) return false;
    const intoOpp20 = (FIELD.length * sign - this.ball.z) * sign <= 20 && (FIELD.length * sign - this.ball.z) * sign >= 0;
    return this.ball.inFieldBounce && intoOpp20;
  }

  private onDead(): void {
    const endSign = this.ball.z >= 0 ? 1 : -1;
    const attacking = this.attackSign(0) === endSign ? 0 : 1;
    const defending = (1 - attacking) as TeamId;
    if (this.ball.kick === 'conversion' || this.ball.kick === 'penalty_goal') {
      if (!this.goalResolved) this.resolveGoal(false);
      return;
    }
    if (this.stopForHooter()) return;
    if (this.ball.kickTeam === attacking) this.startDropout(defending);
    else this.startTwenty(defending, this.ball.z);
  }

  private callForward(passerId: number): void {
    const passer = this.players.find((p) => p.id === passerId);
    const team = passer?.team ?? this.possession;
    if (passer) {
      passer.errors += 1;
      this.errors[team] += 1;
    }
    this.emit('forward_pass', (1 - team) as TeamId, `Forward pass — ${passer?.name ?? 'pass'}`, passerId, this.ball.x, this.ball.z);
    if (this.stopForHooter()) return;
    this.startScrum((1 - team) as TeamId, clamp(this.ball.z, -30, 30), clamp(this.ball.x, -15, 15));
  }

  private callKnockOn(p: Player): void {
    this.emit('knock_on', (1 - p.team) as TeamId, `Knock-on — ${p.name}`, p.id, p.x, p.z);
    if (this.stopForHooter()) return;
    this.startScrum((1 - p.team) as TeamId, clamp(p.z, -30, 30), clamp(p.x, -15, 15));
  }

  private callPenalty(offending: TeamId, x: number, z: number, reason: string): void {
    const team = (1 - offending) as TeamId;
    this.errors[offending] += 1;
    this.penaltyTeam = team;
    this.penaltyX = clamp(x, -24, 24);
    this.penaltyZ = clamp(z, -40, 40);
    this.hooterPenalty = this.hooter;
    this.emit('penalty', team, `Penalty — ${reason}`, -1, x, z);
    this.phase = 'penalty';
    this.phaseTime = 0;
    this.released = false;
    this.clearCarriers();
    this.ball.mode = 'dead';
  }

  private autoPenalty(dt: number): void {
    const human = this.humanTeam === this.penaltyTeam && this.holdPresentation;
    const wait = human ? 8 : 0.2;
    if (this.phaseTime < wait) {
      void dt;
      return;
    }
    this.chooseRestart(this.aiPenaltyChoice());
  }

  private aiPenaltyChoice(): 'tap' | 'touch' | 'goal' {
    const team = this.penaltyTeam;
    const metres = metresToGoal(this, team, this.penaltyZ);
    const kicker = this.bestKicker(team);
    if ((this.hooterPenalty || metres < 38) && Math.abs(this.penaltyX) < 22 && kicker.attrs.kickAccuracy > 0.6) return 'goal';
    if (metres > 28) return 'touch';
    return 'tap';
  }

  private startScrum(feed: TeamId, z: number, x: number): void {
    this.phase = 'scrum';
    this.phaseTime = 0;
    this.scrumFeed = feed;
    this.possession = feed;
    this.pendingHandover = false;
    this.ruck = { x: clamp(x, -18, 18), z: clamp(z, -30, 30), tackledId: -1, tacklerIds: [], dominant: false };
    this.clearCarriers();
    this.ball.x = this.ruck.x;
    this.ball.z = this.ruck.z;
    this.ball.y = 0.3;
    this.ball.mode = 'dead';
    this.emit('scrum', feed, `Scrum — ${this.teams[feed].short} feed`, -1, this.ruck.x, this.ruck.z);
    this.placePack(this.ruck.x, this.ruck.z);
  }

  private updateScrum(): void {
    if (this.phaseTime < 1.05) return;
    const feed = this.scrumFeed;
    const other = (1 - feed) as TeamId;
    const feedHook = this.packPower(feed);
    const defHook = this.packPower(other);
    const winner: TeamId = feedHook + 0.2 >= defHook ? feed : other;
    this.possession = winner;
    this.tackleCount = 0;
    const dh = this.dummyHalf(winner, -1);
    if (dh && this.ruck) {
      const sign = this.attackSign(winner);
      dh.x = this.ruck.x;
      dh.z = this.ruck.z - sign * 2;
      dh.lockPosition = false;
      this.unlockPlaying();
      this.giveBall(dh.id);
    }
    this.phase = 'open_play';
    this.phaseTime = 0;
    this.settleDefence(winner);
    if (this.stopForHooter()) return;
  }

  private packPower(team: TeamId): number {
    const hook = this.players.find((p) => p.onField && p.team === team && p.role === 'hooker');
    const props = this.players.filter((p) => p.onField && p.team === team && p.role === 'prop');
    const base = (hook?.attrs.strength ?? 0.6) + (hook?.attrs.tackling ?? 0.6);
    return base + props.reduce((s, p) => s + p.attrs.strength * 0.25, 0);
  }

  private startTap(team: TeamId, x: number, z: number): void {
    this.phase = 'restart';
    this.restartKind = 'tap';
    this.phaseTime = 0;
    this.possession = team;
    this.tackleCount = 0;
    this.pendingHandover = false;
    this.quickPTB = false;
    const sign = this.attackSign(team);
    const px = clamp(x, -20, 20);
    const pz = clamp(z, -40, 40);
    this.ruck = { x: px, z: pz, tackledId: -1, tacklerIds: [], dominant: false };
    const dh = this.dummyHalf(team, -1) ?? this.bestKicker(team);
    this.kickerId = dh.id;
    this.placeRestartShape(team, px, pz, sign);
    dh.x = px;
    dh.z = pz;
    dh.lockPosition = false;
    this.ball.x = px;
    this.ball.z = pz;
    this.ball.y = 0.25;
    this.ball.mode = 'dead';
    this.clearCarriers();
    this.emit('twenty_metre', team, `${this.teams[team].short} tap`, dh.id, px, pz);
  }

  private startTwenty(team: TeamId, z: number): void {
    const sign = this.attackSign(team);
    const z20 = -30 * sign;
    this.emit('twenty_metre', team, 'Twenty-metre restart', -1, 0, z);
    this.startTap(team, 0, z20);
  }

  private startDropout(team: TeamId): void {
    const sign = this.attackSign(team);
    const z = -FIELD.length * sign;
    this.phase = 'restart';
    this.restartKind = 'dropout';
    this.phaseTime = 0;
    this.possession = team;
    this.tackleCount = 0;
    this.pendingHandover = false;
    const kicker = this.players.find((p) => p.onField && p.team === team && p.role === 'fullback') ?? this.bestKicker(team);
    this.kickerId = kicker.id;
    this.placeRestartShape(team, 0, z, sign);
    kicker.x = 0;
    kicker.z = z + sign * 0.5;
    kicker.lockPosition = false;
    kicker.hasBall = true;
    this.clearCarriers();
    kicker.hasBall = true;
    this.ball.carrierId = kicker.id;
    this.ball.mode = 'held';
    this.ball.x = kicker.x;
    this.ball.z = kicker.z;
    this.ball.y = 0.4;
    this.possession = team;
    this.emit('dropout', team, 'Goal-line drop-out', kicker.id, 0, z);
  }

  private updateRestart(): void {
    if (this.restartKind === 'dropout') {
      if (this.phaseTime > 0.4 && this.ball.mode !== 'flight') {
        const kicker = this.player(this.kickerId);
        if (!kicker.hasBall) kicker.hasBall = true;
        this.ball.carrierId = kicker.id;
        this.releaseKick(kicker, 'dropout', 0.7, (kicker.id % 5 - 2) * 0.05, this.attackSign(kicker.team));
      }
      return;
    }
    const human = this.humanTeam === this.possession && this.holdPresentation;
    if (this.quickPTB || (!human && this.phaseTime > 0.4) || this.phaseTime > 2.2) {
      const p = this.player(this.kickerId);
      p.lockPosition = false;
      this.unlockPlaying();
      this.giveBall(p.id);
      this.settleDefence(p.team);
      this.phase = 'open_play';
      this.phaseTime = 0;
      this.quickPTB = false;
    }
  }

  private startKickoff(team: TeamId): void {
    this.placeKickoff(team);
    this.phase = 'kickoff';
    this.phaseTime = 0;
    this.released = false;
    this.goalMode = null;
    this.goalResolved = false;
    this.pendingHandover = false;
    this.tackleCount = 0;
    this.emit('kickoff', team, `Kick-off — ${this.teams[team].short}`, this.kickerId, 0, 0);
  }

  private releasePass(p: Player, tx: number, tz: number, intended: number, forceForward: boolean): void {
    const launch = passLaunch(p.x, p.z, p.facing, p.attrs.passing, tx, tz);
    this.clearCarriers();
    this.ball.x = launch.x;
    this.ball.z = launch.z;
    this.ball.y = launch.y;
    this.ball.vx = launch.vx;
    this.ball.vz = launch.vz;
    this.ball.vy = launch.vy;
    this.ball.mode = 'flight';
    this.ball.kick = null;
    this.ball.kickTeam = null;
    this.ball.lastPlayerId = p.id;
    this.ball.intendedId = intended;
    this.ball.kickX = p.x;
    this.ball.kickZ = p.z;
    this.ball.bounced = false;
    this.ball.inFieldBounce = false;
    this.ball.chargeDown = false;
    this.ball.forward = forceForward || this.ball.vz * this.attackSign(p.team) > 0.95;
    const offload = this.phase === 'tackle';
    this.flightKind = 'pass';
    this.phase = 'in_flight';
    this.phaseTime = 0;
    this.carryId = -1;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const lateral = dx * Math.cos(p.facing) - dz * Math.sin(p.facing);
    p.throwSide = lateral >= 0 ? 1 : -1;
    this.setAction(p, 'pass', 0.4);
    if (offload) p.offloads += 1;
  }

  private releaseKick(p: Player, kind: KickKind, power: number, dirX: number, dirZ: number): void {
    const sign = this.attackSign(p.team);
    const spec = KICKS[kind];
    const bias = ((p.id * 13 + this.tackleCount * 5 + this.half) % 9) / 8 - 0.5;
    const err = (1 - p.attrs.kickAccuracy) * spec.err * (0.35 + Math.abs(bias)) * (this.weather.rain > 0 ? 1.15 : 1);
    const yawError = err * Math.sign(bias || 0.2);
    // A defender square in front knocks the kick down. Not a knock-on.
    const charger = this.players.find((d) => {
      if (!d.onField || d.team === p.team) return false;
      const ahead = (d.z - p.z) * sign;
      return ahead > 0.2 && ahead < 1.2 && Math.abs(d.x - p.x) < 0.85;
    });
    const launch = kickLaunch(p.x, p.z, kind, power, p.attrs.kickPower, dirX, dirZ, yawError, Boolean(charger), sign);
    this.clearCarriers();
    this.ball.x = launch.x;
    this.ball.z = launch.z;
    this.ball.y = launch.y;
    this.ball.vx = launch.vx;
    this.ball.vz = launch.vz;
    this.ball.vy = launch.vy;
    this.ball.chargeDown = Boolean(charger);
    if (charger) {
      this.emit('charge_down', charger.team, `Charge-down — ${charger.name}`, charger.id, charger.x, charger.z);
    }
    this.ball.mode = 'flight';
    this.ball.kick = charger ? null : kind;
    this.ball.kickTeam = p.team;
    this.ball.kickX = p.x;
    this.ball.kickZ = p.z;
    this.ball.lastPlayerId = p.id;
    this.ball.intendedId = -1;
    this.ball.bounced = false;
    this.ball.inFieldBounce = false;
    this.ball.forward = false;
    this.flightKind = 'kick';
    this.phase = 'in_flight';
    this.phaseTime = 0;
    this.carryId = -1;
    p.kicks += 1;
    this.setAction(p, 'kick', 0.55);
    this.markKickOffside(p);
  }

  private markKickOffside(kicker: Player): void {
    const sign = this.attackSign(kicker.team);
    for (const p of this.players) {
      p.offside = false;
      if (p.team !== kicker.team || p.id === kicker.id || !p.onField) continue;
      p.offside = (p.z - kicker.z) * sign > 1;
    }
  }

  private clearOffside(): void {
    for (const p of this.players) p.offside = false;
  }

  private integrateBall(dt: number): void {
    this.prevBall = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
    const spec = this.ball.kick ? KICKS[this.ball.kick] : undefined;
    this.ball.vx += this.weather.windX * 0.32 * dt;
    this.ball.vz += this.weather.windZ * 0.32 * dt;
    const drag = this.ball.mode === 'rolling' ? 2.1 : 0.16;
    this.ball.vx *= Math.exp(-drag * dt);
    this.ball.vz *= Math.exp(-drag * dt);
    if (this.ball.mode !== 'rolling') this.ball.vy -= 9.81 * dt;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.z += this.ball.vz * dt;
    this.ball.spin += Math.hypot(this.ball.vx, this.ball.vz) * dt;
    if (this.ball.y <= 0.12) {
      this.ball.y = 0.12;
      if (this.ball.vy < 0) {
        if (Math.abs(this.ball.x) < FIELD.width && Math.abs(this.ball.z) < FIELD.length) this.ball.inFieldBounce = true;
        this.ball.bounced = true;
        this.ball.vy = -this.ball.vy * (spec?.rest ?? 0.28);
        this.ball.vx *= 0.75;
        this.ball.vz *= 0.75;
        if (Math.abs(this.ball.vy) < 0.85) {
          this.ball.vy = 0;
          this.ball.mode = 'rolling';
        }
      }
    }
  }

  private checkLineBreak(): void {
    const c = this.carrier();
    if (!c || this.brokeThisCarry || this.lastLineBreak === c.id && this.phaseTime < 0.2) return;
    const sign = this.attackSign(c.team);
    if (Math.hypot(c.vx, c.vz) < 6.4) return;
    const gained = (c.z - this.prevCarrierZ) * sign;
    void gained;
    let ahead = 0;
    for (const d of this.players) {
      if (!d.onField || d.team === c.team) continue;
      const dz = (d.z - c.z) * sign;
      if (dz > 0 && dz < 9 && Math.abs(d.x - c.x) < 4.5) ahead += 1;
    }
    if (ahead === 0 && c.metres > 8) {
      this.brokeThisCarry = true;
      c.lineBreaks += 1;
      this.lastLineBreak = c.id;
      this.emit('line_break', c.team, `Line break — ${c.name}`, c.id, c.x, c.z);
    }
  }

  private updateClock(dt: number): void {
    if (this.clockFrozen()) return;
    this.clock += dt * this.rules.clockScale;
    const limit = this.half >= 3 ? this.rules.extraTimeSeconds : this.rules.halfSeconds;
    if (this.clock >= limit && !this.hooter) {
      this.hooter = true;
      this.emit('hooter', -1, this.half >= 3 ? 'Golden point siren' : 'Siren', -1, this.ball.x, this.ball.z);
    }
    if (this.hooter && this.clock >= limit + 50) this.endPeriod();
  }

  private clockFrozen(): boolean {
    return this.phase === 'try' || this.phase === 'conversion' || this.phase === 'half_time'
      || this.phase === 'full_time' || this.phase === 'penalty' || this.phase === 'prematch';
  }

  private trackPossession(dt: number): void {
    if (this.clockFrozen()) return;
    const tick = dt * this.rules.clockScale;
    this.possessionTime[this.possession] += tick;
    const sign = this.attackSign(this.possession);
    if (this.ball.z * sign > 0) this.territoryTime[this.possession] += tick;
  }

  private stopForHooter(): boolean {
    if (!this.hooter) return false;
    if (this.phase === 'try' || this.phase === 'conversion') return false;
    this.endPeriod();
    return true;
  }

  private endPeriod(): void {
    if (this.phase === 'half_time' || this.phase === 'full_time') return;
    this.hooter = false;
    if (this.half === 1) {
      this.pendingHalf = 2;
      this.phase = 'half_time';
      this.phaseTime = 0;
      this.released = false;
      this.clearCarriers();
      this.ball.mode = 'dead';
      this.emit('half_time', -1, `Half-time ${this.score[0]}–${this.score[1]}`, -1, 0, 0);
      return;
    }
    if (this.half === 2 && this.score[0] === this.score[1] && this.rules.goldenPoint) {
      this.pendingHalf = 3;
      this.phase = 'half_time';
      this.phaseTime = 0;
      this.released = false;
      this.clearCarriers();
      this.emit('extra_time', -1, 'Golden point', -1, 0, 0);
      return;
    }
    this.finish(this.score[0] === this.score[1] ? 'draw' : 'full_time');
  }

  private beginNextHalf(): void {
    this.half = this.pendingHalf;
    this.clock = 0;
    this.hooter = false;
    this.released = false;
    const kicker: TeamId = this.half === 2 ? 0 : ((this.seed % 2) as TeamId);
    this.startKickoff(kicker);
  }

  private finish(reason: string): void {
    if (this.phase === 'full_time') return;
    this.phase = 'full_time';
    this.endReason = reason;
    this.ball.mode = 'dead';
    const lead = this.score[0] === this.score[1]
      ? 'Draw'
      : `${this.teams[this.score[0] > this.score[1] ? 0 : 1].name} win`;
    this.emit('full_time', this.score[0] === this.score[1] ? -1 : (this.score[0] > this.score[1] ? 0 : 1), `${lead} ${this.score[0]}–${this.score[1]}`, -1, 0, 0);
  }

  private autoPresent(delay: number, next: () => void): void {
    if (this.holdPresentation && !this.released && this.phaseTime < delay) return;
    if (this.phaseTime >= (this.holdPresentation ? 0 : delay) || this.released) next();
  }

  private celebrate(dt: number): void {
    void dt;
    const scorer = this.players.find((p) => p.id === this.tryInfo?.playerId);
    if (scorer) scorer.action = 'celebrate';
  }

  private recoverFatigue(dt: number): void {
    for (const p of this.players) {
      if (!p.onField) {
        p.fatigue = Math.max(0, p.fatigue - dt * 0.05 * (0.65 + p.attrs.endurance));
        continue;
      }
      const speed = Math.hypot(p.vx, p.vz);
      const top = maxSpeed(p, this.elapsed);
      const sprinting = speed > top * 0.82 && p.sprint;
      const drain = (sprinting ? 0.018 : 0.0035) * (1.28 - 0.55 * p.attrs.endurance);
      const rec = sprinting ? 0 : 0.007 * p.attrs.endurance;
      p.fatigue = clamp(p.fatigue + (drain - rec) * dt, 0, 1);
    }
  }

  private maybeInterchange(team: TeamId): void {
    if (this.humanTeam === team) return;
    if (this.interchanges[team] >= this.rules.interchangeLimit) return;
    const tired = this.players
      .filter((p) => p.onField && p.team === team && p.fatigue > 0.72 && !p.hasBall && isBig(p))
      .sort((a, b) => b.fatigue - a.fatigue)[0];
    if (!tired) return;
    const fresh = this.players
      .filter((p) => !p.onField && p.team === team && p.fatigue < 0.4)
      .sort((a, b) => a.fatigue - b.fatigue)[0];
    if (fresh) this.interchange(tired.id, fresh.id);
  }

  private safety(): void {
    if (!Number.isFinite(this.ball.x) || !Number.isFinite(this.ball.z)) {
      this.fault('nan_ball');
      this.ball = this.makeBall();
      this.startScrum(this.possession, 0, 0);
    }
    const limit = this.phase === 'open_play' || this.phase === 'loose' ? 18 : 8;
    if (this.phaseTime > limit && this.phase !== 'half_time' && this.phase !== 'full_time' && this.phase !== 'try' && this.phase !== 'conversion' && this.phase !== 'penalty') {
      this.fault(`stall_${this.phase}`);
      this.startScrum(this.possession, clamp(this.ball.z, -20, 20), 0);
    }
  }

  private checkInvariants(): void {
    const on = [0, 0];
    let carriers = 0;
    for (const p of this.players) {
      if (p.onField) on[p.team] += 1;
      if (p.hasBall) carriers += 1;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) this.fault('nan_player');
    }
    if (on[0] !== 13 || on[1] !== 13) this.fault(`players_${on[0]}_${on[1]}`);
    if (carriers > 1) {
      this.fault('multi_carrier');
      let seen = false;
      for (const p of this.players) {
        if (!p.hasBall) continue;
        if (seen) p.hasBall = false;
        seen = true;
      }
    }
    if (this.tackleCount < 0 || this.tackleCount > this.rules.tacklesPerSet) this.fault(`tackle_${this.tackleCount}`);
    if (this.score[0] < 0 || this.score[1] < 0) this.fault('negative_score');
  }

  private recordHistory(dt: number): void {
    this.histAcc += dt;
    if (this.histAcc < 0.1) return;
    this.histAcc = 0;
    this.history.push({
      t: this.elapsed,
      ball: { x: this.ball.x, y: this.ball.y, z: this.ball.z },
      players: this.players.map((p) => ({
        x: p.x, z: p.z, facing: p.facing, action: p.action, hasBall: p.hasBall,
      })),
    });
    if (this.history.length > 80) this.history.shift();
  }

  private spawnPlayers(): void {
    for (const team of [0, 1] as TeamId[]) {
      const club = this.teams[team];
      const primary = team === 0 ? club.home : this.clash(club) ? club.away : club.home;
      const secondary = team === 0 ? club.accent : club.accent;
      club.squad.forEach((template, squadIndex) => {
        this.players.push(this.makePlayer(team, squadIndex, template, primary, secondary));
      });
    }
  }

  private clash(away: Team): boolean {
    return hexDist(this.teams[0].home, away.home) < 80;
  }

  private makePlayer(team: TeamId, squadIndex: number, template: PlayerTemplate, primary: string, secondary: string): Player {
    const bench = squadIndex >= 13;
    return {
      id: team * 20 + squadIndex,
      team,
      squadIndex,
      name: template.name,
      number: template.number,
      role: template.role,
      side: template.side,
      attrs: { ...template.attrs },
      look: { ...template.look },
      star: template.star,
      primary,
      secondary,
      onField: !bench,
      x: team === 0 ? -36 : 36,
      z: bench ? -6 + (squadIndex - 13) * 2.4 : 0,
      vx: 0,
      vz: 0,
      facing: team === 0 ? 0 : Math.PI,
      fatigue: 0,
      hasBall: false,
      action: 'idle',
      actionUntil: 0,
      targetX: 0,
      targetZ: 0,
      sprint: false,
      engage: false,
      lockPosition: false,
      travel: 0,
      intent: 'hold',
      decision: null,
      appliedSerial: 0,
      decisionAt: 0,
      stumbleUntil: 0,
      burstUntil: 0,
      offside: false,
      marker: false,
      groundTimer: 0,
      metres: 0,
      carries: 0,
      tackles: 0,
      tackleBreaks: 0,
      misses: 0,
      tries: 0,
      goals: 0,
      fieldGoals: 0,
      kicks: 0,
      errors: 0,
      offloads: 0,
      lineBreaks: 0,
      throwSide: 1,
    };
  }

  private placeKickoff(kicking: TeamId): void {
    const sign = this.attackSign(kicking);
    this.clearCarriers();
    this.unlockPlaying();
    for (const p of this.players) {
      if (!p.onField) {
        this.parkBench(p);
        continue;
      }
      const lat = (p.squadIndex - 6) * 4.2;
      if (p.team === kicking) {
        p.x = clamp(lat * 0.7, -28, 28);
        p.z = -sign * (2 + (p.squadIndex % 5) * 1.3);
      } else {
        p.x = clamp(lat, -30, 30);
        const depth = p.role === 'fullback' ? 26 : 12 + (p.squadIndex % 4);
        p.z = sign * depth;
      }
      p.vx = 0;
      p.vz = 0;
      p.facing = Math.atan2(0, sign);
      p.targetX = p.x;
      p.targetZ = p.z;
      p.offside = false;
      p.marker = false;
    }
    const kicker = this.players.find((p) => p.onField && p.team === kicking && (p.role === 'halfback' || p.role === 'fullback'))
      ?? this.players.find((p) => p.onField && p.team === kicking)!;
    kicker.x = 0;
    kicker.z = -sign * 1.2;
    this.kickerId = kicker.id;
    this.ball = this.makeBall();
    this.ball.x = 0;
    this.ball.z = 0;
    this.ball.y = 0.35;
    this.possession = kicking;
  }

  private placeRestartShape(team: TeamId, x: number, z: number, sign: number): void {
    this.unlockPlaying();
    for (const p of this.players) {
      if (!p.onField) continue;
      const lat = (p.squadIndex - 6) * 3.4;
      if (p.team === team) {
        p.x = clamp(x + lat * 0.45, -30, 30);
        p.z = z - sign * (1.5 + (p.squadIndex % 4));
      } else {
        p.x = clamp(lat, -30, 30);
        p.z = z + sign * (11 + (p.role === 'fullback' ? 8 : 0));
      }
      p.vx = 0;
      p.vz = 0;
      p.offside = false;
    }
  }

  private placePack(x: number, z: number): void {
    for (const team of [0, 1] as TeamId[]) {
      const forwards = this.players.filter((p) => p.onField && p.team === team && isBig(p)).slice(0, 3);
      forwards.forEach((p, i) => {
        const sign = this.attackSign(this.scrumFeed);
        const side = team === this.scrumFeed ? -1 : 1;
        p.x = x + (i - 1) * 0.7;
        p.z = z + side * sign * 0.8;
        p.lockPosition = true;
      });
    }
  }

  private unlockPlaying(): void {
    for (const p of this.players) if (p.onField) p.lockPosition = false;
  }

  private parkBench(p: Player): void {
    p.onField = false;
    p.hasBall = false;
    p.x = p.team === 0 ? -37.2 : 37.2;
    p.z = -8 + (p.squadIndex - 13) * 2.3;
    p.vx = 0;
    p.vz = 0;
  }

  private bestKicker(team: TeamId): Player {
    const pool = this.players.filter((p) => p.onField && p.team === team);
    return pool.sort((a, b) => b.attrs.kickAccuracy + b.attrs.kickPower * 0.3 - (a.attrs.kickAccuracy + a.attrs.kickPower * 0.3))[0];
  }

  private nearestOpponentDistance(p: Player): number {
    let best = 99;
    for (const d of this.players) {
      if (!d.onField || d.team === p.team) continue;
      best = Math.min(best, Math.hypot(d.x - p.x, d.z - p.z));
    }
    return best;
  }

  private segmentDistance(px: number, pz: number): number {
    const ax = this.prevBall.x;
    const az = this.prevBall.z;
    const bx = this.ball.x;
    const bz = this.ball.z;
    const abx = bx - ax;
    const abz = bz - az;
    const ab2 = abx * abx + abz * abz;
    const t = ab2 < 0.0001 ? 0 : clamp(((px - ax) * abx + (pz - az) * abz) / ab2, 0, 1);
    return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
  }

  private clearCarriers(): void {
    for (const p of this.players) p.hasBall = false;
    this.ball.carrierId = -1;
  }

  private setAction(p: Player, action: Action, lock: number): void {
    p.action = action;
    p.actionUntil = this.elapsed + lock;
  }

  private maybeArmMega(): void {
    if (this.elapsed < this.megaCooldownUntil) return;
    if (this.possession === this.humanTeam) return;
    if (Math.random() > 0.22) return;
    this.megaArmed = true;
    this.megaArmedUntil = this.elapsed + 2.8;
  }

  private tryMegaTackle(defender: Player): void {
    if (!this.megaArmed || this.elapsed > this.megaArmedUntil) return;
    if (this.humanTeam === null || defender.team !== this.humanTeam) return;
    if (this.phase !== 'open_play' && this.phase !== 'tackle') return;
    const c = this.carrier();
    if (!c || c.team === defender.team) return;
    const dxy = Math.hypot(defender.x - c.x, defender.z - c.z);
    if (dxy > 2.4) return;
    this.megaArmed = false;
    this.megaCooldownUntil = this.elapsed + 28;
    const illegal = Math.random() < 0.62;
    const spotted = illegal && Math.random() < 0.48;
    defender.engage = true;
    defender.x = c.x + (Math.random() - 0.5) * 0.2;
    defender.z = c.z + (Math.random() - 0.5) * 0.2;
    this.setAction(defender, 'mega_hit', 0.7);
    this.setAction(c, 'injured', 1.2);
    c.stumbleUntil = this.elapsed + 1.4;
    c.fatigue = Math.min(1, c.fatigue + 0.12);
    this.lastImpact = { x: c.x, z: c.z, power: 1.35, bloody: true, t: this.elapsed };
    this.timeScale = 0.18;
    this.timeScaleUntil = this.elapsed + 1.35;
    this.captureSlowMoReplay();
    if (illegal) {
      this.emit('illegal_tackle', defender.team, spotted
        ? `Illegal mega hit — spotted on ${c.name}`
        : `Mega break-neck hit — play on, ref missed it`, defender.id, c.x, c.z);
      if (spotted) {
        this.callPenalty(defender.team, c.x, c.z, 'Dangerous contact');
        return;
      }
    } else {
      this.emit('mega_tackle', defender.team, `Mega smash on ${c.name}`, defender.id, c.x, c.z);
    }
    this.phase = 'tackle';
    this.phaseTime = 0;
    this.ruck = {
      x: c.x,
      z: c.z,
      tackledId: c.id,
      tacklerIds: [defender.id],
      dominant: true,
    };
  }

  private maybeSparkFight(carrier: Player, tackler: Player | undefined): void {
    if (!tackler || this.fightOpen) return;
    if (this.elapsed < this.nextFightRoll) return;
    this.nextFightRoll = this.elapsed + 14 + Math.random() * 22;
    if (Math.random() > 0.16) return;
    this.fightOpen = true;
    this.fightKind = Math.random() < 0.28 ? 'brawl' : 'duel';
    this.fightUntil = this.elapsed + 12;
    this.emit('fight', -1, this.fightKind === 'brawl' ? 'All-in brawl brewing' : `Temper flare — ${tackler.name} and ${carrier.name}`, tackler.id, carrier.x, carrier.z);
    this.holdPresentation = true;
    this.released = false;
  }

  private resolveFight(choice: 'punch' | 'kick' | 'wrestle' | 'brawl' | 'back_down'): void {
    if (!this.fightOpen) return;
    this.fightOpen = false;
    this.released = true;
    const c = this.carrier() ?? this.players.find((p) => p.id === this.ruck?.tackledId);
    const t = this.players.find((p) => this.ruck?.tacklerIds.includes(p.id)) ?? this.players.find((p) => p.onField && p.team !== c?.team);
    if (!c || !t) return;
    if (choice === 'back_down') {
      this.emit('fight', -1, 'Players separate — play on', -1, c.x, c.z);
      return;
    }
    const brawl = choice === 'brawl' || this.fightKind === 'brawl';
    const cast = brawl
      ? this.players.filter((p) => p.onField).slice(0, 18)
      : [c, t];
    for (const p of cast) {
      const act: Action = choice === 'kick' ? 'kick_fight' : choice === 'wrestle' ? 'wrestle' : 'punch';
      this.setAction(p, act, 1.4 + Math.random() * 0.6);
      p.fatigue = Math.min(1, p.fatigue + 0.04);
      p.stumbleUntil = this.elapsed + 0.9;
    }
    this.lastImpact = { x: c.x, z: c.z, power: brawl ? 1.5 : 0.9, bloody: true, t: this.elapsed };
    this.timeScale = 0.22;
    this.timeScaleUntil = this.elapsed + 1.6;
    this.emit(brawl ? 'brawl' : 'fight', -1, brawl ? 'All-in brawl — everyone in' : `${choice} — scrap on the fringe`, t.id, c.x, c.z);
    if (Math.random() < 0.55) {
      const offender = Math.random() < 0.5 ? t.team : c.team;
      this.callPenalty(offender, c.x, c.z, 'Fighting');
    }
  }

  private captureSlowMoReplay(): void {
    if (this.history.length < 8) return;
    this.replay = this.history.slice(-36);
    this.emit('slow_mo', -1, 'Slow-mo impact', -1, this.ball.x, this.ball.z);
  }

  tickPresentation(dt: number): number {
    if (this.megaArmed && this.elapsed > this.megaArmedUntil) this.megaArmed = false;
    if (this.fightOpen && this.elapsed > this.fightUntil) {
      this.fightOpen = false;
      this.released = true;
    }
    if (this.elapsed > this.timeScaleUntil) this.timeScale = 1;
    return dt * this.timeScale;
  }

  private emit(type: EventType, team: TeamId | -1, text: string, playerId = -1, x = 0, z = 0): void {
    this.events.push({
      id: this.eventId++,
      type,
      team,
      playerId,
      clock: this.clock,
      half: this.half,
      text,
      x,
      z,
    });
  }

  private fault(code: string): void {
    if (!this.faults.includes(code)) this.faults.push(code);
  }

  private makeBall(): Ball {
    return {
      x: 0, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0,
      mode: 'dead', carrierId: -1, lastPlayerId: -1, kick: null, kickTeam: null,
      kickX: 0, kickZ: 0, bounced: false, inFieldBounce: false, forward: false,
      chargeDown: false, spin: 0, intendedId: -1,
    };
  }
}

function isBig(p: Player): boolean {
  return p.role === 'prop' || p.role === 'lock' || p.role === 'second_row' || p.role === 'hooker';
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function turnToward(current: number, target: number, maxStep: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + clamp(d, -maxStep, maxStep);
}

function hexDist(a: string, b: string): number {
  const pa = hex(a);
  const pb = hex(b);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

function hex(h: string): [number, number, number] {
  const n = h.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

export function emptyInput(): HumanInput {
  return {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    pass: false,
    passDirX: 0,
    passDirZ: 0,
    assistedPass: true,
    passTarget: -1,
    kick: null,
    tackle: false,
    dive: false,
    offload: false,
    switchPlayer: false,
    quickPlay: false,
    megaTackle: false,
    fightChoice: null,
    restartChoice: null,
    goalError: null,
    release: false,
  };
}

export function ratingOf(p: { tries: number; goals: number; fieldGoals: number; metres: number; tackles: number; tackleBreaks: number; offloads: number; lineBreaks: number; errors: number }): number {
  return 6 + p.tries * 1.25 + p.goals * 0.35 + p.fieldGoals * 0.8 + p.metres / 90 + p.tackles / 14 + p.tackleBreaks * 0.35 + p.offloads * 0.2 + p.lineBreaks * 0.3 - p.errors * 0.85;
}
