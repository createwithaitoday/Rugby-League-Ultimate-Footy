import * as THREE from 'three';
import type { StadiumInfo } from '../data/teams';
import { buildPitchMaterial } from './pitch';

const SPONSORS = [
  'HARBOUR BANK',
  'NORTHLINE FREIGHT',
  'VALE ENERGY',
  'CAPE AIR',
  'REDGUM TIMBER',
  'IRONRIDGE TOOLS',
  'PORTSIDE LINE',
  'MERIDIAN STEEL',
  'HARROW CIVIC',
  'WESTMERE RAIL',
];

export interface BuiltStadium {
  group: THREE.Group;
  scoreboards: THREE.Mesh[];
  scoreCtx: CanvasRenderingContext2D[];
  night: boolean;
  setRain(amount: number): void;
}

export function buildStadium(info: StadiumInfo, quality: 'low' | 'medium' | 'high'): BuiltStadium {
  const group = new THREE.Group();
  group.name = info.id;
  const peopleCap = quality === 'low' ? 0 : quality === 'medium' ? 1600 : 2800;

  const pitch = buildPitchMaterial(quality);
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(92, 132, 1, 1), pitch.material);
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  group.add(turf);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 150),
    new THREE.MeshStandardMaterial({ color: '#2c343c', roughness: 0.94 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  group.add(apron);

  addPosts(group, 50);
  addPosts(group, -50);

  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.46, 0.28, 0.4),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    4200,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 7, 6),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }),
    Math.max(1, peopleCap),
  );
  const bodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.14, 0.22, 2, 5),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
    Math.max(1, peopleCap),
  );
  let seatIndex = 0;
  let headIndex = 0;
  const colorA = new THREE.Color(info.seatA);
  const colorB = new THREE.Color(info.seatB);
  const skinTones = ['#e0ac7e', '#c68642', '#8d5524', '#f3d2b5', '#6b4423', '#d7c4a3'].map((h) => new THREE.Color(h));
  const shirtTones = [colorA, colorB, new THREE.Color('#d9dde3'), new THREE.Color('#1c1c1c')];

  const placeSeat = (x: number, y: number, z: number, row: number, col: number) => {
    if (seatIndex >= 4200) return;
    const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    seats.setMatrixAt(seatIndex, matrix);
    const useB = (Math.floor(col / 9) + Math.floor(row / 4)) % 3 === 0;
    const tint = (useB ? colorB : colorA).clone();
    const jitter = ((row * 17 + col * 13) % 10) / 10;
    tint.offsetHSL(0, 0, (jitter - 0.5) * 0.08);
    seats.setColorAt(seatIndex, tint);
    seatIndex += 1;
    if (headIndex < peopleCap && (row * 3 + col) % 5 !== 0) {
      const shirt = shirtTones[(row + col) % shirtTones.length];
      heads.setMatrixAt(headIndex, new THREE.Matrix4().makeTranslation(x, y + 0.55, z));
      heads.setColorAt(headIndex, skinTones[(row + col) % skinTones.length]);
      bodies.setMatrixAt(headIndex, new THREE.Matrix4().makeTranslation(x, y + 0.22, z));
      bodies.setColorAt(headIndex, shirt);
      headIndex += 1;
    }
  };

  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 78; col++) {
      if (col % 20 === 10) continue;
      const z = (col - 39) * 0.72;
      const y = 1.1 + row * 0.46;
      placeSeat(-42 - row * 0.78, y, z, row, col);
      placeSeat(42 + row * 0.78, y, z, row, col + 3);
    }
  }
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 48; col++) {
      if (col % 16 === 8) continue;
      const x = (col - 24) * 0.7;
      const y = 1.3 + row * 0.48;
      placeSeat(x, y, -66 - row * 0.8, row, col);
      placeSeat(x, y, 66 + row * 0.8, row, col + 2);
    }
  }
  seats.count = seatIndex;
  heads.count = Math.max(1, headIndex);
  bodies.count = Math.max(1, headIndex);
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  group.add(seats);
  if (peopleCap > 0) group.add(bodies, heads);

  const roofMat = new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 78), roofMat);
  roof.position.set(52, 10.5, 0);
  group.add(roof);
  const roof2 = roof.clone();
  roof2.position.x = -52;
  group.add(roof2);

  addBoards(group);
  addCrowd(group, info.seatA, info.seatB);
  addRoof(group, info.accent);
  addLights(group, info.night);
  const { meshes, contexts } = addScoreboards(group);
  addTunnel(group);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(78, 86, 8, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.9, side: THREE.DoubleSide }),
  );
  bowl.position.y = 2;
  group.add(bowl);

  return { group, scoreboards: meshes, scoreCtx: contexts, night: info.night, setRain: pitch.setRain };
}

function addPosts(group: THREE.Group, z: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.35, metalness: 0.15 });
  const pad = new THREE.MeshStandardMaterial({ color: '#d7dde3', roughness: 0.8 });
  for (const x of [-2.75, 2.75]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 8, 10), mat);
    post.position.set(x, 4, z);
    post.castShadow = true;
    group.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8), pad);
    base.position.set(x, 0.6, z);
    group.add(base);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5.5, 8), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 3, z);
  bar.castShadow = true;
  group.add(bar);
}

function addBoards(group: THREE.Group): void {
  SPONSORS.forEach((label, i) => {
    const alongSideline = i < 6;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = i % 2 === 0 ? '#102033' : '#f4f1ea';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = i % 2 === 0 ? '#f0b429' : '#102033';
    ctx.fillRect(0, 0, 10, 128);
    ctx.font = '700 54px Barlow Condensed, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = i % 2 === 0 ? '#f7f4ea' : '#102033';
    ctx.fillText(label, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(alongSideline ? 12 : 10, 1.3),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
    );
    if (alongSideline) {
      const side = i % 2 === 0 ? -1 : 1;
      mesh.position.set(side * 36.2, 0.9, -24 + (i % 3) * 16);
      mesh.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const end = i % 2 === 0 ? -1 : 1;
      mesh.position.set(-12 + (i % 3) * 12, 0.9, end * 60.5);
      mesh.rotation.y = end === 1 ? Math.PI : 0;
    }
    group.add(mesh);
  });
}

function addRoof(group: THREE.Group, accent: string): void {
  const steel = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.62, roughness: 0.32 });
  const chord = new THREE.MeshStandardMaterial({ color: '#d5dde4', metalness: 0.7, roughness: 0.28 });
  for (const x of [-24, 0, 24]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 128), steel);
    beam.position.set(x, 15.5, 0);
    group.add(beam);
  }
  for (let z = -54; z <= 54; z += 12) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(62, 0.22, 0.22), chord);
    cross.position.set(0, 15.2, z);
    group.add(cross);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), chord);
    brace.position.set(-24, 14.4, z);
    brace.rotation.z = 0.55;
    group.add(brace);
    const brace2 = brace.clone();
    brace2.position.x = 24;
    brace2.rotation.z = -0.55;
    group.add(brace2);
  }
}

function addCrowd(group: THREE.Group, seatA: string, seatB: string): void {
  const tex = crowdTexture(seatA, seatB);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const end = new THREE.Mesh(new THREE.PlaneGeometry(74, 16), mat);
  end.position.set(0, 8, -63);
  group.add(end);
  const end2 = end.clone();
  end2.position.z = 63;
  end2.rotation.y = Math.PI;
  group.add(end2);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(118, 14), mat);
  side.position.set(-44, 7.5, 0);
  side.rotation.y = Math.PI / 2;
  group.add(side);
  const side2 = side.clone();
  side2.position.x = 44;
  side2.rotation.y = -Math.PI / 2;
  group.add(side2);
}

function crowdTexture(seatA: string, seatB: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = seatA;
  ctx.fillRect(0, 0, 1024, 512);
  const shirts = [seatA, seatB, '#f7f7f2', '#20242a', '#2d62b0', '#c44747', '#e2b657'];
  const skins = ['#f3d2b5', '#e0ac7e', '#c68642', '#8d5524', '#6b3a22'];
  for (let row = 0; row < 42; row++) {
    for (let col = 0; col < 86; col++) {
      const x = col * 12 + (row % 2) * 5;
      const y = row * 12;
      ctx.fillStyle = shirts[(row * 7 + col * 3) % shirts.length];
      ctx.fillRect(x, y + 5, 7, 7);
      ctx.fillStyle = skins[(row * 2 + col) % skins.length];
      ctx.fillRect(x + 1, y + 1, 5, 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addLights(group: THREE.Group, night: boolean): void {
  const poleMat = new THREE.MeshStandardMaterial({ color: '#c5ced6', metalness: 0.4, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#fff4d2',
    emissive: night ? '#fff1c9' : '#665533',
    emissiveIntensity: night ? 1.4 : 0.3,
  });
  for (const [x, z] of [[-40, -48], [40, -48], [-40, 48], [40, 48]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 18, 8), poleMat);
    pole.position.set(x, 9, z);
    pole.castShadow = true;
    group.add(pole);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 1.6), lampMat);
    bank.position.set(x, 18.2, z);
    group.add(bank);
    for (const ox of [-2.2, -0.7, 0.7, 2.2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.7), lampMat);
      lamp.position.set(x + ox, 18.5, z);
      group.add(lamp);
    }
  }
}

function addScoreboards(group: THREE.Group): { meshes: THREE.Mesh[]; contexts: CanvasRenderingContext2D[] } {
  const meshes: THREE.Mesh[] = [];
  const contexts: CanvasRenderingContext2D[] = [];
  for (const z of [-70, 70]) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    contexts.push(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    mesh.position.set(0, 8.5, z);
    mesh.rotation.y = z > 0 ? Math.PI : 0;
    group.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, contexts };
}

function addTunnel(group: THREE.Group): void {
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(4, 2.6, 3),
    new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 1 }),
  );
  mouth.position.set(-39, 1.3, -20);
  group.add(mouth);
  const benchMat = new THREE.MeshStandardMaterial({ color: '#2c343c', roughness: 0.7 });
  for (const x of [-36.2, 36.2]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 8), benchMat);
    bench.position.set(x, 0.4, -4);
    group.add(bench);
  }
}

export function paintScoreboard(
  ctx: CanvasRenderingContext2D,
  home: string,
  away: string,
  score: [number, number],
  clock: string,
  half: string,
  tackle: string,
): void {
  const canvas = ctx.canvas;
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e2b657';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#f7f4ea';
  ctx.font = '700 42px Barlow Condensed, Impact, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(home, 36, 78);
  ctx.textAlign = 'right';
  ctx.fillText(away, canvas.width - 36, 78);
  ctx.textAlign = 'center';
  ctx.font = '700 92px Barlow Condensed, Impact, sans-serif';
  ctx.fillText(`${score[0]}  ${score[1]}`, canvas.width / 2, 110);
  ctx.font = '600 36px Barlow Condensed, Impact, sans-serif';
  ctx.fillStyle = '#e2b657';
  ctx.fillText(`${half}   ${clock}   ${tackle}`, canvas.width / 2, 190);
}
