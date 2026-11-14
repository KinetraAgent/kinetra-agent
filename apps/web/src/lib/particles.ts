import * as THREE from "three";

// One particle system that becomes every chapter of the story. Each particle carries a position for every
// shape; the shader blends between neighbours as uStage moves, so the mark, the orbits, the warp, the bloom
// and the iris are always the same points rearranging themselves.

const RING_R = [0.42, 0.62, 0.84, 1.06, 1.3];
const RING_SPEED = [0.55, -0.38, 0.3, -0.22, 0.16];
const RING_TILT: [number, number, number][] = [
  [1.35, 0, 0.5],
  [0.25, 0, 1.15],
  [1.45, 0.6, -0.3],
  [0.18, 0, -0.12],
  [0.95, 0, 1.45],
];
const CUTS = [-1, -0.6, -0.2, 0.22, 0.6, 1];

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

const VERT = /* glsl */ `
uniform float uTime, uStage, uScaleK, uAlpha;
uniform float uOpen, uLogoScale, uLogoAlpha, uHalo, uFlow;
uniform float uBloomOpen, uBloomY, uScatter, uPupil;
uniform mat4 uLogoM;
uniform mat3 uRingRot[5];
uniform float uRingR[5];
uniform float uRingS[5];
uniform vec2 uLook;
uniform vec3 uMouse;
uniform float uMouseK;

attribute vec4 aLogo;
attribute vec4 aRing;
attribute vec4 aWarp;
attribute vec4 aEmber;
attribute vec4 aIris;
attribute vec2 aBloom;
attribute vec4 aRand;

varying vec3 vColor;
varying float vAlpha;
varying float vBokeh;

const float PI = 3.14159265;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
float hash(float n) { return fract(sin(n) * 43758.5453); }

// 0: the KINETRA mark, matching the ribbon meshes so the dissolve lines up
vec3 logo(out vec3 c, out float s, out float a) {
  float k = aLogo.w;
  vec3 p = rotY(aLogo.xyz, (k - 2.0) * uOpen * 0.55);
  p.y += (k - 2.0) * uOpen * 0.42;
  p = (uLogoM * vec4(p, 1.0)).xyz * uLogoScale;
  c = mix(vec3(0.36, 0.42, 1.0), vec3(0.5, 0.96, 1.0), (aLogo.y + 1.0) * 0.5);
  s = 1.4 + aRand.z;
  a = uLogoAlpha;
  return p;
}

// 1: five orbits around a hot core, inside a cloud of dust
vec3 rings(out vec3 c, out float s, out float a) {
  vec3 p;
  if (aRing.w < -1.5) {
    p = rotY(aRing.xyz, uTime * 0.04) * uHalo;
    c = vec3(0.72, 0.85, 1.0);
    s = 1.1 + aRand.z * 1.5;
    a = 0.45;
  } else if (aRing.w < -0.5) {
    p = aRing.xyz * (1.0 + 0.12 * sin(uTime * 2.2 + aRand.x * 6.283));
    c = vec3(1.0, 0.86, 0.58);
    s = 2.4;
    a = 0.8;
  } else {
    int i = int(aRing.w + 0.5);
    float ang = aRing.x + uTime * uRingS[i];
    float R = uRingR[i] + aRing.y;
    p = uRingRot[i] * vec3(cos(ang) * R, aRing.z, sin(ang) * R);
    c = aRand.y > 0.8 ? vec3(0.55, 0.93, 1.0) : vec3(1.0, 0.92, 0.76);
    s = 1.5 + aRand.z * 1.2;
    a = 0.95;
  }
  return p;
}

// 2: a tunnel of sparks streaming past the camera
vec3 warp(out vec3 c, out float s, out float a) {
  float z = -11.0 + mod(aWarp.z + uFlow * aWarp.w, 16.0);
  float ang = aWarp.x + z * 0.04;
  vec3 p = vec3(cos(ang) * aWarp.y, sin(ang) * aWarp.y, z);
  c = mix(vec3(1.0, 0.74, 0.32), vec3(1.0, 0.95, 0.86), aRand.y);
  s = 1.4 + aRand.z * 1.6;
  a = smoothstep(-11.0, -7.0, z) * (1.0 - smoothstep(3.2, 4.3, z));
  return p;
}

// 3: slow embers and a few out-of-focus lights
vec3 embers(out vec3 c, out float s, out float a, out float b) {
  float ph = aEmber.w * 6.283;
  vec3 p = aEmber.xyz + vec3(sin(uTime * 0.2 + ph) * 0.35, cos(uTime * 0.16 + ph * 1.3) * 0.3, sin(uTime * 0.12 + ph * 0.7) * 0.25);
  float rise = mod(aEmber.w * 5.2 + uTime * 0.05, 1.0);
  p.y += rise * 1.2 - 0.6;
  bool big = aRand.x > 0.955;
  c = aRand.y > 0.42 ? vec3(1.0, 0.66, 0.26) : vec3(0.72, 0.86, 1.0);
  s = big ? 9.0 + aRand.z * 20.0 : 1.0 + aRand.z * 1.4;
  a = (big ? 0.5 : 0.3) * sin(rise * PI);
  b = big ? 1.0 : 0.0;
  return p;
}

// 4 and 5: the mark grows back as a bud on a stem and opens; with scatter > 0 its petals come loose
vec3 bloom(float scatter, out vec3 c, out float s, out float a) {
  float open = uBloomOpen;
  if (aRand.w < 0.05) {
    float v = aRand.z;
    vec3 p = vec3(sin(v * 5.0 + uTime * 0.4) * 0.04 * v + (aRand.y - 0.5) * 0.025, -0.06 - v * 3.4 + uBloomY, (aRand.x - 0.5) * 0.03);
    p += vec3(aRand.x - 0.5, -aRand.y, aRand.z - 0.5) * scatter * (0.6 + aRand.w * 40.0);
    c = vec3(0.3, 0.95, 0.8);
    s = 1.3;
    a = 0.75 * (1.0 - scatter * 0.6);
    return p;
  }
  float k = aLogo.w;
  float o = (4.0 - k) * 0.25;
  float seg = 2.0 * PI / 5.0;
  float off = k * 0.63;
  float ang = atan(aLogo.z, aLogo.x);
  float idx = floor((ang + off) / seg + 0.5);
  float center = idx * seg - off;
  float u = aBloom.x;
  float da = ang - center;
  float edge = clamp(abs(da) / (seg * 0.5), 0.0, 1.0);
  float w = pow(sin(PI * u), 0.75) * 0.5;
  float pa = center + da * w * (0.55 + 0.45 * open);
  float phi = mix(0.1 + 0.05 * o, 0.35 + 1.05 * o, open);
  float len = mix(0.36 + 0.06 * o, 0.55 + 0.6 * o, open);
  vec3 dir = vec3(cos(pa), 0.0, sin(pa));
  vec3 p = dir * (sin(phi) * len * u + open * o * 0.22 * u * u * len + 0.035 * (1.0 - u))
         + vec3(0.0, cos(phi) * len * u - open * o * 0.1 * u * u * len, 0.0);
  p = rotX(rotY(p, uTime * 0.07), 0.32);

  float g = k * 5.0 + mod(idx, 5.0);
  vec3 gd = normalize(vec3(hash(g * 1.7) - 0.5, hash(g * 3.1) - 0.3, hash(g * 5.3) - 0.5));
  if (aRand.y < 0.25) gd = normalize(vec3(aRand.x - 0.5, aRand.z - 0.3, aRand.w - 0.5));
  float spin = (hash(g * 7.7) - 0.5) * 4.0 * scatter;
  p = rotY(rotX(p, spin * 0.6), spin) + gd * scatter * (1.2 + hash(g * 9.1) * 2.8);
  p.y += uBloomY;

  c = mix(vec3(0.5, 0.82, 1.0), vec3(1.0), edge * edge * 0.9 + (1.0 - u) * 0.1);
  s = 1.2 + edge * 1.4 + aRand.z * 0.6;
  a = 0.32 + edge * edge * 0.68;
  return p;
}

// 6: an iris of fibres around a dark pupil that follows the cursor
vec3 iris(out vec3 c, out float s, out float a) {
  float r = aIris.y;
  float outer = max(1.3, uPupil + 0.95);
  float rr = mix(uPupil, outer, r);
  float ang = aIris.x + sin(r * 13.0 + aRand.x * 40.0) * 0.03 + sin(r * 4.0 + aIris.x * 9.0) * 0.025 + uTime * 0.01;
  vec3 p = vec3(cos(ang) * rr, sin(ang) * rr, aIris.z - r * 0.18);
  p.xy += uLook * (1.0 - r) * 0.22;
  vec3 inner = vec3(0.25, 0.85, 0.72);
  vec3 mid = vec3(0.35, 0.88, 1.0);
  vec3 rim = vec3(0.78, 0.88, 1.0);
  c = r < 0.45 ? mix(inner, mid, r / 0.45) : mix(mid, rim, (r - 0.45) / 0.55);
  c = mix(c, vec3(1.0), step(0.86, aRand.y) * 0.6);
  s = 1.1 + aRand.z * 1.1 + aIris.w * 0.4;
  a = (0.55 + 0.45 * aRand.y) * (1.0 + aIris.w * 0.2);
  return p;
}

vec3 shape(float i, out vec3 c, out float s, out float a, out float b) {
  b = 0.0;
  if (i < 0.5) return logo(c, s, a);
  if (i < 1.5) return rings(c, s, a);
  if (i < 2.5) return warp(c, s, a);
  if (i < 3.5) return embers(c, s, a, b);
  if (i < 4.5) return bloom(0.0, c, s, a);
  if (i < 5.5) return bloom(uScatter, c, s, a);
  return iris(c, s, a);
}

void main() {
  float i0 = floor(uStage);
  float f = uStage - i0;
  // each particle leaves a little later than the last, so shapes pour into each other
  float t = smoothstep(0.0, 1.0, clamp((f - aRand.x * 0.4) / 0.6, 0.0, 1.0));
  vec3 c; float s; float a; float b;
  vec3 p = shape(i0, c, s, a, b);
  if (t > 0.0) {
    vec3 c1; float s1; float a1; float b1;
    vec3 p1 = shape(i0 + 1.0, c1, s1, a1, b1);
    p = mix(p, p1, t);
    c = mix(c, c1, t);
    s = mix(s, s1, t);
    a = mix(a, a1, t);
    b = mix(b, b1, t);
    p += vec3(sin(p.y * 2.3 + uTime * 0.9 + aRand.y * 6.0), sin(p.z * 1.9 + uTime * 0.7 + aRand.z * 6.0), sin(p.x * 2.1 + uTime * 0.8 + aRand.w * 6.0)) * sin(PI * t) * 0.45;
  }
  vec2 d = p.xy - uMouse.xy;
  float dd = dot(d, d);
  p.xy += d * inversesqrt(dd + 1e-4) * uMouseK * 0.3 * exp(-dd * 7.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float z = -mv.z;
  gl_PointSize = clamp(s * uScaleK / max(z, 0.1), 0.0, 64.0);
  vColor = c;
  vAlpha = a * uAlpha * smoothstep(0.15, 0.8, z);
  vBokeh = b;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vBokeh;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float glow = exp(-d * 5.0);
  float disc = smoothstep(1.0, 0.7, d) * 0.45 + glow * 0.35;
  gl_FragColor = vec4(vColor, mix(glow, disc, vBokeh) * vAlpha);
}
`;

/** Samples the ribbon meshes and lays out every other shape. */
export function storyParticles(count: number, ribbons: THREE.BufferGeometry[]) {
  const aLogo = new Float32Array(count * 4);
  const aRing = new Float32Array(count * 4);
  const aWarp = new Float32Array(count * 4);
  const aEmber = new Float32Array(count * 4);
  const aIris = new Float32Array(count * 4);
  const aBloom = new Float32Array(count * 2);
  const aRand = new Float32Array(count * 4);
  const pos = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const i4 = i * 4;

    // a random point on a random triangle of ribbon k
    const k = i % 5;
    const g = ribbons[k];
    const P = g.attributes.position;
    const idx = g.index!;
    const tri = ((Math.random() * idx.count) / 3) | 0;
    a.fromBufferAttribute(P, idx.getX(tri * 3));
    b.fromBufferAttribute(P, idx.getX(tri * 3 + 1));
    c.fromBufferAttribute(P, idx.getX(tri * 3 + 2));
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const x = a.x + (b.x - a.x) * u + (c.x - a.x) * v;
    const y = a.y + (b.y - a.y) * u + (c.y - a.y) * v;
    const z = a.z + (b.z - a.z) * u + (c.z - a.z) * v;
    aLogo.set([x, y, z, k], i4);
    pos.set([x, y, z], i * 3);
    aBloom[i * 2] = Math.min(Math.max((y - CUTS[k]) / (CUTS[k + 1] - CUTS[k]), 0), 1);
    aBloom[i * 2 + 1] = Math.random();

    const r = Math.random();
    if (r < 0.62) {
      aRing.set([Math.random() * Math.PI * 2, gauss() * 0.014, gauss() * 0.014, i % 5], i4);
    } else if (r < 0.72) {
      const d = new THREE.Vector3().randomDirection().multiplyScalar(Math.abs(gauss()) * 0.14);
      aRing.set([d.x, d.y, d.z, -1], i4);
    } else {
      const d = new THREE.Vector3().randomDirection().multiplyScalar(1.9 + Math.random() * 2.2);
      aRing.set([d.x, d.y, d.z, -2], i4);
    }

    aWarp.set([Math.random() * Math.PI * 2, 0.15 + Math.pow(Math.random(), 0.6) * 2.6, Math.random() * 16, 0.6 + Math.random() * 0.8], i4);
    aEmber.set([(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5.2, -5 + Math.random() * 7.5, Math.random()], i4);

    const kind = Math.random();
    const fibre = Math.floor(Math.random() * 420) + gauss() * 0.15;
    const ir = kind < 0.08 ? 0.3 + gauss() * 0.03 : kind < 0.2 ? 0.97 + gauss() * 0.02 : Math.pow(Math.random(), 0.85);
    aIris.set([(fibre / 420) * Math.PI * 2, ir, gauss() * 0.03, kind < 0.2 ? 1 : 0], i4);

    aRand.set([Math.random(), Math.random(), Math.random(), Math.random()], i4);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aLogo", new THREE.BufferAttribute(aLogo, 4));
  geo.setAttribute("aRing", new THREE.BufferAttribute(aRing, 4));
  geo.setAttribute("aWarp", new THREE.BufferAttribute(aWarp, 4));
  geo.setAttribute("aEmber", new THREE.BufferAttribute(aEmber, 4));
  geo.setAttribute("aIris", new THREE.BufferAttribute(aIris, 4));
  geo.setAttribute("aBloom", new THREE.BufferAttribute(aBloom, 2));
  geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 4));

  const uniforms = {
    uTime: { value: 0 },
    uStage: { value: 0 },
    uScaleK: { value: 5 },
    uAlpha: { value: 1 },
    uOpen: { value: 0 },
    uLogoScale: { value: 1 },
    uLogoAlpha: { value: 0 },
    uHalo: { value: 1 },
    uFlow: { value: 0 },
    uBloomOpen: { value: 0 },
    uBloomY: { value: -1.6 },
    uScatter: { value: 0 },
    uPupil: { value: 0.36 },
    uLogoM: { value: new THREE.Matrix4() },
    uRingRot: { value: RING_TILT.map((e) => new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...e)))) },
    uRingR: { value: RING_R },
    uRingS: { value: RING_SPEED },
    uLook: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uMouseK: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, uniforms };
}

/** A far shell of twinkling stars. */
export function starfield(count: number) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(22 + Math.random() * 20);
    pos.set([v.x, v.y, v.z], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uPR: { value: 1 }, uAlpha: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uPR, uAlpha;
      attribute float aSeed;
      varying float vA;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.2 + fract(aSeed * 7.13) * 2.4) * uPR;
        vA = (0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 40.0)) * uAlpha * (0.25 + fract(aSeed * 3.7) * 0.75);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = dot(uv, uv);
        if (d > 1.0) discard;
        gl_FragColor = vec4(0.85, 0.92, 1.0, exp(-d * 4.0) * vA);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, uniforms };
}

/** Soft additive light used for the core, the warp flash and the bud. */
export function glowSprite() {
  const size = 128;
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  return sprite;
}

// value noise for the burn-away dissolve on the ribbon meshes
export const DISSOLVE_GLSL = /* glsl */ `
float dh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dh(i), dh(i + vec3(1, 0, 0)), f.x), mix(dh(i + vec3(0, 1, 0)), dh(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dh(i + vec3(0, 0, 1)), dh(i + vec3(1, 0, 1)), f.x), mix(dh(i + vec3(0, 1, 1)), dh(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;
