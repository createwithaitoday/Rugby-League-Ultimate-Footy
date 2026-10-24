import { createTeams, roleLabel, stadiumById, type StadiumInfo } from '../data/teams';
import { Pitch2D } from '../render/pitch2d';
import { mountScene } from '../render/scene';
import type { CameraMode, FieldView } from '../render/view';
import { kickPreview, passPreview } from '../sim/aim';
import { legalReceivers, metresToGoal } from '../sim/ai';
import { Match, ratingOf } from '../sim/match';
import { buildFinals, buildFixtures, buildGrandFinal, recordResult, regularComplete, standings } from '../sim/season';
import type { Difficulty, HumanInput, KickKind, MatchEvent, Role, Tactic, Team, TeamId, Weather } from '../sim/types';
import { defaultTactic } from '../sim/types';
import { bannerForScreen, setMenuBanner } from './ads';
import { MatchAudio } from './audio';
import { ControlState } from './input';
import {
  achievementCatalog,
  loadSave,
  storeSave,
  unlockAchievements,
  type CareerState,
  type SaveData,
  type SeasonState,
} from './save';

type Screen = 'menu' | 'setup' | 'howto' | 'settings' | 'privacy' | 'season' | 'career' | 'training' | 'results' | 'match';
type DrillId = 'pass' | 'tackle' | 'goal' | 'last';

interface Drill {
  id: DrillId;
  catches: number;
  startTackles: number;
  goals: number;
  attempts: number;
  spots: number[];
  spot: number;
  time: number;
  done: boolean;
  success: boolean;
  text: string;
  lastCarrier: number;
}

interface SimJob {
  fixtureId: string;
  match: Match;
  steps: number;
}

const ROLES: Role[] = ['fullback', 'wing', 'centre', 'five_eighth', 'halfback', 'prop', 'hooker', 'second_row', 'lock'];
const KICKS: { id: KickKind; label: string }[] = [
  { id: 'punt', label: 'Punt' },
  { id: 'grubber', label: 'Grubber' },
  { id: 'bomb', label: 'Bomb' },
  { id: 'chip', label: 'Chip' },
  { id: 'touch_finder', label: 'Touch' },
  { id: 'field_goal', label: 'Field goal' },
];

const WEATHERS: Record<string, Weather> = {
  clear: { rain: 0, windX: 0, windZ: 0 },
  rain: { rain: 0.7, windX: 0.5, windZ: -0.2 },
  wind: { rain: 0, windX: 2.4, windZ: 0.8 },
};

export class Game {
  private readonly teams = createTeams();
  private save: SaveData;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: FieldView | null;
  private readonly audio = new MatchAudio();
  private readonly controls = new ControlState();
  private match: Match | null = null;
  private screen: Screen = 'menu';
  private drill: Drill | null = null;
  private fixtureId: string | null = null;
  private job: SimJob | null = null;
  private eventCursor = 0;
  private holdingReplay = false;
  private resultsShown = false;
  private paused = false;
  private kickOpen = false;
  private aimingField = false;
  private receiverLock = -1;
  private armedKick: KickKind = 'punt';
  private actionKey = '';
  private toastUntil = 0;
  private meterPhase = 0;
  private last = performance.now();
  private frames = 0;
  private fpsAcc = 0;
  private fps = 0;
  private prevPhase = '';
  private hidden = false;

  constructor() {
    this.save = loadSave();
    const view = createView(must('view'));
    this.canvas = view.canvas;
    this.scene = view.view;
    document.body.dataset.pitch = view.flat ? 'flat' : view.view ? '3d' : 'none';
    if (view.flat && view.view) {
      const note = must('gfx-note');
      note.hidden = false;
      note.textContent = 'The 3D stadium cannot be shown in this browser. The match is on a flat pitch, with the same teams, laws, and controls.';
    }
    if (!this.scene) {
      const boot = must('boot');
      boot.hidden = false;
      boot.textContent = 'This browser cannot draw the pitch. The match engine can still be tested from the command line.';
    }
    this.controls.attach(must('stick'), must('knob'));
    this.bindUi();
    this.applySettings();
    this.openMenu();
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (this.hidden && this.screen === 'match' && !this.resultsShown) {
        this.paused = true;
        must('pause').hidden = false;
        this.renderPause();
      }
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => this.onKey(event));
    document.body.addEventListener('pointerdown', () => void this.audio.resume());
    this.resize();
    requestAnimationFrame((now) => this.frame(now));
  }

  private bindUi(): void {
    document.body.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
      if (!target) return;
      this.audio.click();
      this.go(target.dataset.go as Screen);
    });
    document.body.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-drill]') as HTMLElement | null;
      if (!target?.dataset.drill) return;
      this.audio.click();
      this.startDrill(target.dataset.drill as DrillId);
    });
    must('setup-start').addEventListener('click', () => this.startQuick());
    must('btn-pause').addEventListener('click', () => this.togglePause(true));
    must('pause-resume').addEventListener('click', () => this.togglePause(false));
    must('pause-camera').addEventListener('click', () => this.cycleCamera());
    must('pause-quit').addEventListener('click', () => this.quitMatch());
    must('meter-kick').addEventListener('click', () => this.strike());
    must('meter-cancel').addEventListener('click', () => {
      this.aimingField = false;
      must('meter').hidden = true;
    });
    const actions = must('actions');
    actions.addEventListener('pointerdown', (event) => this.onAction(event, true));
    actions.addEventListener('pointerup', (event) => this.onAction(event, false));
    actions.addEventListener('pointercancel', (event) => this.onAction(event, false));
    const wheel = must('kick-wheel');
    const armKick = (event: Event) => {
      const button = (event.target as HTMLElement).closest('button');
      const kind = button?.dataset.kick as KickKind | undefined;
      if (kind) this.armedKick = kind;
    };
    wheel.addEventListener('pointerover', armKick);
    wheel.addEventListener('pointerdown', armKick);
    wheel.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      const kind = button?.dataset.kick as KickKind | undefined;
      if (!kind) return;
      this.armedKick = kind;
      if (kind === 'field_goal') this.aimingField = true;
      else this.controls.kick = kind;
      this.kickOpen = false;
      this.actionKey = '';
      must('kick-wheel').hidden = true;
    });
    must('choice-buttons').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button');
      const act = button?.dataset.act;
      if (!act) return;
      if (act === 'tap' || act === 'touch' || act === 'goal') this.controls.restart = act;
      else if (act === 'continue' || act === 'skip') this.controls.release = true;
      else if (act === 'drill-done') this.finishDrill();
      else if (act === 'quick') this.controls.quick = true;
    });
    this.bindSettings();
    this.fillTeamSelects();
  }

  private bindSettings(): void {
    const set = this.save.settings;
    const difficulty = must<HTMLSelectElement>('set-difficulty');
    const half = must<HTMLSelectElement>('set-half');
    const clock = must<HTMLSelectElement>('set-clock');
    const quality = must<HTMLSelectElement>('set-quality');
    const camera = must<HTMLSelectElement>('set-camera');
    difficulty.value = set.difficulty;
    half.value = String(set.halfMinutes);
    clock.value = String(set.clockScale);
    quality.value = set.quality;
    camera.value = set.camera;
    must<HTMLInputElement>('set-music').value = String(Math.round(set.music * 100));
    must<HTMLInputElement>('set-effects').value = String(Math.round(set.effects * 100));
    must<HTMLInputElement>('set-crowd').value = String(Math.round(set.crowd * 100));
    must<HTMLInputElement>('set-left').checked = set.leftHanded;
    must<HTMLInputElement>('set-assist').checked = set.assistedPass;
    must<HTMLInputElement>('set-ten').checked = set.showTen;
    must<HTMLInputElement>('set-shake').checked = set.shake;
    must<HTMLInputElement>('set-large').checked = set.largeHud;
    must<HTMLInputElement>('set-fps').checked = set.showFps;
    must<HTMLInputElement>('set-cb').checked = set.colorblind;
    const read = () => {
      set.difficulty = difficulty.value as Difficulty;
      set.halfMinutes = Number(half.value);
      set.clockScale = Number(clock.value);
      set.quality = quality.value as SaveData['settings']['quality'];
      set.camera = camera.value as SaveData['settings']['camera'];
      set.music = Number(must<HTMLInputElement>('set-music').value) / 100;
      set.effects = Number(must<HTMLInputElement>('set-effects').value) / 100;
      set.crowd = Number(must<HTMLInputElement>('set-crowd').value) / 100;
      set.leftHanded = must<HTMLInputElement>('set-left').checked;
      set.assistedPass = must<HTMLInputElement>('set-assist').checked;
      set.showTen = must<HTMLInputElement>('set-ten').checked;
      set.shake = must<HTMLInputElement>('set-shake').checked;
      set.largeHud = must<HTMLInputElement>('set-large').checked;
      set.showFps = must<HTMLInputElement>('set-fps').checked;
      set.colorblind = must<HTMLInputElement>('set-cb').checked;
      this.applySettings();
      storeSave(this.save);
    };
    for (const id of ['set-difficulty', 'set-half', 'set-clock', 'set-quality', 'set-camera', 'set-music', 'set-effects', 'set-crowd', 'set-left', 'set-assist', 'set-ten', 'set-shake', 'set-large', 'set-fps', 'set-cb']) {
      must(id).addEventListener('change', read);
      must(id).addEventListener('input', read);
    }
  }

  private applySettings(): void {
    const set = this.save.settings;
    document.body.classList.toggle('left-handed', set.leftHanded);
    document.body.classList.toggle('large-hud', set.largeHud);
    document.body.classList.toggle('contrast', set.colorblind);
    this.audio.setVolumes(set.effects, set.crowd, set.music);
    this.scene?.setQuality(set.quality);
    if (this.match) this.scene?.setStadium(this.stadium(), set.quality);
  }

  private fillTeamSelects(): void {
    const home = must<HTMLSelectElement>('setup-home');
    const away = must<HTMLSelectElement>('setup-away');
    const options = this.teams.map((team) => `<option value="${team.id}">${escapeHtml(team.city)} ${escapeHtml(team.name)}</option>`).join('');
    home.innerHTML = options;
    away.innerHTML = options;
    away.selectedIndex = 1;
    const note = () => {
      const team = this.team(home.value);
      const stadium = stadiumById(team.stadiumId);
      must('setup-stadium').textContent = `${stadium.name}, ${stadium.city}. Listed capacity ${stadium.capacity}. Night kick-off: ${stadium.night ? 'yes' : 'no'}.`;
    };
    home.addEventListener('change', note);
    note();
  }

  private go(screen: Screen): void {
    if (screen === 'menu') this.openMenu();
    else if (screen === 'setup') this.show('setup');
    else if (screen === 'howto') this.show('howto');
    else if (screen === 'settings') this.show('settings');
    else if (screen === 'privacy') this.show('privacy');
    else if (screen === 'season') this.openSeason();
    else if (screen === 'career') this.openCareer();
    else if (screen === 'training') this.show('training');
    else if (screen === 'results') this.show('results');
  }

  private show(screen: Screen): void {
    this.screen = screen;
    this.paused = false;
    for (const id of ['screen-menu', 'screen-setup', 'screen-howto', 'screen-settings', 'screen-privacy', 'screen-season', 'screen-career', 'screen-training', 'screen-results']) {
      must(id).hidden = id !== `screen-${screen}`;
    }
    const playing = screen === 'match';
    must('hud').hidden = !playing;
    must('ui').hidden = playing;
    must('pause').hidden = true;
    document.body.classList.toggle('playing', playing);
    this.audio.setMenuMusic(!playing);
    setMenuBanner(bannerForScreen(screen));
  }

  private openMenu(): void {
    const home = this.teams[0];
    const away = this.teams[1];
    this.match = new Match({ home, away, humanTeam: null, seed: 1, stadiumId: home.stadiumId });
    this.match.lineup();
    this.drill = null;
    this.fixtureId = null;
    this.resultsShown = false;
    this.present(home.stadiumId);
    this.show('menu');
  }

  private startQuick(): void {
    const home = this.team(must<HTMLSelectElement>('setup-home').value);
    let away = this.team(must<HTMLSelectElement>('setup-away').value);
    if (away.id === home.id) away = this.teams.find((team) => team.id !== home.id) ?? away;
    const weather = WEATHERS[must<HTMLSelectElement>('setup-weather').value] ?? WEATHERS.clear;
    this.beginMatch(this.overlay(home), this.overlay(away), weather, null);
  }

  private beginMatch(home: Team, away: Team, weather: Weather, fixtureId: string | null): void {
    const set = this.save.settings;
    const human = this.humanSide(home, away);
    this.match = new Match({
      home,
      away,
      humanTeam: human,
      difficulty: set.difficulty,
      weather,
      stadiumId: home.stadiumId,
      halfSeconds: set.halfMinutes * 60,
      clockScale: set.clockScale,
      seed: Math.floor(Math.random() * 100000) + 1,
      tactics: [defaultTactic(), defaultTactic()],
    });
    this.match.start();
    this.fixtureId = fixtureId;
    this.drill = null;
    this.eventCursor = 0;
    this.holdingReplay = false;
    this.resultsShown = false;
    this.kickOpen = false;
    this.actionKey = '';
    this.prevPhase = '';
    this.resultsShown = false;
    this.present(home.stadiumId);
    this.show('match');
  }

  private startDrill(id: DrillId): void {
    const home = this.teams[0];
    const away = this.teams[4];
    const human: TeamId = id === 'tackle' ? 1 : 0;
    this.match = new Match({
      home,
      away,
      humanTeam: human,
      difficulty: 'rookie',
      halfSeconds: 20 * 60,
      clockScale: 1,
      seed: 5,
      stadiumId: home.stadiumId,
    });
    if (id === 'pass') this.match.scenario(0, 6, 0, 0, 1);
    else if (id === 'tackle') this.match.scenario(0, 2, 0, -8, 0);
    else if (id === 'goal') this.match.scenario(0, 6, 0, 30, 2);
    else this.match.scenario(0, 6, 0, -18, 5);
    this.match.passiveDefence = id !== 'tackle' && id !== 'last';
    this.match.aiEnabled = id !== 'goal';
    if (id === 'pass') {
      for (const player of this.match.players) {
        if (player.team === 0 && (player.role === 'centre' || player.role === 'wing' || player.role === 'five_eighth' || player.role === 'fullback')) {
          player.lockPosition = false;
        }
      }
    }
    if (id === 'tackle') {
      for (const player of this.match.players) if (player.team === 1) player.lockPosition = true;
      const defender = this.match.players.find((player) => player.team === 1 && player.onField && player.role === 'centre');
      const carrier = this.match.carrier();
      if (defender) {
        defender.lockPosition = false;
        this.match.controlledId = defender.id;
      }
      if (carrier) carrier.lockPosition = false;
    }
    if (id === 'last') {
      for (const player of this.match.players) if (player.onField) player.lockPosition = false;
    }
    const defender = this.match.players.find((player) => player.team === 1 && player.id === this.match?.controlledId);
    this.drill = {
      id,
      catches: 0,
      startTackles: defender?.tackles ?? 0,
      goals: 0,
      attempts: 0,
      spots: [0, 14, -18, 8],
      spot: 0,
      time: 0,
      done: false,
      success: false,
      text: drillText(id),
      lastCarrier: this.match.carrier()?.id ?? -1,
    };
    this.fixtureId = null;
    this.eventCursor = this.match.events.length;
    this.resultsShown = false;
    this.holdingReplay = false;
    this.resultsShown = false;
    this.present(home.stadiumId);
    this.show('match');
  }

  private finishDrill(): void {
    this.drill = null;
    this.show('training');
  }

  private openSeason(): void {
    if (!this.save.season) {
      const ids = this.teams.map((team) => team.id);
      this.save.season = {
        year: this.save.career?.seasonYear ?? 2026,
        teamIds: ids,
        userTeamId: this.save.career?.teamId ?? ids[0],
        fixtures: buildFixtures(ids),
      };
      storeSave(this.save);
    }
    this.show('season');
    this.renderSeason();
  }

  private renderSeason(): void {
    const season = this.save.season;
    const body = must('season-body');
    if (!season) {
      body.textContent = '';
      return;
    }
    this.advanceSeason(season);
    const table = standings(season.teamIds, season.fixtures);
    const rows = table.map((row, index) => {
      const team = this.team(row.id);
      const you = row.id === season.userTeamId ? ' ●' : '';
      return `<tr><td>${index + 1}</td><td>${escapeHtml(team.short)}${you}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.diff}</td><td>${row.points}</td></tr>`;
    }).join('');
    const fixtures = season.fixtures.map((fixture) => {
      const home = this.team(fixture.home);
      const away = this.team(fixture.away);
      const score = fixture.score ? `${fixture.score[0]}–${fixture.score[1]}` : 'vs';
      const yours = fixture.home === season.userTeamId || fixture.away === season.userTeamId;
      let buttons = '';
      if (!fixture.score) {
        if (yours) buttons += `<button type="button" data-play="${fixture.id}">Play</button>`;
        buttons += `<button type="button" class="ghost" data-sim="${fixture.id}">Simulate</button>`;
      }
      return `<div class="fixture"><span>R${fixture.round} ${escapeHtml(home.short)} ${score} ${escapeHtml(away.short)} <em>${fixture.stage}</em></span><span>${buttons}</span></div>`;
    }).join('');
    const final = season.fixtures.find((fixture) => fixture.stage === 'final' && fixture.score);
    const champ = final?.score
      ? `<p>Premiers: ${escapeHtml(this.team(final.score[0] >= final.score[1] ? final.home : final.away).name)}.</p>`
      : '';
    body.innerHTML = `<table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>${champ}<div>${fixtures}</div><p class="note">Two points for a win, one for a draw. Top four play 1v4 and 2v3, then a final. Simulate uses the same match engine without a human player.</p>`;
    body.querySelectorAll('[data-play]').forEach((button) => {
      button.addEventListener('click', () => this.playFixture((button as HTMLElement).dataset.play ?? ''));
    });
    body.querySelectorAll('[data-sim]').forEach((button) => {
      button.addEventListener('click', () => this.simulateFixture((button as HTMLElement).dataset.sim ?? ''));
    });
    storeSave(this.save);
  }

  private advanceSeason(season: SeasonState): void {
    const regular = season.fixtures.filter((fixture) => fixture.stage === 'regular');
    if (regularComplete(regular) && !season.fixtures.some((fixture) => fixture.stage === 'semi')) {
      season.fixtures.push(...buildFinals(standings(season.teamIds, season.fixtures)));
    }
    const semis = season.fixtures.filter((fixture) => fixture.stage === 'semi');
    if (semis.length >= 2 && semis.every((fixture) => fixture.score) && !season.fixtures.some((fixture) => fixture.stage === 'final')) {
      const final = buildGrandFinal(semis);
      if (final) season.fixtures.push(final);
    }
  }

  private playFixture(id: string): void {
    const season = this.save.season;
    const fixture = season?.fixtures.find((item) => item.id === id);
    if (!season || !fixture || fixture.score || this.job) return;
    const home = this.overlay(this.team(fixture.home));
    const away = this.overlay(this.team(fixture.away));
    this.beginMatch(home, away, WEATHERS.clear, fixture.id);
  }

  private simulateFixture(id: string): void {
    const season = this.save.season;
    const fixture = season?.fixtures.find((item) => item.id === id);
    if (!season || !fixture || fixture.score || this.job) return;
    this.job = {
      fixtureId: fixture.id,
      steps: 0,
      match: new Match({
        home: this.overlay(this.team(fixture.home)),
        away: this.overlay(this.team(fixture.away)),
        humanTeam: null,
        difficulty: this.save.settings.difficulty,
        halfSeconds: 40 * 60,
        clockScale: 30,
        seed: hashString(fixture.id + String(season.year)),
      }),
    };
    this.job.match.start();
    must('season-status').textContent = `Simulating ${this.team(fixture.home).short} v ${this.team(fixture.away).short}…`;
  }

  private openCareer(): void {
    this.show('career');
    const body = must('career-body');
    const career = this.save.career;
    if (!career) {
      const options = this.teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join('');
      const roles = ROLES.map((role) => `<option value="${role}">${roleLabel(role)}</option>`).join('');
      body.innerHTML = `<label>Name<input id="career-name" type="text" maxlength="32" value="Ari Keene" /></label>
        <label>Position<select id="career-role">${roles}</select></label>
        <label>Club<select id="career-team">${options}</select></label>
        <button type="button" id="career-create">Start career</button>
        <p class="note">Attributes begin from that position’s squad template and move a small amount after matches. There are no purchases.</p>`;
      must('career-create').addEventListener('click', () => {
        const role = must<HTMLSelectElement>('career-role').value as Role;
        const team = this.team(must<HTMLSelectElement>('career-team').value);
        const slot = team.squad.find((player) => player.role === role && player.number <= 13) ?? team.squad[6];
        const created: CareerState = {
          playerName: must<HTMLInputElement>('career-name').value.trim().slice(0, 32) || 'Ari Keene',
          role,
          teamId: team.id,
          attrs: { ...slot.attrs },
          age: 21,
          matches: 0,
          tries: 0,
          goals: 0,
          tackles: 0,
          metres: 0,
          seasonYear: 2026,
        };
        this.save.career = created;
        if (this.save.season) this.save.season.userTeamId = team.id;
        storeSave(this.save);
        this.openCareer();
      });
      return;
    }
    const team = this.teams.find((item) => item.id === career.teamId);
    const attrs = Object.entries(career.attrs).map(([key, value]) => `<li>${key} ${Math.round(value * 99)}</li>`).join('');
    const unlocked = new Set(this.save.achievements);
    const badges = achievementCatalog().map((item) => `<li>${unlocked.has(item.id) ? '●' : '○'} ${escapeHtml(item.label)}</li>`).join('');
    body.innerHTML = `<p><strong>${escapeHtml(career.playerName)}</strong> · ${roleLabel(career.role)} · ${escapeHtml(team?.name ?? career.teamId)}</p>
      <p>${career.matches} matches · ${career.tries} tries · ${career.goals} goals · ${career.tackles} tackles · ${Math.round(career.metres)} metres</p>
      <ul>${attrs}</ul><ul>${badges}</ul>
      <button type="button" id="career-clear" class="ghost">Retire and clear career</button>`;
    must('career-clear').addEventListener('click', () => {
      this.save.career = null;
      storeSave(this.save);
      this.openCareer();
    });
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.hidden) this.tick(dt);
    requestAnimationFrame((time) => this.frame(time));
  }

  private tick(dt: number): void {
    this.pumpSim();
    this.controls.poll();
    const match = this.match;
    const playing = this.screen === 'match' && match && !this.resultsShown;
    if (!playing || !match) {
      this.controls.take();
      if (match) match.aim = null;
      this.scene?.update(dt, match, this.save.settings.camera, false, true);
      this.scene?.render();
      this.audio.update(dt, 0.2);
      return;
    }
    if (this.paused || this.holdingReplay) {
      const shot = this.controls.take();
      if (this.holdingReplay && (shot.release || (this.scene && !this.scene.replaying))) {
        this.scene?.skipReplay();
        this.holdingReplay = false;
        match.releasePresentation();
      }
      if (!this.paused) this.presentHud(match, dt);
      this.paintAim(match);
      this.scene?.update(dt, match, this.cameraMode(match), this.save.settings.showTen, false);
      this.scene?.render();
      return;
    }
    if (this.drill?.done) {
      this.controls.take();
      this.paintAim(match);
      this.presentHud(match, dt);
      this.scene?.update(dt, match, this.cameraMode(match), false, false);
      this.scene?.render();
      return;
    }
    const shot = this.controls.take();
    this.applyShot(match, shot);
    match.step(dt, this.buildInput(match, shot));
    this.afterStep(match, dt);
    this.paintAim(match);
    this.presentHud(match, dt);
    this.scene?.update(dt, match, this.cameraMode(match), this.save.settings.showTen, false);
    this.scene?.render();
    this.noteFps(dt);
  }

  private pumpSim(): void {
    const job = this.job;
    const season = this.save.season;
    if (!job || !season) return;
    const simulated = job.match;
    for (let i = 0; i < 40 && simulated.phase !== 'full_time'; i++) {
      simulated.step(0.1, null);
      job.steps += 1;
    }
    if (simulated.phase !== 'full_time' && job.steps < 8000) return;
    const fixture = season.fixtures.find((item) => item.id === job.fixtureId);
    this.job = null;
    if (!fixture || fixture.score) {
      must('season-status').textContent = '';
      return;
    }
    if (simulated.phase !== 'full_time') {
      must('season-status').textContent = 'That background match did not finish. It was not recorded.';
      return;
    }
    recordResult(season.fixtures, fixture.id, [simulated.score[0], simulated.score[1]]);
    this.advanceSeason(season);
    storeSave(this.save);
    must('season-status').textContent = `${this.team(fixture.home).short} ${simulated.score[0]}–${simulated.score[1]} ${this.team(fixture.away).short}`;
    if (this.screen === 'season') this.renderSeason();
  }

  private applyShot(match: Match, shot: ReturnType<ControlState['take']>): void {
    const attack = match.humanTeam !== null && match.possession === match.humanTeam;
    if (shot.primaryEdge && attack) shot.pass = true;
    if (shot.pass && !this.canPass(match)) {
      shot.pass = false;
      this.toast('Unavailable');
    }
    if (shot.kick === 'field_goal') {
      this.aimingField = true;
      shot.kick = null;
    }
  }

  private buildInput(match: Match, shot: ReturnType<ControlState['take']>): HumanInput {
    const sign = match.attackSign(match.humanTeam ?? match.possession);
    const moveX = this.controls.ax * sign;
    const moveZ = this.controls.ay * sign;
    const attack = match.humanTeam !== null && match.possession === match.humanTeam;
    const tackle = !attack && (this.controls.tackle || this.controls.primaryHeld);
    let pass = shot.pass;
    let offload = false;
    if (pass && match.phase === 'tackle') {
      offload = true;
      pass = false;
    }
    const kick = shot.kick
      ? { kind: shot.kick, power: shot.kick === 'grubber' ? 0.62 : 0.78, dirX: Math.abs(moveX) > 0.15 ? moveX : 0, dirZ: Math.abs(moveZ) > 0.15 ? moveZ : sign }
      : null;
    return {
      moveX, moveZ,
      sprint: this.controls.sprint,
      pass,
      passDirX: moveX,
      passDirZ: moveZ,
      assistedPass: this.save.settings.assistedPass,
      passTarget: this.receiverLock,
      kick,
      tackle,
      dive: shot.dive,
      offload,
      switchPlayer: shot.switchPlayer,
      quickPlay: shot.quick,
      restartChoice: shot.restart,
      goalError: shot.goalError,
      release: shot.release,
    };
  }

  private afterStep(match: Match, dt: number): void {
    if (this.drill) this.updateDrill(match, dt);
    while (this.eventCursor < match.events.length) this.onEvent(match, match.events[this.eventCursor++]);
    if (match.phase === 'in_flight' && this.prevPhase !== 'in_flight') this.audio.kick();
    if (match.phase === 'conversion' && this.prevPhase !== 'conversion' && !this.humanKicks(match)) match.releasePresentation();
    this.prevPhase = match.phase;
    if (this.holdingReplay && this.scene && !this.scene.replaying) {
      this.holdingReplay = false;
      match.releasePresentation();
    }
    if (match.phase === 'full_time' && !this.holdingReplay && !this.resultsShown && !this.drill) this.showResults();
    const excitement = match.phase === 'try' || match.phase === 'conversion' ? 0.95
      : match.tackleCount >= 5 ? 0.62
      : match.phase === 'tackle' ? 0.48
      : 0.3;
    this.audio.update(dt, excitement);
  }

  private onEvent(match: Match, event: MatchEvent): void {
    this.toast(event.text);
    if (event.type === 'try') {
      this.audio.cheer();
      if (this.save.settings.shake) this.scene?.punch(0.45);
      if (this.scene && match.replay.length > 1) {
        this.scene.startReplay(match.replay);
        this.holdingReplay = this.scene.replaying;
        if (!this.holdingReplay) match.releasePresentation();
      }
    } else if (event.type === 'tackle' || event.type === 'tackle_break') {
      this.audio.thud();
      if (this.save.settings.shake) this.scene?.punch(event.type === 'tackle' ? 0.28 : 0.12);
    } else if (event.type === 'conversion' || event.type === 'penalty_goal' || event.type === 'field_goal') {
      this.audio.cheer();
    } else if (event.type === 'penalty' || event.type === 'knock_on' || event.type === 'forward_pass' || event.type === 'handover' || event.type === 'six_again' || event.type === 'half_time' || event.type === 'full_time' || event.type === 'held_up') {
      this.audio.whistle();
    }
    if (this.drill && (event.type === 'field_goal' || event.type === 'field_goal_miss')) this.noteGoal(match, event.type === 'field_goal');
    if (this.drill && event.type === 'handover' && this.drill.id === 'last' && !this.drill.done) this.completeDrill(false, 'The set ended without a kick or a try.');
    if (this.drill && event.type === 'try' && this.drill.id === 'last') this.completeDrill(true, 'Try on the last tackle.');
  }

  private updateDrill(match: Match, dt: number): void {
    const drill = this.drill;
    if (!drill || drill.done) return;
    drill.time += dt;
    if (drill.id === 'pass') {
      const carrier = match.carrier();
      if (carrier && carrier.id !== drill.lastCarrier && carrier.team === 0 && match.ball.mode === 'held') {
        if (drill.lastCarrier !== -1) drill.catches += 1;
        drill.lastCarrier = carrier.id;
      }
      drill.text = `Catches ${drill.catches}/6. Pass backwards to a support.`;
      if (drill.catches >= 6) this.completeDrill(true, 'Six catches completed.');
      else if (match.events.some((event) => event.type === 'knock_on' || event.type === 'forward_pass')) this.completeDrill(false, 'The pass broke down.');
    } else if (drill.id === 'tackle') {
      const defender = match.players.find((player) => player.id === match.controlledId);
      const made = (defender?.tackles ?? 0) - drill.startTackles;
      drill.text = `Tackles ${made}/3. Meet the carrier.`;
      if (made >= 3) this.completeDrill(true, 'Three tackles completed.');
      else if (match.score[0] > 0) this.completeDrill(false, 'The carrier scored.');
    } else if (drill.id === 'goal') {
      drill.text = `Goals ${drill.goals}/4 attempts ${drill.attempts}. Open the kick menu and choose field goal.`;
    } else if (drill.id === 'last') {
      if (match.ball.mode === 'flight' && match.ball.kick && match.ball.kickTeam === 0) this.completeDrill(true, 'Kick on the last tackle.');
      else drill.text = 'Tackle five. Kick, or score, before the handover.';
    }
    if (drill.time > 90 && !drill.done) this.completeDrill(false, 'Time expired.');
    must('drill-banner').hidden = false;
    must('drill-banner').textContent = drill.text;
  }

  private noteGoal(match: Match, scored: boolean): void {
    const drill = this.drill;
    if (!drill || drill.id !== 'goal' || drill.done) return;
    drill.attempts += 1;
    if (scored) drill.goals += 1;
    if (drill.goals >= 2) {
      this.completeDrill(true, 'Two field goals from four spots.');
      return;
    }
    if (drill.attempts >= 4) {
      this.completeDrill(false, `${drill.goals} field goals from four attempts.`);
      return;
    }
    drill.spot += 1;
    const x = drill.spots[drill.spot] ?? 0;
    match.scenario(0, 6, x, 30, 2);
    match.passiveDefence = true;
    match.aiEnabled = false;
  }

  private completeDrill(success: boolean, text: string): void {
    if (!this.drill || this.drill.done) return;
    this.drill.done = true;
    this.drill.success = success;
    this.drill.text = text;
    must('drill-banner').textContent = text;
    this.fillChoice(success ? 'Drill complete' : 'Drill ended', [{ act: 'drill-done', label: 'Back to training' }]);
  }

  private presentHud(match: Match, dt: number): void {
    const home = match.teams[0];
    const away = match.teams[1];
    const bug = must('scorebug');
    bug.style.setProperty('--home', home.home);
    bug.style.setProperty('--away', away.home);
    must('score-home').textContent = home.short;
    must('score-away').textContent = away.short;
    must('score-a').textContent = String(match.score[0]);
    must('score-b').textContent = String(match.score[1]);
    must('clock').textContent = formatClock(match.clock);
    must('half').textContent = match.half >= 3 ? 'ET' : `H${match.half}`;
    const poss = match.teams[match.possession];
    must('poss').textContent = `${poss.short} ball`;
    const pips = must('pips');
    pips.classList.toggle('last', match.tackleCount >= 5);
    pips.innerHTML = Array.from({ length: 6 }, (_, index) => `<i class="${index < match.tackleCount ? 'on' : ''}"></i>`).join('');
    const controlled = match.controlledId === null ? null : match.players.find((player) => player.id === match.controlledId);
    const aimNote = match.aim?.note ? ` · ${match.aim.note}` : '';
    must('controlled').textContent = controlled ? `${controlled.name} · ${roleLabel(controlled.role)} · ${Math.round(controlled.fatigue * 100)}% fatigue${aimNote}` : '';
    must('fps').hidden = !this.save.settings.showFps;
    must('intent').hidden = !this.save.settings.showFps;
    if (this.save.settings.showFps) {
      must('fps').textContent = `${Math.round(this.fps)} fps`;
      must('intent').textContent = controlled?.intent || controlled?.decision?.intent || '';
    }
    if (performance.now() > this.toastUntil) must('toast').hidden = true;
    if (!this.drill) must('drill-banner').hidden = true;
    this.renderActions(match);
    this.renderChoice(match, dt);
    if (this.scene?.lost) this.toast('Graphics context was lost. Reload the page to restore the picture.');
  }

  private renderActions(match: Match): void {
    const attack = match.humanTeam !== null && match.possession === match.humanTeam;
    const phase = match.phase;
    const key = `${attack ? 'a' : 'd'}:${phase}:${this.kickOpen}`;
    if (key === this.actionKey) return;
    this.actionKey = key;
    const buttons: { act: string; label: string }[] = [];
    if (phase === 'play_the_ball' && attack) buttons.push({ act: 'quick', label: 'Quick PTB' });
    else if (phase === 'restart' && attack) buttons.push({ act: 'quick', label: 'Tap' });
    else if (attack) {
      buttons.push({ act: 'pass', label: phase === 'tackle' ? 'Offload' : 'Pass' });
      buttons.push({ act: 'target', label: 'Receiver' });
      buttons.push({ act: 'kick', label: 'Kick' });
      buttons.push({ act: 'sprint', label: 'Sprint' });
      buttons.push({ act: 'dive', label: 'Dive' });
    } else {
      buttons.push({ act: 'tackle', label: 'Tackle' });
      buttons.push({ act: 'switch', label: 'Switch' });
      buttons.push({ act: 'sprint', label: 'Sprint' });
    }
    must('actions').innerHTML = buttons.map((button) => `<button type="button" data-act="${button.act}">${button.label}</button>`).join('');
    const wheel = must('kick-wheel');
    const metres = metresToGoal(match, match.possession, match.ball.z);
    wheel.innerHTML = KICKS.filter((kick) => kick.id !== 'field_goal' || metres < 48)
      .map((kick) => `<button type="button" data-kick="${kick.id}">${kick.label}</button>`)
      .join('');
    wheel.hidden = !this.kickOpen || !attack;
  }

  private onAction(event: PointerEvent, down: boolean): void {
    const button = (event.target as HTMLElement).closest('button');
    const act = button?.dataset.act;
    if (!act) return;
    if (button && down) button.setPointerCapture(event.pointerId);
    if (act === 'sprint') this.controls.sprintHeld = down;
    else if (act === 'tackle') this.controls.tackleHeld = down;
    else if (down && act === 'pass') this.controls.pass = true;
    else if (down && act === 'dive') this.controls.dive = true;
    else if (down && act === 'switch') this.controls.switchPlayer = true;
    else if (down && act === 'quick') this.controls.quick = true;
    else if (down && act === 'target' && this.match) this.cycleReceiver(this.match);
    else if (down && act === 'kick') {
      this.kickOpen = !this.kickOpen;
      this.armedKick = 'punt';
      this.actionKey = '';
    }
    event.preventDefault();
  }

  private renderChoice(match: Match, dt: number): void {
    const human = match.humanTeam;
    if (this.drill?.done) return;
    if (match.phase === 'half_time') {
      const next = match.half >= 2 ? 'Extra time' : 'Second half';
      this.fillChoice(`Half time ${match.score[0]}–${match.score[1]}`, [{ act: 'continue', label: next }]);
      return;
    }
    if (match.phase === 'penalty' && human === match.awardedTeam) {
      const label = match.events.filter((event) => event.type === 'penalty').at(-1)?.text ?? 'Penalty';
      this.fillChoice(label, [
        { act: 'tap', label: 'Tap' },
        { act: 'touch', label: 'Kick to touch' },
        { act: 'goal', label: 'Goal' },
      ]);
      return;
    }
    if (this.holdingReplay) {
      this.fillChoice('Try replay', [{ act: 'skip', label: 'Skip replay' }]);
      return;
    }
    if (match.phase === 'conversion' && this.humanKicks(match)) {
      this.aimingField = false;
      must('choice').hidden = true;
      must('meter-cancel').hidden = true;
      this.renderMeter(match, dt);
      return;
    }
    if (this.aimingField && match.carrier()?.hasBall && match.carrier()?.team === match.humanTeam
      && (match.phase === 'open_play' || match.phase === 'restart')) {
      must('choice').hidden = true;
      must('meter-cancel').hidden = false;
      this.renderMeter(match, dt);
      return;
    }
    this.aimingField = false;
    must('choice').hidden = true;
    must('meter').hidden = true;
  }

  private choiceKey = '';

  private fillChoice(text: string, buttons: { act: string; label: string }[]): void {
    const key = `${text}:${buttons.map((button) => button.act).join()}`;
    must('meter').hidden = true;
    const choice = must('choice');
    choice.hidden = false;
    if (key === this.choiceKey) return;
    this.choiceKey = key;
    must('choice-text').textContent = text;
    must('choice-buttons').innerHTML = buttons.map((button) => `<button type="button" data-act="${button.act}">${button.label}</button>`).join('');
  }

  private renderMeter(match: Match, dt: number): void {
    must('meter').hidden = false;
    const kicker = match.players.find((player) => player.team === this.kickingTeam(match) && player.role === 'halfback')
      ?? match.players.find((player) => player.team === this.kickingTeam(match));
    const accuracy = kicker?.attrs.kickAccuracy ?? 0.7;
    this.meterPhase += dt * (1.35 + (1 - accuracy) * 1.4);
    const value = Math.sin(this.meterPhase);
    const fromX = this.aimingField || match.goalAttempt === 'penalty_goal'
      ? Math.abs(match.ball.x)
      : Math.abs(match.tryInfo?.x ?? 0);
    const posts = 2.75 / (5.2 + fromX * 0.12);
    const sweet = must('meter-sweet');
    sweet.style.left = `${((1 - posts) / 2) * 100}%`;
    sweet.style.width = `${posts * 100}%`;
    must('meter-mark').style.left = `${((value + 1) / 2) * 100}%`;
    this.meterValue = value;
  }

  private meterValue = 0;

  private strike(): void {
    if (this.aimingField && this.match) {
      const ok = this.match.aimFieldGoal(this.meterValue);
      this.aimingField = false;
      must('meter').hidden = true;
      if (!ok) this.toast('Unavailable');
      return;
    }
    this.controls.goalError = this.meterValue;
    must('meter').hidden = true;
  }

  private humanKicks(match: Match): boolean {
    return match.humanTeam !== null && this.kickingTeam(match) === match.humanTeam;
  }

  private kickingTeam(match: Match): TeamId {
    if (match.goalAttempt === 'penalty_goal') return match.awardedTeam;
    return match.tryInfo?.team ?? match.possession;
  }

  private showResults(): void {
    if (!this.match || this.resultsShown) return;
    this.resultsShown = true;
    const result = this.match.result();
    this.record(result);
    const motm = result.playerStats.find((player) => player.id === result.motmId);
    const scorers = result.scorers.map((score) => {
      const player = result.playerStats.find((item) => item.id === score.playerId);
      return `<li>${escapeHtml(player?.name ?? 'Player')} ${score.kind.replace('_', ' ')} ${score.points}</li>`;
    }).join('');
    const leaders = [...result.playerStats].sort((a, b) => b.metres - a.metres).slice(0, 3)
      .map((player) => `<li>${escapeHtml(player.name)} ${Math.round(player.metres)} m, ${player.tackles} tackles, rating ${ratingOf(player).toFixed(1)}</li>`)
      .join('');
    const faults = result.faults.length ? result.faults.map((fault) => `<li>${escapeHtml(fault)}</li>`).join('') : '<li>No simulation faults recorded.</li>';
    must('results-title').textContent = result.abandoned ? 'Abandoned' : `${result.home} ${result.score[0]}–${result.score[1]} ${result.away}`;
    must('results-body').innerHTML = `<p>${result.abandoned ? 'The match was abandoned and was not written into the season.' : escapeHtml(result.reason || 'Full time')}</p>
      <h3>Scores</h3><ul>${scorers || '<li>No points.</li>'}</ul>
      <p>Man of the match: ${escapeHtml(motm?.name ?? '—')}</p>
      <h3>Metres</h3><ul>${leaders}</ul>
      <p>Sets completed ${result.completedSets[0]}–${result.completedSets[1]}. Errors ${result.errors[0]}–${result.errors[1]}. Interchanges ${result.interchanges[0]}–${result.interchanges[1]}.</p>
      <h3>Engine notes</h3><ul>${faults}</ul>`;
    this.show('results');
    this.audio.whistle();
  }

  private record(result: ReturnType<Match['result']>): void {
    if (result.abandoned) return;
    this.save.history.unshift({
      at: new Date().toISOString(),
      home: result.home,
      away: result.away,
      score: result.score,
      competition: this.fixtureId !== null,
    });
    this.save.history = this.save.history.slice(0, 40);
    if (this.fixtureId && this.save.season) {
      const fixture = this.save.season.fixtures.find((item) => item.id === this.fixtureId);
      if (fixture && !fixture.score) {
        recordResult(this.save.season.fixtures, fixture.id, result.score);
        this.advanceSeason(this.save.season);
      }
    }
    this.growCareer(result);
    unlockAchievements(this.save);
    storeSave(this.save);
  }

  private growCareer(result: ReturnType<Match['result']>): void {
    const career = this.save.career;
    if (!career) return;
    const player = result.playerStats.find((item) => item.name === career.playerName && (item.team === 0 ? result.homeId : result.awayId) === career.teamId);
    if (!player) return;
    career.matches += 1;
    career.tries += player.tries;
    career.goals += player.goals;
    career.tackles += player.tackles;
    career.metres += player.metres;
    const bump = (key: string, amount: number) => {
      const current = career.attrs[key] ?? 0.6;
      career.attrs[key] = Math.max(0.35, Math.min(0.98, current + amount));
    };
    bump('endurance', Math.min(0.012, player.metres / 8000));
    bump('tackling', Math.min(0.01, player.tackles / 400));
    bump('ballCarry', Math.min(0.01, player.metres / 9000));
    if (player.tries > 0) bump('speed', 0.004);
    if (player.goals + player.fieldGoals > 0) bump('kickAccuracy', 0.004);
  }

  private togglePause(on: boolean): void {
    if (this.screen !== 'match' || !this.match || this.resultsShown) return;
    this.paused = on;
    must('pause').hidden = !on;
    if (on) this.renderPause();
  }

  private renderPause(): void {
    const match = this.match;
    if (!match || match.humanTeam === null) return;
    const tactic = match.tactics[match.humanTeam];
    const stoppage = match.phase !== 'open_play' && match.phase !== 'in_flight' && match.phase !== 'tackle';
    const side = match.humanTeam;
    const onField = match.players.filter((player) => player.team === side && player.onField);
    const bench = match.players.filter((player) => player.team === side && !player.onField);
    const options = (selected: string, values: string[]) => values.map((value) => `<option ${value === selected ? 'selected' : ''}>${value}</option>`).join('');
    must('pause-body').innerHTML = `<div class="grid">
      <label>Attack<select id="tac-attack">${options(tactic.attack, ['middle', 'wide', 'tempo', 'completion', 'territory'])}</select></label>
      <label>Defence<select id="tac-defence">${options(tactic.defence, ['aggressive', 'compressed', 'slide', 'edge'])}</select></label>
      <label>Kicking<select id="tac-kick">${options(tactic.kick, ['deep', 'short', 'contest'])}</select></label>
    </div>
    <p class="note">${stoppage ? `Interchanges ${match.interchanges[side]}/${match.rules.interchangeLimit}.` : 'Interchanges wait for a stoppage.'}</p>
    <div class="grid">
      <label>Off<select id="sub-off">${onField.map((player) => `<option value="${player.id}">${player.number} ${escapeHtml(player.name)}</option>`).join('')}</select></label>
      <label>On<select id="sub-on">${bench.map((player) => `<option value="${player.id}">${player.number} ${escapeHtml(player.name)}</option>`).join('')}</select></label>
    </div>
    <button type="button" id="sub-do" ${stoppage ? '' : 'disabled'}>Interchange</button>`;
    const write = () => {
      const next: Tactic = {
        attack: must<HTMLSelectElement>('tac-attack').value as Tactic['attack'],
        defence: must<HTMLSelectElement>('tac-defence').value as Tactic['defence'],
        kick: must<HTMLSelectElement>('tac-kick').value as Tactic['kick'],
      };
      match.tactics[side] = next;
    };
    must('tac-attack').addEventListener('change', write);
    must('tac-defence').addEventListener('change', write);
    must('tac-kick').addEventListener('change', write);
    must('sub-do').addEventListener('click', () => {
      const ok = match.interchange(Number(must<HTMLSelectElement>('sub-off').value), Number(must<HTMLSelectElement>('sub-on').value));
      this.toast(ok ? 'Interchange made' : 'Interchange refused');
      this.renderPause();
    });
  }

  private quitMatch(): void {
    if (!this.match) return;
    this.drill = null;
    this.match.abandon();
    this.paused = false;
    this.showResults();
  }

  private cycleCamera(): void {
    const order: CameraMode[] = ['behind', 'broadcast', 'tactical'];
    const index = order.indexOf(this.save.settings.camera);
    this.save.settings.camera = order[(index + 1) % order.length];
    storeSave(this.save);
    const select = document.getElementById('set-camera') as HTMLSelectElement | null;
    if (select) select.value = this.save.settings.camera;
    this.toast(this.save.settings.camera);
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (event.code === 'Escape') this.togglePause(!this.paused);
    if (this.screen !== 'match') return;
    if (event.code === 'KeyC') this.cycleCamera();
    if (event.code === 'KeyQ' && !event.repeat && this.match) this.cycleReceiver(this.match);
    if (event.code === 'KeyK') {
      this.kickOpen = !this.kickOpen;
      this.armedKick = 'punt';
      this.actionKey = '';
    }
    if (this.kickOpen && event.code.startsWith('Digit')) {
      const index = Number(event.code.slice(5)) - 1;
      const kick = KICKS[index];
      if (kick) this.armedKick = kick.id;
      if (kick?.id === 'field_goal') this.aimingField = true;
      else if (kick) this.controls.kick = kick.id;
      this.kickOpen = false;
    }
  }

  private cameraMode(match: Match): CameraMode {
    if (match.phase === 'conversion' || match.phase === 'try') return 'broadcast';
    return this.save.settings.camera;
  }

  private paintAim(match: Match): void {
    match.aim = null;
    const human = match.humanTeam;
    if (human === null || match.possession !== human) return;
    const carrier = match.carrier();
    if (!carrier?.hasBall || carrier.team !== human || match.ball.mode !== 'held') return;
    const phase = match.phase;
    const live = phase === 'open_play' || phase === 'tackle' || phase === 'kickoff' || phase === 'loose' || phase === 'restart';
    if (!live) return;
    const sign = match.attackSign(human);
    const dirX = this.controls.ax * sign;
    const dirZ = this.controls.ay * sign;
    if (this.kickOpen && phase !== 'tackle' && phase !== 'loose' && !this.aimingField) {
      const power = this.armedKick === 'grubber' ? 0.62 : 0.78;
      const kickX = Math.abs(dirX) > 0.15 ? dirX : 0;
      const kickZ = Math.abs(dirZ) > 0.15 ? dirZ : sign;
      match.aim = kickPreview(match, carrier, this.armedKick, power, kickX, kickZ);
      return;
    }
    if (phase === 'restart') return;
    const legal = legalReceivers(match, carrier);
    if (!legal.some((player) => player.id === this.receiverLock)) this.receiverLock = legal[0]?.id ?? -1;
    match.aim = passPreview(match, carrier, dirX, dirZ, this.receiverLock);
  }

  private cycleReceiver(match: Match): void {
    const carrier = match.carrier();
    if (!carrier || carrier.team !== match.humanTeam || !carrier.hasBall) return;
    const legal = legalReceivers(match, carrier);
    if (!legal.length) {
      this.receiverLock = -1;
      return;
    }
    const index = legal.findIndex((player) => player.id === this.receiverLock);
    const next = legal[(index + 1) % legal.length];
    this.receiverLock = next.id;
    this.paintAim(match);
  }

  private canPass(match: Match): boolean {
    const player = match.controlledId === null ? null : match.players.find((item) => item.id === match.controlledId);
    if (!player?.hasBall) return false;
    return match.phase === 'open_play' || match.phase === 'kickoff' || match.phase === 'tackle' || match.phase === 'loose';
  }

  private toast(text: string): void {
    const el = must('toast');
    el.hidden = false;
    el.textContent = text;
    this.toastUntil = performance.now() + 2800;
  }

  private present(stadiumId: string): void {
    this.scene?.setQuality(this.save.settings.quality);
    this.scene?.setStadium(stadiumById(stadiumId), this.save.settings.quality);
  }

  private stadium(): StadiumInfo {
    return stadiumById(this.match?.stadiumId ?? this.teams[0].stadiumId);
  }

  private team(id: string): Team {
    const team = this.teams.find((item) => item.id === id);
    if (!team) throw new Error(`Unknown team ${id}`);
    return team;
  }

  private overlay(team: Team): Team {
    const career = this.save.career;
    if (!career || career.teamId !== team.id) return team;
    const squad = team.squad.map((player) => ({ ...player, attrs: { ...player.attrs }, look: { ...player.look } }));
    const slot = squad.find((player) => player.role === career.role && player.number <= 13) ?? squad[6];
    slot.name = career.playerName;
    for (const [key, value] of Object.entries(career.attrs)) {
      if (key in slot.attrs) slot.attrs[key as keyof typeof slot.attrs] = value;
    }
    return { ...team, squad };
  }

  private humanSide(home: Team, away: Team): TeamId {
    if (this.save.career && this.save.career.teamId === away.id && this.save.career.teamId !== home.id) return 1;
    return 0;
  }

  private resize(): void {
    this.scene?.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private noteFps(dt: number): void {
    this.frames += 1;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.frames / this.fpsAcc;
      this.frames = 0;
      this.fpsAcc = 0;
    }
  }
}

function createView(canvas: HTMLCanvasElement): { view: FieldView | null; flat: boolean; canvas: HTMLCanvasElement } {
  try {
    return { view: mountScene(canvas), flat: false, canvas };
  } catch (error) {
    console.warn('WebGL context was not created. Drawing the flat pitch.', error);
    const fresh = document.createElement('canvas');
    fresh.id = 'view';
    canvas.replaceWith(fresh);
    try {
      return { view: new Pitch2D(fresh), flat: true, canvas: fresh };
    } catch (flatError) {
      console.error(flatError);
      return { view: null, flat: true, canvas: fresh };
    }
  }
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'));
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0) % 100000 + 1;
}

function drillText(id: DrillId): string {
  if (id === 'pass') return 'Move, then pass to a support runner. Six catches.';
  if (id === 'tackle') return 'You are the centre. Tackle the ball carrier three times.';
  if (id === 'goal') return 'Field goal. The posts are ahead. Two from four.';
  return 'Last tackle, own half. Kick or score before the handover.';
}
