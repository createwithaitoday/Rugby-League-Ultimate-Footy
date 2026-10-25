import * as THREE from 'three';

export interface MatchBall {
  group: THREE.Group;
  shadow: THREE.Mesh;
  orient(dt: number, ball: BallPose, time: number): void;
}

export interface BallPose {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: 'held' | 'flight' | 'rolling' | 'dead';
  spin: number;
}

/** A leather ball with panel seams, pointed along the kick when it is in the air. */
export function createMatchBall(): MatchBall {
  const group = new THREE.Group();
  const leather = new THREE.SphereGeometry(1, 28, 18);
  leather.scale(0.112, 0.104, 0.148);
  const mesh = new THREE.Mesh(leather, leatherMaterial());
  mesh.castShadow = true;
  group.add(mesh);
  const lace = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.018, 0.07),
    new THREE.MeshStandardMaterial({ color: '#c6a15a', roughness: 0.42, metalness: 0.08 }),
  );
  lace.position.set(0, 0.1, 0);
  lace.castShadow = true;
  group.add(lace);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshBasicMaterial({ color: '#041208', transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  let spin = 0;
  const ahead = new THREE.Vector3(0, 0, 1);
  return {
    group,
    shadow,
    orient(dt, ball, time) {
      group.position.set(ball.x, Math.max(0.12, ball.y), ball.z);
      const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
      if (ball.mode === 'flight' && speed > 0.35) {
        spin += dt * (9 + Math.abs(ball.spin) * 3 + speed * 0.15);
        const dir = new THREE.Vector3(ball.vx, ball.vy, ball.vz).normalize();
        group.quaternion.setFromUnitVectors(ahead, dir);
        group.rotateZ(spin);
      } else if (ball.mode === 'rolling') {
        spin += dt * Math.max(2.2, speed) * 2.4;
        group.rotation.set(spin, 0, Math.PI * 0.5);
      } else if (ball.mode === 'flight') {
        spin += dt * 8;
        group.rotation.set(spin * 0.4, spin, 0.2);
      } else {
        group.rotation.set(0.35, time * 0.35, 0.15);
      }
      const lift = Math.max(0, ball.y - 0.14);
      const mat = shadow.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.04, 0.34 - lift * 0.07);
      shadow.position.set(ball.x, 0.03, ball.z);
      const spread = 1 + lift * 0.12;
      shadow.scale.set(spread, spread, 1);
    },
  };
}

function leatherMaterial(): THREE.MeshPhysicalMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2eee4';
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(92, 70, 42, 0.16)' : 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect((i * 47) % 256, (i * 19) % 128, 2, 1);
  }
  ctx.strokeStyle = '#2c261c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.bezierCurveTo(78, 36, 50, 92, 64, 128);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(192, 0);
  ctx.bezierCurveTo(178, 36, 206, 92, 192, 128);
  ctx.stroke();
  ctx.strokeStyle = '#b8924a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(128, 90);
  ctx.stroke();
  for (let y = 46; y <= 84; y += 8) {
    ctx.beginPath();
    ctx.moveTo(121, y);
    ctx.lineTo(135, y);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.46,
    metalness: 0.03,
    clearcoat: 0.32,
    clearcoatRoughness: 0.42,
  });
}
