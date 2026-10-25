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

  addGrandstands(group, info, quality);

  const roofMat = new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 78), roofMat);
  roof.position.set(52, 10.5, 0);
  group.add(roof);
  const roof2 = roof.clone();
  roof2.position.x = -52;
  group.add(roof2);

  addBoards(group);
  addRoof(group, info.accent);
  addLights(group, info.night);
  const { meshes, contexts } = addScoreboards(group);
  addTunnel(group);

  return { group, scoreboards: meshes, scoreCtx: contexts, night: info.night, setRain: pitch.setRain };
}

function addGrandstands(group: THREE.Group, info: StadiumInfo, quality: 'low' | 'medium' | 'high'): void {
  const seatCap = 3600;
  const peopleCap = quality === 'low' ? 500 : quality === 'medium' ? 1800 : 3000;
  const concrete = new THREE.MeshStandardMaterial({ color: '#4c555e', roughness: 0.92 });
  const wallMat = new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.86 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.74 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.58 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.64 });
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.08, 0.34), seatMat, seatCap);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.32, 0.05), seatMat, seatCap);
  const torso = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.34, 0.18), cloth, peopleCap);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), skinMat, peopleCap);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.096, 7, 5), hairMat, peopleCap);
  for (const mesh of [seats, backs, torso, head, hair]) {
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
  }
  const skins = ['#f3d2b5', '#e0ac7e', '#c68642', '#8d5524', '#6b3a22', '#d7b899'].map((hex) => new THREE.Color(hex));
  const hairColours = ['#1b140e', '#3a2416', '#6a3e22', '#d7c4a3', '#111111'].map((hex) => new THREE.Color(hex));
  const shirts = [info.seatA, info.seatB, '#f4f1ea', '#1c1c1c', '#2d4f86', '#8d3a3a', '#2f6b45'].map((hex) => new THREE.Color(hex));
  const seatA = new THREE.Color(info.seatA);
  const seatB = new THREE.Color(info.seatB);
  let seatIndex = 0;
  let personIndex = 0;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const put = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => {
    pos.set(x, y, z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    scale.set(sx, sy, sz);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(index, matrix);
  };
  const fill = (rows: number, cols: number, yaw: number, at: (row: number, col: number) => { x: number; y: number; z: number }) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (col % 16 === 8 || seatIndex >= seatCap) continue;
        const spot = at(row, col);
        const plastic = ((row + col) % 5 === 0 ? seatB : seatA).clone();
        plastic.offsetHSL(0, 0, (((row * 3 + col) % 7) - 3) * 0.02);
        seats.setColorAt(seatIndex, plastic);
        backs.setColorAt(seatIndex, plastic);
        put(seats, seatIndex, spot.x, spot.y, spot.z, yaw);
        put(backs, seatIndex, spot.x - fx * 0.16, spot.y + 0.16, spot.z - fz * 0.16, yaw);
        seatIndex += 1;
        if (personIndex >= peopleCap || (row * 5 + col) % 6 === 0) continue;
        torso.setColorAt(personIndex, shirts[(row * 3 + col) % shirts.length]);
        head.setColorAt(personIndex, skins[(row + col * 2) % skins.length]);
        hair.setColorAt(personIndex, hairColours[(row * 2 + col) % hairColours.length]);
        put(torso, personIndex, spot.x + fx * 0.05, spot.y + 0.28, spot.z + fz * 0.05, yaw, 1, 0.92 + ((row + col) % 3) * 0.04, 1);
        put(head, personIndex, spot.x + fx * 0.07, spot.y + 0.52, spot.z + fz * 0.07, yaw);
        const bald = (row + col) % 11 === 0;
        put(hair, personIndex, spot.x + fx * 0.05, spot.y + 0.58, spot.z + fz * 0.03, yaw, bald ? 0.01 : 1, bald ? 0.01 : 0.68, bald ? 0.01 : 1);
        personIndex += 1;
      }
    }
  };

  const sideRows = 12;
  const sideCols = 68;
  for (let row = 0; row < sideRows; row++) {
    const depth = -40.4 - row * 0.82;
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 62), concrete);
    step.position.set(depth, 0.58 + row * 0.4, 0);
    step.receiveShadow = true;
    group.add(step);
    const opposite = step.clone();
    opposite.position.x = -depth;
    group.add(opposite);
  }
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.35, 64), wallMat);
  westWall.position.set(-38.5, 0.7, 0);
  group.add(westWall);
  const eastWall = westWall.clone();
  eastWall.position.x = 38.5;
  group.add(eastWall);
  fill(sideRows, sideCols, Math.PI / 2, (row, col) => ({
    x: -40.2 - row * 0.82,
    y: 0.78 + row * 0.4,
    z: (col - (sideCols - 1) / 2) * 0.78,
  }));
  fill(sideRows, sideCols, -Math.PI / 2, (row, col) => ({
    x: 40.2 + row * 0.82,
    y: 0.78 + row * 0.4,
    z: (col - (sideCols - 1) / 2) * 0.78,
  }));

  const endRows = 9;
  const endCols = 42;
  for (let row = 0; row < endRows; row++) {
    const depth = -62.5 - row * 0.82;
    const step = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 0.95), concrete);
    step.position.set(0, 0.73 + row * 0.42, depth);
    step.receiveShadow = true;
    group.add(step);
    const opposite = step.clone();
    opposite.position.z = -depth;
    group.add(opposite);
  }
  fill(endRows, endCols, 0, (row, col) => ({
    x: (col - (endCols - 1) / 2) * 0.78,
    y: 0.92 + row * 0.42,
    z: -62.2 - row * 0.82,
  }));
  fill(endRows, endCols, Math.PI, (row, col) => ({
    x: (col - (endCols - 1) / 2) * 0.78,
    y: 0.92 + row * 0.42,
    z: 62.2 + row * 0.82,
  }));

  seats.count = Math.max(1, seatIndex);
  backs.count = seats.count;
  torso.count = Math.max(1, personIndex);
  head.count = torso.count;
  hair.count = torso.count;
  for (const mesh of [seats, backs, torso, head, hair]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  group.add(seats, backs);
  if (personIndex > 0) group.add(torso, head, hair);

  const westName = fascia(info.name);
  westName.position.set(-38.2, 1.55, 0);
  westName.rotation.y = Math.PI / 2;
  group.add(westName);
  const eastName = fascia(info.name);
  eastName.position.set(38.2, 1.55, 0);
  eastName.rotation.y = -Math.PI / 2;
  group.add(eastName);
}

function fascia(name: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#12181f';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#e2b657';
  ctx.fillRect(0, 0, 1024, 10);
  ctx.font = '700 64px Barlow Condensed, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7f4ea';
  ctx.fillText(name.toUpperCase(), 512, 72);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
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
