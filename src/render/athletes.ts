import * as THREE from 'three';
import type { Action, Player, Role } from '../sim/types';

const SKIN = ['#f3d2b5', '#e0ac7e', '#c68642', '#8d5524', '#6b3a22', '#3d2416'];
const HAIR = ['#1b140e', '#3a2416', '#6a3e22', '#d7c4a3', '#111111'];
const BOOTS = ['#141414', '#f4f4f4', '#c4552a', '#1d4e89'];

function physique(role: Role, body: number): { height: number; bulk: number } {
  // Full-size broadcast proportions (closer to console rugby athlete scale).
  const table: Record<Role, [number, number]> = {
    prop: [1.93, 1.38],
    hooker: [1.8, 1.14],
    second_row: [1.98, 1.26],
    lock: [1.9, 1.2],
    halfback: [1.78, 1.02],
    five_eighth: [1.84, 1.08],
    centre: [1.88, 1.14],
    wing: [1.87, 1.02],
    fullback: [1.88, 1.08],
  };
  const [height, bulk] = table[role];
  const nudge = [0.98, 1, 1.06, 1.03][body % 4];
  return { height, bulk: bulk * nudge };
}

interface Pose {
  lean: number;
  twist: number;
  crouch: number;
  armL: number;
  armR: number;
  foreL: number;
  foreR: number;
  thighL: number;
  thighR: number;
  kneeL: number;
  kneeR: number;
  head: number;
  hop: number;
}

const COUNT = 34;

function capsule(radius: number, length: number): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(radius, length, 4, 8);
}

function turned(points: [number, number][]): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(points.map(([y, r]) => new THREE.Vector2(r, y)), 16);
  geo.computeVertexNormals();
  return geo;
}

function poseIdle(): Pose {
  return { lean: 0.04, twist: 0, crouch: 0, armL: 0.15, armR: 0.15, foreL: 0.35, foreR: 0.35, thighL: 0.05, thighR: 0.05, kneeL: 0.08, kneeR: 0.08, head: 0, hop: 0 };
}

function runPose(travel: number, sprint: boolean): Pose {
  const ph = travel * (sprint ? 1.45 : 1.15);
  const s = Math.sin(ph);
  return {
    lean: sprint ? 0.28 : 0.16,
    twist: s * 0.08,
    crouch: sprint ? 0.06 : 0.03,
    armL: -s * 0.85,
    armR: s * 0.85,
    foreL: 0.55,
    foreR: 0.55,
    thighL: s * (sprint ? 0.95 : 0.75),
    thighR: -s * (sprint ? 0.95 : 0.75),
    kneeL: Math.max(0.05, -s) * 1.25,
    kneeR: Math.max(0.05, s) * 1.25,
    head: -0.08,
    hop: Math.abs(Math.sin(ph)) * (sprint ? 0.05 : 0.03),
  };
}

function mirrorPose(pose: Pose): Pose {
  return {
    ...pose,
    twist: -pose.twist,
    armL: pose.armR,
    armR: pose.armL,
    foreL: pose.foreR,
    foreR: pose.foreL,
    thighL: pose.thighR,
    thighR: pose.thighL,
    kneeL: pose.kneeR,
    kneeR: pose.kneeL,
  };
}

function poseFor(action: Action, travel: number, speed: number, time: number, hasBall: boolean, throwSide: -1 | 1, fatigue: number): Pose {
  const sprint = speed > 6.2 || action === 'sprint';
  if (action === 'dive') {
    return { lean: 1.4, twist: 0.2, crouch: 0.62, armL: -2.35, armR: -0.85, foreL: 0.12, foreR: 1.25, thighL: 0.2, thighR: 1.15, kneeL: 0.15, kneeR: 1.15, head: 0.4, hop: -0.28 };
  }
  if (action === 'wrap' || action === 'tackle') {
    return { lean: 0.85, twist: 0, crouch: 0.2, armL: -1.15, armR: -1.15, foreL: 0.9, foreR: 0.9, thighL: 0.7, thighR: -0.2, kneeL: 0.5, kneeR: 0.3, head: 0.15, hop: 0 };
  }
  if (action === 'tackled' || action === 'get_up') {
    return { lean: 1.15, twist: 0.4, crouch: 0.55, armL: 0.4, armR: -0.2, foreL: 0.8, foreR: 1.1, thighL: 1.1, thighR: 0.4, kneeL: 1.3, kneeR: 0.8, head: 0.3, hop: 0 };
  }
  if (action === 'play_ball') {
    return { lean: 0.7, twist: 0, crouch: 0.45, armL: 0.2, armR: 0.4, foreL: 0.6, foreR: 0.5, thighL: 0.9, thighR: -0.35, kneeL: 1.2, kneeR: 0.2, head: 0.25, hop: 0 };
  }
  if (action === 'kick') {
    const swing = Math.sin(Math.min(1, time) * Math.PI);
    return { lean: -0.05 + swing * 0.25, twist: -0.25, crouch: 0.04, armL: 0.9, armR: -0.7, foreL: 0.35, foreR: 0.4, thighL: 0.15, thighR: -1.35 * swing, kneeL: 0.25, kneeR: 0.15 + swing * 0.85, head: -0.08, hop: swing * 0.04 };
  }
  if (action === 'pass') {
    const pass = { lean: 0.1, twist: -0.85, crouch: 0.02, armL: -0.2, armR: -1.45, foreL: 0.45, foreR: 0.15, thighL: 0.2, thighR: -0.1, kneeL: 0.25, kneeR: 0.18, head: -0.12, hop: 0 };
    return throwSide < 0 ? mirrorPose(pass) : pass;
  }
  if (action === 'celebrate') {
    const wave = Math.sin(time * 6) * 0.15;
    return { lean: -0.15, twist: wave, crouch: 0, armL: -2.5, armR: -2.5, foreL: 0.3, foreR: 0.3, thighL: 0.1, thighR: 0.1, kneeL: 0.1, kneeR: 0.1, head: -0.2, hop: 0.04 };
  }
  if (action === 'jump' || action === 'catch') {
    return { lean: 0.05, twist: 0, crouch: 0, armL: -2.2, armR: -2.2, foreL: 0.3, foreR: 0.3, thighL: -0.3, thighR: 0.2, kneeL: 0.4, kneeR: 0.5, head: -0.3, hop: 0.28 };
  }
  if (action === 'stumble') {
    return { lean: 0.6, twist: 0.5, crouch: 0.2, armL: 0.8, armR: -0.6, foreL: 0.4, foreR: 0.5, thighL: 0.5, thighR: -0.4, kneeL: 0.7, kneeR: 0.3, head: 0.2, hop: 0 };
  }
  if (action === 'mega_hit') {
    return { lean: 1.55, twist: -0.35, crouch: 0.15, armL: -2.4, armR: -2.1, foreL: 0.2, foreR: 0.35, thighL: 1.1, thighR: -0.5, kneeL: 0.4, kneeR: 0.7, head: 0.55, hop: 0.08 };
  }
  if (action === 'injured') {
    return { lean: 1.45, twist: 0.7, crouch: 0.7, armL: 0.9, armR: -1.2, foreL: 1.1, foreR: 0.6, thighL: 1.35, thighR: 0.9, kneeL: 1.4, kneeR: 1.1, head: 0.65, hop: -0.35 };
  }
  if (action === 'punch') {
    const swing = Math.sin(time * 14);
    return { lean: 0.35, twist: swing * 0.5, crouch: 0.12, armL: -0.4, armR: -2.2 + swing * 0.4, foreL: 0.7, foreR: 0.15, thighL: 0.4, thighR: -0.2, kneeL: 0.4, kneeR: 0.3, head: 0.1, hop: 0.02 };
  }
  if (action === 'wrestle') {
    return { lean: 0.95, twist: Math.sin(time * 5) * 0.35, crouch: 0.35, armL: -1.5, armR: -1.5, foreL: 1.1, foreR: 1.1, thighL: 0.7, thighR: 0.5, kneeL: 0.8, kneeR: 0.7, head: 0.25, hop: 0 };
  }
  if (action === 'kick_fight') {
    const swing = Math.max(0, Math.sin(time * 10));
    return { lean: 0.2, twist: -0.4, crouch: 0.1, armL: 0.6, armR: -0.8, foreL: 0.4, foreR: 0.5, thighL: 0.2, thighR: -1.5 * swing, kneeL: 0.3, kneeR: 0.2 + swing, head: 0.05, hop: swing * 0.05 };
  }
  if (action === 'marker') {
    return { lean: 0.35, twist: 0, crouch: 0.18, armL: 0.45, armR: 0.45, foreL: 0.7, foreR: 0.7, thighL: 0.45, thighR: 0.45, kneeL: 0.55, kneeR: 0.55, head: 0.1, hop: 0 };
  }
  if (speed < 0.35) {
    const idle = poseIdle();
    idle.armL = 0.18 + Math.sin(time * 1.6) * 0.04;
    idle.armR = hasBall ? -0.9 : 0.18 + Math.sin(time * 1.6 + 1) * 0.04;
    if (hasBall) idle.foreR = 1.1;
    if (fatigue > 0.72) idle.crouch += 0.06;
    return idle;
  }
  const run = runPose(travel, sprint);
  if (action === 'backpedal') {
    run.lean = -0.08;
    run.thighL *= 0.65;
    run.thighR *= 0.65;
  }
  if (hasBall) {
    run.armR = -1.05;
    run.foreR = 1.15;
    run.armL = 0.25;
    run.foreL = 0.7;
  }
  if (fatigue > 0.72) {
    run.crouch += 0.08;
    run.lean += 0.12;
    run.hop *= 0.7;
  }
  return run;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  (Object.keys(a) as (keyof Pose)[]).forEach((k) => {
    out[k] = a[k] + (b[k] - a[k]) * t;
  });
  return out;
}

export class Athletes {
  readonly group = new THREE.Group();
  private readonly poses: Pose[] = [];
  private boundKey = '';
  private readonly torso: THREE.InstancedMesh;
  private readonly shorts: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly beard: THREE.InstancedMesh;
  private readonly arm: THREE.InstancedMesh;
  private readonly forearm: THREE.InstancedMesh;
  private readonly thigh: THREE.InstancedMesh;
  private readonly shin: THREE.InstancedMesh;
  private readonly boot: THREE.InstancedMesh;
  private readonly eye: THREE.InstancedMesh;
  private readonly sclera: THREE.InstancedMesh;
  private readonly nose: THREE.InstancedMesh;
  private readonly brow: THREE.InstancedMesh;
  private readonly collar: THREE.InstancedMesh;
  private readonly stripe: THREE.InstancedMesh;
  private readonly finger: THREE.InstancedMesh;
  private readonly neck: THREE.InstancedMesh;
  private readonly shoulder: THREE.InstancedMesh;
  private readonly sleeve: THREE.InstancedMesh;
  private readonly hand: THREE.InstancedMesh;
  private readonly sock: THREE.InstancedMesh;
  private readonly ear: THREE.InstancedMesh;
  private readonly number: THREE.Mesh[] = [];
  private readonly shadow: THREE.InstancedMesh;
  private readonly dummy = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Quaternion();

  constructor() {
    const skinMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.4, metalness: 0, sheen: 0.35, sheenRoughness: 0.4, sheenColor: new THREE.Color('#f0c2a0'),
    });
    const cloth = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0.04 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.04 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.18 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.2 });
    const white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.35 });
    this.torso = this.make(turned([[-0.26, 0.15], [-0.12, 0.19], [0.02, 0.175], [0.14, 0.21], [0.24, 0.2], [0.3, 0.12]]), cloth);
    this.shorts = this.make(turned([[-0.18, 0.155], [-0.06, 0.2], [0.08, 0.185]]), cloth);
    this.head = this.make(new THREE.SphereGeometry(0.125, 18, 14), skinMat);
    this.hair = this.make(new THREE.SphereGeometry(0.132, 14, 10), hairMat);
    this.beard = this.make(new THREE.SphereGeometry(0.055, 8, 6), hairMat);
    this.neck = this.make(capsule(0.055, 0.07), skinMat);
    this.collar = this.make(new THREE.TorusGeometry(0.09, 0.02, 6, 12), cloth);
    this.stripe = this.make(new THREE.BoxGeometry(0.34, 0.045, 0.02), cloth, COUNT, false);
    this.shoulder = this.make(new THREE.SphereGeometry(0.1, 10, 8), cloth, COUNT * 2);
    this.sleeve = this.make(capsule(0.068, 0.16), cloth, COUNT * 2);
    this.arm = this.make(capsule(0.052, 0.2), skinMat, COUNT * 2);
    this.forearm = this.make(capsule(0.044, 0.2), skinMat, COUNT * 2);
    this.hand = this.make(new THREE.SphereGeometry(0.04, 8, 6), skinMat, COUNT * 2);
    this.finger = this.make(capsule(0.012, 0.045), skinMat, COUNT * 8, false);
    this.ear = this.make(new THREE.SphereGeometry(0.028, 8, 6), skinMat, COUNT * 2, false);
    this.nose = this.make(new THREE.SphereGeometry(0.028, 8, 6), skinMat, COUNT, false);
    this.brow = this.make(new THREE.BoxGeometry(0.09, 0.016, 0.02), hairMat, COUNT, false);
    this.thigh = this.make(capsule(0.09, 0.28), cloth, COUNT * 2);
    this.shin = this.make(capsule(0.05, 0.26), skinMat, COUNT * 2);
    this.sock = this.make(capsule(0.055, 0.16), cloth, COUNT * 2);
    const boot = new THREE.BoxGeometry(0.12, 0.07, 0.28);
    boot.translate(0, 0, 0.05);
    this.boot = this.make(boot, bootMat, COUNT * 2);
    this.sclera = this.make(new THREE.SphereGeometry(0.02, 8, 6), white, COUNT * 2, false);
    this.eye = this.make(new THREE.SphereGeometry(0.011, 8, 6), eyeMat, COUNT * 2, false);
    this.shadow = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.42, 12),
      new THREE.MeshBasicMaterial({ color: '#041008', transparent: true, opacity: 0.16, depthWrite: false }),
      COUNT,
    );
    this.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.shadow);
    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.22),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      this.number.push(mesh);
      this.group.add(mesh);
      this.poses.push(poseIdle());
    }
    this.up.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  }

  bind(players: Player[]): void {
    const key = players.map((p) => `${p.id}:${p.primary}:${p.number}:${p.look.skin}`).join('|');
    if (key === this.boundKey) return;
    this.boundKey = key;
    players.forEach((p, i) => {
      if (i >= COUNT) return;
      const skin = new THREE.Color(SKIN[p.look.skin % SKIN.length]);
      const hair = new THREE.Color(HAIR[p.look.hair % HAIR.length]);
      const jersey = new THREE.Color(p.primary);
      const shorts = new THREE.Color(p.secondary);
      const boot = new THREE.Color(BOOTS[p.look.boot % BOOTS.length]);
      this.torso.setColorAt(i, jersey);
      this.shorts.setColorAt(i, shorts);
      this.head.setColorAt(i, skin);
      this.hair.setColorAt(i, hair);
      this.beard.setColorAt(i, hair);
      this.arm.setColorAt(i * 2, skin);
      this.arm.setColorAt(i * 2 + 1, skin);
      this.forearm.setColorAt(i * 2, skin);
      this.forearm.setColorAt(i * 2 + 1, skin);
      this.thigh.setColorAt(i * 2, shorts);
      this.thigh.setColorAt(i * 2 + 1, shorts);
      this.shin.setColorAt(i * 2, skin);
      this.shin.setColorAt(i * 2 + 1, skin);
      this.boot.setColorAt(i * 2, boot);
      this.boot.setColorAt(i * 2 + 1, boot);
      this.neck.setColorAt(i, skin);
      this.hand.setColorAt(i * 2, skin);
      this.hand.setColorAt(i * 2 + 1, skin);
      this.ear.setColorAt(i * 2, skin);
      this.ear.setColorAt(i * 2 + 1, skin);
      this.shoulder.setColorAt(i * 2, jersey);
      this.shoulder.setColorAt(i * 2 + 1, jersey);
      this.sleeve.setColorAt(i * 2, jersey);
      this.sleeve.setColorAt(i * 2 + 1, jersey);
      this.sock.setColorAt(i * 2, shorts);
      this.sock.setColorAt(i * 2 + 1, shorts);
      this.eye.setColorAt(i * 2, new THREE.Color('#161616'));
      this.eye.setColorAt(i * 2 + 1, new THREE.Color('#161616'));
      this.sclera.setColorAt(i * 2, new THREE.Color('#f6f3ee'));
      this.sclera.setColorAt(i * 2 + 1, new THREE.Color('#f6f3ee'));
      this.nose.setColorAt(i, skin);
      this.brow.setColorAt(i, hair);
      this.collar.setColorAt(i, jersey);
      this.stripe.setColorAt(i, jersey.clone().lerp(new THREE.Color('#f7f4ea'), 0.62));
      for (let f = 0; f < 8; f++) this.finger.setColorAt(i * 8 + f, skin);
      const mat = this.number[i].material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = numberTexture(p.number, p.secondary);
      mat.needsUpdate = true;
      this.number[i].visible = p.onField;
    });
    for (const mesh of [this.torso, this.shorts, this.head, this.hair, this.beard, this.neck, this.collar, this.stripe, this.shoulder, this.sleeve, this.arm, this.forearm, this.hand, this.finger, this.ear, this.nose, this.brow, this.thigh, this.shin, this.sock, this.boot, this.sclera, this.eye]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  sync(
    players: Player[],
    dt: number,
    time: number,
    overrides?: { x: number; z: number; facing: number; action: Action }[],
  ): void {
    const blend = 1 - Math.exp(-10 * dt);
    players.forEach((p, i) => {
      if (i >= COUNT) return;
      const o = overrides?.[i];
      const x = o?.x ?? p.x;
      const z = o?.z ?? p.z;
      const facing = o?.facing ?? p.facing;
      const action = o?.action ?? p.action;
      const speed = Math.hypot(p.vx, p.vz);
      const target = poseFor(action, p.travel, speed, time, p.hasBall, p.throwSide, p.fatigue);
      this.poses[i] = lerpPose(this.poses[i], target, overrides ? 1 : blend);
      const pose = this.poses[i];
      const build = physique(p.role, p.look.body);
      const height = build.height;
      const bulk = build.bulk;
      // Visual scale pushed toward full-size console athletes on the pitch.
      const s = (height / 1.72) * 1.08;
      this.position.set(x, pose.hop, z);
      this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
      this.scale.set(s, s, s);
      const root = new THREE.Matrix4().compose(this.position, this.quaternion, this.scale);
      const hip = this.local(root, 0, 0.98 - pose.crouch * 0.25, 0, pose.lean * 0.2, 0, 0);
      const torso = this.local(hip, 0, 0.28, 0, pose.lean, pose.twist, 0, bulk * 1.15, 1.02, 0.62);
      this.torso.setMatrixAt(i, torso);
      const shorts = this.local(hip, 0, 0.02, 0, 0, 0, 0, bulk * 1.12, 1, 0.78);
      this.shorts.setMatrixAt(i, shorts);
      const head = this.local(torso, 0, 0.46, 0.02, pose.head, 0, 0);
      this.neck.setMatrixAt(i, this.local(torso, 0, 0.32, 0));
      this.collar.setMatrixAt(i, this.local(torso, 0, 0.28, 0, Math.PI / 2, 0, 0));
      this.stripe.setMatrixAt(i, this.local(torso, 0, 0.06, 0.34, 0, 0, 0, 0.9, 1, 1));
      this.head.setMatrixAt(i, this.local(head, 0, 0.02, 0, 0, 0, 0, 1.02, 1.16, 0.94));
      this.shoulder.setMatrixAt(i * 2, this.local(torso, -0.22, 0.18, 0, 0, 0, 0, 1.35, 0.9, 1));
      this.shoulder.setMatrixAt(i * 2 + 1, this.local(torso, 0.22, 0.18, 0, 0, 0, 0, 1.35, 0.9, 1));
      const hairScale = p.look.hairStyle === 4 ? 0.001 : p.look.hairStyle === 3 ? 0.55 : 1;
      const hairY = p.look.hairStyle === 2 ? 0.06 : 0.03;
      this.hair.setMatrixAt(i, this.local(head, 0, hairY, 0, 0, 0, 0, hairScale, p.look.hairStyle === 2 ? 1.25 : 0.72, hairScale));
      const beardScale = p.look.facialHair === 0 ? 0.001 : 1;
      this.beard.setMatrixAt(i, this.local(head, 0, -0.05, 0.1, 0, 0, 0, beardScale, beardScale, beardScale));
      this.nose.setMatrixAt(i, this.local(head, 0, -0.02, 0.11, 0, 0, 0, 0.7, 0.85, 1.1));
      this.brow.setMatrixAt(i, this.local(head, 0, 0.045, 0.1));
      this.sclera.setMatrixAt(i * 2, this.local(head, -0.042, 0.02, 0.09));
      this.sclera.setMatrixAt(i * 2 + 1, this.local(head, 0.042, 0.02, 0.09));
      this.eye.setMatrixAt(i * 2, this.local(head, -0.042, 0.02, 0.108));
      this.eye.setMatrixAt(i * 2 + 1, this.local(head, 0.042, 0.02, 0.108));
      this.ear.setMatrixAt(i * 2, this.local(head, -0.12, 0, 0, 0, 0, 0, 0.7, 1, 0.55));
      this.ear.setMatrixAt(i * 2 + 1, this.local(head, 0.12, 0, 0, 0, 0, 0, 0.7, 1, 0.55));
      this.limb(this.arm, i, 0, torso, -0.24, 0.12, 0, pose.armL, 0, 0.12);
      this.limb(this.arm, i, 1, torso, 0.24, 0.12, 0, pose.armR, 0, 0.12);
      const armL = this.peek(this.arm, i * 2);
      const armR = this.peek(this.arm, i * 2 + 1);
      this.sleeve.setMatrixAt(i * 2, this.local(armL, 0, 0.02, 0, 0, 0, 0, 1.05, 0.85, 1.05));
      this.sleeve.setMatrixAt(i * 2 + 1, this.local(armR, 0, 0.02, 0, 0, 0, 0, 1.05, 0.85, 1.05));
      this.limb(this.forearm, i, 0, armL, 0, -0.26, 0, pose.foreL, 0, 0.11);
      this.limb(this.forearm, i, 1, armR, 0, -0.26, 0, pose.foreR, 0, 0.11);
      const foreL = this.peek(this.forearm, i * 2);
      const foreR = this.peek(this.forearm, i * 2 + 1);
      const handL = this.local(foreL, 0, -0.16, 0.02, 0, 0, 0, 1.15, 0.75, 1.35);
      const handR = this.local(foreR, 0, -0.16, 0.03, 0, 0, 0, 1.15, 0.75, 1.35);
      this.hand.setMatrixAt(i * 2, handL);
      this.hand.setMatrixAt(i * 2 + 1, handR);
      this.placeFingers(handL, i, 0);
      this.placeFingers(handR, i, 4);
      this.limb(this.thigh, i, 0, hip, -0.1 * bulk, -0.04, 0, pose.thighL, 0, 0.18);
      this.limb(this.thigh, i, 1, hip, 0.1 * bulk, -0.04, 0, pose.thighR, 0, 0.18);
      const thighL = this.peek(this.thigh, i * 2);
      const thighR = this.peek(this.thigh, i * 2 + 1);
      this.limb(this.shin, i, 0, thighL, 0, -0.36, 0, pose.kneeL, 0, 0.17);
      this.limb(this.shin, i, 1, thighR, 0, -0.36, 0, pose.kneeR, 0, 0.17);
      const shinL = this.peek(this.shin, i * 2);
      const shinR = this.peek(this.shin, i * 2 + 1);
      this.sock.setMatrixAt(i * 2, this.local(shinL, 0, -0.16, 0));
      this.sock.setMatrixAt(i * 2 + 1, this.local(shinR, 0, -0.16, 0));
      this.boot.setMatrixAt(i * 2, this.local(shinL, 0, -0.28, 0.06, 0, 0, 0));
      this.boot.setMatrixAt(i * 2 + 1, this.local(shinR, 0, -0.28, 0.06, 0, 0, 0));
      this.number[i].visible = p.onField;
      this.number[i].matrix.copy(this.local(torso, 0, 0.04, -0.36, 0, Math.PI, 0, 1.35, 1.6, 1));
      const shadow = new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0.03, z),
        this.up,
        new THREE.Vector3(1, 1, 1),
      );
      this.shadow.setMatrixAt(i, shadow);
    });
    for (const mesh of [this.torso, this.shorts, this.head, this.hair, this.beard, this.neck, this.collar, this.stripe, this.shoulder, this.sleeve, this.arm, this.forearm, this.hand, this.finger, this.ear, this.nose, this.brow, this.thigh, this.shin, this.sock, this.boot, this.sclera, this.eye, this.shadow]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private placeFingers(hand: THREE.Matrix4, player: number, base: number): void {
    for (let finger = 0; finger < 4; finger++) {
      const spread = (finger - 1.5) * 0.018;
      this.finger.setMatrixAt(
        player * 8 + base + finger,
        this.local(hand, spread, -0.055, 0.02, -0.45, 0, spread * 6, 0.55, 1, 0.55),
      );
    }
  }

  private make(geometry: THREE.BufferGeometry, material: THREE.Material, count = COUNT, shadow = true): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  private local(
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): THREE.Matrix4 {
    this.position.set(x, y, z);
    this.quaternion.setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    this.scale.set(sx, sy, sz);
    this.dummy.compose(this.position, this.quaternion, this.scale);
    return new THREE.Matrix4().multiplyMatrices(parent, this.dummy);
  }

  private limb(
    mesh: THREE.InstancedMesh,
    player: number,
    side: number,
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    rx: number,
    hang: number,
    half: number,
  ): void {
    const joint = this.local(parent, x, y, z, rx, 0, 0);
    const hung = this.local(joint, 0, -half + hang, 0, 0, 0, 0);
    mesh.setMatrixAt(player * 2 + side, hung);
  }

  private peek(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(index, m);
    return m;
  }
}

function numberTexture(n: number, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 96);
  ctx.fillStyle = '#f7f4ea';
  ctx.font = '700 78px Barlow Condensed, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 50);
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.strokeText(String(n), 64, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
