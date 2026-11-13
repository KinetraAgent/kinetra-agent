import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The KINETRA mark: a thick spherical shell cut into five ribbons along S-shaped seams.
const R = 1;
const INNER = 0.84;
const CUTS = [-0.6, -0.2, 0.22, 0.6];
const GAP = 0.045;
const wave = (phi: number) => 0.13 * Math.sin(2 * phi + 0.6);

const TOP = new THREE.Color("#46e8ff");
const MID = new THREE.Color("#2f7bff");
const LOW = new THREE.Color("#3a3dff");
const WHITE = new THREE.Color("#ffffff");

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function shade(y: number, out: THREE.Color) {
  const t = (y + 1) / 2;
  return t > 0.5 ? out.copy(MID).lerp(TOP, (t - 0.5) * 2) : out.copy(LOW).lerp(MID, t * 2);
}

function ribbon(k: number, segPhi: number, segArc: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();

  const lo = (phi: number) => (k === 0 ? -R : CUTS[k - 1] + wave(phi) + GAP);
  const hi = (phi: number) => (k === 4 ? R : CUTS[k] + wave(phi) - GAP);
  const loIn = (phi: number) => (k === 0 ? -INNER : lo(phi));
  const hiIn = (phi: number) => (k === 4 ? INNER : hi(phi));

  const tri = (a: number, b: number, d: number) => {
    // wind each triangle so its face agrees with the vertex normal
    const v = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const face = new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(d).sub(v(a)));
    const vn = new THREE.Vector3(nor[a * 3], nor[a * 3 + 1], nor[a * 3 + 2]);
    if (face.dot(vn) >= 0) idx.push(a, b, d);
    else idx.push(a, d, b);
  };

  const grid = (steps: number, at: (phi: number, t: number) => void) => {
    const base = pos.length / 3;
    for (let i = 0; i <= segPhi; i++) {
      const phi = (i / segPhi) * Math.PI * 2;
      for (let j = 0; j <= steps; j++) {
        at(phi, j / steps);
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < segPhi; i++) {
      for (let j = 0; j < steps; j++) {
        const a = base + i * (steps + 1) + j;
        const b = a + steps + 1;
        tri(a, b, a + 1);
        tri(a + 1, b, b + 1);
      }
    }
  };

  const onSphere = (radius: number, y: number, phi: number) => {
    const rho = Math.sqrt(Math.max(radius * radius - y * y, 0));
    return p.set(rho * Math.cos(phi), y, rho * Math.sin(phi));
  };

  // outer skin
  grid(segArc, (phi, t) => {
    const a = Math.asin(lo(phi) / R);
    const b = Math.asin(hi(phi) / R);
    onSphere(R, R * Math.sin(a + (b - a) * t), phi);
    n.copy(p).normalize();
    shade(p.y, c);
  });
  // inner skin, dark so the seams read deep
  grid(segArc, (phi, t) => {
    const a = Math.asin(loIn(phi) / INNER);
    const b = Math.asin(hiIn(phi) / INNER);
    onSphere(INNER, INNER * Math.sin(a + (b - a) * t), phi);
    n.copy(p).normalize().negate();
    shade(p.y, c).multiplyScalar(0.28);
  });
  // cut faces, lighter like the bevels on the logo
  const wall = (edge: (phi: number) => number, inner: (phi: number) => number, up: boolean) =>
    grid(3, (phi, t) => {
      const yo = edge(phi);
      const yi = inner(phi);
      const ro = Math.sqrt(R * R - yo * yo);
      const ri = Math.sqrt(INNER * INNER - yi * yi);
      const rho = ro + (ri - ro) * t;
      const y = yo + (yi - yo) * t;
      p.set(rho * Math.cos(phi), y, rho * Math.sin(phi));
      const e = 0.001;
      const dPhi = new THREE.Vector3(
        rho * Math.cos(phi + e) - rho * Math.cos(phi - e),
        edge(phi + e) - edge(phi - e),
        rho * Math.sin(phi + e) - rho * Math.sin(phi - e),
      );
      n.crossVectors(dPhi, new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi))).normalize();
      if ((n.y > 0) !== up) n.negate();
      shade(y, c).lerp(WHITE, up ? 0.3 : 0.08);
    });
  if (k < 4) wall(hi, hiIn, true);
  if (k > 0) wall(lo, loIn, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class KinetraSphere {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  private root = new THREE.Group();
  private core = new THREE.Group();
  private bands: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[] = [];
  private lift = [0, 0, 0, 0, 0];
  private hovered = -1;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private rayDirty = false;
  private tilt = new THREE.Vector2();
  private spin = 0;
  private velocity = 0.12;
  private dragging = false;
  private lastX = 0;
  private frame = 0;
  private clock = new THREE.Timer();
  private baseX = 0;
  private baseY = 0;
  private baseScale = 1;
  progress = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private reduced = false,
  ) {
    const mobile = matchMedia("(max-width: 900px)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight("#5ef0ff", 2.6);
    rim.position.set(4, 1, -3);
    const glow = new THREE.PointLight("#2f6bff", 7, 2.6, 1.6);
    this.scene.add(key, rim, this.root);
    this.core.add(glow);

    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.2,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    for (let k = 0; k < 5; k++) {
      const mesh = new THREE.Mesh(ribbon(k, mobile ? 96 : 160, mobile ? 18 : 28), material.clone());
      this.bands.push(mesh);
      this.core.add(mesh);
    }
    this.core.rotation.set(0.28, 0, -0.5);
    this.root.add(this.core);
    this.camera.position.set(0, 0, 5);

    canvas.addEventListener("pointerdown", this.onDown);
    addEventListener("pointermove", this.onMove, { passive: true });
    addEventListener("pointerup", this.onUp);
  }

  /** Puts the sphere right of the copy on wide screens, above it on narrow ones. */
  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const halfH = Math.tan(THREE.MathUtils.degToRad(17.5)) * 5;
    const halfW = halfH * this.camera.aspect;
    if (this.camera.aspect > 0.95) {
      this.baseX = Math.min(halfW * 0.5, 1.7);
      this.baseY = 0;
      this.baseScale = Math.min(1.1, halfW * 0.42);
    } else {
      this.baseX = 0;
      this.baseY = halfH * 0.42;
      this.baseScale = Math.min(0.78, halfW * 0.62);
    }
    if (!this.frame) this.render(0);
  }

  start() {
    if (this.frame) return;
    this.clock.update();
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.render(Math.min(this.clock.update().getDelta(), 0.05));
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.tilt.set(this.pointer.x, this.pointer.y);
    this.rayDirty = true;
    if (this.dragging) {
      this.velocity = (e.clientX - this.lastX) * 0.004;
      this.spin += this.velocity;
      this.lastX = e.clientX;
    }
  };

  private onUp = () => {
    this.dragging = false;
  };

  private render(dt: number) {
    const p = this.progress;
    if (!this.dragging) {
      // drift back toward a slow idle spin after a flick
      this.velocity += ((this.reduced ? 0 : 0.0025) - this.velocity) * Math.min(dt * 1.5, 1);
      this.spin += this.velocity * dt * 60;
    }
    this.core.rotation.y = this.spin;
    this.core.rotation.x = 0.28 + this.tilt.y * 0.12;
    this.core.rotation.z = -0.5 + this.tilt.x * 0.06;

    if (this.rayDirty) {
      // raycast only after the pointer moved, not every frame
      this.rayDirty = false;
      this.ray.setFromCamera(this.pointer, this.camera);
      const hit = p < 0.2 ? this.ray.intersectObjects(this.bands, false)[0] : undefined;
      this.hovered = hit ? this.bands.indexOf(hit.object as (typeof this.bands)[number]) : -1;
      this.canvas.style.cursor = this.dragging ? "grabbing" : this.hovered >= 0 ? "grab" : "";
    }

    const open = smooth(0.08, 0.6, p);
    this.bands.forEach((band, k) => {
      this.lift[k] += ((k === this.hovered ? 1 : 0) - this.lift[k]) * Math.min(dt * 10, 1);
      const spread = (k - 2) * (open * 0.42);
      band.position.y = spread;
      band.rotation.y = (k - 2) * open * 0.55;
      band.scale.setScalar(1 + this.lift[k] * 0.035);
      band.material.emissive.setRGB(0.02, 0.18, 0.32).multiplyScalar(this.lift[k]);
    });

    const dive = smooth(0.45, 1, p);
    this.root.position.set(this.baseX * (1 - dive), this.baseY * (1 - dive), 0);
    this.root.scale.setScalar(this.baseScale);
    this.camera.position.set(0, 0, 5 - dive * 4.6);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    removeEventListener("pointermove", this.onMove);
    removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.bands.forEach((b) => {
      b.geometry.dispose();
      b.material.dispose();
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
