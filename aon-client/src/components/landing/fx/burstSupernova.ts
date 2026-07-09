/* BURST V1 — "SUPERNOVA"
   A real 3D gold coin. Scroll spins it up, ember cracks bloom across the
   face, then it detonates — shards tumble outward through a 3,500-particle
   nebula that finally converges into a golden halo behind the last caption.
   Everything is a pure function of scroll progress: scrub it both ways. */

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  DPR_CAP,
  clamp01,
  easeOutCubic,
  easeOutQuart,
  smoothstep,
  mulberry32,
  type BurstHandle,
} from "./types";

const R = 2.05; //   coin radius
const D = 0.26; //   coin thickness
const SHATTER = 0.56; // progress at which the coin detonates
const N_PART = 3500;

/* ------------------------------ textures -------------------------------- */

function faceTexture(word: string, mirror = false) {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  // the back face is viewed mirror-image after the coin's Y-flip — bake the
  // opposite mirror into the artwork so the word reads correctly in 3D
  if (mirror) {
    g.translate(s, 0);
    g.scale(-1, 1);
  }
  const r = s / 2;
  const grad = g.createRadialGradient(r * 0.8, r * 0.7, s * 0.05, r, r, r);
  grad.addColorStop(0, "#ffd877");
  grad.addColorStop(0.55, "#e9b949");
  grad.addColorStop(1, "#a9791f");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  // embossed rings
  g.strokeStyle = "rgba(122,84,20,0.85)";
  g.lineWidth = s * 0.012;
  for (const rr of [0.94, 0.78]) {
    g.beginPath();
    g.arc(r, r, r * rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,236,170,0.55)";
  g.beginPath();
  g.arc(r, r, r * 0.86, 0, Math.PI * 2);
  g.stroke();
  // legend around the rim
  g.fillStyle = "rgba(122,84,20,0.9)";
  g.font = `700 ${s * 0.052}px "Arial Narrow", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const legend = "FORTUNE ✦ FAVORS ✦ THE ✦ BOLD ✦ ";
  for (let i = 0; i < legend.length; i++) {
    const a = (i / legend.length) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(r + Math.cos(a) * r * 0.87, r + Math.sin(a) * r * 0.87);
    g.rotate(a + Math.PI / 2);
    g.fillText(legend[i], 0, 0);
    g.restore();
  }
  // centre word
  g.fillStyle = "#7a5414";
  let size = s * 0.3;
  g.font = `900 ${size}px "Arial Narrow", Impact, sans-serif`;
  const m = g.measureText(word);
  if (m.width > s * 0.62) size = (size * s * 0.62) / m.width;
  g.font = `900 ${size}px "Arial Narrow", Impact, sans-serif`;
  g.fillText(word, r, r + s * 0.005);
  g.fillStyle = "rgba(255,236,170,0.35)";
  g.fillText(word, r - s * 0.004, r - s * 0.004);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function edgeTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c79a33";
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = "#8a6217";
  for (let i = 0; i < 64; i++) g.fillRect(i * 8, 0, 3, 64); // reeded edge
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crackTexture(rand: () => number) {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,110,40,1)";
  g.lineCap = "round";
  g.shadowColor = "rgba(255,68,56,0.9)";
  g.shadowBlur = 10;
  const r = s / 2;
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI * 2 + rand() * 0.5;
    let x = r + Math.cos(a0) * r * 0.06;
    let y = r + Math.sin(a0) * r * 0.06;
    let a = a0;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 6 + Math.floor(rand() * 4);
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.9;
      const len = r * (0.09 + rand() * 0.09);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1, 5 - k);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* --------------------------------- mount -------------------------------- */

export function mount(canvas: HTMLCanvasElement): BurstHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.position.set(0, 0, 10);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.05);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.85;

  const key = new THREE.PointLight(0xffd877, 140, 60);
  key.position.set(5, 6, 7);
  const rim = new THREE.PointLight(0xff4438, 36, 40);
  rim.position.set(-6, -3, -4);
  const fill = new THREE.PointLight(0x8b5cf6, 22, 30);
  fill.position.set(-5, 4, 5);
  scene.add(key, rim, fill, new THREE.AmbientLight(0x241c2e, 1.3));

  const rand = mulberry32(4200109);

  // everything coin-born (coin, shards, dust) rides one rig so narrow screens
  // can scale the whole story down together (see resize)
  const rig = new THREE.Group();
  scene.add(rig);

  // --- intact coin ---------------------------------------------------------
  const coin = new THREE.Group();
  rig.add(coin);
  const texAll = faceTexture("ALL");
  const texNothing = faceTexture("NOTHING");
  // the cylinder is tipped 90° to face the camera, which rotates the cap UVs —
  // counter-rotate the textures so the words read upright
  texAll.center.set(0.5, 0.5);
  texAll.rotation = Math.PI / 2;
  texNothing.center.set(0.5, 0.5);
  texNothing.rotation = Math.PI / 2;
  const texEdge = edgeTexture();
  const coinGeo = new THREE.CylinderGeometry(R, R, D, 96);
  const goldSide = new THREE.MeshStandardMaterial({ map: texEdge, roughness: 0.34, metalness: 1 });
  const matTop = new THREE.MeshStandardMaterial({ map: texAll, roughness: 0.28, metalness: 1 });
  const matBottom = new THREE.MeshStandardMaterial({ map: texNothing, roughness: 0.28, metalness: 1 });
  const coinMesh = new THREE.Mesh(coinGeo, [goldSide, matTop, matBottom]);
  coinMesh.rotation.x = Math.PI / 2; // faces toward the camera
  coin.add(coinMesh);

  const crackTex = crackTexture(rand);
  const crack = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 2, R * 2),
    new THREE.MeshBasicMaterial({
      map: crackTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  crack.position.z = D / 2 + 0.012;
  coin.add(crack);

  // --- shards: polar fracture of the disc ----------------------------------
  type Shard = {
    mesh: THREE.Mesh;
    dir: THREE.Vector3;
    speed: number;
    angVel: THREE.Vector3;
    grav: number;
  };
  const shards: Shard[] = [];
  const shardGroup = new THREE.Group();
  shardGroup.visible = false;
  rig.add(shardGroup);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xe9b949, roughness: 0.3, metalness: 1 });

  const SECT = 12;
  const RINGS = [0, 0.55, 1.25, R];
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    for (let si = 0; si < SECT; si++) {
      const a0 = (si / SECT) * Math.PI * 2 + rand() * 0.22;
      const a1 = ((si + 1) / SECT) * Math.PI * 2 + rand() * 0.22;
      const r0 = RINGS[ri] * (ri === 0 ? 1 : 0.92 + rand() * 0.16);
      const r1 = RINGS[ri + 1] * (ri + 1 === RINGS.length - 1 ? 1 : 0.92 + rand() * 0.16);
      const shape = new THREE.Shape();
      if (r0 < 0.01) {
        shape.moveTo(0, 0);
        shape.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
        shape.lineTo(Math.cos((a0 + a1) / 2) * r1 * 1.02, Math.sin((a0 + a1) / 2) * r1 * 1.02);
        shape.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      } else {
        shape.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        shape.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
        shape.lineTo(Math.cos((a0 + a1) / 2) * r1 * 1.03, Math.sin((a0 + a1) / 2) * r1 * 1.03);
        shape.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        shape.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false });
      geo.translate(0, 0, -D / 2);
      geo.computeBoundingBox();
      const c = new THREE.Vector3();
      geo.boundingBox!.getCenter(c);
      geo.translate(-c.x, -c.y, -c.z);
      const mesh = new THREE.Mesh(geo, shardMat);
      mesh.userData.base = c.clone();
      shards.push({
        mesh,
        dir: new THREE.Vector3(c.x, c.y, (rand() - 0.5) * 0.9).normalize(),
        speed: 2.6 + rand() * 4.6,
        angVel: new THREE.Vector3((rand() - 0.5) * 9, (rand() - 0.5) * 9, (rand() - 0.5) * 9),
        grav: 0.8 + rand() * 1.6,
      });
      shardGroup.add(mesh);
    }
  }

  // --- particle nebula ------------------------------------------------------
  const pDir = new Float32Array(N_PART * 3);
  const pSpeed = new Float32Array(N_PART);
  const pSwirl = new Float32Array(N_PART);
  const pDisc = new Float32Array(N_PART * 3); // re-mint target: coin silhouette
  const pos = new Float32Array(N_PART * 3);
  const cols = new Float32Array(N_PART * 3);
  const gold = new THREE.Color(0xe9b949);
  const bright = new THREE.Color(0xffd877);
  const ember = new THREE.Color(0xff6a38);
  const tmpC = new THREE.Color();
  for (let i = 0; i < N_PART; i++) {
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    pDir[i * 3] = Math.sin(ph) * Math.cos(th);
    pDir[i * 3 + 1] = Math.sin(ph) * Math.sin(th);
    pDir[i * 3 + 2] = Math.cos(ph) * 0.6;
    pSpeed[i] = 1.5 + Math.pow(rand(), 1.6) * 8.5;
    pSwirl[i] = (rand() - 0.5) * 3.4;
    // rim-weighted disc — the dust reassembles into the coin's silhouette
    const ra = rand() * Math.PI * 2;
    const rr = R * (0.55 + 0.45 * Math.pow(rand(), 0.4)) * (rand() < 0.8 ? 1 : 0.4);
    pDisc[i * 3] = Math.cos(ra) * rr;
    pDisc[i * 3 + 1] = Math.sin(ra) * rr;
    pDisc[i * 3 + 2] = (rand() - 0.5) * 0.24;
    const roll = rand();
    tmpC.copy(roll < 0.12 ? ember : roll < 0.5 ? bright : gold);
    cols[i * 3] = tmpC.r;
    cols[i * 3 + 1] = tmpC.g;
    cols[i * 3 + 2] = tmpC.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.06,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const nebula = new THREE.Points(pGeo, pMat);
  nebula.visible = false;
  rig.add(nebula);

  // --- detonation flash ------------------------------------------------------
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffe9b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  flash.position.z = 4;
  scene.add(flash);

  const resize = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Portrait phones: the coin (Ø 2R world units, ×1.14 spin-up swell, camera
    // as close as z≈9.1 while it's whole) otherwise spans the full viewport
    // width and crowds the captions. Fit the rig so the coin peaks at ~62vw;
    // on landscape/desktop the fit clamps to 1 and nothing changes.
    const visW = 2 * 9.1 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    rig.scale.setScalar(Math.min(1, (visW * 0.62) / (2 * R * 1.14)));
  };

  const setCoinOpacity = (op: number) => {
    for (const m of [goldSide, matTop, matBottom]) {
      m.transparent = op < 1;
      m.opacity = op;
    }
  };

  const frame = (p: number, _dt: number, t: number) => {
    const pe = clamp01((p - SHATTER) / 0.3); //  explosion progress
    const converge = smoothstep(0.82, 0.95, p); // dust spirals back into a disc
    const reform = smoothstep(0.93, 0.995, p); // the coin re-mints out of the dust
    const flashAmp = Math.exp(-Math.pow((p - SHATTER) / 0.02, 2));
    const mintFlash = Math.exp(-Math.pow((p - 0.965) / 0.018, 2));

    // ---- intact coin: idle → spin-up → gone → re-minted from the dust ----
    const exploded = pe > 0;
    coin.visible = !exploded || reform > 0.001;
    if (!exploded) {
      setCoinOpacity(1);
      const spin = 26 * Math.pow(clamp01(p / SHATTER), 2.4); // scroll-driven spin-up
      const beat = p > 0.24 ? Math.sin(t * (4 + p * 14)) * 0.02 * smoothstep(0.24, 0.5, p) : 0;
      coin.rotation.y = spin + Math.sin(t * 0.5) * 0.08;
      coin.rotation.x = Math.sin(t * 0.4) * 0.05 - 0.08;
      coin.scale.setScalar(1 + smoothstep(0.2, SHATTER, p) * 0.14 + beat);
      coin.position.y = Math.sin(t * 0.8) * 0.08;
      (crack.material as THREE.MeshBasicMaterial).opacity =
        smoothstep(0.3, SHATTER, p) * (0.75 + Math.sin(t * 9) * 0.2);
      // keep the crack overlay facing the camera regardless of coin spin
      crack.rotation.y = -coin.rotation.y;
    } else if (reform > 0.001) {
      // fate resets: the coin condenses out of the dust, settling face-on (ALL up)
      setCoinOpacity(reform);
      coin.rotation.y = (1 - reform) * 2.6;
      coin.rotation.x = (1 - reform) * -0.5;
      coin.scale.setScalar(0.55 + reform * 0.5 + Math.sin(t * 1.6) * 0.012 * reform);
      coin.position.y = 0;
      (crack.material as THREE.MeshBasicMaterial).opacity = 0;
      crack.rotation.y = -coin.rotation.y;
    }

    // ---- shards: fly, tumble and burn away completely ----
    const shardFade = (1 - smoothstep(0.45, 0.88, pe)) * (1 - reform);
    shardGroup.visible = exploded && shardFade > 0.01;
    if (shardGroup.visible) {
      const e = easeOutCubic(pe);
      shardMat.opacity = shardFade;
      shardMat.transparent = true;
      for (const s of shards) {
        const b = s.mesh.userData.base as THREE.Vector3;
        s.mesh.position.set(
          b.x + s.dir.x * s.speed * e,
          b.y + s.dir.y * s.speed * e - s.grav * pe * pe * 1.6,
          b.z + s.dir.z * s.speed * e
        );
        s.mesh.rotation.set(s.angVel.x * pe, s.angVel.y * pe, s.angVel.z * pe);
        const sc = 1 - smoothstep(0.5, 0.95, pe) * 0.85;
        s.mesh.scale.setScalar(Math.max(0.001, sc));
      }
    }

    // ---- nebula: blast outward, then spiral home into the coin's silhouette ----
    nebula.visible = exploded;
    if (exploded) {
      const e = easeOutQuart(pe);
      // dust hands its light over to the solidifying coin
      pMat.opacity = smoothstep(0, 0.08, pe) * (1 - reform * 0.92);
      pMat.size = 0.06 + converge * 0.02;
      const attr = pGeo.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      // extra whirl as the disc assembles — a tightening vortex, not a parked ring
      const whirl = converge * 2.2;
      const cw = Math.cos(whirl);
      const sw = Math.sin(whirl);
      for (let i = 0; i < N_PART; i++) {
        const i3 = i * 3;
        const rr = 0.25 + pSpeed[i] * e;
        // swirl: rotate the direction around Z as the blast expands
        const ang = pSwirl[i] * e;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const dx = pDir[i3] * ca - pDir[i3 + 1] * sa;
        const dy = pDir[i3] * sa + pDir[i3 + 1] * ca;
        let x = dx * rr;
        let y = dy * rr - pe * pe * 0.8;
        let z = pDir[i3 + 2] * rr;
        // spiral the disc target so grains arrive on curved orbits
        const tx = pDisc[i3] * cw - pDisc[i3 + 1] * sw;
        const ty = pDisc[i3] * sw + pDisc[i3 + 1] * cw;
        const wob = Math.sin(t * 1.6 + i) * 0.03 * (1 - reform);
        x += (tx - x) * converge;
        y += (ty + wob - y) * converge;
        z += (pDisc[i3 + 2] - z) * converge;
        arr[i3] = x;
        arr[i3 + 1] = y;
        arr[i3 + 2] = z;
      }
      attr.needsUpdate = true;
      nebula.rotation.z = 0;
    }

    // ---- flashes + camera ----
    (flash.material as THREE.MeshBasicMaterial).opacity = flashAmp * 0.85 + mintFlash * 0.5;
    const shake = flashAmp * 0.2;
    camera.position.x = Math.sin(t * 61) * shake;
    camera.position.y = Math.cos(t * 47) * shake;
    camera.position.z =
      10 - smoothstep(0.2, SHATTER, p) * 0.9 + pe * 1.4 - converge * 1.6;
    camera.lookAt(0, 0, 0);

    rim.intensity =
      36 + smoothstep(0.3, SHATTER, p) * 70 + flashAmp * 300 + mintFlash * 160;
    key.intensity = 140 + reform * 80;
    renderer.render(scene, camera);
  };

  const dispose = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    for (const tx of [texAll, texNothing, texEdge, crackTex]) tx.dispose();
    pMat.map?.dispose();
    env.texture.dispose();
    pmrem.dispose();
    renderer.dispose();
  };

  return { frame, resize, dispose };
}
