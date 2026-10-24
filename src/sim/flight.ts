import type { KickKind, Weather } from './types';
import { FIELD } from './types';

export interface KickSpec {
  angle: number;
  min: number;
  max: number;
  err: number;
  rest: number;
}

/** Same numbers the match uses when it releases a kick. */
export const KICK_SPECS: Record<KickKind, KickSpec> = {
  punt: { angle: 0.58, min: 16, max: 28, err: 0.16, rest: 0.4 },
  grubber: { angle: 0.1, min: 13, max: 21, err: 0.07, rest: 0.58 },
  bomb: { angle: 1.02, min: 15, max: 23, err: 0.12, rest: 0.32 },
  chip: { angle: 0.52, min: 10, max: 16, err: 0.1, rest: 0.4 },
  touch_finder: { angle: 0.66, min: 18, max: 30, err: 0.12, rest: 0.38 },
  kickoff: { angle: 0.78, min: 20, max: 26, err: 0.06, rest: 0.36 },
  dropout: { angle: 0.72, min: 18, max: 26, err: 0.08, rest: 0.36 },
  conversion: { angle: 0.5, min: 20, max: 24, err: 0, rest: 0.3 },
  penalty_goal: { angle: 0.5, min: 20, max: 24, err: 0, rest: 0.3 },
  field_goal: { angle: 0.48, min: 16, max: 24, err: 0.12, rest: 0.34 },
};

export interface Launch {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function passLaunch(
  x: number,
  z: number,
  facing: number,
  passing: number,
  tx: number,
  tz: number,
): Launch {
  const dx = tx - x;
  const dz = tz - z;
  const dist = Math.max(1, Math.hypot(dx, dz));
  const speed = Math.min(18.5, (10.5 + dist * 0.32) * (0.88 + passing * 0.2));
  return {
    x: x + Math.sin(facing) * 0.3,
    z: z + Math.cos(facing) * 0.3,
    y: 1.2,
    vx: (dx / dist) * speed,
    vz: (dz / dist) * speed,
    vy: 1.6 + Math.min(2.4, dist * 0.08),
  };
}

export function kickLaunch(
  x: number,
  z: number,
  kind: KickKind,
  power: number,
  kickPower: number,
  dirX: number,
  dirZ: number,
  yawError: number,
  blocked: boolean,
  attackSign: number,
): Launch {
  let dx = dirX;
  let dz = dirZ;
  if (Math.hypot(dx, dz) < 0.15) {
    dx = 0;
    dz = attackSign;
  }
  if (kind === 'touch_finder' && Math.abs(dx) < 0.3) dx = x >= 0 ? 0.9 : -0.9;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const spec = KICK_SPECS[kind];
  const yaw = Math.atan2(dx, dz) + yawError;
  const speed = (spec.min + (spec.max - spec.min) * power) * (0.8 + 0.28 * kickPower);
  const launch: Launch = {
    x,
    z,
    y: kind === 'grubber' ? 0.32 : 0.85,
    vx: Math.sin(yaw) * speed * Math.cos(spec.angle),
    vz: Math.cos(yaw) * speed * Math.cos(spec.angle),
    vy: speed * Math.sin(spec.angle),
  };
  if (blocked) {
    launch.vx *= 0.2;
    launch.vz = -attackSign * 2.5;
    launch.vy = 1.4;
  }
  return launch;
}

export interface FlightSample {
  points: { x: number; y: number; z: number }[];
  landing: { x: number; z: number };
  flightTime: number;
  apex: number;
  crossedTouchInAir: boolean;
  inGoal: boolean;
}

/**
 * Steps the same forces as Match.integrateBall: wind, drag, gravity, then bounce.
 * The first ground contact is the landing the aim line shows.
 */
export function sampleFlight(
  start: Launch,
  wind: Weather,
  rest: number,
  dt = 1 / 30,
  maxTime = 4.2,
): FlightSample {
  let { x, y, z, vx, vy, vz } = start;
  const points = [{ x, y, z }];
  let t = 0;
  let bounced = false;
  let crossedTouchInAir = false;
  let mode: 'flight' | 'rolling' = 'flight';
  let apex = y;
  while (t < maxTime && points.length < 200) {
    vx += wind.windX * 0.32 * dt;
    vz += wind.windZ * 0.32 * dt;
    const drag = mode === 'rolling' ? 2.1 : 0.16;
    const decay = Math.exp(-drag * dt);
    vx *= decay;
    vz *= decay;
    if (mode !== 'rolling') vy -= 9.81 * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    apex = Math.max(apex, y);
    if (y <= 0.12) {
      y = 0.12;
      if (vy < 0) {
        bounced = true;
        vy = -vy * rest;
        vx *= 0.75;
        vz *= 0.75;
        if (Math.abs(vy) < 0.85) {
          vy = 0;
          mode = 'rolling';
        }
      }
    } else if (!bounced && Math.abs(x) > FIELD.width) {
      crossedTouchInAir = true;
    }
    points.push({ x, y, z });
    if (bounced && mode === 'rolling') break;
    if (Math.abs(z) > FIELD.dead + 6 || Math.abs(x) > FIELD.width + 14) break;
  }
  const landingPoint = points.find((point) => point.y <= 0.121) ?? points[points.length - 1];
  return {
    points,
    landing: { x: landingPoint.x, z: landingPoint.z },
    flightTime: t,
    apex,
    crossedTouchInAir,
    inGoal: Math.abs(landingPoint.z) > FIELD.length && Math.abs(landingPoint.z) < FIELD.dead,
  };
}
