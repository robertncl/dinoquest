// DinoQuest — a Chrome-dino-style endless runner, rendered with Canvas 2D.
// Sprites are authored as character grids and drawn as scaled pixels, so the
// game ships with zero binary assets.

// ---------------------------------------------------------------------------
// Sprite grids. A non-space character = a filled pixel; spaces = transparent.
// ---------------------------------------------------------------------------

const grid = (s) => s.replace(/^\n/, "").replace(/\n$/, "").split("\n");

// Standing T-rex body (head + torso + tail). The eye is baked in as a gap so
// no manual pixel-punching is needed. Legs are separate, animated frames.
const DINO_BODY = grid(`
                ##########
                ###########
                ###########
                ##### #####
                ###########
                ###########
                ###### ####
                ######
                ######
#               ######
##              #######
###            ########
####          #########
#####        ##########
######      ###########
#######    ############
########################
 #######################
  #####################
   ###################
    #################
     ###############
      #############
`);

// Right-arm nub, drawn separately so it sits in front of the chest.
const DINO_ARM = grid(`
###
  #
`);

const DINO_LEGS_A = grid(`
      ###    ####
      ###    ###
      ###    ##
      ##     ##
     ###    ##
    ###
`);

const DINO_LEGS_B = grid(`
      ###    ####
      ###    ###
       ##    ###
       ##    ##
       ##   ###
            ###
`);

const DINO_LEGS_STAND = grid(`
      ###    ####
      ###    ###
      ###    ###
      ###    ###
      ###    ###
     ####   ####
`);

// Ducking dino: stretched low, head forward, tail back.
const DINO_DUCK_A = grid(`
                      ##########
                      ###########
#                     ###### #####
##                    ###########
####       ######################
########  #######################
##################################
###################  #####
#############
   ###  ###     ##  ##
   ##    #      #    #
`);

const DINO_DUCK_B = grid(`
                      ##########
                      ###########
#                     ###### #####
##                    ###########
####       ######################
########  #######################
##################################
###################  #####
#############
    ## ##        ###  ##
    #   #        #     #
`);

const CACTUS_SMALL = grid(`
  ##
  ##
# ##
# ## #
####  #
  ## ##
  ####
  ##
  ##
  ##
`);

const CACTUS_LARGE = grid(`
   ##
   ##   #
#  ##   #
#  ## # #
#  ## # #
## ## ###
 # ####
   ###
   ##
   ##
   ##
   ##
   ##
`);

const BIRD_UP = grid(`
   ##
   ###
   ####
   ######
###########       ##
 ##############  ###
  #################
   ##############
    #########
     ##  ##
`);

const BIRD_DOWN = grid(`
   ##
   ###
   ####
   #####
   ##############
  #################
 ##############  ###
###########       ##
   ####
   ##
`);

const CLOUD = grid(`
   ######
  ##########
 #############
###############
 #############
`);

// ---------------------------------------------------------------------------
// Canvas setup with HiDPI scaling.
// ---------------------------------------------------------------------------

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const VIEW_W = 900;
const VIEW_H = 260;
const GROUND_Y = 210; // baseline the dino's feet rest on

function setupHiDPI() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = VIEW_W * dpr;
  canvas.height = VIEW_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
setupHiDPI();
window.addEventListener("resize", setupHiDPI);

// ---------------------------------------------------------------------------
// Drawing helpers.
// ---------------------------------------------------------------------------

function drawSprite(sprite, x, y, unit, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== " ") {
        ctx.fillRect(Math.round(x + c * unit), Math.round(y + r * unit), unit, unit);
      }
    }
  }
}

function spriteWidth(sprite, unit) {
  let max = 0;
  for (const row of sprite) max = Math.max(max, row.length);
  return max * unit;
}
function spriteHeight(sprite, unit) {
  return sprite.length * unit;
}

// ---------------------------------------------------------------------------
// Game constants.
// ---------------------------------------------------------------------------

const PX = 3; // sprite pixel size
const GRAVITY = 2400; // px/s^2
const JUMP_VELOCITY = -760; // px/s
const START_SPEED = 320; // px/s
const MAX_SPEED = 900;
const SPEED_RAMP = 14; // px/s added per second of play
const DAY_NIGHT_SCORE = 700; // score interval for day/night flip

const STATE = { IDLE: "idle", RUNNING: "running", OVER: "over" };

// ---------------------------------------------------------------------------
// Game state.
// ---------------------------------------------------------------------------

const dino = {
  x: 60,
  y: 0, // top of the standing sprite, computed each frame from feet
  vy: 0,
  onGround: true,
  ducking: false,
  height: 0,
  width: 0,
  legTimer: 0,
  legFrame: 0,
};

let state = STATE.IDLE;
let speed = START_SPEED;
let score = 0;
let hiScore = Number(localStorage.getItem("dinoquest:hi") || 0);
let obstacles = [];
let clouds = [];
let groundOffset = 0;
let spawnTimer = 0;
let isNight = false;
let nightTransition = 0; // 0 = day, 1 = night (for smooth color blend)
let lastTime = 0;
let flashTimer = 0; // brief score-milestone blink
let invincible = false; // dev-only: skip collision (used by shot.mjs)

const DINO_STAND_H = spriteHeight([...DINO_BODY, ...DINO_LEGS_STAND], PX);
const DINO_STAND_W = spriteWidth(DINO_BODY, PX);
const DINO_DUCK_H = spriteHeight(DINO_DUCK_A, PX);
const DINO_DUCK_W = spriteWidth(DINO_DUCK_A, PX);

// ---------------------------------------------------------------------------
// Colors. Each palette entry is [dayHex, nightHex]; col() blends between them
// by nightTransition so the whole scene cross-fades on the day/night cycle.
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function blendColor(dayHex, nightHex, t = nightTransition) {
  const a = hexToRgb(dayHex);
  const b = hexToRgb(nightHex);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(
    lerp(a[2], b[2], t)
  )})`;
}

const PALETTE = {
  skyTop: ["#7ec8f0", "#0a1130"],
  skyBottom: ["#eaf7ff", "#1c2750"],
  dirt: ["#e3c08a", "#2b2742"],
  dirtLine: ["#9c6f3a", "#c9c4de"],
  pebble: ["#bf9a63", "#43406a"],
  dino: ["#4f9e3f", "#83d96e"],
  cactus: ["#2f8f55", "#57b87e"],
  bird: ["#9b59b6", "#cf9bea"],
  cloud: ["#ffffff", "#9fa9d4"],
};
const col = (k) => blendColor(PALETTE[k][0], PALETTE[k][1]);

// Sky color at the very top — used to carve the crescent moon out of the disc.
const skyTopColor = () => col("skyTop");
// Contrasting color for the game-over "X" eye.
const deadEyeColor = () => blendColor("#3a2a1a", "#f0f0f0");

// ---------------------------------------------------------------------------
// Spawning.
// ---------------------------------------------------------------------------

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function spawnObstacle() {
  const roll = Math.random();
  let obstacle;

  if (roll < 0.18 && score > 250) {
    // Pterodactyl at one of three heights.
    const heights = [GROUND_Y - 30, GROUND_Y - 60, GROUND_Y - 95];
    const y = heights[Math.floor(Math.random() * heights.length)];
    obstacle = {
      type: "bird",
      x: VIEW_W + 20,
      y,
      w: spriteWidth(BIRD_UP, PX),
      h: spriteHeight(BIRD_UP, PX),
      hitboxes: BIRD_BOXES,
      flap: 0,
      flapTimer: 0,
    };
  } else {
    // Cactus: small or large, sometimes clustered.
    const large = Math.random() < 0.4;
    const sprite = large ? CACTUS_LARGE : CACTUS_SMALL;
    const count = large ? (Math.random() < 0.3 ? 2 : 1) : Math.floor(randRange(1, 4));
    const unitW = spriteWidth(sprite, PX);
    const h = spriteHeight(sprite, PX);
    obstacle = {
      type: "cactus",
      sprite,
      count,
      x: VIEW_W + 20,
      y: GROUND_Y - h,
      w: unitW * count,
      h,
      hitboxes: large ? CACTUS_LARGE_BOXES : CACTUS_SMALL_BOXES,
    };
  }
  obstacles.push(obstacle);

  // Schedule the next spawn: gap shrinks as speed rises, with jitter.
  const base = lerp(1.4, 0.7, (speed - START_SPEED) / (MAX_SPEED - START_SPEED));
  spawnTimer = randRange(base, base + 0.8);
}

function spawnCloud() {
  clouds.push({
    x: VIEW_W + 20,
    y: randRange(20, 90),
    w: spriteWidth(CLOUD, PX),
  });
}

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

function jump() {
  if (state === STATE.IDLE) {
    startGame();
    return;
  }
  if (state === STATE.OVER) {
    resetGame();
    return;
  }
  if (dino.onGround) {
    dino.vy = JUMP_VELOCITY;
    dino.onGround = false;
    dino.ducking = false;
  }
}

function setDuck(active) {
  if (state !== STATE.RUNNING) return;
  dino.ducking = active;
  if (active && !dino.onGround) {
    // Fast-fall when ducking mid-air.
    dino.vy += 600;
  }
}

window.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "Space":
    case "ArrowUp":
    case "KeyW":
      e.preventDefault();
      jump();
      break;
    case "ArrowDown":
    case "KeyS":
      e.preventDefault();
      setDuck(true);
      break;
    case "Enter":
      if (state !== STATE.RUNNING) jump();
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown" || e.code === "KeyS") setDuck(false);
});

// Pointer / touch: tap top half to jump, bottom half to duck.
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const localY = (e.clientY - rect.top) / rect.height;
  if (state !== STATE.RUNNING) {
    jump();
    return;
  }
  if (localY > 0.6) {
    setDuck(true);
  } else {
    jump();
  }
});
canvas.addEventListener("pointerup", () => setDuck(false));
canvas.addEventListener("pointerleave", () => setDuck(false));

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
startBtn.addEventListener("click", () => jump());

// ---------------------------------------------------------------------------
// Game flow.
// ---------------------------------------------------------------------------

function startGame() {
  state = STATE.RUNNING;
  overlay.hidden = true;
}

function resetGame() {
  state = STATE.RUNNING;
  speed = START_SPEED;
  score = 0;
  obstacles = [];
  spawnTimer = 0.6;
  dino.vy = 0;
  dino.onGround = true;
  dino.ducking = false;
  isNight = false;
  nightTransition = 0;
  document.body.classList.remove("is-night");
  overlay.hidden = true;
}

function gameOver() {
  state = STATE.OVER;
  if (score > hiScore) {
    hiScore = Math.floor(score);
    localStorage.setItem("dinoquest:hi", String(hiScore));
  }
  overlay.hidden = false;
  overlay.querySelector(".overlay__title").textContent = "Game Over";
  overlay.querySelector(".overlay__msg").textContent = `Score ${pad(Math.floor(score))}`;
  startBtn.textContent = "Press Space to Retry";
}

// ---------------------------------------------------------------------------
// Collision.
//
// Each sprite gets a small set of collision boxes (in grid units, relative to
// the sprite's draw origin) that hug its filled pixels instead of one loose
// box around the whole grid. This matches the real shapes: the dino's L,
// the bird's narrow body inside a wide wingspan, the cacti's cross.
//
// Obstacle boxes are tight (deaths feel fair); the dino's are slightly inset
// from its edges (a near miss reads as a miss). Boxes are {x, y, w, h} in
// grid cells; scaleBoxes() converts them to world-pixel AABBs.
// ---------------------------------------------------------------------------

// Dino standing: head/neck (upper right) + body/legs (lower, full width).
const STAND_BOXES = [
  { x: 16, y: 1, w: 11, h: 10 },
  { x: 1, y: 11, w: 23, h: 17 },
];
// Dino ducking: a low body slab plus the head poking forward; legs omitted.
const DUCK_BOXES = [
  { x: 0, y: 4, w: 33, h: 4 },
  { x: 22, y: 0, w: 12, h: 4 },
];
// Cacti: a vertical stalk plus the arm band, trimming the empty corners.
const CACTUS_SMALL_BOXES = [
  { x: 2, y: 0, w: 2, h: 10 },
  { x: 0, y: 2, w: 7, h: 4 },
];
const CACTUS_LARGE_BOXES = [
  { x: 3, y: 0, w: 2, h: 13 },
  { x: 0, y: 1, w: 9, h: 6 },
];
// Bird: the solid central body + leading edge, not the thin upper wing tip
// or the trailing tail (same box works for both flap frames).
const BIRD_BOXES = [{ x: 0, y: 3, w: 18, h: 6 }];

function scaleBoxes(boxes, ox, oy) {
  return boxes.map((b) => ({
    x: ox + b.x * PX,
    y: oy + b.y * PX,
    w: b.w * PX,
    h: b.h * PX,
  }));
}

function dinoBoxes() {
  if (dino.ducking && dino.onGround) {
    return scaleBoxes(DUCK_BOXES, dino.x, GROUND_Y - DINO_DUCK_H);
  }
  return scaleBoxes(STAND_BOXES, dino.x, (dino.feetY ?? GROUND_Y) - DINO_STAND_H);
}

function obstacleBoxes(o) {
  if (o.type === "cactus") {
    const unitW = spriteWidth(o.sprite, PX);
    const out = [];
    for (let i = 0; i < o.count; i++) {
      out.push(...scaleBoxes(o.hitboxes, o.x + i * unitW, o.y));
    }
    return out;
  }
  return scaleBoxes(o.hitboxes, o.x, o.y);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// Update.
// ---------------------------------------------------------------------------

function update(dt) {
  if (state !== STATE.RUNNING) return;

  speed = Math.min(MAX_SPEED, speed + SPEED_RAMP * dt);
  score += dt * speed * 0.05;

  // Day/night cycle.
  const cycle = Math.floor(score / DAY_NIGHT_SCORE) % 2 === 1;
  if (cycle !== isNight) {
    isNight = cycle;
    document.body.classList.toggle("is-night", isNight);
  }
  const target = isNight ? 1 : 0;
  nightTransition += (target - nightTransition) * Math.min(1, dt * 3);

  // Milestone blink every 100 points.
  if (Math.floor(score / 100) > Math.floor((score - dt * speed * 0.05) / 100)) {
    flashTimer = 0.6;
  }
  if (flashTimer > 0) flashTimer -= dt;

  // Dino vertical physics.
  if (!dino.onGround) {
    dino.vy += GRAVITY * dt;
    dino.feetY = (dino.feetY ?? GROUND_Y) + dino.vy * dt;
    if (dino.feetY >= GROUND_Y) {
      dino.feetY = GROUND_Y;
      dino.vy = 0;
      dino.onGround = true;
    }
  } else {
    dino.feetY = GROUND_Y;
  }

  // Running leg animation.
  dino.legTimer += dt;
  if (dino.legTimer > 0.1) {
    dino.legTimer = 0;
    dino.legFrame ^= 1;
  }

  // Ground scroll.
  groundOffset = (groundOffset + speed * dt) % VIEW_W;

  // Obstacles.
  spawnTimer -= dt;
  if (spawnTimer <= 0) spawnObstacle();

  for (const o of obstacles) {
    o.x -= speed * dt;
    if (o.type === "bird") {
      o.flapTimer += dt;
      if (o.flapTimer > 0.18) {
        o.flapTimer = 0;
        o.flap ^= 1;
      }
    }
  }
  obstacles = obstacles.filter((o) => o.x + o.w > -10);

  // Clouds.
  if (clouds.length < 4 && Math.random() < dt * 0.6) spawnCloud();
  for (const c of clouds) c.x -= speed * 0.25 * dt;
  clouds = clouds.filter((c) => c.x + c.w > -10);

  // Collision: any dino box overlapping any obstacle box ends the run.
  if (!invincible) {
    const db = dinoBoxes();
    for (const o of obstacles) {
      const ob = obstacleBoxes(o);
      if (db.some((a) => ob.some((b) => overlaps(a, b)))) {
        gameOver();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

function pad(n) {
  return String(Math.floor(n)).padStart(5, "0");
}

const scoreEl = document.getElementById("score");
const hiScoreEl = document.getElementById("hiScore");

function render() {
  // Sky gradient.
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, col("skyTop"));
  sky.addColorStop(1, col("skyBottom"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sun (day) cross-fading into a crescent moon (night).
  const cx = VIEW_W - 110;
  const cy = 56;
  if (nightTransition < 0.95) {
    ctx.globalAlpha = 1 - nightTransition;
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    // soft halo
    ctx.globalAlpha = (1 - nightTransition) * 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (nightTransition > 0.05) {
    ctx.globalAlpha = nightTransition;
    ctx.fillStyle = "#eef0d8";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // carve the crescent using the top-of-sky color
    ctx.globalAlpha = 1;
    ctx.fillStyle = skyTopColor();
    ctx.beginPath();
    ctx.arc(cx + 8, cy - 6, 16, 0, Math.PI * 2);
    ctx.fill();
    // stars
    ctx.fillStyle = `rgba(255,255,255,${nightTransition * 0.85})`;
    for (const s of STARS) ctx.fillRect(s.x, s.y, 2, 2);
  }

  // Clouds.
  for (const c of clouds) {
    ctx.globalAlpha = 0.85;
    drawSprite(CLOUD, c.x, c.y, PX, col("cloud"));
    ctx.globalAlpha = 1;
  }

  // Ground: dirt band, baseline, and scrolling pebbles.
  ctx.fillStyle = col("dirt");
  ctx.fillRect(0, GROUND_Y + 4, VIEW_W, VIEW_H - (GROUND_Y + 4));
  ctx.fillStyle = col("dirtLine");
  ctx.fillRect(0, GROUND_Y + 2, VIEW_W, 2);
  ctx.fillStyle = col("pebble");
  for (const b of GROUND_BUMPS) {
    const x = (b.x - groundOffset + VIEW_W) % VIEW_W;
    ctx.fillRect(x, GROUND_Y + 8 + (b.x % 14), b.w, 2);
  }

  // Obstacles.
  const cactusColor = col("cactus");
  const birdColor = col("bird");
  for (const o of obstacles) {
    if (o.type === "cactus") {
      const unitW = spriteWidth(o.sprite, PX);
      for (let i = 0; i < o.count; i++) {
        drawSprite(o.sprite, o.x + i * unitW, o.y, PX, cactusColor);
      }
    } else {
      drawSprite(o.flap ? BIRD_DOWN : BIRD_UP, o.x, o.y, PX, birdColor);
    }
  }

  // Dino.
  drawDino(col("dino"));

  // Score (canvas copy is decorative; the HUD is the source of truth).
  scoreEl.textContent = pad(score);
  hiScoreEl.textContent = "HI " + pad(hiScore);
  scoreEl.style.opacity = flashTimer > 0 && Math.floor(flashTimer * 10) % 2 === 0 ? "0.2" : "1";
}

function drawDino(ink) {
  if (state !== STATE.IDLE && dino.ducking && dino.onGround) {
    const frame = dino.legFrame ? DINO_DUCK_B : DINO_DUCK_A;
    const top = GROUND_Y - DINO_DUCK_H;
    drawSprite(frame, dino.x, top, PX, ink);
    if (state === STATE.OVER) drawDeadEye(dino.x + 27 * PX, top + 2 * PX);
    return;
  }

  const feetY = dino.feetY ?? GROUND_Y;
  const bodyTop = feetY - DINO_STAND_H;
  drawSprite(DINO_BODY, dino.x, bodyTop, PX, ink);
  // Tiny forward arm.
  drawSprite(DINO_ARM, dino.x + 22 * PX, bodyTop + 15 * PX, PX, ink);

  let legs;
  if (state === STATE.RUNNING && dino.onGround) {
    legs = dino.legFrame ? DINO_LEGS_A : DINO_LEGS_B;
  } else {
    legs = DINO_LEGS_STAND;
  }
  const legTop = bodyTop + spriteHeight(DINO_BODY, PX);
  drawSprite(legs, dino.x, legTop, PX, ink);

  if (state === STATE.OVER) drawDeadEye(dino.x + 21 * PX, bodyTop + 3 * PX);
}

// Replace the open eye-gap with an "X" to read as defeated.
function drawDeadEye(ex, ey) {
  ctx.fillStyle = deadEyeColor();
  ctx.fillRect(ex - PX, ey - PX, PX, PX);
  ctx.fillRect(ex + PX, ey - PX, PX, PX);
  ctx.fillRect(ex, ey, PX, PX);
  ctx.fillRect(ex - PX, ey + PX, PX, PX);
  ctx.fillRect(ex + PX, ey + PX, PX, PX);
}

// Static decorative elements.
const GROUND_BUMPS = Array.from({ length: 26 }, () => ({
  x: Math.random() * VIEW_W,
  w: 2 + Math.floor(Math.random() * 6),
}));
const STARS = Array.from({ length: 18 }, () => ({
  x: Math.random() * (VIEW_W - 200),
  y: 15 + Math.random() * 90,
}));

// ---------------------------------------------------------------------------
// Main loop.
// ---------------------------------------------------------------------------

function frame(now) {
  const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// Init HUD and feet, then start the loop.
dino.feetY = GROUND_Y;
hiScoreEl.textContent = "HI " + pad(hiScore);
requestAnimationFrame(frame);

// Dev-only hooks used by shot.mjs for deterministic screenshots.
window.__setScore = (n) => {
  score = n;
};
window.__forceOver = () => {
  if (state === STATE.IDLE) startGame();
  gameOver();
};
window.__invincible = (v) => {
  invincible = v;
};
window.__clearObstacles = () => {
  obstacles = [];
};
