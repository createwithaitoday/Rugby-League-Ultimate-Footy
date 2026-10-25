import type { StadiumInfo } from '../data/teams';
import type { AimPreview } from '../sim/aim';
import type { Match } from '../sim/match';
import type { Action, Snapshot } from '../sim/types';
import type { CameraMode, FieldView } from './view';

const SKIN = ['#f3d2b5', '#e0ac7e', '#c68642', '#8d5524', '#6b3a22', '#3d2416'];

/**
 * Flat broadcast pitch used when the browser cannot create a WebGL context.
 * The match engine is unchanged. Screen-up is still the attacking direction.
 */
export class Pitch2D implements FieldView {
  replaying = false;
  lost = false;
  private readonly ctx: CanvasRenderingContext2D;
  private stadium: StadiumInfo | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private quality: 'low' | 'medium' | 'high' = 'medium';
  private shake = 0;
  private time = 0;
  private replay: Snapshot[] = [];
  private replayT = 0;
  private readonly replayDur = 3.2;
  private frame: DrawFrame | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is unavailable');
    this.ctx = ctx;
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.quality = quality;
    this.dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
    this.applySize();
  }

  setStadium(info: StadiumInfo): void {
    this.stadium = info;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applySize();
  }

  punch(amount = 0.35): void {
    this.shake = Math.max(this.shake, amount);
  }

  startReplay(frames: Snapshot[], _duration?: number): void {
    if (frames.length < 2) return;
    this.replay = frames;
    this.replayT = 0;
    this.replaying = true;
  }

  skipReplay(): void {
    this.replaying = false;
  }

  update(dt: number, match: Match | null, mode: CameraMode, showTen: boolean, menu: boolean): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    if (!match) {
      this.frame = null;
      return;
    }
    let ball = { x: match.ball.x, y: match.ball.y, z: match.ball.z };
    let players = match.players.map((player) => ({
      x: player.x,
      z: player.z,
      facing: player.facing,
      action: player.action as Action,
      team: player.team,
      number: player.number,
      skin: player.look.skin,
      primary: player.primary,
      secondary: player.secondary,
      onField: player.onField,
      hasBall: player.hasBall,
      id: player.id,
      sprint: player.sprint,
    }));
    if (this.replaying) {
      this.replayT += dt;
      const sample = sampleReplay(this.replay, Math.min(1, this.replayT / this.replayDur));
      if (sample) {
        ball = sample.ball;
        players = players.map((player, index) => {
          const snap = sample.players[index];
          return snap ? { ...player, ...snap, sprint: false } : player;
        });
      }
      if (this.replayT >= this.replayDur) this.replaying = false;
    }
    const sign = match.attackSign(match.possession);
    this.frame = {
      match,
      ball,
      players,
      mode: menu || match.phase === 'prematch' ? 'tactical' : mode,
      menu: menu || match.phase === 'prematch',
      sign,
      showTen: showTen && match.phase === 'play_the_ball' && match.ruck !== null,
      tenZ: match.ruck ? match.ruck.z + sign * match.rules.tenMetres : 0,
      controlledId: match.controlledId,
    };
  }

  render(): void {
    const ctx = this.ctx;
    const frame = this.frame;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const night = this.stadium?.night ?? true;
    ctx.fillStyle = night ? '#071018' : '#8eb4d4';
    ctx.fillRect(0, 0, this.width, this.height);
    if (!frame) return;
    const cam = this.camera(frame);
    this.stands(ctx, cam, night);
    this.pitch(ctx, cam);
    this.markings(ctx, cam);
    this.posts(ctx, cam, 50);
    this.posts(ctx, cam, -50);
    if (frame.showTen) this.tenLine(ctx, cam, frame.tenZ);
    const order = frame.players.filter((player) => player.onField).sort((a, b) => cam.depth(a) - cam.depth(b));
    for (const player of order) this.player(ctx, cam, player, player.id === frame.controlledId);
    this.guide(ctx, cam, frame.match.aim);
    this.ball(ctx, cam, frame.ball);
    if (this.stadium && (frame.menu || frame.mode === 'tactical')) {
      ctx.fillStyle = 'rgba(244,240,230,0.9)';
      ctx.font = '600 14px Barlow, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${this.stadium.name} · ${this.stadium.city}`, 16, 28);
    }
  }

  private applySize(): void {
    const canvas = this.ctx.canvas;
    canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
  }

  private camera(frame: DrawFrame): Cam {
    const { width, height } = this;
    const tactical = frame.mode === 'tactical' || frame.menu;
    const broadcast = frame.mode === 'broadcast' && !frame.menu;
    const span = tactical ? 92 : broadcast ? 74 : this.replaying ? 42 : 54;
    const scale = Math.min(width / span, height / (tactical ? 132 : span * 0.78));
    const sign = frame.sign;
    const focusZ = frame.menu ? Math.sin(this.time * 0.15) * 8 : frame.ball.z - (tactical ? 0 : sign * (broadcast ? 0 : 7));
    const focusX = frame.menu ? 0 : frame.ball.x * (tactical ? 0.15 : 0.35);
    const shakeX = this.shake > 0 ? Math.sin(this.time * 40) * this.shake * 10 : 0;
    const shakeY = this.shake > 0 ? Math.cos(this.time * 35) * this.shake * 6 : 0;
    return new Cam(width / 2 + shakeX, tactical ? height / 2 + shakeY : height * 0.58 + shakeY, scale, sign, broadcast, focusX, focusZ);
  }

  private stands(ctx: CanvasRenderingContext2D, cam: Cam, night: boolean): void {
    const seatA = this.stadium?.seatA ?? '#0c2340';
    const seatB = this.stadium?.seatB ?? '#e2b657';
    ctx.fillStyle = night ? '#101820' : '#d5e0ea';
    this.worldRect(ctx, cam, -46, -66, 92, 132);
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = row % 2 === 0 ? seatA : seatB;
      const inset = 40 + row * 1.15;
      this.strokeRect(ctx, cam, -inset, -(58 + row * 1.3), inset * 2, (58 + row * 1.3) * 2);
    }
    ctx.fillStyle = this.stadium?.accent ?? '#d7e2ea';
    this.worldRect(ctx, cam, -36.2, -52, 1.1, 104);
    this.worldRect(ctx, cam, 35.1, -52, 1.1, 104);
  }

  private pitch(ctx: CanvasRenderingContext2D, cam: Cam): void {
    const night = this.stadium?.night ?? true;
    for (let i = 0; i < 12; i++) {
      const z = -58 + i * (116 / 12);
      ctx.fillStyle = i % 2 === 0 ? (night ? '#1c6b34' : '#2f8f45') : (night ? '#17602e' : '#27863c');
      this.worldRect(ctx, cam, -34, z, 68, 116 / 12 + 0.05);
    }
    ctx.fillStyle = night ? 'rgba(8, 40, 18, 0.28)' : 'rgba(255,255,255,0.08)';
    this.worldRect(ctx, cam, -34, 50, 68, 8);
    this.worldRect(ctx, cam, -34, -58, 68, 8);
  }

  private markings(ctx: CanvasRenderingContext2D, cam: Cam): void {
    ctx.strokeStyle = 'rgba(244,240,230,0.88)';
    ctx.lineWidth = 1.4;
    this.strokeRect(ctx, cam, -34, -50, 68, 100);
    this.strokeRect(ctx, cam, -34, -58, 68, 116);
    for (const z of [0, 10, -10, 20, -20, 30, -30, 40, -40]) {
      this.line(ctx, cam, -34, z, 34, z);
    }
    ctx.strokeStyle = 'rgba(244,240,230,0.45)';
    this.line(ctx, cam, 0, -10, 0, 10);
  }

  private posts(ctx: CanvasRenderingContext2D, cam: Cam, goalZ: number): void {
    const dir = goalZ > 0 ? 1 : -1;
    ctx.strokeStyle = '#f4f0e6';
    ctx.lineWidth = 2;
    this.line(ctx, cam, -2.75, goalZ, -2.75, goalZ + dir * 1.6);
    this.line(ctx, cam, 2.75, goalZ, 2.75, goalZ + dir * 1.6);
    this.line(ctx, cam, -2.75, goalZ + dir * 0.35, 2.75, goalZ + dir * 0.35);
  }

  private tenLine(ctx: CanvasRenderingContext2D, cam: Cam, z: number): void {
    ctx.save();
    ctx.strokeStyle = '#e2b657';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    this.line(ctx, cam, -34, z, 34, z);
    ctx.restore();
  }

  private player(ctx: CanvasRenderingContext2D, cam: Cam, player: DrawPlayer, controlled: boolean): void {
    const p = cam.project(player.x, player.z);
    const scale = cam.scale;
    const facingX = Math.sin(player.facing);
    const facingUp = Math.cos(player.facing) * cam.sign;
    const angle = Math.atan2(facingX, facingUp);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const dive = player.action === 'dive';
    const down = player.action === 'tackled' || player.action === 'get_up' || player.action === 'play_ball';
    const len = (dive ? 1.7 : down ? 1.15 : 1.35) * scale * 0.42;
    const wid = (down ? 0.72 : 0.5) * scale * 0.42;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(1, 2, wid * 0.9, len * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = player.primary;
    roundRect(ctx, -wid * 0.62, -len * 0.22, wid * 1.24, len * 0.7, wid * 0.35);
    ctx.fill();
    ctx.fillStyle = player.secondary;
    roundRect(ctx, -wid * 0.55, len * 0.22, wid * 0.42, len * 0.42, wid * 0.15);
    ctx.fill();
    roundRect(ctx, wid * 0.13, len * 0.22, wid * 0.42, len * 0.42, wid * 0.15);
    ctx.fill();
    ctx.fillStyle = SKIN[player.skin % SKIN.length];
    ctx.beginPath();
    ctx.arc(0, -len * 0.48, wid * 0.42, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, -wid * 0.95, -len * 0.05, wid * 0.38, len * 0.48, wid * 0.16);
    ctx.fill();
    roundRect(ctx, wid * 0.57, -len * 0.05, wid * 0.38, len * 0.48, wid * 0.16);
    ctx.fill();
    if (controlled) {
      ctx.strokeStyle = '#e2b657';
      ctx.lineWidth = 2;
      ctx.strokeRect(-wid * 0.8, -len * 0.75, wid * 1.6, len * 1.7);
    }
    if (player.hasBall) {
      ctx.fillStyle = '#f6f3ea';
      ctx.beginPath();
      ctx.ellipse(wid * 0.55, len * 0.05, scale * 0.11, scale * 0.07, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.quality !== 'low') {
      ctx.fillStyle = contrast(player.primary);
      ctx.font = `700 ${Math.max(8, scale * 0.28)}px Barlow, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.number), 0, len * 0.12);
    }
    ctx.restore();
  }

  private guide(ctx: CanvasRenderingContext2D, cam: Cam, aim: AimPreview | null): void {
    if (!aim || aim.points.length < 2) return;
    const risk = aim.risk > 0.66 ? '#e06a5c' : aim.risk > 0.35 ? '#e2b657' : '#d7efe2';
    const strokePath = (points: { x: number; y: number; z: number }[], width: number, alpha: number) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const projected = cam.project(point.x, point.z);
        const lift = point.y * cam.scale * 0.35;
        if (index === 0) ctx.moveTo(projected.x, projected.y - lift);
        else ctx.lineTo(projected.x, projected.y - lift);
      });
      ctx.strokeStyle = risk;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (aim.spread.length > 1) strokePath(aim.spread, 1.5, 0.35);
    strokePath(aim.points, 2.5, 0.9);
    const land = cam.project(aim.landing.x, aim.landing.z);
    ctx.strokeStyle = '#e2b657';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(land.x, land.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    if (aim.catch) {
      const zone = cam.project(aim.catch.x, aim.catch.z);
      ctx.strokeStyle = risk;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, Math.max(8, aim.catch.radius * cam.scale * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (aim.receiverId !== null) {
      const player = this.frame?.players.find((item) => item.id === aim.receiverId);
      if (player) {
        const mark = cam.project(player.x, player.z);
        ctx.strokeStyle = '#7dcea0';
        ctx.lineWidth = 2;
        ctx.strokeRect(mark.x - 10, mark.y - 16, 20, 28);
      }
    }
  }

  private ball(ctx: CanvasRenderingContext2D, cam: Cam, ball: { x: number; y: number; z: number }): void {
    const p = cam.project(ball.x, ball.z);
    const lift = ball.y * cam.scale * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f3ea';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - lift, 5.5 + ball.y, 3.6 + ball.y * 0.4, this.time * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private worldRect(ctx: CanvasRenderingContext2D, cam: Cam, x: number, z: number, w: number, d: number): void {
    const a = cam.project(x, z);
    const b = cam.project(x + w, z + d);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }

  private strokeRect(ctx: CanvasRenderingContext2D, cam: Cam, x: number, z: number, w: number, d: number): void {
    ctx.beginPath();
    const corners = [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
    corners.forEach(([px, pz], index) => {
      const point = cam.project(px, pz);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private line(ctx: CanvasRenderingContext2D, cam: Cam, x1: number, z1: number, x2: number, z2: number): void {
    const a = cam.project(x1, z1);
    const b = cam.project(x2, z2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

class Cam {
  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly scale: number,
    readonly sign: number,
    private readonly side: boolean,
    private readonly focusX: number,
    private readonly focusZ: number,
  ) {}

  project(x: number, z: number): { x: number; y: number } {
    const dx = x - this.focusX;
    const dz = (z - this.focusZ) * this.sign;
    if (this.side) return { x: this.ox + dz * this.scale, y: this.oy + dx * this.scale };
    return { x: this.ox + dx * this.scale, y: this.oy - dz * this.scale };
  }

  depth(player: { x: number; z: number }): number {
    return this.project(player.x, player.z).y;
  }
}

interface DrawPlayer {
  x: number;
  z: number;
  facing: number;
  action: Action;
  team: 0 | 1;
  number: number;
  skin: number;
  primary: string;
  secondary: string;
  onField: boolean;
  hasBall: boolean;
  id: number;
  sprint: boolean;
}

interface DrawFrame {
  match: Match;
  ball: { x: number; y: number; z: number };
  players: DrawPlayer[];
  mode: CameraMode;
  menu: boolean;
  sign: number;
  showTen: boolean;
  tenZ: number;
  controlledId: number | null;
}

function sampleReplay(frames: Snapshot[], t: number): Snapshot | null {
  if (!frames.length) return null;
  const first = frames[0].t;
  const last = frames[frames.length - 1].t;
  const time = first + (last - first) * t;
  let index = 0;
  while (index < frames.length - 1 && frames[index + 1].t < time) index += 1;
  return frames[index];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function contrast(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return '#f4f0e6';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (r * 0.3 + g * 0.59 + b * 0.11) > 150 ? '#1a1408' : '#f4f0e6';
}
