import * as THREE from 'three';
import type { AimPreview } from '../sim/aim';

/** Trajectory, catch zone, and receiver mark drawn from the match aim preview. */
export class AimGuide {
  readonly group = new THREE.Group();
  private readonly line: THREE.Line;
  private readonly spread: THREE.Line;
  private readonly landing: THREE.Mesh;
  private readonly catchZone: THREE.Mesh;
  private readonly receiver: THREE.Mesh;
  private readonly lineGeo = new THREE.BufferGeometry();
  private readonly spreadGeo = new THREE.BufferGeometry();

  constructor() {
    const lineMat = new THREE.LineBasicMaterial({ color: '#f4f0e2', transparent: true, opacity: 0.9 });
    const spreadMat = new THREE.LineBasicMaterial({ color: '#f4f0e2', transparent: true, opacity: 0.35 });
    this.line = new THREE.Line(this.lineGeo, lineMat);
    this.spread = new THREE.Line(this.spreadGeo, spreadMat);
    this.line.frustumCulled = false;
    this.spread.frustumCulled = false;
    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 20),
      new THREE.MeshBasicMaterial({ color: '#e2b657', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.catchZone = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: '#7dcea0', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.receiver = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 24),
      new THREE.MeshBasicMaterial({ color: '#7dcea0', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    for (const mesh of [this.landing, this.catchZone, this.receiver]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.06;
      mesh.frustumCulled = false;
    }
    this.group.add(this.line, this.spread, this.landing, this.catchZone, this.receiver);
    this.group.visible = false;
  }

  sync(aim: AimPreview | null, players: { id: number; x: number; z: number }[]): void {
    if (!aim || aim.points.length < 2) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.setLine(this.line, this.lineGeo, aim.points);
    this.setLine(this.spread, this.spreadGeo, aim.spread);
    const risk = aim.risk;
    const color = risk > 0.66 ? '#e06a5c' : risk > 0.35 ? '#e2b657' : '#d7efe2';
    (this.line.material as THREE.LineBasicMaterial).color.set(color);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(color);
    this.landing.position.set(aim.landing.x, 0.06, aim.landing.z);
    const zone = aim.catch;
    this.catchZone.visible = Boolean(zone);
    if (zone) {
      this.catchZone.position.set(zone.x, 0.05, zone.z);
      this.catchZone.scale.set(zone.radius, zone.radius, 1);
    }
    const receiver = aim.receiverId === null ? undefined : players.find((player) => player.id === aim.receiverId);
    this.receiver.visible = Boolean(receiver);
    if (receiver) this.receiver.position.set(receiver.x, 0.07, receiver.z);
  }

  private setLine(line: THREE.Line, geo: THREE.BufferGeometry, points: { x: number; y: number; z: number }[]): void {
    if (points.length < 2) {
      line.visible = false;
      return;
    }
    line.visible = true;
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = Math.max(0.15, point.y);
      positions[index * 3 + 2] = point.z;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
  }
}
