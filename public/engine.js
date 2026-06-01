// DinoQuest engine — the framework-free game core.
//
// Nothing in this module touches the DOM, `window`, `localStorage`, or any
// other browser global at import time. All side-effecting inputs (randomness,
// high-score persistence) are injected, and every drawing routine takes an
// explicit canvas context. That keeps the whole core unit-testable under Bun
// while the browser shell in game.js wires it up to a real canvas.
//
// Sprites are authored as character grids and drawn as scaled pixels, so the
// game still ships with zero binary image assets.

// ---------------------------------------------------------------------------
// Sprite grids.
//
// A space is a transparent pixel. Every other character is a filled pixel
// whose color comes from a per-sprite palette (see drawSprite): `#` is the
// base tone, `@` a highlight, `.` a shadow and `*` an accent. Characters that
// are not in the palette fall back to the base tone, so a plain `#`-only grid
// still renders with a single color.
// ---------------------------------------------------------------------------

export const grid = (s) => s.replace(/^\n/, "").replace(/\n$/, "").split("\n");

// Standing T-rex body (head + torso + tail). The eye is baked in as a gap.
// `@` lightens the spine/back; `.` shades the belly and tail underside.
export const DINO_BODY = grid(`
                @@@@@@@@@@
                @##########
                ###########
                ##### #####
                ###########
                ###########
                ######.####
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
 .#####################.
  .###################.
   .#################.
    .###############.
     .#############.
      ...........
`);

// Right-arm nub, drawn separately so it sits in front of the chest.
export const DINO_ARM = grid(`
###
  #
`);

export const DINO_LEGS_A = grid(`
      ###    ####
      ###    ###
      ###    ##
      ##     ##
     ###    ##
    ...
`);

export const DINO_LEGS_B = grid(`
      ###    ####
      ###    ###
       ##    ###
       ##    ##
       ##   ###
            ...
`);

export const DINO_LEGS_STAND = grid(`
      ###    ####
      ###    ###
      ###    ###
      ###    ###
      ###    ###
     ....   ....
`);

// Ducking dino: stretched low, head forward, tail back.
export const DINO_DUCK_A = grid(`
                      @@@@@@@@@@
                      ###########
#                     ###### #####
##                    ###########
####       ######################
########  #######################
##################################
###################  #####
.............
   ###  ###     ##  ##
   ...    .      .    .
`);

export const DINO_DUCK_B = grid(`
                      @@@@@@@@@@
                      ###########
#                     ###### #####
##                    ###########
####       ######################
########  #######################
##################################
###################  #####
.............
    ## ##        ###  ##
    .   .        .     .
`);

export const CACTUS_SMALL = grid(`
  @#
  @#
# @#
# @# .
@@##. #
  @#.##
  @###
  @#.
  @#
  @#
`);

export const CACTUS_LARGE = grid(`
   @#
   @#   #
#  @#   #
#  @# # #
#  @# # #
@@ @#.###
 @ ####.
   @##.
   @#.
   @#
   @#
   @#
   @#
`);

export const BIRD_UP = grid(`
   ##
   ###
   ####
   ######
@@@########       ##
 @############. ###
  @##############.
   .############.
    ..#######..
     ..  ..
`);

export const BIRD_DOWN = grid(`
   ##
   ###
   ####
   #####
   @#######.####
  @################
 @############. ###
@@@########       ##
   ....
   ..
`);

export const CLOUD = grid(`
   @@@@@@
  @@######
 @#########.
###########..
 .........
`);

// ---------------------------------------------------------------------------
// Sprite helpers.
// ---------------------------------------------------------------------------

export function spriteWidth(sprite, unit) {
  let max = 0;
  for (const row of sprite) max = Math.max(max, row.length);
  return max * unit;
}

export function spriteHeight(sprite, unit) {
  return sprite.length * unit;
}

// Draw a sprite as scaled pixels. `palette` is either a single CSS color
// string (every filled pixel uses it) or a map of grid-character -> color.
export function drawSprite(ctx, sprite, x, y, unit, palette) {
  const single = typeof palette === "string";
  const base = single ? palette : palette["#"];
  let current = null;
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === " ") continue;
      const color = single ? base : palette[ch] ?? base;
      if (color !== current) {
        ctx.fillStyle = color;
        current = color;
      }
      ctx.fillRect(Math.round(x + c * unit), Math.round(y + r * unit), unit, unit);
    }
  }
}

// Draw a sprite with a 1px offset darker "drop shadow" copy behind it, which
// gives every sprite a crisp outline and a touch of depth.
export function drawSpriteShadowed(ctx, sprite, x, y, unit, palette, shadow) {
  if (shadow) drawSprite(ctx, sprite, x + unit, y + unit, unit, shadow);
  drawSprite(ctx, sprite, x, y, unit, palette);
}

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

export const VIEW_W = 900;
export const VIEW_H = 260;
export const GROUND_Y = 210; // baseline the dino's feet rest on

export const PX = 3; // sprite pixel size
export const GRAVITY = 2400; // px/s^2
export const JUMP_VELOCITY = -760; // px/s
export const DUCK_FAST_FALL = 600; // px/s added when ducking mid-air
export const START_SPEED = 320; // px/s
export const MAX_SPEED = 900;
export const SPEED_RAMP = 14; // px/s added per second of play
export const DAY_NIGHT_SCORE = 700; // score interval for the day/night flip
export const BIRD_SCORE_GATE = 250; // birds only appear past this score
export const MAX_DT = 0.05; // clamp long frames (tab switches) to 50ms

export const STATE = { IDLE: "idle", RUNNING: "running", OVER: "over" };

// Derived dino dimensions.
export const DINO_STAND_H = spriteHeight([...DINO_BODY, ...DINO_LEGS_STAND], PX);
export const DINO_STAND_W = spriteWidth(DINO_BODY, PX);
export const DINO_DUCK_H = spriteHeight(DINO_DUCK_A, PX);
export const DINO_DUCK_W = spriteWidth(DINO_DUCK_A, PX);

// ---------------------------------------------------------------------------
// Math + color.
//
// Each palette entry is [dayHex, nightHex]; theme() blends between them by a
// `nightTransition` value in [0,1] so the whole scene cross-fades.
// ---------------------------------------------------------------------------

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function blendColor(dayHex, nightHex, t) {
  const a = hexToRgb(dayHex);
  const b = hexToRgb(nightHex);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(
    lerp(a[1], b[1], t)
  )},${Math.round(lerp(a[2], b[2], t))})`;
}

// Parse a `rgb(r,g,b)` string back into a numeric triple.
export function parseCss(css) {
  const m = String(css).match(/\d+/g) || [0, 0, 0];
  return [Number(m[0]) || 0, Number(m[1]) || 0, Number(m[2]) || 0];
}

// Shift a CSS color toward white (amount > 0) or black (amount < 0).
export function shadeCss(css, amount) {
  const [r, g, b] = parseCss(css);
  const t = Math.min(1, Math.abs(amount));
  const target = amount >= 0 ? 255 : 0;
  return `rgb(${Math.round(lerp(r, target, t))},${Math.round(
    lerp(g, target, t)
  )},${Math.round(lerp(b, target, t))})`;
}

// Build a shaded sprite palette (base/highlight/shadow/accent) from one tone.
export function spritePalette(base, accent) {
  return {
    "#": base,
    "@": shadeCss(base, 0.32),
    ".": shadeCss(base, -0.34),
    "*": accent ?? shadeCss(base, -0.6),
  };
}

export const PALETTE = {
  skyTop: ["#7ec8f0", "#0a1130"],
  skyBottom: ["#eaf7ff", "#1c2750"],
  mountainFar: ["#bcd9c4", "#13193a"],
  mountainNear: ["#9ec79b", "#1d2750"],
  dirt: ["#e3c08a", "#2b2742"],
  dirtLine: ["#9c6f3a", "#c9c4de"],
  pebble: ["#bf9a63", "#43406a"],
  grass: ["#7fae54", "#3c5a55"],
  dino: ["#4f9e3f", "#83d96e"],
  cactus: ["#2f8f55", "#57b87e"],
  bird: ["#9b59b6", "#cf9bea"],
  cloud: ["#ffffff", "#9fa9d4"],
};

// Resolve every palette entry at a given night-transition value.
export function theme(t) {
  const c = (k) => blendColor(PALETTE[k][0], PALETTE[k][1], t);
  return {
    t,
    skyTop: c("skyTop"),
    skyBottom: c("skyBottom"),
    mountainFar: c("mountainFar"),
    mountainNear: c("mountainNear"),
    dirt: c("dirt"),
    dirtLine: c("dirtLine"),
    pebble: c("pebble"),
    grass: c("grass"),
    dino: c("dino"),
    cactus: c("cactus"),
    bird: c("bird"),
    cloud: c("cloud"),
  };
}

// Contrasting color for the game-over "X" eye (dark by day, light by night).
export function deadEyeColor(t) {
  return blendColor("#3a2a1a", "#f0f0f0", t);
}

// ---------------------------------------------------------------------------
// Collision.
//
// Each sprite gets a small set of collision boxes (in grid units, relative to
// the sprite's draw origin) that hug its filled pixels instead of one loose
// box around the whole grid. Obstacle boxes are tight (deaths feel fair); the
// dino's are slightly inset (a near miss reads as a miss).
// ---------------------------------------------------------------------------

export const STAND_BOXES = [
  { x: 16, y: 1, w: 11, h: 10 },
  { x: 1, y: 11, w: 23, h: 17 },
];
export const DUCK_BOXES = [
  { x: 0, y: 4, w: 33, h: 4 },
  { x: 22, y: 0, w: 12, h: 4 },
];
export const CACTUS_SMALL_BOXES = [
  { x: 2, y: 0, w: 2, h: 10 },
  { x: 0, y: 2, w: 7, h: 4 },
];
export const CACTUS_LARGE_BOXES = [
  { x: 3, y: 0, w: 2, h: 13 },
  { x: 0, y: 1, w: 9, h: 6 },
];
export const BIRD_BOXES = [{ x: 0, y: 3, w: 18, h: 6 }];

// Convert grid-unit boxes to world-pixel AABBs at an origin.
export function scaleBoxes(boxes, ox, oy) {
  return boxes.map((b) => ({
    x: ox + b.x * PX,
    y: oy + b.y * PX,
    w: b.w * PX,
    h: b.h * PX,
  }));
}

// Axis-aligned bounding-box overlap test.
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------------------
// Spawning helpers (pure).
// ---------------------------------------------------------------------------

export function randRange(min, max, rng = Math.random) {
  return min + rng() * (max - min);
}

// Gap before the next obstacle: shrinks as speed rises, plus jitter.
export function nextSpawnDelay(speed, rng = Math.random) {
  const base = lerp(1.4, 0.7, (speed - START_SPEED) / (MAX_SPEED - START_SPEED));
  return randRange(base, base + 0.8, rng);
}

// Score is fractional while playing; pad to a fixed-width HUD string.
export function pad(n) {
  return String(Math.floor(n)).padStart(5, "0");
}

// ---------------------------------------------------------------------------
// Game core.
// ---------------------------------------------------------------------------

export class DinoGame {
  constructor({ rng = Math.random, storage = null } = {}) {
    this.rng = rng;
    this.storage = storage; // a {getItem, setItem}-like object, or null
    this.hiScore = this._loadHiScore();
    this.reset(STATE.IDLE);
  }

  _loadHiScore() {
    try {
      return Number(this.storage?.getItem?.("dinoquest:hi") || 0) || 0;
    } catch {
      return 0;
    }
  }

  _saveHiScore() {
    try {
      this.storage?.setItem?.("dinoquest:hi", String(this.hiScore));
    } catch {
      /* storage unavailable — high score is in-memory only */
    }
  }

  // Reset all per-run state. `state` lets callers land in IDLE (title screen)
  // or RUNNING (immediate retry).
  reset(state = STATE.RUNNING) {
    this.state = state;
    this.speed = START_SPEED;
    this.score = 0;
    this.obstacles = [];
    this.clouds = [];
    this.groundOffset = 0;
    this.spawnTimer = state === STATE.IDLE ? 0 : 0.6;
    this.isNight = false;
    this.nightTransition = 0;
    this.flashTimer = 0;
    this.invincible = false;
    this.dino = {
      x: 60,
      vy: 0,
      onGround: true,
      ducking: false,
      feetY: GROUND_Y,
      legTimer: 0,
      legFrame: 0,
    };
    this._initDecor();
    return this;
  }

  // Static decorative scatter, seeded from the injected rng for deterministic
  // tests. Purely cosmetic (ground bumps + night stars).
  _initDecor() {
    this.bumps = Array.from({ length: 26 }, () => ({
      x: this.rng() * VIEW_W,
      w: 2 + Math.floor(this.rng() * 6),
      o: Math.floor(this.rng() * 14),
    }));
    this.stars = Array.from({ length: 22 }, () => ({
      x: this.rng() * (VIEW_W - 200),
      y: 12 + this.rng() * 96,
      p: this.rng() * Math.PI * 2,
    }));
  }

  // Begin a run from the title screen.
  start() {
    if (this.state === STATE.IDLE) {
      this.state = STATE.RUNNING;
      if (this.spawnTimer <= 0) this.spawnTimer = 0.6;
    }
    return this;
  }

  // Primary action: start, retry, or jump depending on state. Returns a short
  // tag describing what happened (handy for tests and input wiring).
  jump() {
    if (this.state === STATE.IDLE) {
      this.start();
      return "start";
    }
    if (this.state === STATE.OVER) {
      this.reset(STATE.RUNNING);
      return "restart";
    }
    if (this.dino.onGround) {
      this.dino.vy = JUMP_VELOCITY;
      this.dino.onGround = false;
      this.dino.ducking = false;
      return "jump";
    }
    return "none";
  }

  setDuck(active) {
    if (this.state !== STATE.RUNNING) return;
    this.dino.ducking = active;
    if (active && !this.dino.onGround) this.dino.vy += DUCK_FAST_FALL;
  }

  gameOver() {
    this.state = STATE.OVER;
    if (this.score > this.hiScore) {
      this.hiScore = Math.floor(this.score);
      this._saveHiScore();
    }
    return this;
  }

  spawnObstacle() {
    const roll = this.rng();
    let obstacle;
    if (roll < 0.18 && this.score > BIRD_SCORE_GATE) {
      const heights = [GROUND_Y - 30, GROUND_Y - 60, GROUND_Y - 95];
      const y = heights[Math.floor(this.rng() * heights.length)];
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
      const large = this.rng() < 0.4;
      const sprite = large ? CACTUS_LARGE : CACTUS_SMALL;
      const count = large
        ? this.rng() < 0.3
          ? 2
          : 1
        : Math.floor(randRange(1, 4, this.rng));
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
    this.obstacles.push(obstacle);
    this.spawnTimer = nextSpawnDelay(this.speed, this.rng);
    return obstacle;
  }

  spawnCloud() {
    const cloud = {
      x: VIEW_W + 20,
      y: randRange(20, 90, this.rng),
      w: spriteWidth(CLOUD, PX),
    };
    this.clouds.push(cloud);
    return cloud;
  }

  // Collision boxes for the dino in its current pose.
  dinoBoxes() {
    const d = this.dino;
    if (d.ducking && d.onGround) {
      return scaleBoxes(DUCK_BOXES, d.x, GROUND_Y - DINO_DUCK_H);
    }
    return scaleBoxes(STAND_BOXES, d.x, (d.feetY ?? GROUND_Y) - DINO_STAND_H);
  }

  // Collision boxes for a single obstacle (cacti expand per clustered unit).
  obstacleBoxes(o) {
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

  hitsObstacle() {
    const db = this.dinoBoxes();
    for (const o of this.obstacles) {
      const ob = this.obstacleBoxes(o);
      if (db.some((a) => ob.some((b) => overlaps(a, b)))) return true;
    }
    return false;
  }

  // Advance the simulation by `dt` seconds. No-op unless running.
  update(dt) {
    if (this.state !== STATE.RUNNING) return;
    const d = this.dino;

    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt);
    const gained = dt * this.speed * 0.05;
    const prevScore = this.score;
    this.score += gained;

    // Day/night cycle.
    this.isNight = Math.floor(this.score / DAY_NIGHT_SCORE) % 2 === 1;
    const target = this.isNight ? 1 : 0;
    this.nightTransition += (target - this.nightTransition) * Math.min(1, dt * 3);

    // Milestone blink every 100 points.
    if (Math.floor(this.score / 100) > Math.floor(prevScore / 100)) {
      this.flashTimer = 0.6;
    }
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // Vertical physics.
    if (!d.onGround) {
      d.vy += GRAVITY * dt;
      d.feetY = (d.feetY ?? GROUND_Y) + d.vy * dt;
      if (d.feetY >= GROUND_Y) {
        d.feetY = GROUND_Y;
        d.vy = 0;
        d.onGround = true;
      }
    } else {
      d.feetY = GROUND_Y;
    }

    // Running leg animation.
    d.legTimer += dt;
    if (d.legTimer > 0.1) {
      d.legTimer = 0;
      d.legFrame ^= 1;
    }

    // Ground scroll.
    this.groundOffset = (this.groundOffset + this.speed * dt) % VIEW_W;

    // Obstacles.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnObstacle();
    for (const o of this.obstacles) {
      o.x -= this.speed * dt;
      if (o.type === "bird") {
        o.flapTimer += dt;
        if (o.flapTimer > 0.18) {
          o.flapTimer = 0;
          o.flap ^= 1;
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -10);

    // Clouds.
    if (this.clouds.length < 4 && this.rng() < dt * 0.6) this.spawnCloud();
    for (const c of this.clouds) c.x -= this.speed * 0.25 * dt;
    this.clouds = this.clouds.filter((c) => c.x + c.w > -10);

    // Collision.
    if (!this.invincible && this.hitsObstacle()) this.gameOver();
  }
}

// ---------------------------------------------------------------------------
// Rendering. Pure functions over a canvas context + game state; no DOM.
// ---------------------------------------------------------------------------

function drawSky(ctx, th) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, th.skyTop);
  sky.addColorStop(1, th.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawCelestial(ctx, game, th) {
  const t = th.t;
  const cx = VIEW_W - 110;
  const cy = 56;

  if (t < 0.95) {
    // Sun with a soft halo.
    const halo = ctx.createRadialGradient(cx, cy, 6, cx, cy, 46);
    halo.addColorStop(0, "rgba(255,210,74,0.55)");
    halo.addColorStop(1, "rgba(255,210,74,0)");
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (t > 0.05) {
    // Stars (twinkle via the decorative phase + ground scroll).
    for (const s of game.stars) {
      const tw = 0.5 + 0.5 * Math.sin(s.p + game.groundOffset * 0.02);
      ctx.fillStyle = `rgba(255,255,255,${(t * (0.35 + 0.55 * tw)).toFixed(3)})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    // Crescent moon (carve the disc with the sky color).
    ctx.globalAlpha = t;
    ctx.fillStyle = "#eef0d8";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = th.skyTop;
    ctx.beginPath();
    ctx.arc(cx + 8, cy - 6, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRidge(ctx, color, top, wave, phase) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= VIEW_W; x += 6) {
    const y =
      top + Math.sin((x + phase) / wave) * 12 + Math.sin((x + phase) / (wave * 0.37)) * 6;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_W, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function drawMountains(ctx, game, th) {
  drawRidge(ctx, th.mountainFar, GROUND_Y - 58, 130, game.groundOffset * 0.15);
  drawRidge(ctx, th.mountainNear, GROUND_Y - 34, 84, game.groundOffset * 0.32);
}

function drawClouds(ctx, game, th) {
  const pal = { "#": th.cloud, "@": shadeCss(th.cloud, 0.12), ".": shadeCss(th.cloud, -0.18) };
  ctx.globalAlpha = 0.9;
  for (const c of game.clouds) drawSprite(ctx, CLOUD, c.x, c.y, PX, pal);
  ctx.globalAlpha = 1;
}

function drawGround(ctx, game, th) {
  // Dirt band with a subtle vertical gradient.
  const dirt = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  dirt.addColorStop(0, th.dirt);
  dirt.addColorStop(1, shadeCss(th.dirt, -0.18));
  ctx.fillStyle = dirt;
  ctx.fillRect(0, GROUND_Y + 4, VIEW_W, VIEW_H - (GROUND_Y + 4));

  // Crisp baseline.
  ctx.fillStyle = th.dirtLine;
  ctx.fillRect(0, GROUND_Y + 2, VIEW_W, 2);

  // Scrolling pebbles + tiny grass tufts for texture.
  for (const b of game.bumps) {
    const x = (b.x - game.groundOffset + VIEW_W) % VIEW_W;
    ctx.fillStyle = th.pebble;
    ctx.fillRect(x, GROUND_Y + 8 + b.o, b.w, 2);
    if (b.o % 3 === 0) {
      ctx.fillStyle = th.grass;
      ctx.fillRect(x + 1, GROUND_Y + 5, 1, 3);
      ctx.fillRect(x + 3, GROUND_Y + 4, 1, 4);
    }
  }
}

// Soft contact shadow under a grounded sprite.
function drawContactShadow(ctx, cx, w) {
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(Math.round(cx - w / 2), GROUND_Y + 3, Math.round(w), 3);
}

function drawObstacle(ctx, o, th) {
  if (o.type === "cactus") {
    const unitW = spriteWidth(o.sprite, PX);
    const pal = spritePalette(th.cactus);
    const shadow = shadeCss(th.cactus, -0.55);
    drawContactShadow(ctx, o.x + o.w / 2, o.w + 6);
    for (let i = 0; i < o.count; i++) {
      drawSpriteShadowed(ctx, o.sprite, o.x + i * unitW, o.y, PX, pal, shadow);
    }
  } else {
    const pal = spritePalette(th.bird);
    drawSpriteShadowed(ctx, o.flap ? BIRD_DOWN : BIRD_UP, o.x, o.y, PX, pal, shadeCss(th.bird, -0.5));
  }
}

// Replace the open eye-gap with an "X" to read as defeated.
function drawDeadEye(ctx, ex, ey, t) {
  ctx.fillStyle = deadEyeColor(t);
  ctx.fillRect(ex - PX, ey - PX, PX, PX);
  ctx.fillRect(ex + PX, ey - PX, PX, PX);
  ctx.fillRect(ex, ey, PX, PX);
  ctx.fillRect(ex - PX, ey + PX, PX, PX);
  ctx.fillRect(ex + PX, ey + PX, PX, PX);
}

// A bright eye with a pupil and glint for the living dino.
function drawLiveEye(ctx, ex, ey) {
  ctx.fillStyle = "#fdfdfd";
  ctx.fillRect(ex - PX, ey - PX, PX, PX);
  ctx.fillRect(ex, ey - PX, PX, PX);
  ctx.fillStyle = "#16210f";
  ctx.fillRect(ex, ey, PX, PX);
}

export function drawDino(ctx, game, th) {
  const d = game.dino;
  const ink = spritePalette(th.dino, "#16210f");
  const shadow = shadeCss(th.dino, -0.55);

  if (game.state !== STATE.IDLE && d.ducking && d.onGround) {
    const frame = d.legFrame ? DINO_DUCK_B : DINO_DUCK_A;
    const top = GROUND_Y - DINO_DUCK_H;
    drawContactShadow(ctx, d.x + DINO_DUCK_W / 2, DINO_DUCK_W);
    drawSpriteShadowed(ctx, frame, d.x, top, PX, ink, shadow);
    if (game.state === STATE.OVER) drawDeadEye(ctx, d.x + 27 * PX, top + 2 * PX, th.t);
    return;
  }

  const feetY = d.feetY ?? GROUND_Y;
  const bodyTop = feetY - DINO_STAND_H;
  if (d.onGround) drawContactShadow(ctx, d.x + DINO_STAND_W / 2, DINO_STAND_W);

  drawSpriteShadowed(ctx, DINO_BODY, d.x, bodyTop, PX, ink, shadow);
  drawSprite(ctx, DINO_ARM, d.x + 22 * PX, bodyTop + 15 * PX, PX, ink);

  let legs;
  if (game.state === STATE.RUNNING && d.onGround) {
    legs = d.legFrame ? DINO_LEGS_A : DINO_LEGS_B;
  } else {
    legs = DINO_LEGS_STAND;
  }
  drawSprite(ctx, legs, d.x, bodyTop + spriteHeight(DINO_BODY, PX), PX, ink);

  if (game.state === STATE.OVER) {
    drawDeadEye(ctx, d.x + 21 * PX, bodyTop + 3 * PX, th.t);
  } else {
    drawLiveEye(ctx, d.x + 21 * PX, bodyTop + 3 * PX);
  }
}

// Subtle vignette to frame the scene.
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_H * 0.5,
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_W * 0.75
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Render the whole scene for the current frame.
export function drawScene(ctx, game) {
  const th = theme(game.nightTransition);
  drawSky(ctx, th);
  drawCelestial(ctx, game, th);
  drawMountains(ctx, game, th);
  drawClouds(ctx, game, th);
  drawGround(ctx, game, th);
  for (const o of game.obstacles) drawObstacle(ctx, o, th);
  drawDino(ctx, game, th);
  drawVignette(ctx);
}
