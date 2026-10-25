import * as THREE from 'three';

/** Blood spray, impact sparks, and injury marks for high-contact collisions. */
export class ImpactFX {
  readonly group = new THREE.Group();
  private readonly blood: THREE.Points;
  private readonly sparks: THREE.Points;
  private readonly bloodVel: Float32Array;
  private readonly sparkVel: Float32Array;
  private readonly bloodLife: Float32Array;
  private readonly sparkLife: Float32Array;
  private readonly stains: THREE.InstancedMesh;
  private stainCount = 0;
  private readonly dummy = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor() {
    const bloodCount = 420;
    const sparkCount = 180;
    const bloodGeo = new THREE.BufferGeometry();
    const bloodPos = new Float32Array(bloodCount * 3);
    bloodGeo.setAttribute('position', new THREE.BufferAttribute(bloodPos, 3));
    this.bloodVel = new Float32Array(bloodCount * 3);
    this.bloodLife = new Float32Array(bloodCount);
    this.blood = new THREE.Points(
      bloodGeo,
      new THREE.PointsMaterial({
        color: '#8b0a0a',
        size: 0.11,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    this.sparkVel = new Float32Array(sparkCount * 3);
    this.sparkLife = new Float32Array(sparkCount);
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        color: '#ffd27a',
        size: 0.08,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    this.stains = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.35, 10),
      new THREE.MeshBasicMaterial({ color: '#4a0606', transparent: true, opacity: 0.55, depthWrite: false }),
      64,
    );
    this.stains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stains.count = 0;
    this.group.add(this.blood, this.sparks, this.stains);
  }

  burst(x: number, z: number, power: number, bloody: boolean): void {
    const bloodPos = this.blood.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sparkPos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nBlood = bloody ? Math.floor(40 + power * 80) : Math.floor(8 + power * 20);
    const nSpark = Math.floor(18 + power * 40);
    let spawned = 0;
    for (let i = 0; i < this.bloodLife.length && spawned < nBlood; i++) {
      if (this.bloodLife[i] > 0.05) continue;
      this.bloodLife[i] = 0.55 + Math.random() * 0.7;
      bloodPos.setXYZ(i, x + (Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.3);
      this.bloodVel[i * 3] = (Math.random() - 0.5) * (2.2 + power * 4);
      this.bloodVel[i * 3 + 1] = 1.5 + Math.random() * (2 + power * 3);
      this.bloodVel[i * 3 + 2] = (Math.random() - 0.5) * (2.2 + power * 4);
      spawned += 1;
    }
    spawned = 0;
    for (let i = 0; i < this.sparkLife.length && spawned < nSpark; i++) {
      if (this.sparkLife[i] > 0.05) continue;
      this.sparkLife[i] = 0.25 + Math.random() * 0.35;
      sparkPos.setXYZ(i, x, 1.2, z);
      this.sparkVel[i * 3] = (Math.random() - 0.5) * 6;
      this.sparkVel[i * 3 + 1] = 2 + Math.random() * 5;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 6;
      spawned += 1;
    }
    bloodPos.needsUpdate = true;
    sparkPos.needsUpdate = true;
    if (bloody && this.stainCount < 64) {
      const i = this.stainCount++;
      this.dummy.compose(
        new THREE.Vector3(x + (Math.random() - 0.5) * 0.8, 0.035, z + (Math.random() - 0.5) * 0.8),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
        new THREE.Vector3(0.6 + power, 0.6 + power, 0.6 + power),
      );
      this.stains.setMatrixAt(i, this.dummy);
      this.color.setHSL(0.98, 0.85, 0.12 + Math.random() * 0.08);
      this.stains.setColorAt(i, this.color);
      this.stains.count = this.stainCount;
      this.stains.instanceMatrix.needsUpdate = true;
      if (this.stains.instanceColor) this.stains.instanceColor.needsUpdate = true;
    }
  }

  update(dt: number): void {
    const bloodPos = this.blood.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sparkPos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.bloodLife.length; i++) {
      if (this.bloodLife[i] <= 0) continue;
      this.bloodLife[i] -= dt;
      const y = bloodPos.getY(i) + this.bloodVel[i * 3 + 1] * dt;
      this.bloodVel[i * 3 + 1] -= 9.5 * dt;
      bloodPos.setXYZ(
        i,
        bloodPos.getX(i) + this.bloodVel[i * 3] * dt,
        Math.max(0.04, y),
        bloodPos.getZ(i) + this.bloodVel[i * 3 + 2] * dt,
      );
      if (y <= 0.05) this.bloodVel[i * 3 + 1] *= -0.15;
    }
    for (let i = 0; i < this.sparkLife.length; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      sparkPos.setXYZ(
        i,
        sparkPos.getX(i) + this.sparkVel[i * 3] * dt,
        sparkPos.getY(i) + this.sparkVel[i * 3 + 1] * dt,
        sparkPos.getZ(i) + this.sparkVel[i * 3 + 2] * dt,
      );
      this.sparkVel[i * 3 + 1] -= 12 * dt;
    }
    bloodPos.needsUpdate = true;
    sparkPos.needsUpdate = true;
    (this.blood.material as THREE.PointsMaterial).opacity = 0.85;
    (this.sparks.material as THREE.PointsMaterial).opacity = 0.75;
  }

  clear(): void {
    this.stainCount = 0;
    this.stains.count = 0;
    this.bloodLife.fill(0);
    this.sparkLife.fill(0);
  }
}
