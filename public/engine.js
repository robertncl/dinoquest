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

// Round-topped tree dotted along the Verdant Valley hills (`*` is the trunk).
export const TREE = grid(`
  @@#
 @@###
@@####.
@#####.
 ####.
  .*.
   *
   *
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
export const SPEED_RAMP = 10.5; // px/s added per second of play
export const DAY_NIGHT_SCORE = 700; // score interval for the day/night flip
export const BIRD_SCORE_GATE = 250; // birds only appear past this score
export const MAX_DT = 0.05; // clamp long frames (tab switches) to 50ms
export const LEVEL_FADE = 1.4; // seconds to cross-fade one level's scenery into the next

export const STATE = { IDLE: "idle", RUNNING: "running", OVER: "over" };

// ---------------------------------------------------------------------------
// Levels.
//
// A run is divided into five score-gated levels. Crossing a threshold snaps the
// pace up to that level's floor, tightens the gap between obstacles (`gapMult`)
// and sends more birds (`birdChance`) — so difficulty steps up at each gate on
// top of the smooth within-level speed ramp. Level 0's `speed` equals
// START_SPEED so the opening level matches the classic feel.
// ---------------------------------------------------------------------------

export const LEVELS = [
  { name: "Verdant Valley", scoreStart: 0, speed: 320, gapMult: 1.0, birdChance: 0.18 },
  { name: "Cactus Flats", scoreStart: 300, speed: 402.5, gapMult: 0.925, birdChance: 0.21 },
  { name: "Dusty Canyon", scoreStart: 700, speed: 500, gapMult: 0.865, birdChance: 0.2475 },
  { name: "Windswept Ridge", scoreStart: 1200, speed: 605, gapMult: 0.805, birdChance: 0.2925 },
  { name: "Volcano Rim", scoreStart: 1900, speed: 710, gapMult: 0.745, birdChance: 0.345 },
];

// Index (0-based) of the level a given score falls into.
export function levelForScore(score) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) {
    if (score >= LEVELS[k].scoreStart) i = k;
  }
  return i;
}

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

// `rgba(...)` version of any CSS color parseCss understands.
export function withAlpha(css, a) {
  const [r, g, b] = parseCss(css);
  return `rgba(${r},${g},${b},${a})`;
}

// Stateless integer hash -> [0,1). Procedural textures and particles index
// into it by world position, so they scroll seamlessly without stored state
// and without consuming the game's injected rng.
export function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// The dino keeps the same colors in every level.
export const DINO_COLORS = ["#4f9e3f", "#83d96e"];

// ---------------------------------------------------------------------------
// Level themes.
//
// Every level has its own look: a palette (each entry is [dayHex, nightHex])
// plus named styles for the backdrop silhouettes, the ground texture and the
// ambient particles in the air. Note that the day/night cycle means Dusty
// Canyon (700–1199) is only ever seen at night, so its night palette matters
// most.
// ---------------------------------------------------------------------------

export const LEVEL_THEMES = [
  {
    // Verdant Valley: rolling green hills, wooded ridges, a flowery meadow.
    backdrop: "hills",
    ground: "meadow",
    air: "pollen",
    palette: {
      skyTop: ["#7ec8f0", "#0a1130"],
      skyBottom: ["#eaf7ff", "#1c2750"],
      glow: ["#fff4c4", "#3a4f8a"],
      sun: ["#ffd24a", "#ffd24a"],
      mountainFar: ["#a8d4b4", "#14204a"],
      mountainNear: ["#76b86f", "#1c3350"],
      dirt: ["#9b6a3e", "#2e2a44"],
      dirtDeep: ["#6b4325", "#1a1830"],
      dirtLine: ["#5c9e3a", "#3f6a5a"],
      pebble: ["#7c5230", "#45406a"],
      grass: ["#7fc24f", "#4a7a62"],
      cactus: ["#2f8f55", "#57b87e"],
      bird: ["#9b59b6", "#cf9bea"],
      cloud: ["#ffffff", "#9fa9d4"],
      accent: ["#ff6f91", "#7a6aa8"], // meadow flowers
      accent2: ["#ffd84a", "#d8ff7a"], // pollen by day, fireflies by night
    },
  },
  {
    // Cactus Flats: high-noon desert, distant mesas, rippled golden sand.
    backdrop: "mesas",
    ground: "sand",
    air: "sand",
    palette: {
      skyTop: ["#3f9ee0", "#121a44"],
      skyBottom: ["#ffeec4", "#4a3a66"],
      glow: ["#ffd27a", "#8a5a8a"],
      sun: ["#fff6c8", "#fff6c8"],
      mountainFar: ["#e3ad80", "#3a2c5a"],
      mountainNear: ["#f2cf86", "#4a3a62"],
      dirt: ["#f3d394", "#4a3d5e"],
      dirtDeep: ["#d9a660", "#2c2440"],
      dirtLine: ["#c9893e", "#d8c08a"],
      pebble: ["#c99a58", "#6a5a80"],
      grass: ["#a3a84a", "#6a7458"],
      cactus: ["#3a9a4c", "#6cc07a"],
      bird: ["#d0603a", "#f0a07a"],
      cloud: ["#fffaf0", "#a89cc8"],
      accent: ["#fff1c8", "#6a5a86"], // ripple highlights + blown sand
      accent2: ["#ff7aa8", "#ff9ac8"], // desert blooms
    },
  },
  {
    // Dusty Canyon: red-rock buttes and striped strata under a magenta dusk.
    backdrop: "canyon",
    ground: "strata",
    air: "dust",
    palette: {
      skyTop: ["#e7745a", "#2a0f3a"],
      skyBottom: ["#ffd09a", "#8a3058"],
      glow: ["#ffb070", "#ff7a6a"],
      sun: ["#ff9a4a", "#ff9a4a"],
      mountainFar: ["#c86c4c", "#5a2448"],
      mountainNear: ["#a2452e", "#3e1838"],
      dirt: ["#c47448", "#4a2034"],
      dirtDeep: ["#8a4026", "#2a1020"],
      dirtLine: ["#7a3420", "#e89070"],
      pebble: ["#a45634", "#6a2e48"],
      grass: ["#bfa451", "#8a6a50"],
      cactus: ["#6f9a4a", "#8fc070"],
      bird: ["#4a5aa8", "#a8b0f0"],
      cloud: ["#ffe0c8", "#b06890"],
      accent: ["#e8a06a", "#9a4060"], // light strata
      accent2: ["#8e4228", "#36142a"], // dark strata
    },
  },
  {
    // Windswept Ridge: snow-capped alpine peaks, frosty shale, gusting wind.
    backdrop: "peaks",
    ground: "shale",
    air: "wind",
    palette: {
      skyTop: ["#4a78d8", "#06102e"],
      skyBottom: ["#d8ecfa", "#2a4a7a"],
      glow: ["#ffffff", "#6a9ad0"],
      sun: ["#fffbe8", "#fffbe8"],
      mountainFar: ["#9fb2d8", "#1e2c58"],
      mountainNear: ["#64789c", "#2a3a62"],
      dirt: ["#8c95aa", "#2e3654"],
      dirtDeep: ["#5a6278", "#1a2038"],
      dirtLine: ["#eef4fc", "#b8c8e8"],
      pebble: ["#68728a", "#4a5478"],
      grass: ["#7aa494", "#4a7078"],
      cactus: ["#3a8a7c", "#6ac4b4"],
      bird: ["#2c4c86", "#a0bcf4"],
      cloud: ["#ffffff", "#8a9ccc"],
      accent: ["#f6faff", "#c8d6f0"], // snow + frost
      accent2: ["#ffffff", "#b0c4ec"], // wind streaks
    },
  },
  {
    // Volcano Rim: a smoking volcano, basalt shot through with lava, embers.
    backdrop: "volcano",
    ground: "basalt",
    air: "embers",
    palette: {
      skyTop: ["#4a2040", "#0c0414"],
      skyBottom: ["#ff9a5a", "#7a1e24"],
      glow: ["#ff6a3a", "#ff4a2a"],
      sun: ["#ff6a4a", "#ff6a4a"],
      mountainFar: ["#6a3040", "#2a0c1c"],
      mountainNear: ["#36202a", "#180a12"],
      dirt: ["#3e2c30", "#22141a"],
      dirtDeep: ["#201418", "#0e0608"],
      dirtLine: ["#ff7a2a", "#ff5a1a"],
      pebble: ["#5e4448", "#3e2a30"],
      grass: ["#7a6464", "#5a4448"],
      cactus: ["#5f8a4a", "#7ab468"],
      bird: ["#f0a03a", "#ffc85a"],
      cloud: ["#6e5a64", "#3e2e3a"],
      accent: ["#ff6a1a", "#ff7a2a"], // lava
      accent2: ["#ffd04a", "#ffe27a"], // embers
    },
  },
];

const THEME_KEYS = Object.keys(LEVEL_THEMES[0].palette);
const LEVEL_RGB = LEVEL_THEMES.map(({ palette }) =>
  Object.fromEntries(THEME_KEYS.map((k) => [k, palette[k].map(hexToRgb)]))
);

// Resolve the palette at a night-transition `t` in [0,1] and a (possibly
// fractional) level `lv`: 1.5 is halfway between level 1 and level 2's
// colors, so level changes cross-fade just like day and night do.
export function theme(t, lv = 0) {
  const last = LEVEL_THEMES.length - 1;
  const a = clamp(Math.floor(lv), 0, last);
  const b = Math.min(a + 1, last);
  const f = clamp(lv - a, 0, 1);
  const out = { t, lv, dino: blendColor(DINO_COLORS[0], DINO_COLORS[1], t) };
  for (const k of THEME_KEYS) {
    const [ad, an] = LEVEL_RGB[a][k];
    const [bd, bn] = LEVEL_RGB[b][k];
    const ch = (i) => Math.round(lerp(lerp(ad[i], bd[i], f), lerp(an[i], bn[i], f), t));
    out[k] = `rgb(${ch(0)},${ch(1)},${ch(2)})`;
  }
  return out;
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
    this.level = 0;
    this.levelVisual = 0; // eases toward `level`; drives the scenery cross-fade
    this.levelFlash = 0; // seconds remaining on the "Level N" banner
    this.clock = 0; // seconds of play, for ambient animation
    this.distance = 0; // unwrapped scroll distance, for parallax + textures
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
    if (roll < LEVELS[this.level].birdChance && this.score > BIRD_SCORE_GATE) {
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
    this.spawnTimer = nextSpawnDelay(this.speed, this.rng) * LEVELS[this.level].gapMult;
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
    this.clock += dt;
    this.distance += this.speed * dt;

    // Day/night cycle.
    this.isNight = Math.floor(this.score / DAY_NIGHT_SCORE) % 2 === 1;
    const target = this.isNight ? 1 : 0;
    this.nightTransition += (target - this.nightTransition) * Math.min(1, dt * 3);

    // Milestone blink every 100 points.
    if (Math.floor(this.score / 100) > Math.floor(prevScore / 100)) {
      this.flashTimer = 0.6;
    }
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // Level progression: stepping into a higher level snaps the pace up to that
    // level's floor and raises the "Level N" announcement banner.
    const lvl = levelForScore(this.score);
    if (lvl > this.level) {
      this.level = lvl;
      // Only ever fade across one boundary, even if the score skipped several.
      this.levelVisual = Math.max(this.levelVisual, lvl - 1);
      this.speed = Math.max(this.speed, LEVELS[lvl].speed);
      this.levelFlash = 2.2;
    }
    if (this.levelFlash > 0) this.levelFlash -= dt;
    this.levelVisual = Math.min(this.level, this.levelVisual + dt / LEVEL_FADE);

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

// Euclidean modulo (always lands in [0, m) even for negative v).
const wrap = (v, m) => ((v % m) + m) % m;
const smoothstep = (f) => f * f * (3 - 2 * f);

function drawSky(ctx, th) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, th.skyTop);
  sky.addColorStop(1, th.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Stepped horizon glow: hard-edged bands instead of a smooth gradient read
  // as retro pixel-art banding and give the sky some texture.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = withAlpha(th.glow, (0.03 + i * 0.034).toFixed(3));
    ctx.fillRect(0, 66 + i * 15, VIEW_W, 15);
  }
}

function drawCelestial(ctx, game, th) {
  const t = th.t;
  const cx = VIEW_W - 110;
  const cy = 56;

  if (t < 0.95) {
    // Sun with a soft halo, tinted per level.
    const halo = ctx.createRadialGradient(cx, cy, 6, cx, cy, 46);
    halo.addColorStop(0, withAlpha(th.sun, 0.55));
    halo.addColorStop(1, withAlpha(th.sun, 0));
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.sun;
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

// ---------------------------------------------------------------------------
// Terrain helpers. A silhouette is a list of per-column top edges, snapped to
// the sprite pixel grid so backdrops match the chunky look of the sprites.
// ---------------------------------------------------------------------------

function terrainTops(heightAt, scroll) {
  const tops = [];
  for (let sx = 0; sx <= VIEW_W; sx += PX) {
    tops.push(Math.round(heightAt(sx + scroll) / PX) * PX);
  }
  return tops;
}

// Fill a silhouette. The path is left current so callers can clip() to it.
function fillTerrain(ctx, tops, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 4);
  for (let i = 0; i < tops.length; i++) {
    ctx.lineTo(i * PX, tops[i]);
    ctx.lineTo((i + 1) * PX, tops[i]);
  }
  ctx.lineTo(VIEW_W, GROUND_Y + 4);
  ctx.closePath();
  ctx.fill();
}

// One-pixel highlight along the top edge.
function rimTerrain(ctx, tops, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < tops.length; i++) ctx.fillRect(i * PX, tops[i], PX, PX);
}

// Darken columns that slope down to the right: a cheap faceted, sun-from-the-
// left shading that makes ridges and peaks read as 3D.
function shadeFacets(ctx, tops, color, depth = GROUND_Y) {
  ctx.fillStyle = color;
  // Compare across a few columns so flat pixel steps on a slope stay shaded.
  for (let i = 1; i < tops.length - 2; i++) {
    if (tops[i + 2] > tops[i - 1]) ctx.fillRect(i * PX, tops[i], PX, depth);
  }
}

// Horizontal strata clipped to the current path, gently waving with scroll.
function drawStrata(ctx, scroll, from, step, colors, alpha) {
  ctx.save();
  ctx.clip();
  ctx.globalAlpha *= alpha;
  for (let y = from, k = 0; y < GROUND_Y + 4; y += step, k++) {
    ctx.fillStyle = colors[k % colors.length];
    for (let sx = 0; sx < VIEW_W; sx += 18) {
      const wy = Math.round(Math.sin((sx + scroll) / 70 + k) * 1.5);
      ctx.fillRect(sx, y + wy, 18, 3);
    }
  }
  ctx.restore();
}

// Visit every hashed "slot" of width `spacing` that overlaps the screen at a
// given scroll, passing (index, screenX of the slot start).
function eachSlot(scroll, spacing, fn, pad = 1) {
  const first = Math.floor(scroll / spacing) - pad;
  const last = Math.floor((scroll + VIEW_W) / spacing) + pad;
  for (let i = first; i <= last; i++) fn(i, i * spacing - scroll);
}

// ---------------------------------------------------------------------------
// Backdrops (one per level). Each draws a far and a near layer with parallax.
// ---------------------------------------------------------------------------

const BACKDROPS = {
  hills(ctx, game, th) {
    const farScroll = game.distance * 0.15;
    const far = terrainTops(
      (x) => GROUND_Y - 58 + Math.sin(x / 130) * 12 + Math.sin(x / 48) * 6,
      farScroll
    );
    fillTerrain(ctx, far, th.mountainFar);
    rimTerrain(ctx, far, shadeCss(th.mountainFar, 0.2));

    const nearScroll = game.distance * 0.32;
    const nearAt = (x) => GROUND_Y - 34 + Math.sin(x / 84) * 12 + Math.sin(x / 31) * 6;
    const near = terrainTops(nearAt, nearScroll);
    fillTerrain(ctx, near, th.mountainNear);
    // Ploughed-field rows across the near hills.
    drawStrata(ctx, nearScroll, GROUND_Y - 40, 7, [shadeCss(th.mountainNear, 0.1)], 0.45);
    rimTerrain(ctx, near, shadeCss(th.mountainNear, 0.22));

    // Copses of round trees standing on the near ridge.
    const pal = spritePalette(shadeCss(th.mountainNear, -0.2), shadeCss(th.dirt, -0.2));
    eachSlot(nearScroll, 38, (i, sx) => {
      if (hash01(i) < 0.5) return;
      const x = sx + hash01(i + 911) * 24;
      const base = Math.round(nearAt(x + nearScroll) / PX) * PX;
      drawSprite(ctx, TREE, x - 7, base - TREE.length * 2 + 4, 2, pal);
    });
  },

  mesas(ctx, game, th) {
    // Distant flat-topped mesas rising from the desert plain.
    const farScroll = game.distance * 0.12;
    const mesaAt = (x) => {
      let top = GROUND_Y - 16 + Math.sin(x / 90) * 2;
      const i0 = Math.floor(x / 240);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        if (hash01(i * 3 + 1) < 0.2) continue;
        const c = i * 240 + 120 + (hash01(i * 3 + 2) - 0.5) * 80;
        const half = 34 + hash01(i * 3 + 3) * 50;
        const h = 36 + hash01(i * 7 + 5) * 36;
        const d = Math.abs(x - c) - half;
        // Stepped cliffs: drop 8px per 4px of run beyond the cap rock.
        const y = GROUND_Y - h + (d > 0 ? Math.ceil(d / 4) * 8 : 0);
        top = Math.min(top, y);
      }
      return top;
    };
    const far = terrainTops(mesaAt, farScroll);
    fillTerrain(ctx, far, th.mountainFar);
    drawStrata(
      ctx,
      farScroll,
      GROUND_Y - 74,
      8,
      [shadeCss(th.mountainFar, -0.1), shadeCss(th.mountainFar, 0.12)],
      0.7
    );
    shadeFacets(ctx, far, withAlpha(shadeCss(th.mountainFar, -0.25), 0.5));
    rimTerrain(ctx, far, shadeCss(th.mountainFar, 0.25));

    // Near sand dunes with shadowed lee slopes.
    const nearScroll = game.distance * 0.3;
    const near = terrainTops(
      (x) => GROUND_Y - 22 + Math.sin(x / 110) * 8 + Math.sin(x / 47) * 3,
      nearScroll
    );
    fillTerrain(ctx, near, th.mountainNear);
    rimTerrain(ctx, near, th.accent);
  },

  canyon(ctx, game, th) {
    // Tall red-rock buttes with stair-stepped ledges.
    const farScroll = game.distance * 0.12;
    const butteAt = (x) => {
      let top = GROUND_Y - 30 + Math.sin(x / 70) * 4;
      const i0 = Math.floor(x / 200);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        if (hash01(i * 5 + 2) < 0.15) continue;
        const c = i * 200 + 100 + (hash01(i * 5 + 3) - 0.5) * 60;
        const half = 20 + hash01(i * 5 + 4) * 40;
        const h = 72 + hash01(i * 11 + 1) * 46;
        const d = Math.abs(x - c) - half;
        top = Math.min(top, GROUND_Y - h + (d > 0 ? Math.ceil(d / 6) * 12 : 0));
      }
      return top;
    };
    const far = terrainTops(butteAt, farScroll);
    fillTerrain(ctx, far, th.mountainFar);
    drawStrata(ctx, farScroll, GROUND_Y - 120, 10, [th.accent, th.accent2], 0.45);
    shadeFacets(ctx, far, withAlpha(shadeCss(th.mountainFar, -0.3), 0.55));
    rimTerrain(ctx, far, shadeCss(th.mountainFar, 0.25));

    // Near jagged canyon wall.
    const nearScroll = game.distance * 0.32;
    const near = terrainTops(
      (x) =>
        GROUND_Y - 24 - Math.abs(Math.sin(x / 57)) * 14 - hash01(Math.floor(x / 9)) * 5,
      nearScroll
    );
    fillTerrain(ctx, near, th.mountainNear);
    drawStrata(ctx, nearScroll, GROUND_Y - 44, 7, [th.accent2, th.accent], 0.4);
    rimTerrain(ctx, near, shadeCss(th.mountainNear, 0.3));
  },

  peaks(ctx, game, th) {
    // Far jagged peaks with snow caps.
    const farScroll = game.distance * 0.12;
    const peakAt = (x) => {
      let top = GROUND_Y - 40 + Math.sin(x / 60) * 4;
      const i0 = Math.floor(x / 150);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const c = i * 150 + 75 + (hash01(i * 7 + 1) - 0.5) * 70;
        const h = 72 + hash01(i * 7 + 2) * 46;
        const slope = 0.75 + hash01(i * 7 + 3) * 0.5;
        top = Math.min(top, GROUND_Y - h + Math.abs(x - c) * slope);
      }
      return top + hash01(Math.floor(x / 6)) * 3;
    };
    const far = terrainTops(peakAt, farScroll);
    fillTerrain(ctx, far, th.mountainFar);
    shadeFacets(ctx, far, withAlpha(shadeCss(th.mountainFar, -0.22), 0.7));
    // Snow above a ragged snowline.
    for (let i = 0; i < far.length; i++) {
      const wx = i * PX + farScroll;
      const line = GROUND_Y - 82 + Math.sin(wx / 23) * 4 + hash01(Math.floor(wx / PX)) * 6;
      if (far[i] < line) {
        ctx.fillStyle = th.accent;
        ctx.fillRect(i * PX, far[i], PX, Math.round((line - far[i]) / PX) * PX);
      }
    }

    // Near rocky ridge, faceted, flecked with snow.
    const nearScroll = game.distance * 0.32;
    const near = terrainTops(
      (x) =>
        GROUND_Y - 30 + Math.sin(x / 40) * 8 + Math.sin(x / 17) * 4 - hash01(Math.floor(x / 6)) * 3,
      nearScroll
    );
    fillTerrain(ctx, near, th.mountainNear);
    rimTerrain(ctx, near, shadeCss(th.mountainNear, 0.15));
    for (let i = 0; i < near.length; i++) {
      const h = hash01(Math.floor((i * PX + nearScroll) / PX) + 77);
      if (h > 0.55) {
        ctx.fillStyle = withAlpha(th.accent, 0.85);
        ctx.fillRect(i * PX, near[i], PX, h > 0.8 ? 6 : 3);
      }
    }
  },

  volcano(ctx, game, th) {
    // A smoking volcano every so often along a low far ridge.
    const farScroll = game.distance * 0.1;
    const SPACING = 820;
    const cone = (x) => {
      const c = Math.round(x / SPACING) * SPACING;
      const d = Math.abs(x - c);
      if (d < 22) return GROUND_Y - 118 + 6; // crater lip dips a little
      return GROUND_Y - 124 + d * 0.55;
    };
    const ridgeAt = (x) =>
      Math.min(GROUND_Y - 34 + Math.sin(x / 50) * 6 - hash01(Math.floor(x / 15)) * 6, cone(x));

    // Screen x of every crater near the view.
    const craters = [];
    for (let k = Math.floor((farScroll - 140) / SPACING); k * SPACING - farScroll < VIEW_W + 140; k++) {
      craters.push(k * SPACING - farScroll);
    }

    // Crater glow + smoke behind the cone so it lights the sky.
    for (const cx of craters) {
      const cy = GROUND_Y - 118;
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 70);
      glow.addColorStop(0, withAlpha(th.accent, 0.7));
      glow.addColorStop(1, withAlpha(th.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 70, cy - 70, 140, 140);
      for (let p = 0; p < 10; p++) {
        const age = wrap(game.clock * 0.18 + p / 10, 1);
        const r = 8 + age * 26;
        ctx.fillStyle = withAlpha(shadeCss(th.cloud, 0.1), ((1 - age) * 0.28).toFixed(3));
        ctx.beginPath();
        ctx.arc(cx + age * 70 + Math.sin(p * 2.3) * 6, cy - 8 - age * 100, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const far = terrainTops(ridgeAt, farScroll);
    fillTerrain(ctx, far, th.mountainFar);
    shadeFacets(ctx, far, withAlpha(shadeCss(th.mountainFar, -0.3), 0.6));
    // Lava rivulets running down from each crater.
    for (const cx of craters) {
      for (const dir of [-1, 1]) {
        for (let k = 0; k < 26; k++) {
          const x = cx + dir * (20 + k * 3 + Math.round(Math.sin(k * 0.9 + dir) * 3));
          const y = cone(x + farScroll);
          ctx.fillStyle = withAlpha(k % 3 ? th.accent : th.accent2, (1 - k / 26).toFixed(3));
          ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX + PX, PX, PX);
        }
      }
    }
    rimTerrain(ctx, far, withAlpha(th.accent, 0.35));

    // Near black rock with a lava-lit edge.
    const nearScroll = game.distance * 0.32;
    const near = terrainTops(
      (x) => GROUND_Y - 22 - Math.abs(Math.sin(x / 33)) * 12 - hash01(Math.floor(x / 8)) * 7,
      nearScroll
    );
    fillTerrain(ctx, near, th.mountainNear);
    rimTerrain(ctx, near, withAlpha(th.accent, 0.6));
  },
};

function drawClouds(ctx, game, th) {
  const pal = { "#": th.cloud, "@": shadeCss(th.cloud, 0.12), ".": shadeCss(th.cloud, -0.18) };
  ctx.globalAlpha = 0.9;
  for (const c of game.clouds) drawSprite(ctx, CLOUD, c.x, c.y, PX, pal);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Ground. A shared base (gradient, baseline, scrolling pebbles + tufts) plus a
// per-level texture layered on top.
// ---------------------------------------------------------------------------

function drawGroundBase(ctx, th) {
  const dirt = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  dirt.addColorStop(0, th.dirt);
  dirt.addColorStop(1, th.dirtDeep);
  ctx.fillStyle = dirt;
  ctx.fillRect(0, GROUND_Y + 4, VIEW_W, VIEW_H - (GROUND_Y + 4));

  // Crisp baseline.
  ctx.fillStyle = th.dirtLine;
  ctx.fillRect(0, GROUND_Y + 2, VIEW_W, 2);
}

function drawGroundBumps(ctx, game, th) {
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

// Sparse hashed specks over the dirt band: `cell`-sized grid, one speck in
// roughly `density` of the cells.
function speckle(ctx, scroll, cell, density, color, salt, size = 2) {
  ctx.fillStyle = color;
  for (let y = GROUND_Y + 8, row = 0; y < VIEW_H - 2; y += cell, row++) {
    eachSlot(scroll, cell, (i, sx) => {
      const h = hash01(i * 131 + row * 7919 + salt);
      if (h < density) ctx.fillRect(Math.round(sx + (h / density) * cell), y, size, size - 1);
    }, 0);
  }
}

const GROUNDS = {
  meadow(ctx, game, th) {
    const d = game.distance;
    // Thick turf band under the baseline.
    ctx.fillStyle = shadeCss(th.dirtLine, -0.12);
    ctx.fillRect(0, GROUND_Y + 4, VIEW_W, 4);
    ctx.fillStyle = withAlpha(shadeCss(th.dirtLine, -0.12), 0.5);
    eachSlot(d, 6, (i, sx) => {
      ctx.fillRect(sx, GROUND_Y + 8, 6, 1 + Math.floor(hash01(i + 3) * 4));
    }, 0);
    // Grass blades poking above the baseline, with the odd flower.
    eachSlot(d, 3, (i, sx) => {
      const h = hash01(i);
      const blade = 1 + Math.floor(h * 4);
      ctx.fillStyle = h > 0.5 ? th.grass : shadeCss(th.grass, 0.18);
      ctx.fillRect(sx, GROUND_Y + 3 - blade, 2, blade);
      const f = hash01(i * 13 + 7);
      if (f > 0.965) {
        ctx.fillStyle = f > 0.983 ? th.accent : th.accent2;
        ctx.fillRect(sx, GROUND_Y + 1 - blade, 3, 3);
      }
    }, 0);
    speckle(ctx, d, 7, 0.22, shadeCss(th.dirt, -0.22), 11);
    speckle(ctx, d, 9, 0.12, shadeCss(th.dirt, 0.15), 29);
  },

  sand(ctx, game, th) {
    const d = game.distance;
    // Wind ripples: short light dashes with a shadow line beneath.
    for (let row = 0; row < 5; row++) {
      const y = GROUND_Y + 10 + row * 8 + (row % 2) * 2;
      eachSlot(d, 26, (i, sx) => {
        const h = hash01(i * 17 + row * 101);
        if (h < 0.3) return;
        const x = sx + Math.round(h * 10);
        const len = 6 + Math.round(h * 14);
        ctx.fillStyle = withAlpha(th.accent, 0.8);
        ctx.fillRect(x, y, len, 1);
        ctx.fillStyle = withAlpha(th.dirtDeep, 0.5);
        ctx.fillRect(x + 2, y + 1, len, 1);
      }, 0);
    }
    // Rare desert blooms along the baseline.
    eachSlot(d, 60, (i, sx) => {
      if (hash01(i + 404) < 0.75) return;
      const x = sx + Math.round(hash01(i + 405) * 40);
      ctx.fillStyle = th.grass;
      ctx.fillRect(x + 1, GROUND_Y - 1, 1, 4);
      ctx.fillStyle = th.accent2;
      ctx.fillRect(x, GROUND_Y - 3, 3, 2);
    }, 0);
    speckle(ctx, d, 8, 0.18, th.pebble, 5);
  },

  strata(ctx, game, th) {
    const d = game.distance;
    // Wavy rock layers in alternating light and dark bands.
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = withAlpha(k % 2 ? th.accent2 : th.accent, 0.55);
      eachSlot(d, 6, (i, sx) => {
        const wy = Math.round(Math.sin((i * 6) / 40 + k * 1.7) * 2);
        ctx.fillRect(sx, GROUND_Y + 10 + k * 11 + wy, 6, 4);
      }, 0);
    }
    // Chunky rocks with a lit top.
    eachSlot(d, 34, (i, sx) => {
      const h = hash01(i * 3 + 9);
      if (h < 0.55) return;
      const x = sx + Math.round(h * 20);
      const y = GROUND_Y + 8 + Math.round(hash01(i + 1) * 30);
      const w = 4 + Math.round(h * 6);
      ctx.fillStyle = th.pebble;
      ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = shadeCss(th.pebble, 0.3);
      ctx.fillRect(x + 1, y, w - 2, 1);
    }, 0);
  },

  shale(ctx, game, th) {
    const d = game.distance;
    // Snow drifts heaped along the baseline.
    eachSlot(d, 9, (i, sx) => {
      const h = hash01(i + 55);
      if (h < 0.45) return;
      ctx.fillStyle = th.accent;
      ctx.fillRect(sx, GROUND_Y + 4, 9, 1 + Math.round(h * 3));
    }, 0);
    // Fractured shale: little zig-zag cracks.
    ctx.fillStyle = withAlpha(th.dirtDeep, 0.9);
    eachSlot(d, 40, (i, sx) => {
      if (hash01(i * 7) < 0.35) return;
      let y = GROUND_Y + 12 + Math.round(hash01(i * 7 + 1) * 26);
      let x = sx + Math.round(hash01(i * 7 + 2) * 16);
      for (let s = 0; s < 6; s++) {
        ctx.fillRect(x, y, 3, 1);
        x += 3;
        y += hash01(i * 7 + s + 3) > 0.5 ? 1 : -1;
      }
    }, 0);
    speckle(ctx, d, 6, 0.16, withAlpha(th.accent, 0.8), 17, 1.5);
  },

  basalt(ctx, game, th) {
    const d = game.distance;
    // Glowing lava cracks that pulse; each gets a faint halo.
    eachSlot(d, 34, (i, sx) => {
      if (hash01(i * 5) < 0.3) return;
      const pulse = 0.55 + 0.35 * Math.sin(game.clock * 3 + i);
      let x = sx + Math.round(hash01(i * 5 + 1) * 12);
      let y = GROUND_Y + 10 + Math.round(hash01(i * 5 + 2) * 28);
      for (let s = 0; s < 7; s++) {
        ctx.fillStyle = withAlpha(th.accent, (pulse * 0.25).toFixed(3));
        ctx.fillRect(x - 1, y - 1, 5, 4);
        ctx.fillStyle = withAlpha(s % 3 ? th.accent : th.accent2, pulse.toFixed(3));
        ctx.fillRect(x, y, 3, 2);
        x += 3;
        y += hash01(i * 5 + s + 3) > 0.5 ? 2 : -2;
      }
    }, 0);
    speckle(ctx, d, 7, 0.2, shadeCss(th.dirt, 0.12), 41);
  },
};

// ---------------------------------------------------------------------------
// Ambient particles. Positions are pure functions of clock/distance and a
// per-particle hash, so they need no simulation state.
// ---------------------------------------------------------------------------

const AIRS = {
  pollen(ctx, game, th, alpha) {
    for (let k = 0; k < 16; k++) {
      const x = wrap(hash01(k) * VIEW_W - game.clock * (10 + hash01(k + 50) * 16), VIEW_W);
      const y = 40 + hash01(k + 100) * 150 + Math.sin(game.clock * 1.3 + k) * 6;
      // Pollen by day; blinking fireflies with a glow by night.
      const blink = lerp(0.75, Math.max(0, Math.sin(game.clock * 2 + k * 1.7)), th.t);
      ctx.globalAlpha = alpha * blink;
      if (th.t > 0.05) {
        ctx.fillStyle = withAlpha(th.accent2, (0.25 * th.t).toFixed(3));
        ctx.fillRect(x - 2, y - 2, 6, 6);
      }
      ctx.fillStyle = th.accent2;
      ctx.fillRect(x, y, 2, 2);
    }
  },

  sand(ctx, game, th, alpha) {
    // Grains skittering low over the ground in the wind.
    ctx.fillStyle = th.accent;
    for (let k = 0; k < 26; k++) {
      const x = wrap(hash01(k) * VIEW_W - game.clock * (160 + hash01(k + 9) * 200), VIEW_W);
      const y = GROUND_Y - 4 - hash01(k + 30) * 34 + Math.sin(game.clock * 4 + k) * 3;
      ctx.globalAlpha = alpha * (0.4 + hash01(k + 60) * 0.5);
      ctx.fillRect(x, y, 2 + Math.round(hash01(k + 90) * 3), 1);
    }
  },

  dust(ctx, game, th, alpha) {
    for (let k = 0; k < 18; k++) {
      const x = wrap(hash01(k) * VIEW_W - game.clock * (24 + hash01(k + 9) * 30), VIEW_W);
      const y = 50 + hash01(k + 30) * 150 + Math.sin(game.clock * 0.9 + k) * 9;
      const s = hash01(k + 60) > 0.7 ? 3 : 2;
      ctx.globalAlpha = alpha * (0.3 + hash01(k + 90) * 0.4);
      ctx.fillStyle = th.accent;
      ctx.fillRect(x, y, s, s);
    }
  },

  wind(ctx, game, th, alpha) {
    // Fast horizontal gust streaks...
    ctx.fillStyle = th.accent2;
    for (let k = 0; k < 9; k++) {
      const w = 30 + hash01(k + 5) * 60;
      const x = wrap(hash01(k) * 1400 - game.clock * (520 + hash01(k + 9) * 260), 1400) - w;
      const y = 30 + hash01(k + 30) * 160;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillRect(x, y, w, 1);
    }
    // ...and snowflakes driven sideways.
    ctx.fillStyle = th.accent;
    for (let k = 0; k < 24; k++) {
      const x = wrap(hash01(k + 200) * VIEW_W - game.clock * (110 + hash01(k + 209) * 90), VIEW_W);
      const y = wrap(hash01(k + 230) * GROUND_Y + game.clock * (30 + hash01(k + 260) * 25), GROUND_Y);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillRect(x, y, 2, 2);
    }
  },

  embers(ctx, game, th, alpha) {
    // Rising, flickering embers...
    for (let k = 0; k < 24; k++) {
      const rise = wrap(hash01(k + 30) * 220 + game.clock * (28 + hash01(k + 9) * 40), 220);
      const x = wrap(hash01(k) * VIEW_W - game.clock * 22 + Math.sin(game.clock * 2 + k) * 8, VIEW_W);
      const y = GROUND_Y + 10 - rise;
      ctx.globalAlpha = alpha * (1 - rise / 220) * (0.6 + 0.4 * Math.sin(game.clock * 9 + k));
      ctx.fillStyle = k % 3 ? th.accent2 : th.accent;
      ctx.fillRect(x, y, 2, 2);
    }
    // ...and falling grey ash.
    ctx.fillStyle = shadeCss(th.cloud, 0.25);
    for (let k = 0; k < 12; k++) {
      const x = wrap(hash01(k + 300) * VIEW_W - game.clock * 30, VIEW_W);
      const y = wrap(hash01(k + 330) * GROUND_Y + game.clock * (18 + hash01(k + 360) * 14), GROUND_Y);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillRect(x, y, 2, 1);
    }
  },
};

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

// Draw one of a level's style layers. While the scenery cross-fades between
// levels, the outgoing style fades out as the incoming one fades in.
function drawLevelLayer(ctx, painters, key, game, th, from, to, f) {
  const layer = (lv, alpha) => {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    painters[lv[key]](ctx, game, th, alpha);
    ctx.restore();
  };
  layer(from, from === to ? 1 : 1 - f);
  if (from !== to) layer(to, f);
}

// Render the whole scene for the current frame.
export function drawScene(ctx, game) {
  const last = LEVEL_THEMES.length - 1;
  const lv = clamp(game.levelVisual ?? game.level ?? 0, 0, last);
  const a = Math.floor(lv);
  const f = smoothstep(lv - a);
  const from = LEVEL_THEMES[a];
  const to = LEVEL_THEMES[Math.min(a + 1, last)];
  const th = theme(game.nightTransition, a + f);

  drawSky(ctx, th);
  drawCelestial(ctx, game, th);
  drawLevelLayer(ctx, BACKDROPS, "backdrop", game, th, from, to, f);
  drawClouds(ctx, game, th);
  drawGroundBase(ctx, th);
  drawLevelLayer(ctx, GROUNDS, "ground", game, th, from, to, f);
  drawGroundBumps(ctx, game, th);
  for (const o of game.obstacles) drawObstacle(ctx, o, th);
  drawDino(ctx, game, th);
  drawLevelLayer(ctx, AIRS, "air", game, th, from, to, f);
  drawVignette(ctx);
}
