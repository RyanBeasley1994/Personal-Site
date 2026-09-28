import * as THREE from "three";

// Bull Run: the reward for finding every shard. Fly the crystal over an endless chart,
// dodge bear candles, grab bull candles to stack a multiplier.

const LANE_X = 4.6;
const Y_MIN = -1.1;
const Y_MAX = 2.8;
const FLOOR = -2;
const SPAWN_Z = -75;
const PLAYER_RADIUS = 0.3;
const BEST_KEY = "beasley.bullrun.best";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

export function createGame({ scene, camera, lens, bloom, audio, holoMaterial, colors, onOpen, onClose }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  /* ---------- World ---------- */

  const grid = new THREE.GridHelper(220, 110, colors.amethyst, colors.deep);
  grid.position.set(0, FLOOR, -90);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  group.add(grid);

  const railMaterial = new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(1.1) });
  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 220), railMaterial);
    rail.position.set(side * (LANE_X + 1), FLOOR + 0.02, -90);
    group.add(rail);
  });

  // Speed streaks in a tube around the lane.
  const STREAKS = 500;
  const streakPos = new Float32Array(STREAKS * 3);
  for (let i = 0; i < STREAKS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = rand(7, 22);
    streakPos[i * 3] = Math.cos(angle) * radius;
    streakPos[i * 3 + 1] = Math.sin(angle) * radius * 0.6 + 2;
    streakPos[i * 3 + 2] = rand(SPAWN_Z, 10);
  }
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
  const streaks = new THREE.Points(streakGeometry, new THREE.PointsMaterial({
    color: colors.lilac.clone().multiplyScalar(1.6),
    size: 0.08,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  streaks.frustumCulled = false;
  group.add(streaks);

  /* ---------- Player ---------- */

  const playerGeometry = new THREE.OctahedronGeometry(0.34, 0);
  playerGeometry.scale(1, 1.3, 1.6);
  const playerMaterial = holoMaterial();
  const player = new THREE.Mesh(playerGeometry, playerMaterial);
  const playerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(playerGeometry),
    new THREE.LineBasicMaterial({ color: colors.lilac.clone().multiplyScalar(2.4), transparent: true })
  );
  player.add(playerEdges);
  group.add(player);

  const TRAIL = 48;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  // Soft round sprite so the trail reads as light, not squares.
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 64;
  const dot = dotCanvas.getContext("2d");
  const gradient = dot.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  dot.fillStyle = gradient;
  dot.fillRect(0, 0, 64, 64);
  const dotTexture = new THREE.CanvasTexture(dotCanvas);

  const trail = new THREE.Points(trailGeometry, new THREE.PointsMaterial({
    color: colors.amethyst.clone().multiplyScalar(2.2),
    map: dotTexture,
    size: 0.22,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  trail.frustumCulled = false;
  group.add(trail);

  /* ---------- Candles ---------- */

  const box = new THREE.BoxGeometry(1, 1, 1);
  const faceShade = [0.6, 0.6, 1.0, 0.25, 0.8, 0.45];
  const shade = [];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) shade.push(faceShade[f], faceShade[f], faceShade[f]);
  box.setAttribute("color", new THREE.Float32BufferAttribute(shade, 3));
  const boxEdges = new THREE.EdgesGeometry(box);

  const bearMaterial = new THREE.MeshBasicMaterial({ color: colors.bear.clone().multiplyScalar(0.9), vertexColors: true });
  const bearEdgeMaterial = new THREE.LineBasicMaterial({ color: colors.bear.clone().multiplyScalar(1.8) });
  const bullMaterial = new THREE.MeshBasicMaterial({ color: colors.bull.clone().multiplyScalar(2), vertexColors: true });

  const bears = Array.from({ length: 48 }, () => {
    const mesh = new THREE.Mesh(box, bearMaterial);
    mesh.add(new THREE.LineSegments(boxEdges, bearEdgeMaterial));
    const wick = new THREE.Mesh(box, bearMaterial);
    group.add(mesh, wick);
    mesh.visible = wick.visible = false;
    return { mesh, wick, active: false, w: 1, h: 1, grazed: false };
  });

  const bulls = Array.from({ length: 16 }, () => {
    const mesh = new THREE.Mesh(box, bullMaterial);
    mesh.scale.set(0.34, 0.8, 0.34);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, active: false };
  });

  function spawnBear(x, width, height, z) {
    const b = bears.find((o) => !o.active);
    if (!b) return;
    b.active = true;
    b.grazed = false;
    b.w = width;
    b.h = height;
    b.mesh.visible = b.wick.visible = true;
    b.mesh.scale.set(width, height, width);
    b.mesh.position.set(x, FLOOR + height / 2, z);
    b.wick.scale.set(0.08, 1.4, 0.08);
    b.wick.position.set(x, FLOOR + height + 0.7, z);
  }

  function spawnBull(x, y, z) {
    const b = bulls.find((o) => !o.active);
    if (!b) return;
    b.active = true;
    b.mesh.visible = true;
    b.mesh.position.set(x, y, z);
  }

  // Patterns get meaner as the run goes on.
  function spawnWave(level) {
    const z = SPAWN_Z;
    const roll = Math.random();
    if (roll < 0.28 + level * 0.1) {
      // Wall of candles with one gap.
      const slots = 6;
      const gap = Math.floor(Math.random() * slots);
      const slotW = (LANE_X * 2) / slots;
      for (let i = 0; i < slots; i++) {
        if (i === gap) continue;
        spawnBear(-LANE_X + slotW * (i + 0.5), slotW * 0.9, rand(3.2, 5.2), z);
      }
      spawnBull(-LANE_X + slotW * (gap + 0.5), rand(-0.5, 1.2), z);
    } else if (roll < 0.6) {
      // Short candles to hop over, tall ones to steer round.
      const count = 2 + Math.floor(level * 3);
      for (let i = 0; i < count; i++) {
        const tall = Math.random() < 0.45;
        spawnBear(rand(-LANE_X, LANE_X), rand(0.7, 1.3), tall ? rand(4.2, 5.5) : rand(0.8, 2.0), z - rand(0, 10));
      }
      if (Math.random() < 0.7) spawnBull(rand(-LANE_X, LANE_X), rand(Y_MIN + 0.4, Y_MAX - 0.3), z - 5);
    } else {
      // A zig-zag of bulls threading between towers.
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        spawnBear(side * (i % 2 ? 1 : -1) * rand(1.8, LANE_X), 1.2, rand(4, 5.5), z - i * 7);
        spawnBull(side * (i % 2 ? -1 : 1) * 1.4, rand(0, 1.5), z - i * 7);
      }
    }
  }

  /* ---------- DOM ---------- */

  const root = document.getElementById("game");
  const panel = document.getElementById("game-panel");
  const title = document.getElementById("game-title");
  const text = document.getElementById("game-text");
  const startButton = document.getElementById("game-start");
  const scoreEl = document.getElementById("game-score");
  const multEl = document.getElementById("game-mult");
  const bestEl = document.getElementById("game-best");
  const popEl = document.getElementById("game-pop");

  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* ignore */ }
  bestEl.textContent = best;

  startButton.addEventListener("click", () => start());
  root.querySelectorAll("[data-game-exit]").forEach((el) => el.addEventListener("click", () => close()));

  let popTimer;
  function pop(message, kind = "") {
    popEl.textContent = message;
    popEl.dataset.kind = kind;
    popEl.classList.remove("is-visible");
    void popEl.offsetWidth;
    popEl.classList.add("is-visible");
    clearTimeout(popTimer);
    popTimer = setTimeout(() => popEl.classList.remove("is-visible"), 700);
  }

  /* ---------- Input ---------- */

  const target = new THREE.Vector2(0, 0.6);
  const keys = new Set();

  root.addEventListener("pointermove", (e) => {
    if (state !== "playing") return;
    target.x = ((e.clientX / innerWidth) * 2 - 1) * LANE_X * 1.15;
    target.y = Y_MIN + (1 - e.clientY / innerHeight) * (Y_MAX - Y_MIN) * 1.2 - 0.2;
  });

  window.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Escape") { close(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    if ((e.key === " " || e.key === "Enter") && state !== "playing") { start(); return; }
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  /* ---------- State ---------- */

  let active = false;
  let state = "menu"; // menu | playing | over
  let speed = 0;
  let elapsed = 0;
  let score = 0;
  let mult = 1;
  let lastPickup = 0;
  let spawnTimer = 0;
  let crashT = 0;
  let shake = 0;
  let flash = 0;
  const velocity = new THREE.Vector2();
  const shardCrack = { value: 0, velocity: 0 };

  function showPanel(heading, body, button) {
    title.textContent = heading;
    text.textContent = body;
    startButton.textContent = button;
    panel.hidden = false;
    startButton.focus({ preventScroll: true });
  }

  function reset() {
    bears.forEach((b) => { b.active = false; b.mesh.visible = b.wick.visible = false; });
    bulls.forEach((b) => { b.active = false; b.mesh.visible = false; });
    player.position.set(0, 0.6, 0);
    player.visible = true;
    target.set(0, 0.6);
    velocity.set(0, 0);
    for (let i = 0; i < TRAIL; i++) trailPos.set([0, 0.6, 0], i * 3);
    speed = 18;
    elapsed = 0;
    score = 0;
    mult = 1;
    spawnTimer = 0.5;
    shardCrack.value = shardCrack.velocity = 0;
    renderScore();
  }

  function renderScore() {
    scoreEl.textContent = Math.floor(score).toLocaleString("en-GB");
    multEl.textContent = `×${mult}`;
  }

  function open() {
    if (active) return;
    active = true;
    group.visible = true;
    scenery.forEach((rock) => { rock.visible = true; });
    root.hidden = false;
    document.body.classList.add("in-game");
    onOpen();
    reset();
    state = "menu";
    audio.setSection(3);
    flash = 0.8;
    showPanel(
      "Bull Run",
      "The market's running. Fly the jet through the chart: dodge the bear candles, grab the glowing bull candles to stack your multiplier up to ×8. Skim past candles for bonus pips. Steer with your mouse, finger or arrow keys.",
      "Start run"
    );
  }

  function start() {
    reset();
    state = "playing";
    panel.hidden = true;
    audio.setSection(4.2);
    audio.drop();
    flash = 0.7;
  }

  function crash() {
    state = "over";
    crashT = 0;
    shake = 1;
    flash = 0.9;
    shardCrack.velocity = 10;
    audio.crash();
    audio.setSection(3);
    const pips = Math.floor(score);
    const record = pips > best;
    if (record) {
      best = pips;
      bestEl.textContent = best;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
    }
    setTimeout(() => {
      if (state !== "over" || !active) return;
      showPanel(
        record ? "New high score" : "Margin call",
        record
          ? `${pips.toLocaleString("en-GB")} pips. That's your best run yet.`
          : `You banked ${pips.toLocaleString("en-GB")} pips. Your best is ${best.toLocaleString("en-GB")}.`,
        "Run again"
      );
    }, 900);
  }

  function close() {
    if (!active) return;
    active = false;
    state = "menu";
    group.visible = false;
    scenery.forEach((rock) => { rock.visible = false; });
    root.hidden = true;
    panel.hidden = true;
    document.body.classList.remove("in-game");
    keys.clear();
    onClose();
  }

  /* ---------- Update ---------- */

  const closest = new THREE.Vector3();

  function update(dt, t, pulse) {
    const playing = state === "playing";
    const cruise = state === "menu" ? 10 : 0;
    const runSpeed = playing ? speed : state === "over" ? Math.max(0, speed * (1 - crashT * 2)) : cruise;

    if (playing) {
      elapsed += dt;
      speed = Math.min(46, 18 + elapsed * 0.55);

      // Keyboard steering nudges the target.
      const kx = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
      const ky = (keys.has("arrowup") || keys.has("w") ? 1 : 0) - (keys.has("arrowdown") || keys.has("s") ? 1 : 0);
      target.x += kx * dt * 11;
      target.y += ky * dt * 7;
      target.x = clamp(target.x, -LANE_X, LANE_X);
      target.y = clamp(target.y, Y_MIN, Y_MAX);

      const prevX = player.position.x, prevY = player.position.y;
      player.position.x += (target.x - player.position.x) * (1 - Math.exp(-dt * 10));
      player.position.y += (target.y - player.position.y) * (1 - Math.exp(-dt * 10));
      velocity.set((player.position.x - prevX) / dt, (player.position.y - prevY) / dt);

      score += runSpeed * dt * 0.6;
      if (mult > 1 && t - lastPickup > 4) mult = 1;

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const level = clamp(elapsed / 90);
        spawnWave(level);
        spawnTimer = Math.max(0.55, 1.5 - elapsed * 0.012) * (18 / speed) * 1.6;
      }
      renderScore();
    } else if (state === "over") {
      crashT += dt;
    } else {
      player.position.x = Math.sin(t * 0.6) * 1.5;
      player.position.y = 0.6 + Math.sin(t * 0.9) * 0.4;
    }

    // Move the world toward the player.
    const move = runSpeed * dt;
    grid.position.z = -90 + ((grid.position.z + 90 + move) % 2);
    for (let i = 0; i < STREAKS; i++) {
      let z = streakPos[i * 3 + 2] + move * 1.3;
      if (z > 10) z -= 105;
      streakPos[i * 3 + 2] = z;
    }
    streakGeometry.attributes.position.needsUpdate = true;
    streaks.material.size = 0.06 + clamp(runSpeed / 46) * 0.12;

    for (const rock of scenery) {
      rock.position.z += move * 0.9;
      if (rock.position.z > 12) placeRock(rock, SPAWN_Z - rand(0, 20));
    }

    const px = player.position.x, py = player.position.y;
    for (const b of bears) {
      if (!b.active) continue;
      b.mesh.position.z += move;
      b.wick.position.z += move;
      const z = b.mesh.position.z;
      if (z > 8) { b.active = false; b.mesh.visible = b.wick.visible = false; continue; }
      if (!playing) continue;
      const half = b.w / 2;
      closest.set(
        clamp(px, b.mesh.position.x - half, b.mesh.position.x + half),
        clamp(py, FLOOR, FLOOR + b.h),
        clamp(0, z - half, z + half)
      );
      const d = Math.hypot(closest.x - px, closest.y - py, closest.z);
      if (d < PLAYER_RADIUS) { crash(); break; }
      if (!b.grazed && d < 0.75 && z > 0) {
        b.grazed = true;
        score += 15 * mult;
        pop(`close call +${15 * mult}`);
        audio.nearMiss();
      }
    }
    for (const b of bulls) {
      if (!b.active) continue;
      b.mesh.position.z += move;
      b.mesh.rotation.y += dt * 4;
      if (b.mesh.position.z > 8) { b.active = false; b.mesh.visible = false; continue; }
      if (playing && b.mesh.position.distanceTo(player.position) < 0.85) {
        b.active = false;
        b.mesh.visible = false;
        mult = Math.min(8, mult + 1);
        lastPickup = t;
        score += 50 * mult;
        pop(`bull candle +${50 * mult}`, "bull");
        audio.pickup(mult);
        flash = Math.max(flash, 0.15);
      }
    }

    // Trail follows the player and streams backwards.
    for (let i = TRAIL - 1; i > 0; i--) {
      trailPos[i * 3] = trailPos[(i - 1) * 3];
      trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
      trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2] + move;
    }
    trailPos[0] = px; trailPos[1] = py; trailPos[2] = 0.3;
    trailGeometry.attributes.position.needsUpdate = true;
    trail.visible = state !== "over";

    // Player crystal: spins, banks, shatters on a crash.
    shardCrack.velocity += (-60 * shardCrack.value - 3 * shardCrack.velocity) * dt;
    shardCrack.value = Math.max(0, shardCrack.value + shardCrack.velocity * dt);
    playerMaterial.uniforms.uCrack.value = state === "over" ? Math.min(3, crashT * 5) : 0;
    playerMaterial.uniforms.uTime.value = t;
    playerMaterial.uniforms.uGlow.value = 1.2 + pulse * 0.5;
    playerEdges.material.opacity = state === "over" ? 0 : 1;
    player.rotation.z = -velocity.x * 0.06;
    player.rotation.x = velocity.y * 0.04;
    // The fighter faces forward; the menu idles with a slow roll.
    player.rotation.y = state === "menu" ? Math.sin(t * 0.8) * 0.4 : velocity.x * -0.02;

    // Chase camera.
    shake = Math.max(0, shake - dt * 1.5);
    flash = Math.max(0, flash - dt * 2);
    const speedFrac = clamp((runSpeed - 10) / 36);
    camera.position.set(
      px * 0.55 + (Math.random() - 0.5) * shake * 0.6,
      py * 0.5 + 1.7 + (Math.random() - 0.5) * shake * 0.6,
      5.8 - speedFrac * 0.8
    );
    camera.lookAt(px * 0.8, py * 0.6 + 0.2, -14);
    camera.rotateZ(-velocity.x * 0.012);
    camera.fov = 58 + speedFrac * 22 - pulse * 1.5;
    camera.updateProjectionMatrix();

    grid.material.opacity = 0.45 + pulse * 0.4;
    bloom.strength = 0.9 + pulse * 0.6 + speedFrac * 0.5 + flash * 1.5;
    lens.uniforms.uSpeed.value = speedFrac * 0.55 + shake * 0.6;
    lens.uniforms.uBeat.value = pulse;
    lens.uniforms.uFlash.value = flash * flash;
    lens.uniforms.uTime.value = t;
  }

  // Blender scenery: towers streaming past both sides, skyline on the horizon.
  const scenery = [];
  function setScenery(rocks, ridgeGeometry, ridgeMaterial) {
    for (let i = 0; i < 18; i++) {
      const group = new THREE.Group();
      rocks[i % rocks.length].forEach((mesh) => group.add(mesh.clone()));
      const side = i % 2 ? 1 : -1;
      group.userData = { side, spin: (Math.random() - 0.5) * 0.6 };
      placeRock(group, SPAWN_Z + (i / 18) * (SPAWN_Z * -1 + 8));
      group.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
      scenery.push(group);
      scene.add(group);
      group.visible = false;
      group.userData.inGame = true;
    }
    const horizon = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
    // The lane runs into the open side of the canyon.
    horizon.position.set(0, FLOOR - 0.5, -112);
    horizon.rotation.y = -Math.PI / 2;
    horizon.scale.set(1.3, 1.6, 1.3);
    group.add(horizon);
  }

  function placeRock(rock, z) {
    const side = rock.userData.side;
    rock.position.set(side * rand(LANE_X + 3.5, LANE_X + 15), FLOOR - 0.5, z);
    rock.scale.set(rand(0.8, 1.3), rand(0.6, 1.3), rand(0.8, 1.3));
  }

  // Swap the placeholder for the Blender fighter.
  function setShip(crystalGeometry, engineGeometry) {
    player.geometry = crystalGeometry;
    playerMaterial.side = THREE.DoubleSide;
    playerEdges.geometry = new THREE.EdgesGeometry(crystalGeometry, 20);
    player.scale.setScalar(0.42);
    const engine = new THREE.Mesh(engineGeometry, new THREE.MeshBasicMaterial({ color: colors.lilac.clone().multiplyScalar(4) }));
    player.add(engine);
  }

  return {
    setShip,
    setScenery,
    open,
    close,
    update,
    get active() { return active; }
  };
}
