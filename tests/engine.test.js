// Unit tests for the DinoQuest engine. The engine is DOM-free and takes all of
// its side effects (randomness, storage, canvas context) as injected inputs,
// so everything below runs under plain `bun test` with no browser.

import { describe, it, expect, beforeEach } from "bun:test";
import {
  // sprite helpers
  grid,
  spriteWidth,
  spriteHeight,
  drawSprite,
  drawSpriteShadowed,
  // math + color
  lerp,
  clamp,
  hexToRgb,
  blendColor,
  parseCss,
  shadeCss,
  spritePalette,
  theme,
  deadEyeColor,
  // collision
  scaleBoxes,
  overlaps,
  STAND_BOXES,
  DUCK_BOXES,
  CACTUS_SMALL_BOXES,
  BIRD_BOXES,
  // spawning
  randRange,
  nextSpawnDelay,
  pad,
  // levels
  LEVELS,
  levelForScore,
  // core + rendering
  DinoGame,
  drawDino,
  drawScene,
  // constants
  STATE,
  PX,
  GROUND_Y,
  VIEW_W,
  START_SPEED,
  MAX_SPEED,
  SPEED_RAMP,
  JUMP_VELOCITY,
  DUCK_FAST_FALL,
  DINO_STAND_H,
  DINO_DUCK_H,
  CACTUS_SMALL,
  CACTUS_LARGE,
  BIRD_UP,
} from "../public/engine.js";

// ---------------------------------------------------------------------------
// Test doubles.
// ---------------------------------------------------------------------------

// Deterministic rng that replays `values`, then returns `fill` forever.
function seqRng(values, fill = 0) {
  let i = 0;
  return () => (i < values.length ? values[i++] : fill);
}

// In-memory localStorage-like object.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// Recording 2D-context mock. Real drawing methods are no-ops, but fillRect /
// fillText / arc and the gradient factories are captured so tests can assert.
function makeCtx() {
  const calls = { fillRect: [], fillText: [], arc: [], gradients: 0 };
  const target = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect(x, y, w, h) {
      calls.fillRect.push({ x, y, w, h, fillStyle: target.fillStyle });
    },
    fillText(...a) {
      calls.fillText.push(a);
    },
    arc(...a) {
      calls.arc.push(a);
    },
    createLinearGradient() {
      calls.gradients++;
      return { addColorStop() {} };
    },
    createRadialGradient() {
      calls.gradients++;
      return { addColorStop() {} };
    },
    measureText: () => ({ width: 0 }),
  };
  return new Proxy(target, {
    get(t, p) {
      if (p === "calls") return calls;
      if (p in t) return t[p];
      return () => {}; // no-op for beginPath/moveTo/lineTo/fill/save/restore/…
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
}

// A running game with a deterministic rng and fake storage.
function makeGame(opts = {}) {
  return new DinoGame({ rng: () => 0.5, storage: fakeStorage(), ...opts });
}

// ---------------------------------------------------------------------------
// Sprite helpers.
// ---------------------------------------------------------------------------

describe("grid", () => {
  it("splits rows and trims the leading/trailing newline", () => {
    expect(grid("\n#\n##\n")).toEqual(["#", "##"]);
  });
  it("preserves interior spaces as transparent pixels", () => {
    expect(grid("\n# #\n")).toEqual(["# #"]);
  });
});

describe("spriteWidth / spriteHeight", () => {
  it("measure the widest row and row count times the unit", () => {
    expect(spriteWidth(["##", "#"], 3)).toBe(6);
    expect(spriteHeight(["#", "#", "#"], 3)).toBe(9);
  });
});

describe("drawSprite", () => {
  it("fills one unit-sized rect per non-space pixel", () => {
    const ctx = makeCtx();
    drawSprite(ctx, ["# #"], 0, 0, 3, "#abc");
    expect(ctx.calls.fillRect).toEqual([
      { x: 0, y: 0, w: 3, h: 3, fillStyle: "#abc" },
      { x: 6, y: 0, w: 3, h: 3, fillStyle: "#abc" },
    ]);
  });

  it("maps each character to its palette color", () => {
    const ctx = makeCtx();
    drawSprite(ctx, ["#@."], 0, 0, 2, { "#": "red", "@": "green", ".": "blue" });
    expect(ctx.calls.fillRect.map((c) => c.fillStyle)).toEqual(["red", "green", "blue"]);
  });

  it("falls back to the base tone for unmapped characters", () => {
    const ctx = makeCtx();
    drawSprite(ctx, ["x"], 0, 0, 2, { "#": "base" });
    expect(ctx.calls.fillRect[0].fillStyle).toBe("base");
  });

  it("offsets pixels by row/column and unit size", () => {
    const ctx = makeCtx();
    drawSprite(ctx, [" #", "# "], 10, 20, 4, "#000");
    expect(ctx.calls.fillRect).toEqual([
      { x: 14, y: 20, w: 4, h: 4, fillStyle: "#000" },
      { x: 10, y: 24, w: 4, h: 4, fillStyle: "#000" },
    ]);
  });
});

describe("drawSpriteShadowed", () => {
  it("draws an offset shadow copy behind the sprite", () => {
    const ctx = makeCtx();
    drawSpriteShadowed(ctx, ["#"], 0, 0, 3, "#0f0", "#000");
    expect(ctx.calls.fillRect).toEqual([
      { x: 3, y: 3, w: 3, h: 3, fillStyle: "#000" }, // shadow first
      { x: 0, y: 0, w: 3, h: 3, fillStyle: "#0f0" }, // sprite on top
    ]);
  });
  it("skips the shadow pass when no shadow color is given", () => {
    const ctx = makeCtx();
    drawSpriteShadowed(ctx, ["#"], 0, 0, 3, "#0f0", null);
    expect(ctx.calls.fillRect).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Math + color.
// ---------------------------------------------------------------------------

describe("lerp / clamp", () => {
  it("lerp interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
  });
  it("clamp bounds a value to [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("hexToRgb", () => {
  it("parses a 6-digit hex color", () => {
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0]);
  });
});

describe("blendColor", () => {
  it("returns the day color at t=0 and the night color at t=1", () => {
    expect(blendColor("#000000", "#ffffff", 0)).toBe("rgb(0,0,0)");
    expect(blendColor("#000000", "#ffffff", 1)).toBe("rgb(255,255,255)");
  });
  it("blends channel-wise at the midpoint", () => {
    expect(blendColor("#000000", "#ffffff", 0.5)).toBe("rgb(128,128,128)");
  });
});

describe("parseCss / shadeCss", () => {
  it("parseCss extracts the rgb triple", () => {
    expect(parseCss("rgb(12,34,56)")).toEqual([12, 34, 56]);
  });
  it("shadeCss(0) leaves the color unchanged", () => {
    expect(shadeCss("rgb(100,100,100)", 0)).toBe("rgb(100,100,100)");
  });
  it("positive amounts move toward white, negative toward black", () => {
    expect(shadeCss("rgb(100,100,100)", 1)).toBe("rgb(255,255,255)");
    expect(shadeCss("rgb(100,100,100)", -1)).toBe("rgb(0,0,0)");
    expect(shadeCss("rgb(100,100,100)", 0.5)).toBe("rgb(178,178,178)");
  });
});

describe("spritePalette", () => {
  it("derives highlight/shadow tones and uses the accent", () => {
    const pal = spritePalette("rgb(100,100,100)", "#abc");
    expect(pal["#"]).toBe("rgb(100,100,100)");
    expect(pal["*"]).toBe("#abc");
    expect(parseCss(pal["@"])[0]).toBeGreaterThan(100); // highlight is lighter
    expect(parseCss(pal["."])[0]).toBeLessThan(100); // shadow is darker
  });
});

describe("theme / deadEyeColor", () => {
  it("resolves palette endpoints for day and night", () => {
    expect(theme(0).skyTop).toBe("rgb(126,200,240)"); // #7ec8f0
    expect(theme(1).skyTop).toBe("rgb(10,17,48)"); // #0a1130
    expect(theme(0.42).t).toBe(0.42);
  });
  it("deadEyeColor is dark by day and light by night", () => {
    expect(deadEyeColor(0)).toBe("rgb(58,42,26)");
    expect(deadEyeColor(1)).toBe("rgb(240,240,240)");
  });
});

// ---------------------------------------------------------------------------
// Collision.
// ---------------------------------------------------------------------------

describe("scaleBoxes", () => {
  it("scales grid-unit boxes to world pixels at an origin", () => {
    expect(scaleBoxes([{ x: 1, y: 2, w: 3, h: 4 }], 10, 20)).toEqual([
      { x: 10 + PX, y: 20 + 2 * PX, w: 3 * PX, h: 4 * PX },
    ]);
  });
});

describe("overlaps", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  it("is true when boxes intersect", () => {
    expect(overlaps(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });
  it("is false when boxes are separated", () => {
    expect(overlaps(a, { x: 20, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it("is false when boxes merely touch edges", () => {
    expect(overlaps(a, { x: 10, y: 0, w: 5, h: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spawning helpers.
// ---------------------------------------------------------------------------

describe("randRange", () => {
  it("returns min at 0, max at 1 and the midpoint at 0.5", () => {
    expect(randRange(2, 4, () => 0)).toBe(2);
    expect(randRange(2, 4, () => 1)).toBe(4);
    expect(randRange(2, 4, () => 0.5)).toBe(3);
  });
});

describe("nextSpawnDelay", () => {
  it("uses the wide gap at start speed", () => {
    expect(nextSpawnDelay(START_SPEED, () => 0)).toBeCloseTo(1.4, 5);
  });
  it("uses the tight gap at max speed", () => {
    expect(nextSpawnDelay(MAX_SPEED, () => 0)).toBeCloseTo(0.7, 5);
  });
  it("adds jitter from the rng", () => {
    expect(nextSpawnDelay(START_SPEED, () => 0.5)).toBeCloseTo(1.8, 5);
  });
});

describe("pad", () => {
  it("zero-pads the floored score to five digits", () => {
    expect(pad(0)).toBe("00000");
    expect(pad(123)).toBe("00123");
    expect(pad(12.9)).toBe("00012");
    expect(pad(99999)).toBe("99999");
  });
});

// ---------------------------------------------------------------------------
// Levels.
// ---------------------------------------------------------------------------

describe("levelForScore", () => {
  it("defines five levels starting at level 0 / score 0", () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS[0].scoreStart).toBe(0);
    expect(LEVELS[0].speed).toBe(START_SPEED); // opening level matches the classic pace
  });
  it("maps scores to the level whose threshold they have crossed", () => {
    expect(levelForScore(0)).toBe(0);
    expect(levelForScore(LEVELS[1].scoreStart - 1)).toBe(0);
    expect(levelForScore(LEVELS[1].scoreStart)).toBe(1);
    expect(levelForScore(LEVELS[2].scoreStart)).toBe(2);
    expect(levelForScore(LEVELS[3].scoreStart)).toBe(3);
    expect(levelForScore(LEVELS[4].scoreStart)).toBe(4);
    expect(levelForScore(1e9)).toBe(4);
  });
  it("raises pace, tightens gaps and adds birds with each level", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].speed).toBeGreaterThan(LEVELS[i - 1].speed);
      expect(LEVELS[i].gapMult).toBeLessThan(LEVELS[i - 1].gapMult);
      expect(LEVELS[i].birdChance).toBeGreaterThan(LEVELS[i - 1].birdChance);
    }
  });
});

describe("level progression", () => {
  function runningGame() {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.invincible = true;
    g.spawnTimer = 100; // keep the spawner quiet
    return g;
  }

  it("starts a run on level 0 with no banner", () => {
    const g = runningGame();
    expect(g.level).toBe(0);
    expect(g.levelFlash).toBe(0);
  });

  it("promotes and snaps the pace up to the level floor on a threshold", () => {
    const g = runningGame();
    g.score = LEVELS[1].scoreStart;
    g.update(0.001);
    expect(g.level).toBe(1);
    expect(g.speed).toBeGreaterThanOrEqual(LEVELS[1].speed);
    expect(g.levelFlash).toBeGreaterThan(0);
  });

  it("counts the banner timer down over time", () => {
    const g = runningGame();
    g.score = LEVELS[2].scoreStart;
    g.update(0.001);
    const armed = g.levelFlash;
    g.update(0.5);
    expect(g.levelFlash).toBeLessThan(armed);
  });

  it("resets back to level 0 on a new run", () => {
    const g = runningGame();
    g.score = LEVELS[3].scoreStart;
    g.update(0.001);
    expect(g.level).toBe(3);
    g.reset(STATE.RUNNING);
    expect(g.level).toBe(0);
    expect(g.levelFlash).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DinoGame: construction + state.
// ---------------------------------------------------------------------------

describe("DinoGame construction", () => {
  it("starts idle with default run state", () => {
    const g = makeGame();
    expect(g.state).toBe(STATE.IDLE);
    expect(g.score).toBe(0);
    expect(g.speed).toBe(START_SPEED);
    expect(g.obstacles).toEqual([]);
    expect(g.clouds).toEqual([]);
    expect(g.spawnTimer).toBe(0);
    expect(g.dino.onGround).toBe(true);
    expect(g.dino.feetY).toBe(GROUND_Y);
    expect(g.hiScore).toBe(0);
  });

  it("loads a persisted high score from storage", () => {
    const g = new DinoGame({ storage: fakeStorage({ "dinoquest:hi": "4321" }) });
    expect(g.hiScore).toBe(4321);
  });

  it("tolerates a missing/garbage stored high score", () => {
    expect(new DinoGame({ storage: fakeStorage({ "dinoquest:hi": "nope" }) }).hiScore).toBe(0);
    expect(new DinoGame({ storage: null }).hiScore).toBe(0);
  });

  it("seeds cosmetic decoration arrays", () => {
    const g = makeGame();
    expect(g.bumps).toHaveLength(26);
    expect(g.stars).toHaveLength(22);
  });
});

describe("reset", () => {
  it("returns to a running run with a spawn delay", () => {
    const g = makeGame();
    g.score = 999;
    g.obstacles.push({ x: 1 });
    g.reset(STATE.RUNNING);
    expect(g.state).toBe(STATE.RUNNING);
    expect(g.score).toBe(0);
    expect(g.obstacles).toEqual([]);
    expect(g.spawnTimer).toBe(0.6);
    expect(g.isNight).toBe(false);
    expect(g.nightTransition).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DinoGame: input + flow.
// ---------------------------------------------------------------------------

describe("start", () => {
  it("moves idle -> running and arms the spawner", () => {
    const g = makeGame();
    g.start();
    expect(g.state).toBe(STATE.RUNNING);
    expect(g.spawnTimer).toBe(0.6);
  });
  it("is a no-op once running", () => {
    const g = makeGame();
    g.start();
    g.spawnTimer = 5;
    g.start();
    expect(g.spawnTimer).toBe(5);
  });
});

describe("jump", () => {
  it("starts the game from the title screen", () => {
    const g = makeGame();
    expect(g.jump()).toBe("start");
    expect(g.state).toBe(STATE.RUNNING);
  });

  it("restarts from game over", () => {
    const g = makeGame();
    g.start();
    g.gameOver();
    expect(g.jump()).toBe("restart");
    expect(g.state).toBe(STATE.RUNNING);
    expect(g.score).toBe(0);
  });

  it("launches the dino when grounded", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    expect(g.jump()).toBe("jump");
    expect(g.dino.vy).toBe(JUMP_VELOCITY);
    expect(g.dino.onGround).toBe(false);
    expect(g.dino.ducking).toBe(false);
  });

  it("does not allow a double jump in mid-air", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.jump();
    g.dino.vy = -100;
    expect(g.jump()).toBe("none");
    expect(g.dino.vy).toBe(-100);
  });
});

describe("setDuck", () => {
  it("is ignored unless running", () => {
    const g = makeGame();
    g.setDuck(true);
    expect(g.dino.ducking).toBe(false);
  });
  it("ducks on the ground without changing velocity", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.setDuck(true);
    expect(g.dino.ducking).toBe(true);
    expect(g.dino.vy).toBe(0);
  });
  it("fast-falls when ducking mid-air", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.jump();
    const vy = g.dino.vy;
    g.setDuck(true);
    expect(g.dino.vy).toBe(vy + DUCK_FAST_FALL);
  });
});

describe("gameOver", () => {
  it("ends the run and persists a new high score", () => {
    const storage = fakeStorage();
    const g = new DinoGame({ rng: () => 0.5, storage });
    g.reset(STATE.RUNNING);
    g.score = 512.9;
    g.gameOver();
    expect(g.state).toBe(STATE.OVER);
    expect(g.hiScore).toBe(512);
    expect(storage.getItem("dinoquest:hi")).toBe("512");
  });

  it("keeps a higher existing high score", () => {
    const storage = fakeStorage({ "dinoquest:hi": "1000" });
    const g = new DinoGame({ rng: () => 0.5, storage });
    g.reset(STATE.RUNNING);
    g.score = 200;
    g.gameOver();
    expect(g.hiScore).toBe(1000);
    expect(storage.getItem("dinoquest:hi")).toBe("1000");
  });
});

// ---------------------------------------------------------------------------
// DinoGame: spawning.
// ---------------------------------------------------------------------------

describe("spawnObstacle", () => {
  it("spawns a small cactus cluster", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.rng = seqRng([0.5, 0.9, 0.0]); // roll>=.18, not large, count->1
    const o = g.spawnObstacle();
    expect(o.type).toBe("cactus");
    expect(o.sprite).toBe(CACTUS_SMALL);
    expect(o.count).toBe(1);
    expect(o.x).toBe(VIEW_W + 20);
    expect(o.hitboxes).toBe(CACTUS_SMALL_BOXES);
    expect(g.obstacles).toContain(o);
  });

  it("spawns a clustered large cactus", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.rng = seqRng([0.5, 0.1, 0.1]); // roll>=.18, large, cluster of 2
    const o = g.spawnObstacle();
    expect(o.sprite).toBe(CACTUS_LARGE);
    expect(o.count).toBe(2);
    expect(o.w).toBe(spriteWidth(CACTUS_LARGE, PX) * 2);
  });

  it("spawns a bird only past the score gate", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.score = 300;
    g.rng = seqRng([0.1, 0.0]); // roll<.18, lowest of three heights
    const o = g.spawnObstacle();
    expect(o.type).toBe("bird");
    expect(o.y).toBe(GROUND_Y - 30);
    expect(o.hitboxes).toBe(BIRD_BOXES);
  });

  it("suppresses birds before the score gate", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.score = 100;
    g.rng = seqRng([0.1, 0.9, 0.0]); // low roll, but score too low -> cactus
    expect(g.spawnObstacle().type).toBe("cactus");
  });

  it("schedules the next spawn", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.spawnTimer = 0;
    g.rng = seqRng([0.5, 0.9, 0.0], 0.5);
    g.spawnObstacle();
    expect(g.spawnTimer).toBeGreaterThan(0);
  });
});

describe("spawnCloud", () => {
  it("adds a cloud within the vertical band", () => {
    const g = makeGame();
    const c = g.spawnCloud();
    expect(c.y).toBeGreaterThanOrEqual(20);
    expect(c.y).toBeLessThanOrEqual(90);
    expect(g.clouds).toContain(c);
  });
});

// ---------------------------------------------------------------------------
// DinoGame: collision geometry.
// ---------------------------------------------------------------------------

describe("dinoBoxes", () => {
  it("uses the standing boxes by default", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    expect(g.dinoBoxes()).toEqual(scaleBoxes(STAND_BOXES, 60, GROUND_Y - DINO_STAND_H));
  });
  it("uses the ducking boxes when ducking on the ground", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.dino.ducking = true;
    expect(g.dinoBoxes()).toEqual(scaleBoxes(DUCK_BOXES, 60, GROUND_Y - DINO_DUCK_H));
  });
});

describe("obstacleBoxes", () => {
  it("expands cactus boxes per clustered unit", () => {
    const g = makeGame();
    const o = {
      type: "cactus",
      sprite: CACTUS_SMALL,
      count: 2,
      x: 100,
      y: 50,
      hitboxes: CACTUS_SMALL_BOXES,
    };
    expect(g.obstacleBoxes(o)).toHaveLength(CACTUS_SMALL_BOXES.length * 2);
  });
  it("returns a single set of boxes for birds", () => {
    const g = makeGame();
    const o = { type: "bird", x: 100, y: 40, hitboxes: BIRD_BOXES };
    expect(g.obstacleBoxes(o)).toEqual(scaleBoxes(BIRD_BOXES, 100, 40));
  });
});

describe("hitsObstacle", () => {
  it("detects an obstacle overlapping the dino", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    g.obstacles.push({
      type: "cactus",
      sprite: CACTUS_SMALL,
      count: 1,
      x: g.dino.x,
      y: GROUND_Y - spriteHeight(CACTUS_SMALL, PX),
      hitboxes: CACTUS_SMALL_BOXES,
    });
    expect(g.hitsObstacle()).toBe(true);
  });
  it("is false with a clear field", () => {
    const g = makeGame();
    g.reset(STATE.RUNNING);
    expect(g.hitsObstacle()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DinoGame: update / simulation.
// ---------------------------------------------------------------------------

describe("update", () => {
  let g;
  beforeEach(() => {
    g = makeGame();
    g.reset(STATE.RUNNING);
    g.spawnTimer = 100; // keep the spawner quiet unless a test wants it
    g.invincible = true; // isolate physics from collisions
  });

  it("does nothing unless running", () => {
    const idle = makeGame();
    idle.update(1);
    expect(idle.score).toBe(0);
    expect(idle.speed).toBe(START_SPEED);
  });

  it("ramps speed and clamps it at MAX_SPEED", () => {
    g.update(1);
    expect(g.speed).toBeCloseTo(START_SPEED + SPEED_RAMP, 5);
    g.speed = MAX_SPEED - 1;
    g.update(1);
    expect(g.speed).toBe(MAX_SPEED);
  });

  it("accrues score from speed and elapsed time", () => {
    g.update(1);
    expect(g.score).toBeCloseTo((START_SPEED + SPEED_RAMP) * 0.05, 5);
  });

  it("integrates gravity while airborne", () => {
    g.jump();
    g.update(0.1);
    expect(g.dino.vy).toBeCloseTo(JUMP_VELOCITY + 2400 * 0.1, 5);
    expect(g.dino.feetY).toBeLessThan(GROUND_Y);
  });

  it("lands the dino on the ground", () => {
    g.dino.onGround = false;
    g.dino.vy = 100;
    g.dino.feetY = GROUND_Y - 1;
    g.update(0.1);
    expect(g.dino.onGround).toBe(true);
    expect(g.dino.feetY).toBe(GROUND_Y);
    expect(g.dino.vy).toBe(0);
  });

  it("toggles the running leg frame past the interval", () => {
    expect(g.dino.legFrame).toBe(0);
    g.update(0.05);
    expect(g.dino.legFrame).toBe(0);
    g.update(0.06); // crosses 0.1s
    expect(g.dino.legFrame).toBe(1);
  });

  it("scrolls the ground by speed * dt", () => {
    g.update(0.1);
    expect(g.groundOffset).toBeCloseTo((START_SPEED + SPEED_RAMP * 0.1) * 0.1, 4);
  });

  it("advances and culls obstacles", () => {
    g.obstacles.push({ type: "cactus", sprite: CACTUS_SMALL, count: 1, x: 500, w: 30, y: 0 });
    g.obstacles.push({ type: "cactus", sprite: CACTUS_SMALL, count: 1, x: -50, w: 10, y: 0 });
    g.update(0.1);
    expect(g.obstacles).toHaveLength(1);
    expect(g.obstacles[0].x).toBeLessThan(500);
  });

  it("flaps birds over time", () => {
    const bird = { type: "bird", x: 400, y: 100, w: 30, h: 20, flap: 0, flapTimer: 0 };
    g.obstacles.push(bird);
    g.update(0.2); // crosses the 0.18s flap interval
    expect(bird.flap).toBe(1);
  });

  it("enters night past the day/night threshold", () => {
    g.score = 700;
    g.update(0.001);
    expect(g.isNight).toBe(true);
    expect(g.nightTransition).toBeGreaterThan(0);
  });

  it("returns to day on the next cycle", () => {
    g.score = 1400;
    g.update(0.001);
    expect(g.isNight).toBe(false);
  });

  it("spawns a cloud when the field is empty and rng allows", () => {
    g.rng = () => 0; // 0 < dt*0.6 -> spawn
    g.update(0.1);
    expect(g.clouds.length).toBe(1);
  });

  it("ends the game on collision", () => {
    g.invincible = false;
    g.obstacles.push({
      type: "cactus",
      sprite: CACTUS_SMALL,
      count: 1,
      x: g.dino.x,
      y: GROUND_Y - spriteHeight(CACTUS_SMALL, PX),
      w: 30,
      hitboxes: CACTUS_SMALL_BOXES,
    });
    g.update(0.001);
    expect(g.state).toBe(STATE.OVER);
  });

  it("ignores collisions while invincible", () => {
    g.obstacles.push({
      type: "cactus",
      sprite: CACTUS_SMALL,
      count: 1,
      x: g.dino.x,
      y: GROUND_Y - spriteHeight(CACTUS_SMALL, PX),
      w: 30,
      hitboxes: CACTUS_SMALL_BOXES,
    });
    g.update(0.001);
    expect(g.state).toBe(STATE.RUNNING);
  });

  it("flashes the HUD when crossing a 100-point milestone", () => {
    g.score = 99.9;
    g.update(0.2);
    expect(g.flashTimer).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Rendering smoke tests (mock context, just assert it draws without throwing).
// ---------------------------------------------------------------------------

describe("drawDino", () => {
  it("renders the running pose with an eye", () => {
    const g = makeGame();
    g.start();
    const ctx = makeCtx();
    expect(() => drawDino(ctx, g, theme(0))).not.toThrow();
    expect(ctx.calls.fillRect.length).toBeGreaterThan(0);
  });

  it("renders the ducking pose", () => {
    const g = makeGame();
    g.start();
    g.dino.ducking = true;
    const ctx = makeCtx();
    expect(() => drawDino(ctx, g, theme(0))).not.toThrow();
  });

  it("renders the dead pose after game over", () => {
    const g = makeGame();
    g.start();
    g.gameOver();
    const ctx = makeCtx();
    expect(() => drawDino(ctx, g, theme(1))).not.toThrow();
  });
});

describe("drawScene", () => {
  it("renders a populated day scene without throwing", () => {
    const g = makeGame();
    g.start();
    for (let i = 0; i < 40; i++) g.update(0.05);
    const ctx = makeCtx();
    expect(() => drawScene(ctx, g)).not.toThrow();
    expect(ctx.calls.fillRect.length).toBeGreaterThan(0);
    expect(ctx.calls.gradients).toBeGreaterThan(0);
  });

  it("renders a night scene with obstacles", () => {
    const g = makeGame();
    g.start();
    g.nightTransition = 1;
    g.obstacles.push({
      type: "bird",
      x: 300,
      y: 100,
      w: spriteWidth(BIRD_UP, PX),
      h: spriteHeight(BIRD_UP, PX),
      flap: 1,
    });
    const ctx = makeCtx();
    expect(() => drawScene(ctx, g)).not.toThrow();
  });
});
