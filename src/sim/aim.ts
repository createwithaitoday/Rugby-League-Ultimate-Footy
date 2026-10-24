import { chooseReceiver, legalReceivers } from './ai';
import { KICK_SPECS, kickLaunch, passLaunch, sampleFlight, type FlightSample } from './flight';
import type { KickKind, MatchView, Player } from './types';
import { FIELD } from './types';

export interface AimPoint {
  x: number;
  y: number;
  z: number;
}

export interface AimPreview {
  mode: 'pass' | 'kick';
  points: AimPoint[];
  spread: AimPoint[];
  landing: { x: number; z: number };
  flightTime: number;
  receiverId: number | null;
  catch: { x: number; z: number; radius: number } | null;
  risk: number;
  note: string;
  power: number;
}

function leadTarget(passer: Player, receiver: Player, sign: number): { x: number; z: number } {
  const lead = 0.25;
  let tx = receiver.x + receiver.vx * lead;
  let tz = receiver.z + receiver.vz * lead;
  if ((tz - passer.z) * sign > 0.15) tz = passer.z - sign * Math.max(1.2, Math.abs(tx - passer.x) * 0.05);
  return { x: tx, z: tz };
}

function laneRisk(view: MatchView, team: number, points: AimPoint[]): number {
  const foes = view.players.filter((player) => player.onField && player.team !== team);
  let hits = 0;
  for (const foe of foes) {
    let nearest = 99;
    for (const point of points) nearest = Math.min(nearest, Math.hypot(point.x - foe.x, point.z - foe.z));
    if (nearest < 1.35) hits += 1;
    else if (nearest < 2.4) hits += 0.45;
  }
  return Math.max(0, Math.min(1, hits / 2.2));
}

function trim(points: AimPoint[]): AimPoint[] {
  if (points.length <= 28) return points;
  const step = Math.ceil(points.length / 24);
  const kept = points.filter((_, index) => index % step === 0);
  kept.push(points[points.length - 1]);
  return kept;
}

export function passPreview(
  view: MatchView,
  passer: Player,
  dirX: number,
  dirZ: number,
  lockedId: number,
): AimPreview | null {
  const sign = view.attackSign(passer.team);
  const legal = legalReceivers(view, passer);
  const locked = legal.find((player) => player.id === lockedId) ?? null;
  const stick = Math.hypot(dirX, dirZ);
  const aimingForward = stick > 0.2 && dirZ * sign > 0.55 && Math.abs(dirZ) >= Math.abs(dirX) * 0.8;
  let target = locked && stick < 0.28 ? locked : chooseReceiver(view, passer, dirX, dirZ, true);
  if (locked && !aimingForward) target = locked;
  let tx: number;
  let tz: number;
  let receiverId: number | null = null;
  if (target && !aimingForward) {
    const led = leadTarget(passer, target, sign);
    tx = led.x;
    tz = led.z;
    receiverId = target.id;
  } else if (stick > 0.2) {
    const dist = 8;
    const len = stick || 1;
    tx = passer.x + (dirX / len) * dist;
    tz = passer.z + (dirZ / len) * dist;
    receiverId = target?.id ?? null;
  } else if (target) {
    const led = leadTarget(passer, target, sign);
    tx = led.x;
    tz = led.z;
    receiverId = target.id;
  } else {
    return null;
  }
  const launch = passLaunch(passer.x, passer.z, passer.facing, passer.attrs.passing, tx, tz);
  const flight = sampleFlight(launch, view.weather, 0.28, 1 / 20, 2.4);
  const forward = (tz - passer.z) * sign > 0.15;
  const risk = Math.min(1, laneRisk(view, passer.team, flight.points) + (forward ? 0.55 : 0));
  const name = target && receiverId === target.id ? target.name.split(' ').slice(-1)[0] : 'space';
  const pressure = view.players.some((player) => player.onField && player.team !== passer.team && Math.hypot(player.x - passer.x, player.z - passer.z) < 1.6);
  return {
    mode: 'pass',
    points: trim(flight.points),
    spread: [],
    landing: flight.landing,
    flightTime: flight.flightTime,
    receiverId,
    catch: receiverId === null ? null : { x: tx, z: tz, radius: 0.7 + (1 - (target?.attrs.catching ?? 0.7)) * 0.8 },
    risk,
    note: `${forward ? `Forward pass to ${name}` : pressure ? `Under pressure · ${name}` : `Pass · ${name}`} · ${flight.flightTime.toFixed(1)}s`,
    power: Math.min(1, Math.hypot(launch.vx, launch.vz) / 18),
  };
}

function chargeDownLikely(view: MatchView, kicker: Player): boolean {
  const sign = view.attackSign(kicker.team);
  return view.players.some((player) => {
    if (!player.onField || player.team === kicker.team) return false;
    const ahead = (player.z - kicker.z) * sign;
    return ahead > 0.2 && ahead < 1.2 && Math.abs(player.x - kicker.x) < 0.85;
  });
}

export function kickPreview(
  view: MatchView,
  kicker: Player,
  kind: KickKind,
  power: number,
  dirX: number,
  dirZ: number,
): AimPreview {
  const sign = view.attackSign(kicker.team);
  const blocked = chargeDownLikely(view, kicker);
  const spec = KICK_SPECS[kind];
  const base = kickLaunch(kicker.x, kicker.z, kind, power, kicker.attrs.kickPower, dirX, dirZ, 0, blocked, sign);
  const rain = view.weather.rain > 0 ? 1.15 : 1;
  const yaw = spec.err * 0.5 * rain * (1.05 - kicker.attrs.kickAccuracy);
  const flight = sampleFlight(base, view.weather, spec.rest);
  const side = yaw > 0.02
    ? sampleFlight(
      kickLaunch(kicker.x, kicker.z, kind, power, kicker.attrs.kickPower, dirX, dirZ, yaw, blocked, sign),
      view.weather,
      spec.rest,
    )
    : flight;
  const risk = Math.min(1, laneRisk(view, kicker.team, flight.points) * 0.45 + (blocked ? 0.7 : 0) + (flight.crossedTouchInAir ? 0.35 : 0));
  const wind = Math.hypot(view.weather.windX, view.weather.windZ);
  const where = flight.crossedTouchInAir
    ? 'Out on the full'
    : Math.abs(flight.landing.x) > FIELD.width
      ? 'Lands in touch'
      : flight.inGoal
        ? 'In goal'
        : blocked
          ? 'Charge-down'
          : kind.replace('_', ' ');
  const windNote = wind > 0.15 ? ' · wind' : '';
  return {
    mode: 'kick',
    points: trim(flight.points),
    spread: trim(side.points),
    landing: flight.landing,
    flightTime: flight.flightTime,
    receiverId: null,
    catch: { x: flight.landing.x, z: flight.landing.z, radius: 1.1 + yaw * 8 },
    risk,
    note: `${where} · ${flight.flightTime.toFixed(1)}s${windNote}`,
    power,
  };
}

export function flightApex(sample: FlightSample): number {
  return sample.apex;
}
