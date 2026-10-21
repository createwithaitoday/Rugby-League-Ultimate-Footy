export interface Fixture {
  id: string;
  round: number;
  home: string;
  away: string;
  score: [number, number] | null;
  stage: 'regular' | 'semi' | 'final';
}

export interface TableRow {
  id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number;
}

/** Single round-robin. Eight teams means seven rounds. */
export function buildFixtures(teamIds: string[]): Fixture[] {
  const ids = teamIds.slice();
  if (ids.length % 2 === 1) ids.push('BYE');
  const rounds = ids.length - 1;
  const half = ids.length / 2;
  const fixed = ids[0];
  let rot = ids.slice(1);
  const fixtures: Fixture[] = [];
  for (let round = 0; round < rounds; round++) {
    const row = [fixed, ...rot];
    for (let i = 0; i < half; i++) {
      const a = row[i];
      const b = row[row.length - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      const swap = round % 2 === 1 && i === 0;
      const home = swap ? b : a;
      const away = swap ? a : b;
      fixtures.push({
        id: `r${round + 1}-${home}-${away}`,
        round: round + 1,
        home,
        away,
        score: null,
        stage: 'regular',
      });
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return fixtures;
}

export function recordResult(fixtures: Fixture[], id: string, score: [number, number]): void {
  const fixture = fixtures.find((f) => f.id === id);
  if (!fixture) throw new Error(`Unknown fixture ${id}`);
  if (fixture.score) throw new Error(`Fixture ${id} already has a result`);
  fixture.score = [score[0], score[1]];
}

export function standings(teamIds: string[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const id of teamIds) {
    rows.set(id, {
      id, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, points: 0,
    });
  }
  for (const fixture of fixtures) {
    if (fixture.stage !== 'regular' || !fixture.score) continue;
    const home = rows.get(fixture.home);
    const away = rows.get(fixture.away);
    if (!home || !away) continue;
    const [hs, as] = fixture.score;
    home.played += 1;
    away.played += 1;
    home.pointsFor += hs;
    home.pointsAgainst += as;
    away.pointsFor += as;
    away.pointsAgainst += hs;
    if (hs > as) {
      home.won += 1;
      home.points += 2;
      away.lost += 1;
    } else if (hs < as) {
      away.won += 1;
      away.points += 2;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }
  for (const row of rows.values()) row.diff = row.pointsFor - row.pointsAgainst;
  return [...rows.values()].sort((a, b) => b.points - a.points || b.diff - a.diff || b.pointsFor - a.pointsFor || a.id.localeCompare(b.id));
}

export function regularComplete(fixtures: Fixture[]): boolean {
  return fixtures.filter((f) => f.stage === 'regular').every((f) => f.score !== null);
}

/** Top four: 1v4 and 2v3, winners meet in the final. */
export function buildFinals(table: TableRow[]): Fixture[] {
  if (table.length < 4) return [];
  const [a, b, c, d] = table;
  return [
    { id: `semi-${a.id}-${d.id}`, round: 8, home: a.id, away: d.id, score: null, stage: 'semi' },
    { id: `semi-${b.id}-${c.id}`, round: 8, home: b.id, away: c.id, score: null, stage: 'semi' },
  ];
}

export function buildGrandFinal(semis: Fixture[]): Fixture | null {
  if (semis.length < 2 || !semis[0].score || !semis[1].score) return null;
  const winner = (f: Fixture) => (f.score![0] >= f.score![1] ? f.home : f.away);
  const home = winner(semis[0]);
  const away = winner(semis[1]);
  return { id: `final-${home}-${away}`, round: 9, home, away, score: null, stage: 'final' };
}
