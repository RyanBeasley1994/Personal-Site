import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SiteAudio } from "./audio.js";
import { initTerminal } from "./terminal.js";
import { createGame } from "./game.js";
import { createGlobe, createCoin, createPricePanel, createLattice, createSkylineMaterial, openSessions, CURRENCIES } from "./props.js";

const load = window.__load || (window.__load = { target: 0, done: false });
load.started = true;
load.target = 0.8;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const isSmall = () => innerWidth < 860;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);

const audio = new SiteAudio();
const sectionEls = [...document.querySelectorAll("[data-section]")];
const sectionNames = ["intro", "markets", "systems", "terminal", "contact"];

/* ============================================================
   DOM: HUD, sound, toast, scramble, cursor
   ============================================================ */

document.getElementById("year").textContent = new Date().getFullYear();

const clockEl = document.getElementById("hud-clock");
const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London", timeZoneName: "short" });
const updateClock = () => {
  const open = openSessions();
  const sessions = open.length ? `${open.join(" + ")} open` : "markets closed";
  clockEl.textContent = `Exeter ${clockFormat.format(new Date())}, ${sessions}`;
};
updateClock();
setInterval(updateClock, 15000);

const soundButton = document.getElementById("sound-toggle");
function setSound(on) {
  const enabled = audio.setEnabled(on);
  soundButton.setAttribute("aria-pressed", String(enabled));
  soundButton.querySelector(".sound-label").textContent = enabled ? "sound on" : "sound off";
  return enabled;
}
soundButton.addEventListener("click", () => setSound(!audio.enabled));
document.querySelectorAll("a, button").forEach((el) => el.addEventListener("pointerenter", () => audio.hover()));

const toastEl = document.getElementById("toast");
let toastTimer;
function toast(html, ms = 3200) {
  toastEl.innerHTML = html;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), ms);
}

// Narrow glyphs so headings keep roughly the same line breaks while scrambling.
const GLYPHS = "01/\\|-_:+=";
function scramble(el) {
  if (el.dataset.scrambled) return;
  el.dataset.scrambled = "1";
  if (reduceMotion) return;
  const text = el.textContent;
  el.style.minHeight = `${el.offsetHeight}px`;
  const duration = 700 + text.length * 18;
  const start = performance.now();
  function step(now) {
    const p = clamp((now - start) / duration);
    const revealed = Math.floor(ease(p) * text.length);
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += i < revealed || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(step);
    else {
      el.textContent = text;
      el.style.minHeight = "";
    }
  }
  requestAnimationFrame(step);
}

let entered = false;
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && entered) entry.target.querySelectorAll("[data-scramble]").forEach(scramble);
  });
}, { threshold: 0.3 });
sectionEls.forEach((el) => sectionObserver.observe(el));

window.addEventListener("site:enter", (event) => {
  entered = true;
  if (event.detail.sound) setSound(true);
  document.querySelectorAll("#home [data-scramble]").forEach(scramble);
});

// Custom cursor for mouse users.
const cursorEl = document.getElementById("cursor");
const cursorLabel = document.getElementById("cursor-label");
const cursorPos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
let overUI = false;
if (finePointer) {
  document.body.classList.add("has-cursor");
  const interactive = "a, button, input, .device";
  window.addEventListener("pointermove", (e) => {
    cursorPos.tx = e.clientX;
    cursorPos.ty = e.clientY;
    overUI = !!e.target.closest(interactive);
    cursorEl.classList.toggle("is-hover", overUI);
  });
  document.addEventListener("pointerleave", () => cursorEl.style.opacity = "0");
  document.addEventListener("pointerenter", () => cursorEl.style.opacity = "");
  (function moveCursor() {
    cursorPos.x += (cursorPos.tx - cursorPos.x) * 0.25;
    cursorPos.y += (cursorPos.ty - cursorPos.y) * 0.25;
    cursorEl.style.transform = `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`;
    requestAnimationFrame(moveCursor);
  })();
}
function setCursorLabel(text) {
  cursorEl.classList.toggle("is-labelled", !!text);
  if (text) cursorLabel.textContent = text;
}

/* ============================================================
   Scroll → continuous section index
   ============================================================ */

let sectionTops = [];
let sectionHolds = [];
function measureSections() {
  sectionTops = sectionEls.map((el) => el.offsetTop);
  // A section taller than the viewport holds its camera pose while it scrolls past.
  sectionHolds = sectionEls.map((el) => Math.max(0, el.offsetHeight - innerHeight));
}

function sectionFloat() {
  const y = scrollY;
  for (let i = sectionTops.length - 2; i >= 0; i--) {
    if (y >= sectionTops[i]) {
      const span = sectionTops[i + 1] - sectionTops[i] - sectionHolds[i];
      return i + clamp((y - sectionTops[i] - sectionHolds[i]) / Math.max(span, 1));
    }
  }
  return 0;
}

function gotoSection(index) {
  sectionEls[index].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
}

const railLinks = [...document.querySelectorAll("[data-rail]")];
const hudPath = document.getElementById("hud-path");
let activeSection = -1;
function updateHUD(s) {
  const index = Math.round(s);
  if (index === activeSection) return;
  activeSection = index;
  railLinks.forEach((link, i) => link.classList.toggle("is-active", i === index));
  hudPath.textContent = `~/beasley.dev/${sectionNames[index]}`;
}

/* ============================================================
   Game state: hidden shards
   ============================================================ */

// Each shard is placed in screen space for a section's resting camera view, so it is
// always on-screen (and clear of the copy) on both desktop and phone layouts.
// ndc = normalised screen position (-1..1), depth = distance from the camera.
const SHARD_SPOTS = [
  { section: 0, desktop: [0.15, 0.72], phone: [0.62, 0.72], depth: 7 },
  { section: 0, desktop: [0.8, -0.5], phone: [0.72, 0.18], depth: 8 },
  { section: 1, desktop: [-0.45, -0.4], phone: [-0.55, 0.55], depth: 6 },
  { section: 1, desktop: [-0.75, 0.45], phone: [0.6, 0.8], depth: 12 },
  { section: 2, desktop: [0.8, 0.72], phone: [0.7, 0.85], depth: 8 },
  { section: 3, desktop: [-0.55, -0.6], phone: [0.75, 0.7], depth: 4 },
  { section: 4, desktop: [0.7, -0.35], phone: [0.6, -0.5], depth: 12 }
];
const SHARD_TOTAL = SHARD_SPOTS.length;
let collected = new Set();
try {
  collected = new Set(JSON.parse(localStorage.getItem("beasley.shards") || "[]"));
} catch { /* storage unavailable: progress lasts for this visit only */ }

const counterEl = document.getElementById("shard-counter");
const countEl = document.getElementById("shard-count");
const playButton = document.getElementById("play-button");
function renderCounter() {
  countEl.textContent = `${collected.size}/${SHARD_TOTAL}`;
  counterEl.classList.toggle("is-complete", collected.size === SHARD_TOTAL);
  playButton.hidden = collected.size !== SHARD_TOTAL;
}
renderCounter();
counterEl.addEventListener("click", () => {
  if (collected.size === SHARD_TOTAL) toast("Every shard found. Hit <kbd>play</kbd> for Bull Run, or type <kbd>unlock</kbd> in the terminal.");
  else toast(`${collected.size} of ${SHARD_TOTAL} found. ${shardHint()}`, 4500);
});

// Names the sections that still hide shards, so nobody gets stuck.
function shardHint() {
  const left = {};
  SHARD_SPOTS.forEach((spot, i) => {
    if (!collected.has(i)) left[spot.section] = (left[spot.section] || 0) + 1;
  });
  const parts = Object.entries(left).map(([section, n]) => `${n} in ${sectionNames[section]}`);
  return `Still hidden: ${parts.join(", ")}. Stop scrolling in that section and look around the edges.`;
}

/* ============================================================
   Three.js scene
   ============================================================ */

const canvas = document.getElementById("scene");
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
  renderer = null;
}

const scene3d = renderer ? buildScene(renderer) : null;

const terminal = initTerminal({
  onCommand: () => audio.tick(),
  onKey: () => audio.tick(),
  goto: gotoSection,
  shardProgress: () => ({ found: collected.size, total: SHARD_TOTAL, hint: shardHint() }),
  isUnlocked: () => collected.size === SHARD_TOTAL,
  toggleSound: () => setSound(!audio.enabled),
  crackCrystal: () => scene3d?.crack(),
  drop: () => scene3d?.drop(),
  play: () => scene3d?.openGame() ?? false,
  celebrate: () => { scene3d?.celebrate(); audio.fanfare(); }
});

playButton.addEventListener("click", () => scene3d?.openGame());

measureSections();
window.addEventListener("resize", measureSections);

if (!scene3d) {
  document.body.classList.add("no-webgl");
  window.addEventListener("scroll", () => {
    const s = sectionFloat();
    updateHUD(s);
    audio.setSection(s);
  }, { passive: true });
  updateHUD(0);
  load.done = true;
}

function buildScene(renderer) {
  const COLORS = {
    void: new THREE.Color("#07040c"),
    deep: new THREE.Color("#12052a"),
    mid: new THREE.Color("#6a2ee0"),
    amethyst: new THREE.Color("#9d5cff"),
    lilac: new THREE.Color("#c99cff"),
    // Trading accents on top of the purple brand.
    bull: new THREE.Color("#1fe0a0"),
    bear: new THREE.Color("#ff3d6e")
  };

  document.body.classList.remove("no-webgl");
  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = COLORS.void;
  scene.fog = new THREE.FogExp2(COLORS.void, 0.032);

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 1, 9);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.62);
  composer.addPass(bloom);

  // Scroll-speed lens: RGB split, barrel warp, scanlines and the drop flash.
  const lens = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uSpeed: { value: 0 },
      uBeat: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uSpeed;
      uniform float uBeat;
      uniform float uFlash;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        vec2 uv = 0.5 + c * (1.0 - uSpeed * 0.12 * r2 - uBeat * 0.015);
        vec2 dir = c * (0.004 + uSpeed * 0.026 + uBeat * 0.006);
        vec3 col;
        col.r = texture2D(tDiffuse, uv + dir).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - dir).b;
        col *= 1.0 - uSpeed * 0.08 * sin(vUv.y * 900.0 + uTime * 40.0);
        col *= smoothstep(0.95, 0.25, length(c) * (1.0 + uSpeed * 0.6));
        col += vec3(0.55, 0.35, 1.0) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  composer.addPass(lens);
  composer.addPass(new OutputPass());

  /* ---------- Camera path: one pose per section ---------- */

  let keyframes = [];
  function layoutKeyframes() {
    const small = isSmall();
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    keyframes = [
      { pos: v(0, 0.9, small ? 11 : 8), look: small ? v(0, -0.9, 0) : v(-2.1, 0.4, 0) },
      { pos: v(small ? 5 : 8, 3.6, -4), look: small ? v(-1, -5, -18) : v(-3, -5, -21) },
      { pos: v(0, 2.2, small ? -17 : -18.5), look: v(0, small ? 0.7 : 1.2, -27) },
      { pos: v(-5, 1.6, -32), look: v(2, -4.5, -44) },
      { pos: v(0, 13, small ? 2 : -2), look: v(0, -5, -30) }
    ];
  }
  layoutKeyframes();

  /* ---------- Crystal material (shared by the hero crystal and system shards) ---------- */

  const holoVertex = /* glsl */ `
    uniform float uCrack;
    varying vec3 vN;
    varying vec3 vV;
    varying float vH;
    varying float vRand;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    void main() {
      vRand = hash(normal);
      vec3 p = position + normal * uCrack * (0.3 + vRand * 0.9);
      vec4 world = modelMatrix * vec4(p, 1.0);
      vH = world.y;
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - world.xyz);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  const holoFragment = /* glsl */ `
    uniform float uTime;
    uniform float uGlow;
    uniform vec3 uDeep;
    uniform vec3 uMid;
    uniform vec3 uRim;
    varying vec3 vN;
    varying vec3 vV;
    varying float vH;
    varying float vRand;
    void main() {
      vec3 n = normalize(vN);
      float facet = dot(n, normalize(vec3(-0.4, 0.9, 0.5))) * 0.5 + 0.5;
      float fres = pow(1.0 - abs(dot(n, vV)), 2.4);
      vec3 col = mix(uDeep, uMid, facet * facet);
      col += uRim * fres * 1.1;
      float scan = smoothstep(0.035, 0.0, abs(fract(vH * 0.45 - uTime * 0.12) - 0.5));
      col += uRim * scan * 0.5;
      col += uMid * vRand * 0.18;
      gl_FragColor = vec4(col * uGlow, 1.0);
    }
  `;
  function holoMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: holoVertex,
      fragmentShader: holoFragment,
      uniforms: {
        uTime: { value: 0 },
        uCrack: { value: 0 },
        uGlow: { value: 1 },
        uDeep: { value: COLORS.deep },
        uMid: { value: COLORS.mid },
        uRim: { value: COLORS.lilac }
      }
    });
  }

  // A damped spring: kick it and it flies apart, then snaps back together.
  function spring() {
    return {
      value: 0, velocity: 0,
      kick(v) { this.velocity += v; },
      step(dt) {
        const acc = -60 * this.value - 7 * this.velocity;
        this.velocity += acc * dt;
        this.value = Math.max(0, this.value + this.velocity * dt);
      }
    };
  }

  /* ---------- Hero crystal ---------- */

  const crystal = new THREE.Group();
  crystal.position.set(0, 0.4, 0);
  scene.add(crystal);

  // The markets globe is added once the land data arrives; this sphere is its
  // hit area for dragging and clicking.
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const gem = new THREE.Mesh(new THREE.SphereGeometry(1.75, 16, 12), hitMaterial);
  crystal.add(gem);
  let globe = null;

  const edgeMaterial = new THREE.LineBasicMaterial({ color: COLORS.lilac.clone().multiplyScalar(1.8), transparent: true });

  const ringGroup = new THREE.Group();
  ringGroup.rotation.set(1.2, 0.2, 0.3);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.005, 6, 200),
    new THREE.MeshBasicMaterial({ color: COLORS.lilac.clone().multiplyScalar(1.3) })
  );
  const satellite = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.07),
    new THREE.MeshBasicMaterial({ color: COLORS.lilac.clone().multiplyScalar(3) })
  );
  ringGroup.add(ring, satellite);
  scene.add(ringGroup);
  ringGroup.position.copy(crystal.position);

  const gemCrack = spring();
  let gemSpin = 0.25;

  // Clicking the globe fires a volley of trades out of London.
  function crack() {
    gemCrack.kick(6);
    gemSpin += 2.5;
    globe?.fireTrades(8);
    audio.crack();
  }

  /* ---------- Particles ---------- */

  const particleCount = isSmall() ? 700 : 1400;
  const pPos = new Float32Array(particleCount * 3);
  const pRand = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 44;
    pPos[i * 3 + 1] = -7 + Math.random() * 20;
    pPos[i * 3 + 2] = 12 - Math.random() * 68;
    pRand[i] = Math.random();
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  particleGeometry.setAttribute("aRand", new THREE.BufferAttribute(pRand, 1));
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uWarp: { value: 0 },
      uPixel: { value: renderer.getPixelRatio() },
      uColor: { value: COLORS.lilac }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTravel;
      uniform float uWarp;
      uniform float uPixel;
      attribute float aRand;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        // Scrolling pushes the star field past the camera: a warp jump.
        p.z = mod(p.z + 56.0 + uTravel * (0.6 + aRand), 68.0) - 56.0;
        p.y += sin(uTime * 0.25 + aRand * 6.2831) * 0.35;
        p.x += cos(uTime * 0.15 + aRand * 12.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.0 + aRand * 2.2) * (1.0 + uWarp * 2.5) * uPixel * (16.0 / -mv.z);
        vAlpha = (0.3 + 0.7 * abs(sin(uTime * (0.4 + aRand) + aRand * 20.0))) * smoothstep(55.0, 4.0, -mv.z) * (1.0 + uWarp * 1.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor * 1.4, smoothstep(0.5, 0.0, d) * vAlpha);
      }
    `
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  /* ---------- Candlestick field: a live chart you can fly over ---------- */

  const COLS = isSmall() ? 44 : 64;
  const ROWS = isSmall() ? 12 : 18;
  const SERIES = 180;
  const SPACING_X = 0.52;
  const SPACING_Z = 2.0;
  const BASE_Y = -5;
  const X0 = -((COLS - 1) / 2) * SPACING_X;
  const Z0 = -8;

  function gaussian() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
  }

  // Each row is a looping random-walk price series, like a currency pair.
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const open = new Float32Array(SERIES), close = new Float32Array(SERIES);
    const high = new Float32Array(SERIES), low = new Float32Array(SERIES);
    const phase = Math.random() * Math.PI * 2;
    let p = 0;
    for (let i = 0; i < SERIES; i++) {
      const trend = Math.sin((i / SERIES) * Math.PI * 2 * 3 + phase) * 0.12;
      open[i] = p;
      p += gaussian() * 0.32 + trend;
      close[i] = p;
    }
    // Remove drift so the series wraps without a jump.
    const drift = p;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < SERIES; i++) {
      open[i] -= drift * (i / SERIES);
      close[i] -= drift * ((i + 1) / SERIES);
      high[i] = Math.max(open[i], close[i]) + Math.abs(gaussian()) * 0.18;
      low[i] = Math.min(open[i], close[i]) - Math.abs(gaussian()) * 0.18;
      min = Math.min(min, low[i]);
      max = Math.max(max, high[i]);
    }
    const scale = 3.4 / (max - min || 1);
    for (let i = 0; i < SERIES; i++) {
      open[i] = (open[i] - min) * scale;
      close[i] = (close[i] - min) * scale;
      high[i] = (high[i] - min) * scale;
      low[i] = (low[i] - min) * scale;
    }
    rows.push({ open, close, high, low, speed: 0.8 + Math.random() * 0.8, offset: Math.random() * SERIES });
  }

  // Shade box faces so the candles read as solid forms without scene lights.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const faceShade = [0.6, 0.6, 1.0, 0.25, 0.8, 0.45];
  const shade = [];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) shade.push(faceShade[f], faceShade[f], faceShade[f]);
  boxGeometry.setAttribute("color", new THREE.Float32BufferAttribute(shade, 3));

  const candleMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const count = COLS * ROWS;
  const bodies = new THREE.InstancedMesh(boxGeometry, candleMaterial, count);
  const wicks = new THREE.InstancedMesh(boxGeometry, candleMaterial, count);
  bodies.frustumCulled = wicks.frustumCulled = false;
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wicks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodies.setColorAt(0, COLORS.lilac);
  wicks.setColorAt(0, COLORS.lilac);
  scene.add(bodies, wicks);

  const grid = new THREE.GridHelper(90, 90, COLORS.amethyst, COLORS.deep);
  grid.position.set(0, BASE_Y - 0.4, -26);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  const bullColor = COLORS.bull.clone().multiplyScalar(0.9);
  const bearColor = COLORS.bear.clone().multiplyScalar(0.85);
  const tmpMatrix = new THREE.Matrix4();
  const tmpColor = new THREE.Color();
  const hoverPoint = new THREE.Vector3(0, 0, -1000);
  const hoverTarget = new THREE.Vector3(0, 0, -1000);
  const chartPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BASE_Y + 1.6));

  function updateCandles(t, pulse) {
    hoverPoint.lerp(hoverTarget, 0.12);
    const motion = reduceMotion ? 0 : 1;
    for (let r = 0; r < ROWS; r++) {
      const row = rows[r];
      const offset = row.offset + t * row.speed * motion;
      const whole = Math.floor(offset);
      const frac = offset - whole;
      const z = Z0 - r * SPACING_Z;
      for (let c = 0; c < COLS; c++) {
        const i = (whole + c) % SERIES;
        const slot = c - frac;
        const x = X0 + slot * SPACING_X;
        const edge = ease(clamp(slot / 3)) * ease(clamp((COLS - 1 - slot) / 3));
        const dx = x - hoverPoint.x, dz = z - hoverPoint.z;
        const lift = Math.pow(clamp(1 - Math.sqrt(dx * dx + dz * dz) / 3.2), 2);
        const o = row.open[i], cl = row.close[i];
        const y = BASE_Y + lift * 1.4 + pulse * 0.12 * Math.sin(c * 0.4 + r);
        const index = r * COLS + c;

        tmpMatrix.makeScale(0.3 * edge, Math.max(Math.abs(cl - o), 0.05) * edge, 0.3 * edge);
        tmpMatrix.setPosition(x, y + (o + cl) / 2, z);
        bodies.setMatrixAt(index, tmpMatrix);

        tmpMatrix.makeScale(0.045 * edge, (row.high[i] - row.low[i]) * edge, 0.045 * edge);
        tmpMatrix.setPosition(x, y + (row.high[i] + row.low[i]) / 2, z);
        wicks.setMatrixAt(index, tmpMatrix);

        tmpColor.copy(cl >= o ? bullColor : bearColor).multiplyScalar(1 + lift * 1.6 + pulse * 0.45);
        bodies.setColorAt(index, tmpColor);
        wicks.setColorAt(index, tmpColor);
      }
    }
    bodies.instanceMatrix.needsUpdate = wicks.instanceMatrix.needsUpdate = true;
    bodies.instanceColor.needsUpdate = wicks.instanceColor.needsUpdate = true;

  }

  /* ---------- System shards with labels pinned to them ---------- */

  // Each system is an invisible hit box holding its visual: a server stack (CRM),
  // a neural lattice (AI) and a risk gauge. Placeholders show until the models load.
  const systemShards = [0, 1, 2].map((i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.9, 1.6), hitMaterial);
    const placeholder = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), holoMaterial());
    placeholder.scale.y = 1.45;
    mesh.add(placeholder);
    scene.add(mesh);
    return {
      mesh, materials: [placeholder.material], lattice: null, needle: null,
      crack: spring(), hover: 0, spin: 0.4 + i * 0.1,
      label: document.querySelector(`.shard-label[data-shard="${i}"]`),
      base: new THREE.Vector3()
    };
  });

  function setSystemVisual(shard, visual, materials) {
    shard.mesh.clear();
    shard.mesh.add(visual);
    shard.materials = materials;
  }

  function layoutShards() {
    const small = isSmall();
    systemShards.forEach((shard, i) => {
      if (small) shard.base.set(-1.0, 2.4 - i * 1.75, -27);
      else shard.base.set((i - 1) * 3.7, 1.4, -27);
      shard.mesh.scale.setScalar(small ? 0.62 : 1);
    });
  }
  layoutShards();

  const projected = new THREE.Vector3();
  function updateShards(dt, t, s) {
    const visibility = clamp(1 - Math.abs(s - 2) * 1.6);
    const small = isSmall();
    systemShards.forEach((shard, i) => {
      shard.mesh.visible = Math.abs(s - 2) < 1.2;
      shard.crack.step(dt);
      shard.materials.forEach((material) => {
        material.uniforms.uCrack.value = shard.crack.value;
        material.uniforms.uTime.value = t;
        material.uniforms.uGlow.value = 1 + shard.hover * 0.6;
      });
      shard.lattice?.update(dt, t, shard.hover);
      if (shard.needle) {
        // Risk needle hunts around the safe zone and spikes when you hover.
        const risk = 0.3 + Math.sin(t * 1.3) * 0.08 + Math.sin(t * 3.7) * 0.04 + shard.hover * 0.5 + shard.crack.value * 0.3;
        shard.needle.rotation.z = THREE.MathUtils.degToRad(210 - clamp(risk) * 240);
      }
      if (i === 0) shard.mesh.rotation.y += dt * (shard.spin + shard.hover * 2.5);
      else shard.mesh.rotation.y = Math.sin(t * 0.5 + i) * 0.45 + shard.hover * Math.sin(t * 3) * 0.2;
      shard.mesh.position.copy(shard.base);
      shard.mesh.position.y += Math.sin(t * 0.8 + i * 2) * 0.12;

      if (visibility <= 0) {
        shard.label.style.visibility = "hidden";
        return;
      }
      // Pin the HTML label under (or beside, on mobile) the shard.
      projected.copy(shard.mesh.position);
      if (small) projected.x += 0.75;
      else projected.y -= 1.55;
      projected.project(camera);
      const x = (projected.x * 0.5 + 0.5) * innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * innerHeight;
      const width = shard.label.offsetWidth;
      shard.label.style.visibility = "visible";
      shard.label.style.opacity = String(visibility);
      shard.label.style.transform = small
        ? `translate3d(${x}px, ${y - 30}px, 0)`
        : `translate3d(${x - width / 2}px, ${y}px, 0)`;
    });
  }

  /* ---------- Collectible shards (the game) ---------- */

  const hitGeometry = new THREE.SphereGeometry(0.75, 8, 8);
  const collectibles = SHARD_SPOTS.map((spot, i) => {
    const mesh = createCoin(CURRENCIES[i], COLORS);
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    hit.userData.collectible = i;
    mesh.add(hit);
    scene.add(mesh);
    const taken = collected.has(i);
    mesh.visible = !taken;
    return { mesh, hit, spot, index: i, taken, vanish: taken ? 1 : 0, phase: Math.random() * 10, base: new THREE.Vector3() };
  });

  // Unproject each spot from its section's camera pose.
  const poseCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const ray = new THREE.Vector3();
  function layoutCollectibles() {
    const small = isSmall();
    poseCamera.aspect = innerWidth / innerHeight;
    poseCamera.updateProjectionMatrix();
    collectibles.forEach((item) => {
      const pose = keyframes[item.spot.section];
      const [x, y] = small ? item.spot.phone : item.spot.desktop;
      poseCamera.position.copy(pose.pos);
      poseCamera.lookAt(pose.look);
      poseCamera.updateMatrixWorld();
      ray.set(x, y, 0.5).unproject(poseCamera).sub(pose.pos).normalize();
      item.base.copy(pose.pos).addScaledVector(ray, item.spot.depth);
      item.mesh.position.copy(item.base);
    });
  }
  layoutCollectibles();

  function collect(item) {
    if (item.taken) return;
    item.taken = true;
    collected.add(item.index);
    try { localStorage.setItem("beasley.shards", JSON.stringify([...collected])); } catch { /* ignore */ }
    renderCounter();
    burst(item.mesh.position);
    audio.collect(collected.size);
    if (collected.size === SHARD_TOTAL) {
      audio.fanfare();
      burst(crystal.position, 3);
      toast("All 7 majors collected. <kbd>Bull Run</kbd> unlocked: hit play in the top bar.", 6000);
      terminal.print("7/7 majors collected. Bull Run unlocked. Type play.", "terminal-secret");
    } else {
      toast(`${CURRENCIES[item.index].code} collected. ${collected.size} of ${SHARD_TOTAL} majors.`);
    }
  }

  function updateCollectibles(dt, t) {
    collectibles.forEach((item) => {
      if (item.taken) {
        item.vanish = Math.min(1, item.vanish + dt * 4);
        item.mesh.scale.setScalar(1 - item.vanish);
        if (item.vanish >= 1) item.mesh.visible = false;
        return;
      }
      item.mesh.rotation.y += dt * 2.4;
      item.mesh.position.y = item.base.y + Math.sin(t * 1.5 + item.phase) * 0.12;
      item.mesh.scale.setScalar(1 + Math.sin(t * 3 + item.phase) * 0.15);
    });
  }

  /* ---------- Burst particles for feedback ---------- */

  const BURST = 240;
  const burstPos = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstGeometry = new THREE.BufferGeometry();
  burstGeometry.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
  const burstMaterial = new THREE.PointsMaterial({
    color: COLORS.lilac.clone().multiplyScalar(3),
    size: 0.09,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const burstPoints = new THREE.Points(burstGeometry, burstMaterial);
  burstPoints.frustumCulled = false;
  scene.add(burstPoints);
  let burstLife = 0;

  function burst(origin, power = 1) {
    burstMaterial.size = 0.09 * Math.sqrt(power);
    for (let i = 0; i < BURST; i++) {
      burstPos[i * 3] = origin.x;
      burstPos[i * 3 + 1] = origin.y;
      burstPos[i * 3 + 2] = origin.z;
      const dir = new THREE.Vector3().randomDirection().multiplyScalar((1.5 + Math.random() * 3) * power);
      burstVel[i * 3] = dir.x;
      burstVel[i * 3 + 1] = dir.y;
      burstVel[i * 3 + 2] = dir.z;
    }
    burstLife = 1;
  }

  function updateBurst(dt) {
    if (burstLife <= 0) return;
    burstLife = Math.max(0, burstLife - dt * 0.7);
    for (let i = 0; i < BURST * 3; i++) {
      burstPos[i] += burstVel[i] * dt;
      burstVel[i] *= 0.96;
    }
    burstGeometry.attributes.position.needsUpdate = true;
    burstMaterial.opacity = burstLife;
  }

  function celebrate() {
    burst(crystal.position, 2.2);
    crack();
  }

  /* ---------- Pointer: hover, drag, tap ---------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const pointerSmooth = new THREE.Vector2(0, 0);
  let pointerInside = false;
  let press = null;
  let dragging = false;

  const isUI = (el) => !!el.closest("a, button, input, label, .device, .panel, .shard-label, .hud, .rail, .loader");

  function setPointer(e) {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  }

  function pick(objects) {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(objects, false)[0] || null;
  }

  const collectibleHits = collectibles.map((c) => c.hit);
  const shardMeshes = systemShards.map((s) => s.mesh);

  window.addEventListener("pointermove", (e) => {
    setPointer(e);
    pointerInside = !isUI(e.target);
    if (dragging && press) {
      gemSpin += (e.clientX - press.lastX) * 0.02;
      crystal.rotation.x += (e.clientY - press.lastY) * 0.006;
      press.lastX = e.clientX;
      press.lastY = e.clientY;
    }
  }, { passive: true });

  window.addEventListener("pointerdown", (e) => {
    if (isUI(e.target) || !document.body.classList.contains("has-entered")) return;
    setPointer(e);
    press = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
    // Touch keeps native scrolling; only mouse and pen can drag the crystal.
    if (e.pointerType !== "touch" && pick([gem])) {
      dragging = true;
      e.preventDefault();
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (!press) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (moved < 8) {
      setPointer(e);
      const hit = pick([...collectibleHits, gem, ...shardMeshes]);
      if (hit) {
        if (hit.object.userData.collectible !== undefined) collect(collectibles[hit.object.userData.collectible]);
        else if (hit.object === gem) crack();
        else {
          const shard = systemShards.find((s) => s.mesh === hit.object);
          shard.crack.kick(7);
          shard.lattice?.fire();
          audio.crack();
        }
      }
    }
    press = null;
    dragging = false;
  });

  function updateHover() {
    if (!finePointer) return;
    if (!pointerInside || overUI) {
      setCursorLabel("");
      systemShards.forEach((s) => s.hover += (0 - s.hover) * 0.15);
      return;
    }
    const hit = pick([...collectibleHits, gem, ...shardMeshes]);
    let label = "";
    if (hit) {
      if (hit.object.userData.collectible !== undefined) label = "collect";
      else if (hit.object === gem) label = dragging ? "" : "drag";
      else label = "ping";
    }
    if (dragging) label = "";
    setCursorLabel(label);
    systemShards.forEach((s) => {
      const target = hit && hit.object === s.mesh ? 1 : 0;
      s.hover += (target - s.hover) * 0.15;
    });

    // Chart ripple follows the pointer across the candle field.
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(chartPlane, hoverTarget)) hoverTarget.set(0, 0, -1000);
  }

  /* ---------- Resize ---------- */

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    layoutKeyframes();
    layoutShards();
    layoutCollectibles();
  });

  /* ---------- Reward: trophy orbit and Bull Run ---------- */

  // Once every shard is found they orbit the crystal for good.
  const trophies = new THREE.Group();
  for (let k = 0; k < SHARD_TOTAL; k++) {
    const mesh = createCoin(CURRENCIES[k], COLORS);
    mesh.scale.setScalar(0.8);
    mesh.userData.tilt = (k / SHARD_TOTAL) * Math.PI;
    mesh.userData.offset = (k / SHARD_TOTAL) * Math.PI * 2;
    trophies.add(mesh);
  }
  scene.add(trophies);

  function updateTrophies(t) {
    trophies.visible = collected.size === SHARD_TOTAL;
    if (!trophies.visible) return;
    trophies.position.copy(crystal.position);
    trophies.children.forEach((mesh) => {
      const a = t * 0.7 + mesh.userData.offset;
      const tilt = mesh.userData.tilt;
      mesh.position.set(Math.cos(a) * 3, Math.sin(a) * Math.sin(tilt) * 1.6, Math.sin(a) * Math.cos(tilt) * 3);
      mesh.rotation.y += 0.05;
    });
  }

  const world = [crystal, ringGroup, bodies, wicks, grid, particles, trophies, ...systemShards.map((s) => s.mesh), ...collectibles.map((c) => c.mesh)];
  const worldVisibility = new Map();
  let savedScroll = 0;

  const game = createGame({
    scene, camera, lens, bloom, audio, holoMaterial, colors: COLORS,
    onOpen() {
      savedScroll = scrollY;
      world.forEach((obj) => { worldVisibility.set(obj, obj.visible); obj.visible = false; });
      systemShards.forEach((shard) => { shard.label.style.visibility = "hidden"; });
      setCursorLabel("");
    },
    onClose() {
      world.forEach((obj) => { obj.visible = worldVisibility.get(obj) ?? true; });
      camera.fov = 45;
      camera.updateProjectionMatrix();
      scrollTo(0, savedScroll);
    }
  });

  function openGame() {
    if (collected.size !== SHARD_TOTAL) return false;
    game.open();
    return true;
  }

  /* ---------- Blender environment (models/environment.glb) ---------- */

  const skylineMaterial = createSkylineMaterial(COLORS);

  // Holo shaders displace along face normals, so they need unshared (flat) vertices.
  const flat = (geometry) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.computeVertexNormals();
    return g;
  };

  // Split a Blender object into its parts by material name.
  function parts(object) {
    const found = {};
    object.traverse((child) => {
      if (child.isMesh) found[child.material.name] = child.geometry;
    });
    return found;
  }

  function centred(geometry, height) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
    const scale = height / (box.max.y - box.min.y);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  // Floating price panels along the route, facing the camera.
  const panels = [];
  const PANEL_SPOTS = [
    [-8, 4.2, -4, 0.8], [10, 5.5, -11, 1], [-13, 2.5, -15, 1.2], [13, 1.5, -21, 1],
    [-10, 6.5, -27, 1.1], [7, 8, -35, 1], [-9, 4.5, -47, 1.4], [15, 4, -41, 1.2],
    [1, 10, -52, 1.6], [-17, 1, -33, 1.1], [-4, 7.5, -14, 0.7], [5, 3.2, -46, 0.8]
  ];
  PANEL_SPOTS.forEach(([x, y, z, scale], k) => {
    const panel = createPricePanel(k);
    panel.mesh.position.set(x, y, z);
    panel.mesh.scale.setScalar(scale);
    panel.baseY = y;
    panel.phase = Math.random() * 10;
    scene.add(panel.mesh);
    panels.push(panel);
    world.push(panel.mesh);
  });

  function applyEnvironment(gltf) {
    const byName = {};
    gltf.scene.traverse((o) => { if (o.name) byName[o.name] = o; });

    // Financial district wrapped around the chart; its open side faces the intro camera.
    const skyline = new THREE.Mesh(byName.Skyline.geometry, skylineMaterial);
    skyline.position.set(0, BASE_Y - 0.6, -26);
    skyline.rotation.y = -Math.PI / 2;
    scene.add(skyline);
    world.push(skyline);

    // Systems: server stack, neural lattice, risk gauge.
    const serverMaterial = holoMaterial();
    const server = new THREE.Mesh(centred(flat(parts(byName.ServerStack).Holo), 2.5), serverMaterial);
    setSystemVisual(systemShards[0], server, [serverMaterial]);

    const lattice = createLattice(COLORS);
    lattice.group.scale.setScalar(1.15);
    setSystemVisual(systemShards[1], lattice.group, []);
    systemShards[1].lattice = lattice;

    const gaugeMaterial = holoMaterial();
    const gauge = new THREE.Group();
    gauge.add(new THREE.Mesh(flat(parts(byName.RiskGauge).Holo), gaugeMaterial));
    const needle = new THREE.Mesh(flat(parts(byName.GaugeNeedle).Holo), gaugeMaterial);
    gauge.add(needle);
    // Safe, caution and danger bands; the needle rests in the green.
    [[130, 80, COLORS.bull], [50, 80, new THREE.Color("#ffb547")], [-30, 80, COLORS.bear]].forEach(([start, length, color]) => {
      const band = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.2, 32, 1, THREE.MathUtils.degToRad(start), THREE.MathUtils.degToRad(length)),
        new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.3), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
      );
      band.position.z = -0.04;
      gauge.add(band);
    });
    gauge.scale.setScalar(0.95);
    setSystemVisual(systemShards[2], gauge, [gaugeMaterial]);
    systemShards[2].needle = needle;

    // Bull Run: the jet, and a city canyon to fly through.
    const jet = parts(byName.Jet);
    game.setShip(flat(jet.Holo), jet.Engine);
    const gameSkyline = createSkylineMaterial(COLORS, 0.01);
    gameSkyline.uniforms.uBase.value = -2.5;
    game.setScenery(
      [0, 1, 2, 3, 4].map((k) => [new THREE.Mesh(byName[`Tower_${k}`].geometry, gameSkyline)]),
      byName.Skyline.geometry,
      gameSkyline
    );
  }

  const exeterTag = document.getElementById("exeter-tag");
  const tagPos = new THREE.Vector3();
  function updateEnvironment(dt, t, pulse, s) {
    skylineMaterial.uniforms.uTime.value = t;
    skylineMaterial.uniforms.uPulse.value = pulse;
    panels.forEach((panel) => {
      panel.update(dt);
      panel.mesh.quaternion.copy(camera.quaternion);
      panel.mesh.position.y = panel.baseY + Math.sin(t * 0.5 + panel.phase) * 0.25;
    });

    // Pin the "you are here" tag to Exeter while it faces the camera.
    if (!globe || s > 0.5) {
      exeterTag.style.opacity = "0";
      return;
    }
    globe.exeterAnchor.getWorldPosition(tagPos);
    const facing = tagPos.clone().sub(crystal.position).normalize().dot(camera.position.clone().sub(tagPos).normalize());
    tagPos.project(camera);
    exeterTag.style.opacity = String(clamp((facing - 0.15) * 4) * clamp(1 - s * 2.5));
    exeterTag.style.transform = `translate3d(${(tagPos.x * 0.5 + 0.5) * innerWidth}px, ${(-tagPos.y * 0.5 + 0.5) * innerHeight}px, 0)`;
  }

  const landReady = fetch("models/land-dots.json")
    .then((response) => response.json())
    .then((landDots) => {
      globe = createGlobe({ colors: COLORS, landDots, pixelRatio: renderer.getPixelRatio() });
      crystal.add(globe.root);
    })
    .catch((error) => console.warn("Globe data failed to load", error));

  const modelsReady = new Promise((resolve) => {
    new GLTFLoader().load(
      "models/environment.glb",
      (gltf) => {
        try { applyEnvironment(gltf); } catch (error) { console.error("Environment failed to apply", error); }
        resolve();
      },
      (event) => {
        if (event.total) load.target = 0.8 + (event.loaded / event.total) * 0.15;
      },
      (error) => {
        // The site still works with the placeholder shapes.
        console.warn("Environment model failed to load", error);
        resolve();
      }
    );
  });
  const environmentReady = Promise.all([landReady, modelsReady]);

  /* ---------- Loop ---------- */

  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const lookSmooth = new THREE.Vector3(-2, 0.4, 0);
  const chartCentre = new THREE.Vector3(0, -3, -26);
  const rootStyle = document.documentElement.style;
  let s = 0;
  let speed = 0;
  let travel = 0;
  let flash = 0;
  let shake = 0;
  let lastDrop = -10;
  let lastSkew = 0;
  let firstFrame = true;

  // The payoff when you reach the contact section.
  function drop(t) {
    lastDrop = t;
    flash = 0.9;
    shake = 1;
    burst(chartCentre, 5);
    audio.drop();
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (game.active) {
      game.update(dt, t, reduceMotion ? 0 : audio.beat());
      updateBurst(dt);
      composer.render();
      requestAnimationFrame(frame);
      return;
    }

    const target = sectionFloat();
    const prev = s;
    s += (target - s) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));
    const delta = target - s;
    speed += (clamp(Math.abs(delta) * 2.4) - speed) * 0.12;
    if (reduceMotion) speed = 0;
    travel += delta * dt * 70;
    audio.motion(speed);
    audio.setSection(s);
    updateHUD(s);

    if (prev < 3.55 && s >= 3.55 && t - lastDrop > 3) drop(t);

    const pulse = reduceMotion ? 0 : audio.beat();
    flash = Math.max(0, flash - dt * 1.6);
    shake = Math.max(0, shake - dt * 1.8);

    // Camera follows the path between section poses, banking through each turn.
    const i = Math.min(Math.floor(s), keyframes.length - 2);
    const f = ease(clamp(s - i));
    camPos.lerpVectors(keyframes[i].pos, keyframes[i + 1].pos, f);
    camLook.lerpVectors(keyframes[i].look, keyframes[i + 1].look, f);
    if (!reduceMotion) {
      pointerSmooth.lerp(pointer, 0.05);
      camPos.x += pointerSmooth.x * 0.45 + (Math.random() - 0.5) * shake * 0.5;
      camPos.y += pointerSmooth.y * 0.3 + Math.sin(t * 0.5) * 0.06 + (Math.random() - 0.5) * shake * 0.5;
    }
    camera.position.copy(camPos);
    lookSmooth.lerp(camLook, firstFrame ? 1 : 0.2);
    camera.lookAt(lookSmooth);
    if (!reduceMotion) camera.rotateZ(Math.sin(f * Math.PI) * 0.16 * (i % 2 ? -1 : 1));
    camera.fov = 45 + speed * 24 - pulse * 1.2;
    camera.updateProjectionMatrix();

    // Globe: scrolling away scatters the continents into points; back reassembles it.
    gemCrack.step(dt);
    const scrollShatter = reduceMotion ? 0 : ease(clamp(s * 1.4)) * 1.6;
    gemSpin += (0.25 - gemSpin) * Math.min(1, dt * 1.5);
    crystal.rotation.y += (gemSpin - 0.25 + scrollShatter * 0.4) * dt * (reduceMotion ? 0.2 : 1);
    crystal.rotation.x *= 0.98;
    crystal.position.y = 0.4 + (reduceMotion ? 0 : Math.sin(t * 0.7) * 0.12);
    globe?.update(dt, t, { scatter: scrollShatter + gemCrack.value * 0.12, pulse, spinSpeed: reduceMotion ? 0.02 : 0.08 });
    ringGroup.scale.setScalar(1 + scrollShatter * 0.5);
    ringGroup.rotation.z += dt * 0.08;
    const orbit = t * 0.6;
    satellite.position.set(Math.cos(orbit) * 2.3, Math.sin(orbit) * 2.3, 0);

    updateCandles(t, pulse);
    updateShards(dt, t, s);
    updateCollectibles(dt, t);
    updateTrophies(t);
    updateEnvironment(dt, t, pulse, s);
    updateBurst(dt);
    particleMaterial.uniforms.uTime.value = t;
    particleMaterial.uniforms.uTravel.value = travel;
    particleMaterial.uniforms.uWarp.value = speed;
    grid.material.opacity = 0.3 + pulse * 0.35;
    updateHover();

    bloom.strength = 0.85 + pulse * 0.55 + speed * 0.9 + flash * 1.5;
    lens.uniforms.uSpeed.value = speed;
    lens.uniforms.uBeat.value = pulse;
    lens.uniforms.uFlash.value = flash * flash;
    lens.uniforms.uTime.value = t;

    // Copy leans into fast scrolls.
    const skew = reduceMotion ? 0 : clamp(delta * 14, -4, 4);
    if (Math.abs(skew - lastSkew) > 0.02) {
      lastSkew = skew;
      rootStyle.setProperty("--skew", `${skew.toFixed(2)}deg`);
    }

    composer.render();

    if (firstFrame) {
      firstFrame = false;
      Promise.all([document.fonts.ready, environmentReady]).then(() => { load.done = true; });
    }
    requestAnimationFrame(frame);
  }

  load.target = 0.92;
  requestAnimationFrame(frame);

  return { crack, celebrate, openGame, drop: () => drop(clock.elapsedTime) };
}
