import * as THREE from 'three';

export interface PitchSurface {
  material: THREE.MeshStandardMaterial;
  readonly rain: number;
  setRain(amount: number): void;
}

const PITCH_GLSL = /* glsl */ `
float pitchHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float pitchNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = pitchHash(i);
  float b = pitchHash(i + vec2(1.0, 0.0));
  float c = pitchHash(i + vec2(0.0, 1.0));
  float d = pitchHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.y), f.y);
}
`;

/** Mown turf that takes stadium light and turns darker and shinier in the rain. */
export function buildPitchMaterial(quality: 'low' | 'medium' | 'high'): PitchSurface {
  const scale = quality === 'high' ? 2 : quality === 'medium' ? 1 : 0.5;
  const width = Math.round(1024 * scale);
  const height = Math.round(1536 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const px = (worldX: number) => ((worldX + 46) / 92) * width;
  const py = (worldZ: number) => ((worldZ + 66) / 132) * height;
  for (let z = -66; z < 66; z += 4) {
    const y0 = py(z);
    const y1 = py(z + 4);
    const top = Math.min(y0, y1);
    const bandH = Math.abs(y1 - y0) + 1;
    const band = Math.floor((z + 66) / 4);
    const dark = band % 2 === 0;
    const gradient = ctx.createLinearGradient(0, top, 0, top + bandH);
    gradient.addColorStop(0, dark ? '#165c30' : '#2f8644');
    gradient.addColorStop(0.5, dark ? '#1e7340' : '#3c9a52');
    gradient.addColorStop(1, dark ? '#14562c' : '#2b7c3e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, top, width, bandH);
  }
  ctx.fillStyle = 'rgba(18, 48, 22, 0.22)';
  ctx.fillRect(px(-34), Math.min(py(50), py(58)), px(34) - px(-34), Math.abs(py(58) - py(50)));
  ctx.fillRect(px(-34), Math.min(py(-58), py(-50)), px(34) - px(-34), Math.abs(py(-50) - py(-58)));
  ctx.fillStyle = '#5e5648';
  ctx.fillRect(0, 0, px(-34.4), height);
  ctx.fillRect(px(34.4), 0, width - px(34.4), height);
  ctx.fillRect(0, 0, width, Math.min(py(-58.4), py(58.4)));
  ctx.fillRect(0, Math.max(py(-58.4), py(58.4)), width, height);
  ctx.fillStyle = 'rgba(30, 24, 16, 0.28)';
  ctx.beginPath();
  ctx.ellipse(px(0), py(0), Math.abs(px(7) - px(0)), Math.abs(py(14) - py(0)), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px(-8), py(22), Math.abs(px(4) - px(0)), Math.abs(py(6) - py(0)), 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px(9), py(-18), Math.abs(px(3.5) - px(0)), Math.abs(py(5) - py(0)), -0.3, 0, Math.PI * 2);
  ctx.fill();
  const specks = quality === 'low' ? 900 : 2800;
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#102818' : '#c6e4b4';
    ctx.fillRect((i * 97) % width, (i * 53) % height, 2, 3);
  }
  ctx.globalAlpha = 1;
  const across = (z: number, thick: number) => {
    const y = py(z);
    ctx.fillRect(px(-34), y - thick / 2, px(34) - px(-34), thick);
  };
  const touch = (x: number) => {
    const left = px(x);
    ctx.fillRect(left - 2, Math.min(py(-58), py(58)), 4, Math.abs(py(58) - py(-58)));
  };
  const paintMarkings = () => {
    for (const z of [-40, -30, -20, -10, 10, 20, 30, 40]) across(z, 3);
    across(0, 4);
    across(50, 5);
    across(-50, 5);
    across(58, 3);
    across(-58, 3);
    touch(-34);
    touch(34);
  };
  ctx.fillStyle = 'rgba(8, 28, 14, 0.4)';
  ctx.save();
  ctx.translate(2, 2);
  paintMarkings();
  ctx.restore();
  ctx.fillStyle = '#f4f7f2';
  paintMarkings();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality === 'high' ? 8 : 4;
  const rain = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 });
  material.customProgramCacheKey = () => 'meridian-pitch-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRain = rain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPitchWorld;\n')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPitchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPitchWorld;\nuniform float uRain;\n${PITCH_GLSL}\n`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float infield = smoothstep(0.45, 0.05, max(abs(vPitchWorld.x) - 34.15, abs(vPitchWorld.z) - 58.15));
        float speckle = pitchNoise(vPitchWorld.xz * 4.5);
        diffuseColor.rgb *= 0.94 + speckle * 0.1;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.58, 0.68, 0.6), clamp(uRain, 0.0, 1.0) * infield);
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float mowing = smoothstep(0.4, 0.6, fract(vPitchWorld.z * 0.25));
        roughnessFactor = mix(0.96, 0.68, mowing);
        roughnessFactor = mix(roughnessFactor, 0.26, clamp(uRain, 0.0, 1.0));
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float nx = pitchNoise(vPitchWorld.xz * 18.0) - 0.5;
        float nz = pitchNoise(vPitchWorld.xz * 18.0 + vec2(2.2, 5.1)) - 0.5;
        float stripeN = sin(vPitchWorld.z * 1.5707963);
        vec3 blades = normalize(vec3(nx, 3.4, nz + stripeN * 0.45));
        normal = normalize(normal + mat3(viewMatrix) * blades * 0.62);
        `,
      );
  };
  return {
    material,
    get rain() {
      return rain.value;
    },
    setRain(amount: number) {
      rain.value = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    },
  };
}
