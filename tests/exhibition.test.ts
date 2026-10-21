import { describe, expect, it } from 'vitest';
import { createTeams } from '../src/data/teams';
import { Match } from '../src/sim/match';

describe('exhibition simulation', () => {
  it('completes an AI versus AI match without breaking the laws', () => {
    const teams = createTeams();
    const m = new Match({
      home: teams[2],
      away: teams[4],
      seed: 11,
      humanTeam: null,
      difficulty: 'club',
      halfSeconds: 70,
      clockScale: 12,
      weather: { rain: 0.15, windX: 1.2, windZ: 0.4 },
    });
    m.start();
    let guard = 0;
    while (m.phase !== 'full_time' && guard < 25000) {
      m.step(0.1, null);
      guard += 1;
      if (m.tackleCount > 6) break;
    }
    expect(m.phase).toBe('full_time');
    expect(m.score[0]).toBeGreaterThanOrEqual(0);
    expect(m.score[1]).toBeGreaterThanOrEqual(0);
    expect(m.players.filter((p) => p.onField && p.team === 0)).toHaveLength(13);
    expect(m.players.filter((p) => p.onField && p.team === 1)).toHaveLength(13);
    expect(m.tackleCount).toBeLessThanOrEqual(6);
    const hard = m.faults.filter((f) => f.startsWith('stall') || f.startsWith('nan') || f.startsWith('players') || f.startsWith('multi') || f.startsWith('tackle_'));
    expect(hard, m.events.slice(-8).map((e) => e.text).join(' | ')).toEqual([]);
    expect(m.events.some((e) => e.type === 'full_time')).toBe(true);
    const result = m.result();
    expect(result.motmId).toBeGreaterThanOrEqual(0);
  });
});
