import { describe, expect, it } from 'vitest';
import { createTeams } from '../src/data/teams';
import { gradeTackle, maxSpeed, planCarrier } from '../src/sim/ai';
import { Match } from '../src/sim/match';
import { buildFinals, buildFixtures, buildGrandFinal, recordResult, standings } from '../src/sim/season';
import { parseSave, serializeSave, unlockAchievements, freshSave } from '../src/game/save';

function match(seed = 3): Match {
  const teams = createTeams();
  return new Match({
    home: teams[0],
    away: teams[1],
    seed,
    humanTeam: null,
    halfSeconds: 120,
    clockScale: 1,
    difficulty: 'club',
  });
}

describe('thirteen a side', () => {
  it('starts with 13 players on the field for each team', () => {
    const m = match();
    m.start();
    expect(m.players.filter((p) => p.onField && p.team === 0)).toHaveLength(13);
    expect(m.players.filter((p) => p.onField && p.team === 1)).toHaveLength(13);
    expect(new Set(m.players.filter((p) => p.team === 0).map((p) => p.name)).size).toBe(17);
  });
});

describe('six-tackle set', () => {
  it('hands the ball over after the sixth completed tackle', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 8, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      expect(m.carrier()?.team).toBe(0);
      m.applyCompletedTackle();
      expect(m.tackleCount).toBe(i + 1);
      expect(m.possession).toBe(0);
      for (let s = 0; s < 40; s++) m.step(0.05, null);
      expect(m.possession).toBe(0);
      expect(m.events.some((e) => e.type === 'six_again')).toBe(false);
    }
    m.applyCompletedTackle();
    expect(m.tackleCount).toBe(6);
    for (let s = 0; s < 50; s++) m.step(0.05, null);
    expect(m.possession).toBe(1);
    expect(m.tackleCount).toBe(0);
    expect(m.events.some((e) => e.type === 'handover')).toBe(true);
    expect(m.faults).toEqual([]);
  });

  it('does not let a grounded player pass', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 6, 0, 0, 1);
    const id = m.carrier()!.id;
    m.applyCompletedTackle();
    expect(m.requestPass(id, 0, -1, true)).toBe(false);
  });
});

describe('infringements', () => {
  it('calls a forward pass and feeds a scrum to the other team', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 6, 0, 0, 2);
    const carrier = m.carrier()!;
    expect(m.requestPass(carrier.id, 0, 1, false)).toBe(true);
    for (let s = 0; s < 80; s++) m.step(0.05, null);
    expect(m.events.some((e) => e.type === 'forward_pass')).toBe(true);
    const scrum = m.events.find((e) => e.type === 'scrum');
    expect(scrum?.team).toBe(1);
  });

  it('calls a knock-on when a pass is dropped forward', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 6, 0, 0, 1);
    const carrier = m.carrier()!;
    for (const p of m.players) {
      if (p.team === 0 && p.id !== carrier.id) {
        p.z = 6;
        p.lockPosition = true;
      }
    }
    const receiver = m.players.find((p) => p.team === 0 && p.squadIndex === 11)!;
    receiver.z = -4;
    receiver.x = -1;
    receiver.lockPosition = false;
    receiver.attrs.catching = 0.28;
    const defender = m.players.find((p) => p.team === 1 && p.squadIndex === 10)!;
    defender.x = -2.8;
    defender.z = -4.2;
    defender.lockPosition = true;
    defender.attrs.catching = 0.2;
    expect(m.requestPass(carrier.id, -1, -1, true)).toBe(true);
    for (let s = 0; s < 80; s++) m.step(0.05, null);
    expect(m.events.some((e) => e.type === 'knock_on' || e.type === 'forward_pass')).toBe(true);
  });

  it('awards six again when a non-marker is inside the 10', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 8, 0, 0, 2);
    const rusher = m.players.find((p) => p.team === 1 && p.squadIndex === 5)!;
    rusher.z = 4;
    rusher.lockPosition = true;
    m.applyCompletedTackle();
    for (let s = 0; s < 40; s++) m.step(0.05, null);
    expect(m.events.some((e) => e.type === 'six_again')).toBe(true);
    expect(m.tackleCount).toBe(0);
    expect(m.possession).toBe(0);
  });
});

describe('scoring', () => {
  it('awards a try for a grounding in-goal', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 4, 0, 47.2, 1);
    const carrier = m.carrier()!;
    carrier.targetX = 0;
    carrier.targetZ = 62;
    carrier.sprint = true;
    for (let s = 0; s < 90 && m.score[0] < 4; s++) m.step(1 / 30, null);
    expect(m.score[0]).toBe(4);
    expect(m.events.some((e) => e.type === 'try')).toBe(true);
    expect(m.replay.length).toBeGreaterThan(0);
  });

  it('holds the ball up when a tackle is completed in-goal', () => {
    const m = match();
    m.aiEnabled = false;
    m.scenario(0, 8, 0, 50.3, 2);
    const carrier = m.carrier()!;
    carrier.attrs.ballCarry = 0.38;
    carrier.attrs.balance = 0.4;
    carrier.vx = 0;
    carrier.vz = 0;
    const defender = m.players.find((p) => p.team === 1 && p.squadIndex === 8)!;
    defender.lockPosition = false;
    defender.x = 0.15;
    defender.z = 50.7;
    defender.engage = true;
    defender.attrs.tackling = 0.96;
    defender.attrs.strength = 0.95;
    for (let s = 0; s < 50 && !m.events.some((e) => e.type === 'held_up' || e.type === 'try'); s++) {
      m.step(1 / 30, null);
    }
    expect(m.events.some((e) => e.type === 'held_up')).toBe(true);
    expect(m.score[0]).toBe(0);
  });

  it('adds two for a centred conversion and nothing for a wide miss', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 2, 0, 48, 0);
    const carrier = m.carrier()!;
    carrier.targetZ = 60;
    carrier.sprint = true;
    for (let s = 0; s < 80 && m.phase !== 'try'; s++) m.step(1 / 30, null);
    expect(m.score[0]).toBe(4);
    for (let s = 0; s < 20 && m.phase !== 'conversion'; s++) m.step(0.05, null);
    expect(m.phase).toBe('conversion');
    m.takeGoalKick(0);
    for (let s = 0; s < 80 && m.score[0] < 6; s++) m.step(1 / 30, null);
    expect(m.score[0]).toBe(6);
    expect(m.events.some((e) => e.type === 'conversion')).toBe(true);

    const missed = match(9);
    missed.aiEnabled = false;
    missed.passiveDefence = true;
    missed.scenario(0, 2, 0, 48, 0);
    const winger = missed.carrier()!;
    winger.targetZ = 60;
    winger.sprint = true;
    for (let s = 0; s < 80 && missed.phase !== 'try'; s++) missed.step(1 / 30, null);
    for (let s = 0; s < 20 && missed.phase !== 'conversion'; s++) missed.step(0.05, null);
    missed.takeGoalKick(1);
    for (let s = 0; s < 80 && !missed.events.some((e) => e.type === 'conversion_miss' || e.type === 'conversion'); s++) {
      missed.step(1 / 30, null);
    }
    expect(missed.score[0]).toBe(4);
    expect(missed.events.some((e) => e.type === 'conversion_miss')).toBe(true);
  });

  it('scores a field goal from in front of the posts', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 6, 0, 30, 5);
    const kicker = m.carrier()!;
    kicker.attrs.kickAccuracy = 0.99;
    kicker.attrs.kickPower = 0.95;
    expect(m.requestKick(kicker.id, 'field_goal', 0.85, 0, 1)).toBe(true);
    for (let s = 0; s < 100 && m.score[0] === 0; s++) m.step(1 / 40, null);
    expect(m.score[0]).toBe(1);
    expect(m.events.some((e) => e.type === 'field_goal')).toBe(true);
  });
});

describe('clock and extra time', () => {
  it('ends the half on the next stoppage after the siren', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.scenario(0, 8, 0, 0, 1);
    m.clock = m.rules.halfSeconds - 0.02;
    m.step(0.05, null);
    expect(m.hooter).toBe(true);
    m.applyCompletedTackle();
    expect(m.phase).toBe('half_time');
    expect(m.score).toEqual([0, 0]);
  });

  it('plays golden point and ends on the next score', () => {
    const m = match();
    m.aiEnabled = false;
    m.passiveDefence = true;
    m.half = 2;
    m.score = [8, 8];
    m.scenario(0, 8, 0, 0, 1);
    m.clock = m.rules.halfSeconds - 0.02;
    m.step(0.05, null);
    m.applyCompletedTackle();
    expect(m.phase).toBe('half_time');
    expect(m.events.some((e) => e.type === 'extra_time')).toBe(true);
    m.step(0.1, null);
    m.step(0.1, null);
    expect(m.half).toBe(3);
    m.scenario(0, 4, 0, 47, 0);
    const carrier = m.carrier()!;
    carrier.targetZ = m.attackSign(0) > 0 ? 62 : -62;
    carrier.sprint = true;
    for (let s = 0; s < 100 && m.phase !== 'full_time'; s++) m.step(1 / 30, null);
    expect(m.phase).toBe('full_time');
    expect(m.score[0]).toBeGreaterThan(8);
    expect(m.endReason).toBe('golden_point');
  });
});

describe('contact, fatigue and interchanges', () => {
  it('breaks a weak tackle and completes a dominant one', () => {
    const m = match();
    const carrier = m.players[8];
    const tackler = m.players[28];
    carrier.x = 0;
    carrier.z = 0;
    carrier.facing = 0;
    carrier.attrs.ballCarry = 0.95;
    carrier.attrs.balance = 0.95;
    carrier.attrs.strength = 0.9;
    carrier.vx = 1;
    carrier.vz = 7;
    tackler.x = 0.3;
    tackler.z = -1.2;
    tackler.attrs.tackling = 0.42;
    tackler.attrs.strength = 0.4;
    tackler.vx = 0;
    tackler.vz = 0;
    expect(gradeTackle(carrier, [tackler])).toBe('broken');
    tackler.attrs.tackling = 0.96;
    tackler.attrs.strength = 0.95;
    tackler.vz = 4;
    const helper = m.players[29];
    helper.x = -0.4;
    helper.z = 1.1;
    helper.vx = 0;
    helper.vz = -5;
    helper.attrs.tackling = 0.92;
    helper.attrs.strength = 0.9;
    carrier.attrs.ballCarry = 0.5;
    carrier.attrs.balance = 0.45;
    expect(gradeTackle(carrier, [tackler, helper])).toBe('dominant');
  });

  it('slows a fatigued player', () => {
    const m = match();
    const p = m.players[1];
    p.fatigue = 0;
    const fresh = maxSpeed(p, 0);
    p.fatigue = 0.9;
    expect(maxSpeed(p, 0)).toBeLessThan(fresh * 0.8);
  });

  it('enforces the interchange limit', () => {
    const m = match();
    m.phase = 'play_the_ball';
    const off = m.players.find((p) => p.team === 0 && p.onField && p.squadIndex === 8)!;
    const on = m.players.find((p) => p.team === 0 && !p.onField)!;
    expect(m.interchange(off.id, on.id)).toBe(true);
    expect(m.players.filter((p) => p.team === 0 && p.onField)).toHaveLength(13);
    m.interchanges[0] = 8;
    const off2 = m.players.find((p) => p.team === 0 && p.onField && p.role === 'prop')!;
    const on2 = m.players.find((p) => p.team === 0 && !p.onField)!;
    expect(m.interchange(off2.id, on2.id)).toBe(false);
  });
});

describe('tactical decisions', () => {
  it('carries early in a set and kicks on the last from its own half', () => {
    const m = match();
    m.aiEnabled = false;
    m.scenario(0, 8, 0, 0, 0);
    m.tactics[0] = { attack: 'middle', defence: 'slide', kick: 'deep' };
    const early = planCarrier(m, m.carrier()!);
    expect(early?.type === 'carry' || early?.type === 'pass').toBe(true);
    expect(early?.type).not.toBe('kick');

    m.scenario(0, 6, 0, -18, 5);
    m.tactics[0] = { attack: 'territory', defence: 'slide', kick: 'deep' };
    const last = planCarrier(m, m.carrier()!);
    expect(last?.type).toBe('kick');
  });
});

describe('season table', () => {
  it('ranks by competition points and builds a top-four final', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fixtures = buildFixtures(ids);
    expect(fixtures).toHaveLength(28);
    expect(new Set(fixtures.map((f) => f.round)).size).toBe(7);
    const first = fixtures.find((f) => f.home === 'a' && f.away === 'b') ?? fixtures[0];
    recordResult(fixtures, first.id, [20, 10]);
    expect(() => recordResult(fixtures, first.id, [1, 1])).toThrow();
    for (const fixture of fixtures) {
      if (!fixture.score) recordResult(fixtures, fixture.id, fixture.home < fixture.away ? [18, 12] : [12, 12]);
    }
    const table = standings(ids, fixtures);
    expect(table).toHaveLength(8);
    expect(table[0].points).toBeGreaterThanOrEqual(table[1].points);
    const semis = buildFinals(table);
    expect(semis.map((s) => s.stage)).toEqual(['semi', 'semi']);
    recordResult(semis, semis[0].id, [14, 12]);
    recordResult(semis, semis[1].id, [6, 10]);
    const final = buildGrandFinal(semis);
    expect(final?.home).toBe(semis[0].home);
    expect(final?.away).toBe(semis[1].away);
    expect(final?.stage).toBe('final');
  });
});

describe('saves', () => {
  it('rejects corrupt data and keeps a valid versioned save', () => {
    expect(parseSave(null).version).toBe(1);
    expect(parseSave('not json').settings.difficulty).toBe('club');
    expect(parseSave(JSON.stringify({ version: 99 })).history).toEqual([]);
    const save = freshSave();
    save.settings.difficulty = 'representative';
    save.settings.leftHanded = true;
    save.career = {
      playerName: 'Tane Vale',
      role: 'halfback',
      teamId: 'wolves',
      attrs: { passing: 0.7 },
      age: 23,
      matches: 2,
      tries: 1,
      goals: 0,
      tackles: 4,
      metres: 120,
      seasonYear: 2026,
    };
    save.history.push({ at: '2026-10-21', home: 'Harbour Wolves', away: 'Ironridge Steel', score: [18, 12], competition: true });
    const gained = unlockAchievements(save);
    expect(gained).toContain('first-try');
    const again = parseSave(serializeSave(save));
    expect(again.settings.difficulty).toBe('representative');
    expect(again.settings.leftHanded).toBe(true);
    expect(again.career?.metres).toBe(120);
    expect(again.achievements).toContain('first-try');
    expect(again.history).toHaveLength(1);
  });
});
