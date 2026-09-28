import * as THREE from "three";

// Scene props for the trading world: the markets globe, currency coins,
// live price panels, the AI lattice and the skyline's window shader.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function latLonToVector(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    Math.cos(phi) * Math.sin(lambda) * radius,
    Math.sin(phi) * radius,
    Math.cos(phi) * Math.cos(lambda) * radius
  );
}

/* ============================================================
   Markets globe
   ============================================================ */

// Forex hubs and their (approximate) session hours in UTC.
const HUBS = [
  { name: "London", lat: 51.5, lon: -0.13, open: 7, close: 16 },
  { name: "New York", lat: 40.7, lon: -74.0, open: 12, close: 21 },
  { name: "Tokyo", lat: 35.7, lon: 139.7, open: 0, close: 9 },
  { name: "Sydney", lat: -33.9, lon: 151.2, open: 21, close: 6 },
  { name: "Frankfurt", lat: 50.1, lon: 8.7, open: 6, close: 15 },
  { name: "Singapore", lat: 1.35, lon: 103.8, open: 0, close: 9 },
  { name: "Hong Kong", lat: 22.3, lon: 114.2, open: 0, close: 9 },
  { name: "Zurich", lat: 47.4, lon: 8.5, open: 7, close: 16 }
];

export const EXETER = { lat: 50.7, lon: -3.53 };

export function sessionOpen(hub, date = new Date()) {
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;
  return hub.open < hub.close ? h >= hub.open && h < hub.close : h >= hub.open || h < hub.close;
}

export function openSessions(date = new Date()) {
  const majors = ["Sydney", "Tokyo", "London", "New York"];
  return HUBS.filter((hub) => majors.includes(hub.name) && sessionOpen(hub, date)).map((hub) => hub.name);
}

export function createGlobe({ colors, landDots, pixelRatio }) {
  const R = 1.55;
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(23.4);
  const spin = new THREE.Group();
  spin.rotation.y = THREE.MathUtils.degToRad(20); // open on Europe and the Atlantic
  tilt.add(spin);
  root.add(tilt);

  // Ocean: dark sphere with a lilac limb.
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uDeep: { value: new THREE.Color("#0b0418") }, uRim: { value: colors.lilac }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep; uniform vec3 uRim; uniform float uFade;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float fres = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 3.0);
          gl_FragColor = vec4((uDeep + uRim * fres * 0.7) * uFade, 1.0);
        }
      `
    })
  );
  spin.add(ocean);

  // Atmosphere halo.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.14, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: colors.amethyst }, uStrength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uStrength;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float glow = pow(clamp(0.72 + dot(normalize(vN), vV), 0.0, 1.0), 4.0);
          gl_FragColor = vec4(uColor * 1.6, glow * uStrength);
        }
      `
    })
  );
  root.add(halo);

  // Graticule every 30°.
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = 0; lon < 360; lon += 4) {
      grat.push(latLonToVector(lat, lon, R * 1.002), latLonToVector(lat, lon + 4, R * 1.002));
    }
  }
  for (let lon = 0; lon < 360; lon += 30) {
    for (let lat = -84; lat < 84; lat += 4) {
      grat.push(latLonToVector(lat, lon, R * 1.002), latLonToVector(lat + 4, lon, R * 1.002));
    }
  }
  const graticule = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(grat),
    new THREE.LineBasicMaterial({ color: colors.amethyst, transparent: true, opacity: 0.18, depthWrite: false })
  );
  spin.add(graticule);

  // Land as dots; scrolling away scatters them outwards.
  const count = landDots.length / 2;
  const dotPos = new Float32Array(count * 3);
  const dotRand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const v = latLonToVector(landDots[i * 2], landDots[i * 2 + 1], R * 1.004);
    dotPos.set([v.x, v.y, v.z], i * 3);
    dotRand[i] = Math.random();
  }
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeometry.setAttribute("aRand", new THREE.BufferAttribute(dotRand, 1));
  const dotMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uScatter: { value: 0 },
      uPulse: { value: 0 },
      uPixel: { value: pixelRatio },
      uColor: { value: colors.lilac }
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScatter; uniform float uPixel;
      attribute float aRand;
      varying float vBright;
      void main() {
        vec3 n = normalize(position);
        vec3 p = position + n * uScatter * (0.4 + aRand * 3.5);
        p += vec3(sin(aRand * 91.0), cos(aRand * 53.0), sin(aRand * 17.0)) * uScatter * aRand * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.6 + aRand * 1.2) * uPixel * (7.0 / -mv.z);
        vec3 worldN = normalize(mat3(modelMatrix) * n);
        vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
        float facing = dot(worldN, toCam);
        vBright = mix(0.12, 1.0, smoothstep(-0.1, 0.35, facing) + uScatter);
        vBright *= 0.65 + 0.35 * sin(uTime * (0.6 + aRand) + aRand * 40.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPulse;
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor * (1.1 + uPulse * 0.8), smoothstep(0.5, 0.15, d) * vBright);
      }
    `
  });
  const dots = new THREE.Points(dotGeometry, dotMaterial);
  spin.add(dots);

  // Hubs: a beam and a pulsing ring; brighter while their session is open.
  const hubs = HUBS.map((hub) => {
    const pos = latLonToVector(hub.lat, hub.lon, R * 1.005);
    const normal = pos.clone().normalize();
    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(2.2), transparent: true });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), beamMaterial);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(2), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), beamMaterial);
    group.add(beam, ring, node);
    spin.add(group);
    return { ...hub, pos, group, beam, ring, ringMaterial, beamMaterial, phase: Math.random() };
  });

  const exeterAnchor = new THREE.Object3D();
  exeterAnchor.position.copy(latLonToVector(EXETER.lat, EXETER.lon, R * 1.01));
  spin.add(exeterAnchor);
  const exeterMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.045, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), side: THREE.DoubleSide, transparent: true, depthWrite: false })
  );
  exeterMarker.position.copy(exeterAnchor.position);
  exeterMarker.lookAt(exeterAnchor.position.clone().multiplyScalar(2));
  spin.add(exeterMarker);

  // Trade arcs: a bright head runs along a bezier between two hubs.
  const SEGMENTS = 64;
  const arcMaterialBase = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHead; uniform vec3 uColor;
      varying float vT;
      void main() {
        float behind = uHead - vT;
        float a = step(0.0, behind) * (1.0 - smoothstep(0.0, 0.35, behind));
        a += step(0.0, behind) * 0.12 * (1.0 - smoothstep(0.35, 1.2, behind));
        gl_FragColor = vec4(uColor, a);
      }
    `
  };
  const tValues = new Float32Array(SEGMENTS + 1).map((_, i) => i / SEGMENTS);
  // Buys in green, sells in red.
  const bull = colors.bull.clone().multiplyScalar(2);
  const bear = colors.bear.clone().multiplyScalar(1.8);
  const arcs = Array.from({ length: 18 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    geometry.setAttribute("aT", new THREE.BufferAttribute(tValues, 1));
    const material = new THREE.ShaderMaterial({ ...arcMaterialBase, uniforms: { uHead: { value: 2 }, uColor: { value: bull.clone() } } });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    spin.add(line);
    return { line, geometry, material, head: 2, speed: 0.5, wait: Math.random() * 3 };
  });

  const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), p = new THREE.Vector3();
  function launch(arc, from) {
    const open = hubs.filter((hub) => sessionOpen(hub));
    const start = from || (open.length && Math.random() < 0.75 ? open[(Math.random() * open.length) | 0] : hubs[(Math.random() * hubs.length) | 0]);
    let end = start;
    while (end === start) end = hubs[(Math.random() * hubs.length) | 0];
    a.copy(start.pos);
    b.copy(end.pos);
    const distance = a.distanceTo(b);
    mid.copy(a).add(b).normalize().multiplyScalar(R * (1.08 + distance * 0.28));
    const positions = arc.geometry.attributes.position.array;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      // Quadratic bezier a → mid → b.
      p.copy(a).multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(mid, 2 * (1 - t) * t)
        .addScaledVector(b, t * t);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    arc.geometry.attributes.position.needsUpdate = true;
    arc.material.uniforms.uColor.value.copy(Math.random() < 0.6 ? bull : bear);
    arc.head = 0;
    arc.speed = 0.45 + Math.random() * 0.35;
    arc.wait = 0;
  }

  function fireTrades(n) {
    const idle = arcs.filter((arc) => arc.head > 1.2).slice(0, n);
    const origin = hubs.find((hub) => hub.name === "London");
    idle.forEach((arc, i) => launch(arc, i % 2 ? undefined : origin));
  }

  const hitMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  root.add(hitMesh);

  let sessionCheck = 0;
  function update(dt, t, { scatter = 0, pulse = 0, spinSpeed = 0.08 }) {
    spin.rotation.y += dt * spinSpeed;
    dotMaterial.uniforms.uTime.value = t;
    dotMaterial.uniforms.uScatter.value = scatter;
    dotMaterial.uniforms.uPulse.value = pulse;
    ocean.material.uniforms.uFade.value = 1 - clamp(scatter * 1.4);
    ocean.scale.setScalar(Math.max(0.001, 1 - clamp(scatter * 0.9)));
    halo.material.uniforms.uStrength.value = (1 - clamp(scatter)) * (0.8 + pulse * 0.4);
    graticule.material.opacity = 0.18 * (1 - clamp(scatter * 2));

    sessionCheck -= dt;
    const recheck = sessionCheck <= 0;
    if (recheck) sessionCheck = 30;
    hubs.forEach((hub) => {
      if (recheck) hub.isOpen = sessionOpen(hub);
      const height = hub.isOpen ? 0.42 : 0.14;
      hub.beam.scale.y = height * (1 - clamp(scatter));
      hub.beam.position.y = hub.beam.scale.y / 2;
      hub.beamMaterial.opacity = (hub.isOpen ? 1 : 0.35) * (1 - clamp(scatter));
      const k = (t * 0.6 + hub.phase) % 1;
      hub.ring.scale.setScalar(1 + k * (hub.isOpen ? 3 : 1.5));
      hub.ringMaterial.opacity = (1 - k) * (hub.isOpen ? 0.9 : 0.3) * (1 - clamp(scatter));
    });
    exeterMarker.material.opacity = (0.6 + 0.4 * Math.sin(t * 4)) * (1 - clamp(scatter));

    arcs.forEach((arc) => {
      if (arc.head > 1.2) {
        arc.wait -= dt;
        if (arc.wait <= 0 && scatter < 0.2) launch(arc);
        else if (arc.wait <= 0) arc.wait = 1;
      } else {
        arc.head += dt * arc.speed;
        if (arc.head > 1.2) arc.wait = 0.5 + Math.random() * 2.5;
      }
      arc.material.uniforms.uHead.value = arc.head;
      arc.line.visible = scatter < 0.6;
    });
  }

  return { root, spin, hitMesh, exeterAnchor, fireTrades, update, hubs };
}

/* ============================================================
   Currency coins (the collectibles)
   ============================================================ */

export const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "JPY", symbol: "¥" },
  { code: "CHF", symbol: "Fr" },
  { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" }
];

export function createCoin(currency, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(100, 90, 20, 128, 128, 128);
  gradient.addColorStop(0, "#f1e4ff");
  gradient.addColorStop(1, "#b07cff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(19, 9, 29, 0.55)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#13091d";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${currency.symbol.length > 1 ? 88 : 128}px Unbounded, sans-serif`;
  ctx.fillText(currency.symbol, 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const face = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.5, 1.5, 1.5) });
  const rim = new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(2.2) });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40), [rim, face, face]);
  coin.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(coin);
  return holder;
}

/* ============================================================
   Price panels: floating holographic tickers
   ============================================================ */

const PAIRS = [
  ["EUR/USD", 1.0842, 4], ["GBP/USD", 1.271, 4], ["USD/JPY", 151.32, 2], ["AUD/USD", 0.6581, 4],
  ["USD/CHF", 0.8812, 4], ["USD/CAD", 1.3598, 4], ["EUR/GBP", 0.8531, 4], ["XAU/USD", 2334.1, 2],
  ["NZD/USD", 0.6012, 4], ["EUR/JPY", 164.05, 2], ["GBP/JPY", 192.4, 2], ["USD/SGD", 1.3462, 4]
];

export function createPricePanel(index) {
  const [pair, start, decimals] = PAIRS[index % PAIRS.length];
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.75),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.25, 1.25, 1.25) })
  );

  const history = [];
  let price = start;
  for (let i = 0; i < 48; i++) history.push((price *= 1 + (Math.random() - 0.5) * 0.0015));
  const open = history[0];

  function draw() {
    ctx.clearRect(0, 0, 512, 280);
    ctx.fillStyle = "rgba(22, 9, 38, 0.72)";
    ctx.strokeStyle = "rgba(201, 156, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 272, 22);
    ctx.fill();
    ctx.stroke();

    const change = (price / open - 1) * 100;
    const up = change >= 0;
    ctx.fillStyle = "#c99cff";
    ctx.font = "500 30px Unbounded, sans-serif";
    ctx.fillText(pair, 30, 58);
    ctx.fillStyle = "#6f6580";
    ctx.font = "400 18px 'JetBrains Mono', monospace";
    ctx.fillText("simulated", 380, 56);
    ctx.fillStyle = "#f8f5ff";
    ctx.font = "500 56px 'JetBrains Mono', monospace";
    ctx.fillText(price.toFixed(decimals), 30, 132);
    ctx.fillStyle = up ? "#3cf0b0" : "#ff5c82";
    ctx.font = "500 24px 'JetBrains Mono', monospace";
    ctx.fillText(`${up ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}%`, 30, 172);

    // Sparkline.
    const min = Math.min(...history), max = Math.max(...history);
    ctx.strokeStyle = up ? "#3cf0b0" : "#ff5c82";
    ctx.lineWidth = 4;
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = 30 + (i / (history.length - 1)) * 452;
      const y = 250 - ((v - min) / (max - min || 1)) * 56;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    texture.needsUpdate = true;
  }
  draw();

  let timer = Math.random();
  function update(dt) {
    timer -= dt;
    if (timer > 0) return;
    timer = 0.6 + Math.random() * 0.8;
    price *= 1 + (Math.random() - 0.5) * 0.0012;
    history.push(price);
    history.shift();
    draw();
  }

  return { mesh, update };
}

/* ============================================================
   AI lattice: a small neural network with signals flowing through
   ============================================================ */

export function createLattice(colors) {
  const group = new THREE.Group();
  const layers = [3, 5, 5, 3];
  const nodes = [];
  const nodeMaterial = new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(2) });
  const nodeGeometry = new THREE.IcosahedronGeometry(0.075, 1);
  layers.forEach((n, l) => {
    const layer = [];
    for (let i = 0; i < n; i++) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.set((l - (layers.length - 1) / 2) * 0.75, (i - (n - 1) / 2) * 0.55, (Math.random() - 0.5) * 0.4);
      group.add(node);
      layer.push(node);
    }
    nodes.push(layer);
  });

  const edges = [];
  const points = [];
  for (let l = 0; l < layers.length - 1; l++) {
    for (const from of nodes[l]) {
      for (const to of nodes[l + 1]) {
        edges.push([from.position, to.position]);
        points.push(from.position, to.position);
      }
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: colors.amethyst, transparent: true, opacity: 0.35 })
  );
  group.add(lines);

  const PULSES = 36;
  const pulsePos = new Float32Array(PULSES * 3);
  const pulses = Array.from({ length: PULSES }, () => ({ edge: (Math.random() * edges.length) | 0, t: Math.random() }));
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
  const pulsePoints = new THREE.Points(pulseGeometry, new THREE.PointsMaterial({
    color: colors.lilac.clone().multiplyScalar(3),
    size: 0.09,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pulsePoints.frustumCulled = false;
  group.add(pulsePoints);

  const tmp = new THREE.Vector3();
  let boost = 0;
  function update(dt, t, hover) {
    boost = Math.max(0, boost - dt);
    const speed = 0.8 + hover * 1.6 + boost * 3;
    pulses.forEach((pulse, i) => {
      pulse.t += dt * speed;
      if (pulse.t >= 1) {
        // Continue from the end node into the next layer where possible.
        const end = edges[pulse.edge][1];
        const next = edges.map((e, k) => (e[0] === end ? k : -1)).filter((k) => k >= 0);
        pulse.edge = next.length ? next[(Math.random() * next.length) | 0] : (Math.random() * edges.length) | 0;
        pulse.t = 0;
      }
      const [from, to] = edges[pulse.edge];
      tmp.lerpVectors(from, to, pulse.t);
      pulsePos.set([tmp.x, tmp.y, tmp.z], i * 3);
    });
    pulseGeometry.attributes.position.needsUpdate = true;
    nodeMaterial.color.copy(colors.lilac).multiplyScalar(0.95 + hover * 0.8 + boost * 1.5 + Math.sin(t * 3) * 0.1);
    lines.material.opacity = 0.3 + hover * 0.3 + boost * 0.4;
  }

  return { group, update, fire() { boost = 1; } };
}

/* ============================================================
   Skyline: lit office windows computed from world position
   ============================================================ */

export function createSkylineMaterial(colors, fogDensity = 0.012) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uVoid: { value: colors.void },
      uLow: { value: new THREE.Color("#06030b") },
      uHigh: { value: new THREE.Color("#1d0d36") },
      uWindow: { value: colors.lilac },
      uFog: { value: fogDensity },
      uBase: { value: -5.6 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPulse; uniform float uFog; uniform float uBase;
      uniform vec3 uVoid; uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uWindow;
      varying vec3 vWorld; varying vec3 vNormal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        float h = clamp((vWorld.y - uBase) / 24.0, 0.0, 1.0);
        vec3 col = mix(uLow, uHigh, h);

        // Windows on walls: grid in the wall's own horizontal axis.
        float wall = 1.0 - step(0.5, abs(n.y));
        vec2 axis = normalize(vec2(-n.z, n.x) + 1e-5);
        float u = dot(vWorld.xz, axis) / 0.42;
        float w = (vWorld.y - uBase) / 0.6;
        vec2 cell = floor(vec2(u, w));
        vec2 f = fract(vec2(u, w));
        float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.78);
        float seed = hash(cell + floor(vWorld.xz * 0.15) * 7.0);
        float lit = step(0.7, seed);
        float flicker = step(0.97, hash(cell + floor(uTime * 0.4 + seed * 10.0)));
        vec3 glass = uWindow * mix(0.8, 1.6, hash(cell * 1.7)) * (1.0 + uPulse * 0.5);
        col += glass * pane * wall * max(lit, flicker) * (0.4 + h * 0.45);

        // Cool rim along silhouettes and a faint roof line.
        col += uWindow * pow(1.0 - abs(dot(n, v)), 4.0) * 0.25 * h;
        col += uWindow * step(0.9, n.y) * 0.08;

        float d = length(cameraPosition - vWorld);
        col = mix(col, uVoid, 1.0 - exp(-pow(d * uFog, 2.0)));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}
