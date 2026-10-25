import * as THREE from 'three';
import type { StadiumInfo } from '../data/teams';
import type { Match } from '../sim/match';
import type { Action, Snapshot } from '../sim/types';
import { MatchAtmosphere } from './atmosphere';
import { Athletes } from './athletes';
import { createMatchBall, type BallPose } from './ball';
import { ImpactFX } from './fx';
import { AimGuide } from './guide';
import { buildStadium, paintScoreboard, type BuiltStadium } from './stadium';
import type { CameraMode, FieldView } from './view';

export type { CameraMode };

export class MatchScene implements FieldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly athletes = new Athletes();
  private readonly guide = new AimGuide();
  private readonly fx = new ImpactFX();
  private lastImpactT = -1;
  private stadium: BuiltStadium | null = null;
  private stadiumId = '';
  private readonly ball: ReturnType<typeof createMatchBall>;
  private readonly atmosphere: MatchAtmosphere;
  private ten: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private spots: THREE.SpotLight[] = [];
  private camPos = new THREE.Vector3(0, 14, -24);
  private look = new THREE.Vector3(0, 1, 8);
  private shake = 0;
  private time = 0;
  private orbit = 0;
  private scoreKey = '';
  replaying = false;
  private replay: Snapshot[] = [];
  private replayT = 0;
  private replayDur = 3.2;
  lost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.2, 320);
    this.scene.background = new THREE.Color('#081018');
    this.scene.fog = new THREE.Fog('#081018', 70, 190);
    this.hemi = new THREE.HemisphereLight('#d5e6f6', '#2f6a38', 0.72);
    this.sun = new THREE.DirectionalLight('#fff6e4', 1.85);
    this.sun.position.set(22, 46, -14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.02;
    const shadowCam = this.sun.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -48;
    shadowCam.right = 48;
    shadowCam.top = 72;
    shadowCam.bottom = -72;
    shadowCam.near = 8;
    shadowCam.far = 130;
    shadowCam.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.hemi, this.sun);
    this.ball = createMatchBall();
    this.atmosphere = new MatchAtmosphere(this.scene);
    this.scene.add(this.ball.group, this.ball.shadow);
    this.ten = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 0.18),
      new THREE.MeshBasicMaterial({ color: '#e2b657', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.ten.rotation.x = -Math.PI / 2;
    this.ten.position.y = 0.04;
    this.ten.visible = false;
    this.scene.add(this.ten, this.athletes.group, this.guide.group, this.fx.group);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    const ratio = quality === 'high' ? 2 : quality === 'medium' ? 1.35 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
    const shadows = quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const size = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.atmosphere.setQuality(quality);
  }

  setStadium(info: StadiumInfo, quality: 'low' | 'medium' | 'high'): void {
    if (this.stadium && this.stadiumId === `${info.id}:${quality}`) return;
    if (this.stadium) this.scene.remove(this.stadium.group);
    this.stadium = buildStadium(info, quality);
    this.stadiumId = `${info.id}:${quality}`;
    this.scene.add(this.stadium.group);
    const night = info.night;
    this.scene.background = new THREE.Color(night ? '#070b12' : '#9ec8ea');
    this.scene.fog = new THREE.Fog(night ? '#101820' : '#9ec8ea', night ? 90 : 140, night ? 230 : 280);
    this.hemi.intensity = night ? 0.38 : 0.7;
    this.hemi.color.set(night ? '#b7cbe4' : '#e7f2fb');
    this.hemi.groundColor.set(night ? '#14341c' : '#3d8a45');
    this.sun.intensity = night ? 1.45 : 1.9;
    this.sun.color.set(night ? '#ffe2b0' : '#fff8ee');
    this.renderer.toneMappingExposure = night ? 1.22 : 1.08;
    this.atmosphere.setNight(night);
    for (const spot of this.spots) this.scene.remove(spot);
    this.spots = [];
    if (night) {
      for (const [x, z] of [[-30, -36], [30, -36], [-30, 36], [30, 36]] as const) {
        const spot = new THREE.SpotLight('#fff1cc', 80, 110, 0.62, 0.4, 1);
        spot.position.set(x, 22, z);
        spot.target.position.set(0, 0, z * 0.2);
        this.scene.add(spot, spot.target);
        this.spots.push(spot);
      }
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  punch(amount = 0.35): void {
    this.shake = Math.max(this.shake, amount);
  }

  startReplay(frames: Snapshot[], duration = 3.2): void {
    if (frames.length < 2) return;
    this.replay = frames;
    this.replayT = 0;
    this.replayDur = duration;
    this.replaying = true;
  }

  skipReplay(): void {
    this.replaying = false;
  }

  update(dt: number, match: Match | null, mode: CameraMode, showTen: boolean, menu: boolean): void {
    this.time += dt;
    if (!match) return;
    let ball = { x: match.ball.x, y: match.ball.y, z: match.ball.z };
    let overrides: { x: number; z: number; facing: number; action: Action }[] | undefined;
    if (this.replaying) {
      this.replayT += dt;
      const sample = sampleReplay(this.replay, Math.min(1, this.replayT / this.replayDur));
      if (sample) {
        ball = sample.ball;
        overrides = sample.players.map((p) => ({ x: p.x, z: p.z, facing: p.facing, action: p.action }));
      }
      if (this.replayT >= this.replayDur) this.replaying = false;
    }
    this.athletes.bind(match.players);
    this.athletes.sync(match.players, dt, this.time, overrides);
    this.guide.sync(this.replaying ? null : match.aim, match.players);
    if (match.lastImpact && match.lastImpact.t !== this.lastImpactT) {
      this.lastImpactT = match.lastImpact.t;
      this.fx.burst(match.lastImpact.x, match.lastImpact.z, match.lastImpact.power, match.lastImpact.bloody);
      this.punch(0.2 + match.lastImpact.power * 0.55);
    }
    this.fx.update(dt);
    const pose: BallPose = this.replaying
      ? { ...ball, vx: 0, vy: 0, vz: 0, mode: 'flight', spin: 0 }
      : match.ball;
    this.ball.orient(dt, pose, this.time);
    this.stadium?.setRain(match.weather.rain);
    this.atmosphere.update(dt, match.weather, ball);
    const sign = match.attackSign(match.possession);
    const showLine = showTen && match.phase === 'play_the_ball' && match.ruck;
    this.ten.visible = Boolean(showLine);
    if (showLine && match.ruck) {
      this.ten.position.z = match.ruck.z + sign * match.rules.tenMetres;
    }
    this.updateScoreboard(match);
    this.updateCamera(dt, match, mode, menu, ball, sign);
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  render(): void {
    if (!this.lost) this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(
    dt: number,
    match: Match,
    mode: CameraMode,
    menu: boolean,
    ball: { x: number; y: number; z: number },
    sign: number,
  ): void {
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (menu || match.phase === 'prematch') {
      this.orbit += dt * 0.12;
      desired.set(Math.sin(this.orbit) * 36, 8.5, Math.cos(this.orbit) * 28);
      look.set(0, 1.2, 6);
      this.camera.fov = 42;
    } else if (this.replaying) {
      desired.set(ball.x + 7.5, 2.1, ball.z - sign * 5.5);
      look.set(ball.x, 0.85, ball.z + sign * 1.2);
      this.camera.fov = 28;
    } else if (mode === 'broadcast') {
      desired.set(ball.x * 0.15 - 28, 9.5, ball.z - sign * 6);
      look.set(ball.x * 0.55, 1.1, ball.z + sign * 8);
      this.camera.fov = 36;
    } else if (mode === 'tactical') {
      desired.set(ball.x * 0.2, 46, ball.z - sign * 8);
      look.set(ball.x * 0.35, 0, ball.z + sign * 12);
      this.camera.fov = 40;
    } else {
      desired.set(ball.x * 0.22, 8.4, ball.z - sign * 17);
      look.set(ball.x * 0.35, 1.15, ball.z + sign * 12);
      this.camera.fov = 52;
    }
    if (this.shake > 0 && !menu) {
      desired.x += Math.sin(this.time * 40) * this.shake;
      desired.y += Math.cos(this.time * 35) * this.shake * 0.4;
    }
    const k = 1 - Math.exp(-3.2 * dt);
    this.camPos.lerp(desired, k);
    this.look.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
    this.camera.updateProjectionMatrix();
  }

  private updateScoreboard(match: Match): void {
    if (!this.stadium) return;
    const clock = formatClock(match.clock);
    const half = match.half >= 3 ? 'ET' : `H${match.half}`;
    const tackle = match.phase === 'full_time' ? 'FULL TIME' : `TACKLE ${Math.min(6, match.tackleCount)}`;
    const key = `${match.score.join('-')}:${clock}:${half}:${tackle}`;
    if (key === this.scoreKey) return;
    this.scoreKey = key;
    for (const ctx of this.stadium.scoreCtx) {
      paintScoreboard(ctx, match.teams[0].short, match.teams[1].short, match.score, clock, half, tackle);
    }
    for (const mesh of this.stadium.scoreboards) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.needsUpdate = true;
    }
  }
}

/** Builds the 3D view, or throws when that context cannot clear a frame. */
export function mountScene(canvas: HTMLCanvasElement): MatchScene {
  const scene = new MatchScene(canvas);
  const gl = scene.renderer.getContext();
  const info = glInfo(gl);
  if (gl.isContextLost() || !canClear(scene, gl)) {
    scene.renderer.dispose();
    scene.renderer.forceContextLoss();
    throw new Error(`WebGL renderer cannot present the stadium (${info || 'context lost'})`);
  }
  return scene;
}

function glInfo(gl: WebGLRenderingContext): string {
  const debug = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
  const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendor = gl.getParameter(gl.VENDOR);
  return `${renderer ?? ''} ${vendor ?? ''}`.trim();
}

function canClear(scene: MatchScene, gl: WebGLRenderingContext): boolean {
  const previous = scene.scene.background;
  const mapping = scene.renderer.toneMapping;
  scene.athletes.group.visible = false;
  scene.scene.background = new THREE.Color('#ff00aa');
  scene.renderer.setClearColor('#ff00aa', 1);
  scene.renderer.toneMapping = THREE.NoToneMapping;
  scene.camera.position.set(0, 5, 0);
  scene.camera.lookAt(0, 80, 0);
  scene.renderer.setSize(16, 16, false);
  scene.renderer.render(scene.scene, scene.camera);
  const pixels = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  scene.athletes.group.visible = true;
  scene.scene.background = previous;
  scene.renderer.toneMapping = mapping;
  scene.renderer.toneMappingExposure = 1.05;
  return pixels[0] > 180 && pixels[2] > 80 && pixels[1] < 80;
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const attempts: THREE.WebGLRendererParameters[] = [
    { canvas, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false },
    { canvas, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown;
  for (const options of attempts) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error('WebGL is unavailable');
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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
