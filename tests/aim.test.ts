import { describe, expect, it } from 'vitest';
import { createTeams } from '../src/data/teams';
import { kickPreview, passPreview } from '../src/sim/aim';
import { kickLaunch, passLaunch, sampleFlight } from '../src/sim/flight';
import { Match } from '../src/sim/match';

const calm = { rain: 0, windX: 0, windZ: 0 };

function openMatch(): Match {
  const teams = createTeams();
  const played = new Match({
    home: teams[0],
    away: teams[1],
    seed: 3,
    humanTeam: null,
    halfSeconds: 120,
    clockScale: 1,
    difficulty: 'club',
  });
  played.aiEnabled = false;
  played.passiveDefence = true;
  played.scenario(0, 6, 0, 0, 2);
  return played;
}

describe('pass and kick flight', () => {
  it('gives a longer pass more pace, and a better passer more pace again', () => {
    const near = passLaunch(0, 0, 0, 0.4, 0, -4);
    const far = passLaunch(0, 0, 0, 0.4, 0, -16);
    const skilled = passLaunch(0, 0, 0, 0.95, 0, -16);
    const pace = (launch: { vx: number; vz: number }) => Math.hypot(launch.vx, launch.vz);
    expect(pace(far)).toBeGreaterThan(pace(near));
    expect(pace(skilled)).toBeGreaterThan(pace(far));
  });

  it('lands a punt downfield', () => {
    const launch = kickLaunch(0, 0, 'punt', 0.78, 0.8, 0, 1, 0, false, 1);
    const flight = sampleFlight(launch, calm, 0.4);
    expect(flight.landing.z).toBeGreaterThan(8);
    expect(flight.flightTime).toBeGreaterThan(0.4);
    expect(flight.apex).toBeGreaterThan(launch.y);
  });

  it('shifts the landing when the wind blows across the field', () => {
    const launch = kickLaunch(0, 10, 'punt', 0.7, 0.7, 0, 1, 0, false, 1);
    const still = sampleFlight(launch, calm, 0.4);
    const blown = sampleFlight(launch, { rain: 0, windX: 3, windZ: 0 }, 0.4);
    expect(blown.landing.x).toBeGreaterThan(still.landing.x + 0.5);
  });

  it('sends a bomb higher than a grubber', () => {
    const bomb = sampleFlight(kickLaunch(0, 0, 'bomb', 0.78, 0.8, 0, 1, 0, false, 1), calm, 0.32);
    const grubber = sampleFlight(kickLaunch(0, 0, 'grubber', 0.62, 0.8, 0, 1, 0, false, 1), calm, 0.58);
    expect(bomb.apex).toBeGreaterThan(grubber.apex + 2);
  });

  it('labels a pass behind the carrier as a normal pass', () => {
    const played = openMatch();
    const passer = played.carrier();
    expect(passer).toBeTruthy();
    if (!passer) return;
    const mate = played.players.find((player) => player.onField && player.team === 0 && player.id !== passer.id);
    expect(mate).toBeTruthy();
    if (!mate) return;
    const sign = played.attackSign(0);
    mate.x = passer.x + 4;
    mate.z = passer.z - sign * 6;
    mate.vx = 0;
    mate.vz = 0;
    const preview = passPreview(played, passer, 0, 0, mate.id);
    expect(preview).not.toBeNull();
    expect(preview?.note.startsWith('Forward')).toBe(false);
    expect(preview?.receiverId).toBe(mate.id);
    expect(preview?.points.length).toBeGreaterThan(2);
  });

  it('previews a punt from the same kick the match releases', () => {
    const played = openMatch();
    const kicker = played.carrier();
    expect(kicker).toBeTruthy();
    if (!kicker) return;
    const preview = kickPreview(played, kicker, 'punt', 0.78, 0, played.attackSign(kicker.team));
    expect(preview.mode).toBe('kick');
    expect(preview.points.length).toBeGreaterThan(2);
    expect(preview.flightTime).toBeGreaterThan(0.3);
    expect(preview.note.length).toBeGreaterThan(0);
  });
});
