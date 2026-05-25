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

const DINO_STAND_H = spriteHeight([...DINO_BODY, ...DINO_LEGS_STAND], PX);
const DINO_STAND_W = spriteWidth(DINO_BODY, PX);
const DINO_DUCK_H = spriteHeight(DINO_DUCK_A, PX);
const DINO_DUCK_W = spriteWidth(DINO_DUCK_A, PX);

// ---------------------------------------------------------------------------
// Colors (blend between day and night).
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function blendChannel(day, night, t) {
  return Math.round(lerp(day, night, t));
}
function inkColor() {
  const t = nightTransition;
  const r = blendChannel(0x53, 0xe6, t);
  const g = blendChannel(0x53, 0xe6, t);
  const b = blendChannel(0x53, 0xe6, t);
  return `rgb(${r},${g},${b})`;
}
function skyColor() {
  const t = nightTransition;
  const r = blendChannel(0xf7, 0x1b, t);
  const g = blendChannel(0xf7, 0x1b, t);
  const b = blendChannel(0xf7, 0x1f, t);
  return `rgb(${r},${g},${b})`;
}

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
// Collision (AABB with a forgiving inset).
// ---------------------------------------------------------------------------

function dinoHitbox() {
  const inset = 6;
  if (dino.ducking && dino.onGround) {
    return {
      x: dino.x + inset,
      y: GROUND_Y - DINO_DUCK_H + inset,
      w: DINO_DUCK_W - inset * 2,
      h: DINO_DUCK_H - inset * 2,
    };
  }
  return {
    x: dino.x + inset,
    y: dino.feetY - DINO_STAND_H + inset,
    w: DINO_STAND_W - inset * 2,
    h: DINO_STAND_H - inset * 2,
  };
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

  // Collision.
  const hb = dinoHitbox();
  for (const o of obstacles) {
    const ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 };
    if (overlaps(hb, ob)) {
      gameOver();
      break;
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
  const ink = inkColor();

  // Sky.
  ctx.fillStyle = skyColor();
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Moon / sun.
  if (nightTransition > 0.05) {
    ctx.fillStyle = `rgba(230,230,230,${nightTransition})`;
    // crescent moon
    ctx.beginPath();
    ctx.arc(VIEW_W - 110, 56, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skyColor();
    ctx.beginPath();
    ctx.arc(VIEW_W - 102, 50, 16, 0, Math.PI * 2);
    ctx.fill();
    // stars
    ctx.fillStyle = `rgba(230,230,230,${nightTransition * 0.8})`;
    for (const s of STARS) ctx.fillRect(s.x, s.y, 2, 2);
  }

  // Clouds.
  for (const c of clouds) {
    ctx.globalAlpha = 0.7;
    drawSprite(CLOUD, c.x, c.y, PX, ink);
    ctx.globalAlpha = 1;
  }

  // Ground line + scrolling bumps.
  ctx.fillStyle = ink;
  ctx.fillRect(0, GROUND_Y + 2, VIEW_W, 2);
  for (const b of GROUND_BUMPS) {
    const x = (b.x - groundOffset + VIEW_W) % VIEW_W;
    ctx.fillRect(x, GROUND_Y + 4, b.w, 2);
  }

  // Obstacles.
  for (const o of obstacles) {
    if (o.type === "cactus") {
      const unitW = spriteWidth(o.sprite, PX);
      for (let i = 0; i < o.count; i++) {
        drawSprite(o.sprite, o.x + i * unitW, o.y, PX, ink);
      }
    } else {
      drawSprite(o.flap ? BIRD_DOWN : BIRD_UP, o.x, o.y, PX, ink);
    }
  }

  // Dino.
  drawDino(ink);

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
  ctx.fillStyle = inkColor();
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
