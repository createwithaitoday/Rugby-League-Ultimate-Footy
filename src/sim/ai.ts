import type {
  CarrierDecision,
  KickKind,
  MatchView,
  Player,
  TargetOrder,
  TeamId,
} from './types';
import { FIELD } from './types';

/** Lateral offset by squad index, metres to the attacker's right. */
const ATTACK_LAT = [0, 27, 14, -14, -27, 6, -5, -3.4, 0.2, 3.4, -9, 9, 0.6];
const ATTACK_BEHIND = [13, 1.1, 1.5, 1.5, 1.1, 3.4, 4.4, 1.2, 2.5, 1.2, 2.3, 2.3, 1.5];
const DEF_LAT = [0, 26, 14, -14, -26, 6.5, -5, -3.6, 0.7, 3.6, -10, 10, 0];
const DEF_DEPTH = [18, 5.5, 2.4, 2.4, 5.5, 2.5, 2.8, 1.7, 1.3, 1.7, 2.3, 2.3, 1.6];

function latOf(p: Player, table: number[]): number {
  if (p.squadIndex >= 0 && p.squadIndex < table.length) return table[p.squadIndex];
  if (p.role === 'prop') return p.number % 2 === 0 ? -4 : 4;
  if (p.role === 'wing') return p.side >= 0 ? 26 : -26;
  if (p.role === 'centre') return p.side >= 0 ? 14 : -14;
  if (p.role === 'second_row') return p.side >= 0 ? 10 : -10;
  return 0;
}

function behindOf(p: Player): number {
  if (p.squadIndex >= 0 && p.squadIndex < ATTACK_BEHIND.length) return ATTACK_BEHIND[p.squadIndex];
  return 3;
}

export function worldPoint(
  originX: number,
  originZ: number,
  sign: number,
  lateral: number,
  behind: number,
): { x: number; z: number } {
  return {
    x: clamp(originX + lateral * sign, -FIELD.width + 1.5, FIELD.width - 1.5),
    z: clamp(originZ - behind * sign, -FIELD.dead + 1, FIELD.dead - 1),
  };
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function metresToGoal(view: MatchView, team: TeamId, z: number): number {
  const sign = view.attackSign(team);
  return (FIELD.length * sign - z) * sign;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function opponents(view: MatchView, team: TeamId): Player[] {
  return view.players.filter((p) => p.onField && p.team !== team);
}

function teammates(view: MatchView, team: TeamId): Player[] {
  return view.players.filter((p) => p.onField && p.team === team);
}

export function isAhead(sign: number, fromZ: number, toZ: number, margin = 0.45): boolean {
  return (toZ - fromZ) * sign > margin;
}

export function legalReceivers(view: MatchView, passer: Player): Player[] {
  const sign = view.attackSign(passer.team);
  return teammates(view, passer.team).filter((r) => {
    if (r.id === passer.id || r.offside) return false;
    if (isAhead(sign, passer.z, r.z, 0.35)) return false;
    const d = dist(passer.x, passer.z, r.x, r.z);
    return d >= 1.4 && d <= 18;
  });
}

export function chooseReceiver(
  view: MatchView,
  passer: Player,
  dirX: number,
  dirZ: number,
  assisted: boolean,
): Player | null {
  const legal = legalReceivers(view, passer);
  if (!legal.length) return null;
  const dirLen = Math.hypot(dirX, dirZ);
  const sign = view.attackSign(passer.team);
  const aimingForward = dirLen > 0.25 && dirZ * sign > 0.45 && Math.abs(dirZ) > Math.abs(dirX) * 0.75;
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const r of legal) {
    const dx = r.x - passer.x;
    const dz = r.z - passer.z;
    const d = Math.hypot(dx, dz) || 1;
    const align = dirLen > 0.2 ? (dx * dirX + dz * dirZ) / (d * dirLen) : 0.15;
    const space = spaceAround(view, r);
    let score = align * 2.4 + space * 0.35 - d * 0.04 + r.attrs.catching * 0.3;
    if (view.tactics[passer.team].attack === 'wide' && Math.abs(r.x - passer.x) > 10) score += 0.6;
    if (view.tactics[passer.team].attack === 'middle' && Math.abs(r.x - passer.x) < 6 && isForward(r)) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (assisted && (aimingForward || bestScore < 0.05)) {
    best = bestSupport(view, passer, legal);
  }
  return best;
}

function isForward(p: Player): boolean {
  return p.role === 'prop' || p.role === 'lock' || p.role === 'second_row' || p.role === 'hooker';
}

function spaceAround(view: MatchView, p: Player): number {
  let nearest = 12;
  for (const d of opponents(view, p.team)) {
    nearest = Math.min(nearest, dist(p.x, p.z, d.x, d.z));
  }
  return nearest;
}

function bestSupport(view: MatchView, passer: Player, legal: Player[]): Player | null {
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const r of legal) {
    const space = spaceAround(view, r);
    const d = dist(passer.x, passer.z, r.x, r.z);
    let score = space * 0.5 - Math.abs(d - 6) * 0.08 + r.attrs.catching * 0.2;
    if (r.role === 'hooker' || r.role === 'halfback' || r.role === 'five_eighth') score += 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function laneScore(view: MatchView, carrier: Player, lateral: number): number {
  const sign = view.attackSign(carrier.team);
  const tx = carrier.x + lateral;
  let pen = 0;
  if (Math.abs(tx) > FIELD.width - 2) pen += 5;
  for (const d of opponents(view, carrier.team)) {
    const dz = (d.z - carrier.z) * sign;
    if (dz < -0.5 || dz > 12) continue;
    const dx = Math.abs(d.x - tx);
    if (dx < 1.8) pen += dz < 4 ? 3.2 : 2.2;
    else if (dx < 3.6) pen += 1;
  }
  return 7.5 - pen;
}

function bestLane(view: MatchView, carrier: Player): { lateral: number; score: number } {
  let best = { lateral: 0, score: -99 };
  for (const lateral of [-8, -4, -2, 0, 2, 4, 8]) {
    const score = laneScore(view, carrier, lateral);
    if (score > best.score) best = { lateral, score };
  }
  return best;
}

function landingSpot(view: MatchView): { x: number; z: number } {
  const b = view.ball;
  if (b.mode !== 'flight') return { x: b.x, z: b.z };
  const g = 9.81;
  const disc = b.vy * b.vy + 2 * g * Math.max(0, b.y);
  const t = Math.min(3.2, (b.vy + Math.sqrt(Math.max(0, disc))) / g);
  return {
    x: clamp(b.x + b.vx * t, -FIELD.width + 1, FIELD.width - 1),
    z: clamp(b.z + b.vz * t, -FIELD.dead + 1, FIELD.dead - 1),
  };
}

function markerIds(view: MatchView): number[] {
  if (!view.ruck || (view.phase !== 'play_the_ball' && view.phase !== 'tackle')) return [];
  const sign = view.attackSign(view.possession);
  const ranked = opponents(view, view.possession)
    .map((d) => ({ d, dist: dist(d.x, d.z, view.ruck!.x, view.ruck!.z) }))
    .sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, 2).map((r) => r.d.id).filter((_, i) => ranked[i].dist < 14 || i < 2)
    .slice(0, 2)
    .filter((id) => {
      const d = view.players.find((p) => p.id === id)!;
      const behind = (view.ruck!.z - d.z) * sign;
      return behind < 16;
    });
}

export function planTargets(view: MatchView): TargetOrder[] {
  if (view.phase === 'half_time' || view.phase === 'full_time' || view.phase === 'prematch') return [];
  if (view.phase === 'try' || view.phase === 'conversion' || view.phase === 'scrum') return [];
  const orders: TargetOrder[] = [];
  const ballX = view.ball.mode === 'held' ? (view.players.find((p) => p.hasBall)?.x ?? view.ball.x) : view.ball.x;
  const ballZ = view.ball.mode === 'held' ? (view.players.find((p) => p.hasBall)?.z ?? view.ball.z) : view.ball.z;
  const landing = landingSpot(view);
  const markers = new Set(markerIds(view));
  const carrier = view.players.find((p) => p.hasBall) ?? null;
  const sign = view.attackSign(view.possession);
  const defence = view.tactics[view.possession === 0 ? 1 : 0];
  const attackTac = view.tactics[view.possession];
  const diffPush = view.difficulty === 'representative' ? 0.82 : view.difficulty === 'rookie' ? 1.18 : 1;
  const last = view.tackleCount >= view.rules.tacklesPerSet - 1;

  for (const p of view.players) {
    if (!p.onField || p.lockPosition) continue;
    if (carrier && p.id === carrier.id) continue;
    const onAttack = p.team === view.possession;
    if (onAttack) {
      orders.push(attackOrder(view, p, ballX, ballZ, sign, attackTac.attack, last, carrier));
    } else {
      orders.push(defenceOrder(view, p, ballX, ballZ, sign, defence.defence, markers, landing, diffPush, last));
    }
  }
  return orders;
}

function attackOrder(
  view: MatchView,
  p: Player,
  ballX: number,
  ballZ: number,
  sign: number,
  style: MatchView['tactics'][0]['attack'],
  last: boolean,
  carrier: Player | null,
): TargetOrder {
  let lateral = latOf(p, ATTACK_LAT);
  let behind = behindOf(p);
  if (style === 'middle') lateral *= p.role === 'wing' ? 1 : 0.82;
  if (style === 'wide') lateral *= 1.08;
  if (style === 'tempo') behind = Math.max(0.8, behind - 0.6);
  if (p.role === 'fullback' && last && metresToGoal(view, p.team, ballZ) < 28) behind = 5;
  if (view.phase === 'in_flight' && view.ball.kick) {
    const spot = landingSpot(view);
    if (p.role === 'fullback' || p.role === 'wing') {
      return {
        id: p.id, x: spot.x + lateral * 0.15, z: spot.z - sign * (p.role === 'fullback' ? 1 : 3),
        sprint: true, engage: false, marker: false, intent: 'kick-chase',
      };
    }
  }
  const spot = worldPoint(ballX, ballZ, sign, lateral, behind);
  let x = spot.x;
  let z = spot.z;
  let sprint = style === 'tempo' || (carrier ? dist(p.x, p.z, carrier.x, carrier.z) > 8 : false);
  let intent = 'shape';
  if (carrier && isSupport(p, carrier)) {
    const side = lateral >= 0 ? 1 : -1;
    const trail = worldPoint(carrier.x, carrier.z, sign, side * 3.2, 3.2);
    x = x * 0.45 + trail.x * 0.55;
    z = z * 0.45 + trail.z * 0.55;
    sprint = true;
    intent = 'support';
  }
  if (view.phase === 'play_the_ball' && p.role === 'hooker') {
    const dh = worldPoint(ballX, ballZ, sign, 0.3, 1.6);
    x = dh.x;
    z = dh.z;
    sprint = true;
    intent = 'dummy-half';
  }
  if (view.phase === 'loose') {
    const d = dist(p.x, p.z, view.ball.x, view.ball.z);
    if (d < 18) {
      x = view.ball.x;
      z = view.ball.z - sign * 0.4;
      sprint = true;
      intent = 'scoop';
    }
  }
  if (p.fatigue > 0.72) sprint = false;
  return { id: p.id, x, z, sprint, engage: false, marker: false, intent };
}

function isSupport(p: Player, carrier: Player): boolean {
  if (p.role === 'hooker' || p.role === 'halfback' || p.role === 'five_eighth') return true;
  return Math.abs(p.x - carrier.x) < 12 && Math.abs(p.z - carrier.z) < 8;
}

function defenceOrder(
  view: MatchView,
  p: Player,
  ballX: number,
  ballZ: number,
  attackSign: number,
  style: MatchView['tactics'][0]['defence'],
  markers: Set<number>,
  landing: { x: number; z: number },
  diffPush: number,
  last: boolean,
): TargetOrder {
  const slide = style === 'slide' ? 0.62 : style === 'edge' ? 0.28 : style === 'compressed' ? 0.48 : 0.4;
  const compress = style === 'compressed' ? 0.78 : style === 'edge' ? 1.06 : 1;
  // Attacker's right flips with the attacking direction. Defenders face that attack,
  // so a right-side wing stays on the attacker's right-hand touchline.
  const base = -latOf(p, DEF_LAT) * compress * attackSign;
  const lateral = clamp(base + ballX * slide, -FIELD.width + 2, FIELD.width - 2);
  let depth = (DEF_DEPTH[p.squadIndex] ?? 3) * diffPush;
  if (style === 'aggressive') depth *= 0.78;
  if (style === 'compressed') depth += 0.4;
  if (p.role === 'fullback') depth = last ? 12 : 18;
  if (p.role === 'wing') depth = Math.max(depth, style === 'edge' ? 6.5 : 4.5);
  if (view.phase === 'play_the_ball' || view.phase === 'restart' || view.phase === 'tackle') {
    if (!markers.has(p.id)) depth = Math.max(view.rules.tenMetres + 0.6, depth);
    else depth = 1.05;
  } else if (view.phase === 'open_play') {
    const pressed = style === 'aggressive' ? 3.1 : style === 'compressed' ? 5.2 : 4.2;
    depth = Math.max(2.4, Math.min(depth, pressed * diffPush));
  }
  if (markers.has(p.id) && (view.phase === 'play_the_ball' || view.phase === 'tackle')) {
    const side = p.side === 0 ? (p.number % 2 === 0 ? -1 : 1) : p.side;
    const spot = worldPoint(view.ruck?.x ?? ballX, view.ruck?.z ?? ballZ, attackSign, side * 0.55, -0.9);
    // behind negative means in front of the ball (toward attack). Markers stand just in front of the tackled player.
    return {
      id: p.id,
      x: spot.x,
      z: spot.z,
      sprint: false,
      engage: false,
      marker: true,
      intent: 'marker',
    };
  }
  // Goal-side of the ball: between the carrier and the try-line they are defending.
  let spot = { x: lateral, z: ballZ + depth * attackSign };
  let sprint = style === 'aggressive' && view.phase === 'open_play' && p.fatigue < 0.62;
  let intent = style === 'slide' ? 'slide' : style === 'edge' ? 'edge' : 'line';
  let engage = false;
  if (view.ball.mode === 'flight' && view.ball.kick) {
    const chase = p.role === 'fullback' || p.role === 'wing' || p.role === 'centre';
    if (chase) {
      spot = { x: landing.x + (p.role === 'wing' ? latOf(p, DEF_LAT) * 0.2 : 0), z: landing.z };
      sprint = true;
      intent = 'kick-cover';
    }
  }
  if (view.phase === 'loose') {
    spot = { x: view.ball.x, z: view.ball.z };
    sprint = true;
    intent = 'scoop';
  }
  const carrier = view.players.find((pl) => pl.hasBall);
  if (carrier && view.phase === 'open_play') {
    const d = dist(p.x, p.z, carrier.x, carrier.z);
    const nearest = isAmongNearest(view, p, carrier, 2);
    if (nearest && d < 2.5 && !p.offside) {
      engage = true;
      sprint = true;
      intent = 'tackle';
      spot = { x: carrier.x, z: carrier.z };
    }
  }
  if (p.fatigue > 0.75) sprint = false;
  return {
    id: p.id,
    x: clamp(spot.x, -FIELD.width + 1, FIELD.width - 1),
    z: clamp(spot.z, -FIELD.dead + 1, FIELD.dead - 1),
    sprint,
    engage,
    marker: false,
    intent,
  };
}

function isAmongNearest(view: MatchView, p: Player, carrier: Player, n: number): boolean {
  const ranks = opponents(view, carrier.team)
    .map((d) => ({ id: d.id, d: dist(d.x, d.z, carrier.x, carrier.z) }))
    .sort((a, b) => a.d - b.d);
  return ranks.slice(0, n).some((r) => r.id === p.id);
}

let decisionSerial = 1;

export function planCarrier(view: MatchView, carrier: Player): CarrierDecision | null {
  if (!carrier.hasBall) return null;
  if (view.phase !== 'open_play' && view.phase !== 'kickoff' && view.phase !== 'tackle') return null;
  const emergency = nearestOpponentDistance(view, carrier) < 1.35 && view.phase === 'open_play';
  if (carrier.decision && view.elapsed < carrier.decision.until && !emergency) {
    return { ...carrier.decision, score: 0 };
  }
  if (view.phase === 'tackle') {
    return offloadDecision(view, carrier);
  }
  const sign = view.attackSign(carrier.team);
  const lane = bestLane(view, carrier);
  const metres = metresToGoal(view, carrier.team, carrier.z);
  const last = view.tackleCount >= view.rules.tacklesPerSet - 1;
  const tactic = view.tactics[carrier.team];
  const options: CarrierDecision[] = [];

  const carryScore = lane.score
    + (isForward(carrier) && view.tackleCount <= 2 ? 1.4 : 0)
    + (tactic.attack === 'middle' && isForward(carrier) ? 1.1 : 0)
    + (metres < 10 ? 2.2 : 0)
    + carrier.attrs.ballCarry * 0.4;
  options.push(make(carrier, 'carry', carryScore, lane.lateral * 0.15, sign, 'punt', {
    intent: lane.score > 5 ? 'line-break' : isForward(carrier) ? 'hit-up' : 'run',
  }));

  if (metres < 7 && lane.score > 2) {
    options.push(make(carrier, 'dive', carryScore + 1.5, 0, sign, 'punt', { intent: 'dive' }));
  }

  for (const r of legalReceivers(view, carrier)) {
    const dx = r.x - carrier.x;
    const dz = r.z - carrier.z;
    const space = spaceAround(view, r);
    let score = space * 0.55 + r.attrs.catching * 0.4 - Math.abs(Math.hypot(dx, dz) - 7) * 0.05;
    if (tactic.attack === 'wide' && Math.abs(dx) > 10) score += 1.6;
    if (tactic.attack === 'middle' && Math.abs(dx) < 5 && isForward(r)) score += 1.3;
    if (tactic.attack === 'completion') score += space > 4 ? 0.4 : -0.6;
    if (view.tackleCount <= 1 && (carrier.role === 'halfback' || carrier.role === 'hooker' || carrier.role === 'five_eighth') && isForward(r)) {
      score += 1.5;
    }
    if (view.tackleCount >= 2 && view.tackleCount <= 4 && (r.role === 'centre' || r.role === 'five_eighth' || r.role === 'wing')) {
      score += tactic.attack === 'wide' ? 1.2 : 0.35;
    }
    options.push(make(carrier, 'pass', score, dx, dz, 'punt', { intent: Math.abs(dx) > 10 ? 'shift' : 'pass', targetId: r.id }));
  }

  const kick = chooseKick(view, carrier, metres, last, lane.score);
  if (kick) options.push(kick);

  let ranked = options.sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (view.difficulty === 'rookie' && ranked.length > 1 && view.tackleCount % 2 === 0 && ranked[1].score > ranked[0].score - 1.8) {
    ranked = [ranked[1], ranked[0], ...ranked.slice(2)];
  }
  const chosen = ranked[0];
  chosen.serial = ++decisionSerial;
  const pressure = nearestOpponentDistance(view, carrier);
  const hold = chosen.type === 'carry' ? (pressure < 2 ? 0.35 : 0.7) : 0.25;
  chosen.until = view.elapsed + hold;
  return chosen;
}

function offloadDecision(view: MatchView, carrier: Player): CarrierDecision | null {
  if (view.phaseTime > 0.36) return null;
  const support = legalReceivers(view, carrier).sort((a, b) => spaceAround(view, b) - spaceAround(view, a))[0];
  if (!support) return null;
  if (carrier.attrs.passing + carrier.attrs.balance < 1.15 && view.difficulty !== 'rookie') return null;
  const score = spaceAround(view, support);
  if (score < 2.4) return null;
  const d = make(carrier, 'pass', score, support.x - carrier.x, support.z - carrier.z, 'punt', {
    intent: 'offload',
    targetId: support.id,
  });
  d.serial = ++decisionSerial;
  d.until = view.elapsed + 0.2;
  return d;
}

function chooseKick(
  view: MatchView,
  carrier: Player,
  metres: number,
  last: boolean,
  lane: number,
): CarrierDecision | null {
  const sign = view.attackSign(carrier.team);
  const tactic = view.tactics[carrier.team];
  const inGoalRange = metres < 35 && metres > 14 && Math.abs(carrier.x) < 16;
  if (!last && !(tactic.attack === 'territory' && view.tackleCount >= 4 && metres > 40)) {
    return null;
  }
  if (last && metres < 12 && lane > 2.5) return null;

  let kind: KickKind = 'punt';
  let score = 3.2;
  let dirX = 0;
  let dirZ = sign;
  let power = 0.72;
  let intent = 'kick';

  if (inGoalRange && (last || view.clock > view.rules.halfSeconds * 0.72)) {
    const diff = view.score[carrier.team] - view.score[1 - carrier.team];
    let fg = 3.4 - metres / 22 - Math.abs(carrier.x) / 18 + carrier.attrs.kickAccuracy * 1.4;
    if (diff > 8) fg -= 2.5;
    if (diff < 0 && diff >= -6) fg += 1.4;
    if (fg > score) {
      kind = 'field_goal';
      score = fg;
      intent = 'field-goal';
      power = 0.7;
    }
  }

  if (metres < 30 && tactic.kick === 'contest') {
    const bomb = 4.1 + (tactic.kick === 'contest' ? 0.4 : 0) - (lane > 5 ? 1.5 : 0);
    if (bomb > score) {
      kind = 'bomb';
      score = bomb;
      intent = 'bomb';
      power = 0.66;
      dirX = carrier.x > 0 ? 0.25 : -0.25;
    }
  }
  if (metres < 25 && (tactic.kick === 'short' || lane < 3)) {
    const grub = 3.8 + (tactic.kick === 'short' ? 0.7 : 0);
    if (grub > score) {
      kind = 'grubber';
      score = grub;
      intent = 'grubber';
      power = 0.62;
    }
  }
  if (metres >= 30 || tactic.attack === 'territory' || tactic.kick === 'deep') {
    const deep = (last ? 4.4 : 2.4) + (tactic.kick === 'deep' || tactic.attack === 'territory' ? 0.8 : 0);
    if (deep > score) {
      kind = Math.abs(carrier.x) < 12 ? 'punt' : 'touch_finder';
      score = deep;
      intent = kind === 'touch_finder' ? 'find-touch' : 'territory';
      power = 0.8;
      if (kind === 'touch_finder') dirX = carrier.x >= 0 ? 0.85 : -0.85;
    }
  }
  if (!last && tactic.attack !== 'territory') score -= 1.2;
  if (last && metres > 22) score += 2.4;
  if (score < 2.6) return null;
  return make(carrier, 'kick', score, dirX, dirZ, kind, { intent, power });
}

function nearestOpponentDistance(view: MatchView, p: Player): number {
  let n = 99;
  for (const d of opponents(view, p.team)) n = Math.min(n, dist(p.x, p.z, d.x, d.z));
  return n;
}

function make(
  _carrier: Player,
  type: CarrierDecision['type'],
  score: number,
  dirX: number,
  dirZ: number,
  kick: KickKind,
  extra: { intent: string; targetId?: number; power?: number },
): CarrierDecision {
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    serial: 0,
    type,
    until: 0,
    dirX: dirX / len,
    dirZ: dirZ / len,
    targetId: extra.targetId ?? -1,
    kick,
    power: extra.power ?? 0.7,
    intent: extra.intent,
    score,
  };
}

/** Tackle outcome from the players involved. Pure and deterministic. */
export function gradeTackle(carrier: Player, tacklers: Player[]): 'broken' | 'completed' | 'dominant' {
  let power = 0;
  for (const t of tacklers) {
    const closing = Math.max(0, (carrier.x - t.x) * t.vx + (carrier.z - t.z) * t.vz);
    const spd = clamp(0.55 + closing / 8, 0.55, 1.25);
    const angle = approachAngle(t, carrier);
    power += t.attrs.tackling * (1 - t.fatigue * 0.35) * angle * spd * (1 - t.fatigue * 0.1 + t.attrs.strength * 0.15);
  }
  if (tacklers.length >= 2) power *= 1.12 + Math.min(0.2, (tacklers.length - 2) * 0.05);
  const momentum = clamp(Math.hypot(carrier.vx, carrier.vz) / 8, 0.45, 1.2);
  const carry = carrier.attrs.ballCarry * (0.65 + carrier.attrs.balance * 0.5) * (1 - carrier.fatigue * 0.32) * momentum;
  const ratio = power / Math.max(0.25, carry);
  if (ratio < 0.78) return 'broken';
  if (ratio > 1.38 || tacklers.length >= 3) return 'dominant';
  return 'completed';
}

function approachAngle(tackler: Player, carrier: Player): number {
  const dx = carrier.x - tackler.x;
  const dz = carrier.z - tackler.z;
  const d = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(carrier.facing);
  const fz = Math.cos(carrier.facing);
  const dot = (dx / d) * fx + (dz / d) * fz;
  // 1 = tackler is in front of the carrier, 0 side, negative behind.
  if (dot > 0.45) return 1;
  if (dot > -0.2) return 0.86;
  return 0.72;
}

export function maxSpeed(p: Player, now: number): number {
  const roleBase =
    p.role === 'wing' || p.role === 'fullback' ? 9.05
      : p.role === 'centre' ? 8.45
        : p.role === 'halfback' || p.role === 'five_eighth' || p.role === 'hooker' ? 8.0
          : p.role === 'second_row' || p.role === 'lock' ? 7.5
            : 6.8;
  const attr = 0.9 + 0.16 * p.attrs.speed;
  const fatigue = 1 - 0.3 * p.fatigue * p.fatigue;
  const burst = p.burstUntil > now ? 1.08 : 1;
  const stumble = p.stumbleUntil > now ? 0.32 : 1;
  return roleBase * attr * fatigue * burst * stumble;
}

export function acceleration(p: Player): number {
  return (10 + p.attrs.acceleration * 8) * (1 - p.fatigue * 0.25);
}
