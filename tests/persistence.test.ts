import { describe, expect, it } from 'vitest';
import { parseSave, unlockAchievements } from '../src/game/save';
import { buildFixtures, buildFinals, recordResult, regularComplete, standings } from '../src/sim/season';

describe('save migration', () => {
  it('rejects corrupt and future payloads', () => {
    expect(parseSave(null).version).toBe(2);
    expect(parseSave('{').settings.difficulty).toBe('club');
    expect(parseSave(JSON.stringify({ version: 3, settings: { difficulty: 'rookie' } })).settings.difficulty).toBe('club');
  });

  it('keeps a valid settings payload inside the allowed ranges', () => {
    const raw = JSON.stringify({
      version: 2,
      settings: { difficulty: 'representative', halfMinutes: 40, clockScale: 8, music: 4, leftHanded: true },
      achievements: ['first-win', 12],
      history: [{ at: '2026-01-01', home: 'A', away: 'B', score: [8, 4], competition: false }],
    });
    const save = parseSave(raw);
    expect(save.settings.difficulty).toBe('representative');
    expect(save.settings.halfMinutes).toBe(40);
    expect(save.settings.music).toBe(1);
    expect(save.settings.leftHanded).toBe(true);
    expect(save.achievements).toEqual(['first-win']);
    expect(save.history).toHaveLength(1);
  });

  it('unlocks a win once', () => {
    const save = parseSave(null);
    save.history.push({ at: 't', home: 'A', away: 'B', score: [4, 0], competition: false });
    expect(unlockAchievements(save)).toContain('first-win');
    expect(unlockAchievements(save)).toEqual([]);
  });
});

describe('meridian cup table', () => {
  it('builds a single round robin and ranks by points', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const fixtures = buildFixtures(ids);
    expect(fixtures).toHaveLength(6);
    expect(regularComplete(fixtures)).toBe(false);
    for (const fixture of fixtures) recordResult(fixtures, fixture.id, fixture.home === 'a' ? [10, 4] : [6, 6]);
    expect(() => recordResult(fixtures, fixtures[0].id, [1, 1])).toThrow(/already/);
    expect(regularComplete(fixtures)).toBe(true);
    const table = standings(ids, fixtures);
    expect(table[0].id).toBe('a');
    expect(table[0].points).toBeGreaterThan(0);
    const finals = buildFinals(table);
    expect(finals.map((fixture) => fixture.home)).toEqual([table[0].id, table[1].id]);
  });
});
