import * as THREE from 'three';
import type { StadiumInfo } from '../data/teams';

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
}

export function buildStadium(info: StadiumInfo, quality: 'low' | 'medium' | 'high'): BuiltStadium {
  const group = new THREE.Group();
  group.name = info.id;
  const peopleCap = quality === 'low' ? 0 : quality === 'medium' ? 700 : 1400;

  const turf = new THREE.Mesh(new THREE.PlaneGeometry(92, 132), fieldMaterial());
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  group.add(turf);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 150),
    new THREE.MeshStandardMaterial({ color: '#3c4650', roughness: 0.92 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  group.add(apron);

  addPosts(group, 50);
  addPosts(group, -50);

  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.46, 0.28, 0.4),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    4200,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 6, 5),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
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
      heads.setMatrixAt(headIndex, new THREE.Matrix4().makeTranslation(x, y + 0.42, z));
      heads.setColorAt(headIndex, (row + col) % 2 === 0 ? shirt : skinTones[(row + col) % skinTones.length]);
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
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(seats);
  if (peopleCap > 0) group.add(heads);

  const roofMat = new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 78), roofMat);
  roof.position.set(52, 10.5, 0);
  group.add(roof);
  const roof2 = roof.clone();
  roof2.position.x = -52;
  group.add(roof2);

  addBoards(group);
  addLights(group, info.night);
  const { meshes, contexts } = addScoreboards(group);
  addTunnel(group);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(78, 86, 8, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: info.bowl, roughness: 0.9, side: THREE.DoubleSide }),
  );
  bowl.position.y = 2;
  group.add(bowl);

  return { group, scoreboards: meshes, scoreCtx: contexts, night: info.night };
}

function addPosts(group: THREE.Group, z: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.35, metalness: 0.15 });
  const pad = new THREE.MeshStandardMaterial({ color: '#d7dde3', roughness: 0.8 });
  for (const x of [-2.75, 2.75]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 8, 8), mat);
    post.position.set(x, 4, z);
    group.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8), pad);
    base.position.set(x, 0.6, z);
    group.add(base);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5.5, 8), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 3, z);
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

function addLights(group: THREE.Group, night: boolean): void {
  const poleMat = new THREE.MeshStandardMaterial({ color: '#c5ced6', metalness: 0.4, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#fff4d2',
    emissive: night ? '#fff1c9' : '#665533',
    emissiveIntensity: night ? 1.4 : 0.3,
  });
  for (const [x, z] of [[-40, -48], [40, -48], [-40, 48], [40, 48]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 18, 6), poleMat);
    pole.position.set(x, 9, z);
    group.add(pole);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 1.2), lampMat);
    bank.position.set(x, 18, z);
    group.add(bank);
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

function fieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      float band(float value, float at, float width) {
        float d = abs(value - at);
        return 1.0 - smoothstep(width * 0.35, width, d);
      }
      void main() {
        float stripe = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vWorld.z * 0.78));
        vec3 a = vec3(0.09, 0.38, 0.16);
        vec3 b = vec3(0.16, 0.48, 0.2);
        vec3 grass = mix(a, b, stripe);
        float n = fract(sin(dot(floor(vWorld.xz * 6.0), vec2(127.1, 311.7))) * 43758.5453);
        grass *= 0.93 + n * 0.1;
        if (abs(vWorld.z) > 50.0 && abs(vWorld.z) < 58.0) grass = mix(grass, vec3(0.12, 0.42, 0.22), 0.35);
        float line = 0.0;
        line = max(line, band(vWorld.z, 0.0, 0.14));
        line = max(line, band(vWorld.z, 10.0, 0.1));
        line = max(line, band(vWorld.z, -10.0, 0.1));
        line = max(line, band(vWorld.z, 20.0, 0.1));
        line = max(line, band(vWorld.z, -20.0, 0.1));
        line = max(line, band(vWorld.z, 30.0, 0.1));
        line = max(line, band(vWorld.z, -30.0, 0.1));
        line = max(line, band(vWorld.z, 40.0, 0.1));
        line = max(line, band(vWorld.z, -40.0, 0.1));
        line = max(line, band(vWorld.z, 50.0, 0.18));
        line = max(line, band(vWorld.z, -50.0, 0.18));
        line = max(line, band(vWorld.z, 58.0, 0.1));
        line = max(line, band(vWorld.z, -58.0, 0.1));
        line = max(line, band(abs(vWorld.x), 34.0, 0.12));
        if (abs(vWorld.x) > 34.15 && abs(vWorld.z) < 49.8) line = min(line, band(abs(vWorld.x), 34.0, 0.12));
        if (abs(vWorld.x) > 34.3 || abs(vWorld.z) > 58.3) {
          grass = mix(grass, vec3(0.22, 0.2, 0.16), 0.72);
          line = 0.0;
        }
        vec3 col = mix(grass, vec3(0.94, 0.95, 0.93), clamp(line, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
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
