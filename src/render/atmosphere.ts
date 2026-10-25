import * as THREE from 'three';
import type { Weather } from '../sim/types';

const MAX_DROPS = 1400;

/** Rain streaks. Density follows the graphics setting. */
export class MatchAtmosphere {
  private readonly points: THREE.Points;
  private readonly speeds: Float32Array;
  private active = 0;

  constructor(scene: THREE.Scene) {
    const positions = new Float32Array(MAX_DROPS * 3);
    this.speeds = new Float32Array(MAX_DROPS);
    for (let i = 0; i < MAX_DROPS; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 52;
      this.speeds[i] = 14 + Math.random() * 10;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(geometry, streakMaterial());
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.active = quality === 'high' ? MAX_DROPS : quality === 'medium' ? 700 : 0;
    this.points.geometry.setDrawRange(0, this.active);
  }

  setNight(_night: boolean): void {
    // The lamp banks on the stadium stay. Light cones were covering the stands.
  }

  update(dt: number, weather: Weather, focus: { x: number; z: number }): void {
    const rain = Math.max(0, Math.min(1, weather.rain));
    this.points.visible = rain > 0.02 && this.active > 0;
    if (this.points.visible) {
      const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.active; i++) {
        let x = position.getX(i) + weather.windX * dt * 1.6;
        let y = position.getY(i) - dt * this.speeds[i] * (0.65 + rain);
        let z = position.getZ(i) + weather.windZ * dt * 1.6;
        if (y < 0.05) y = 12 + Math.random() * 12;
        if (x > focus.x + 24) x -= 48;
        if (x < focus.x - 24) x += 48;
        if (z > focus.z + 28) z -= 56;
        if (z < focus.z - 28) z += 56;
        position.setXYZ(i, x, y, z);
      }
      position.needsUpdate = true;
      const mat = this.points.material as THREE.PointsMaterial;
      mat.opacity = 0.12 + rain * 0.38;
    }
  }
}

function streakMaterial(): THREE.PointsMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.35, 'rgba(232,240,248,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(6, 0, 4, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.PointsMaterial({
    color: '#e7eef6',
    size: 0.55,
    map,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    sizeAttenuation: true,
  });
}
