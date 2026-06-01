// DinoQuest browser shell.
//
// All gameplay, physics and rendering live in the DOM-free engine; this file
// only wires the engine to a real canvas: HiDPI setup, input, the animation
// loop, HUD/overlay DOM, and the dev hooks used by shot.mjs.

import {
  DinoGame,
  drawScene,
  pad,
  STATE,
  VIEW_W,
  VIEW_H,
} from "./engine.js";

// ---------------------------------------------------------------------------
// Canvas + HiDPI.
// ---------------------------------------------------------------------------

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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
// Game instance.
// ---------------------------------------------------------------------------

const game = new DinoGame({ storage: window.localStorage });

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "Space":
    case "ArrowUp":
    case "KeyW":
      e.preventDefault();
      game.jump();
      break;
    case "ArrowDown":
    case "KeyS":
      e.preventDefault();
      game.setDuck(true);
      break;
    case "Enter":
      if (game.state !== STATE.RUNNING) game.jump();
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown" || e.code === "KeyS") game.setDuck(false);
});

// Pointer / touch: tap the top half to jump, the bottom half to duck.
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (game.state !== STATE.RUNNING) {
    game.jump();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const localY = (e.clientY - rect.top) / rect.height;
  if (localY > 0.6) game.setDuck(true);
  else game.jump();
});
canvas.addEventListener("pointerup", () => game.setDuck(false));
canvas.addEventListener("pointerleave", () => game.setDuck(false));

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const titleEl = overlay.querySelector(".overlay__title");
const msgEl = overlay.querySelector(".overlay__msg");
startBtn.addEventListener("click", () => game.jump());

// ---------------------------------------------------------------------------
// HUD / overlay sync (driven from engine state each frame).
// ---------------------------------------------------------------------------

const scoreEl = document.getElementById("score");
const hiScoreEl = document.getElementById("hiScore");
let lastShownState = null;

function syncDom() {
  // Day/night theme follows the canvas cross-fade.
  document.body.classList.toggle("is-night", game.nightTransition > 0.5);

  // Score HUD (source of truth for the on-screen numbers).
  scoreEl.textContent = pad(game.score);
  hiScoreEl.textContent = "HI " + pad(game.hiScore);
  const blink = game.flashTimer > 0 && Math.floor(game.flashTimer * 10) % 2 === 0;
  scoreEl.style.opacity = blink ? "0.2" : "1";
  scoreEl.classList.toggle("hud__score--flash", game.flashTimer > 0);

  // Overlay: only rewrite text when the state actually changes.
  overlay.hidden = game.state === STATE.RUNNING;
  if (game.state === lastShownState) return;
  lastShownState = game.state;

  if (game.state === STATE.OVER) {
    titleEl.textContent = "Game Over";
    msgEl.textContent = `Score ${pad(game.score)} · Best ${pad(game.hiScore)}`;
    startBtn.textContent = "Press Space to Retry";
  } else if (game.state === STATE.IDLE) {
    titleEl.textContent = "DinoQuest";
    msgEl.textContent = "Jump the cacti. Duck the pterodactyls.";
    startBtn.textContent = "Press Space to Start";
  }
}

// ---------------------------------------------------------------------------
// Main loop.
// ---------------------------------------------------------------------------

let lastTime = 0;
function frame(now) {
  const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
  lastTime = now;
  game.update(dt);
  drawScene(ctx, game);
  syncDom();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Dev-only hooks used by shot.mjs for deterministic screenshots.
// ---------------------------------------------------------------------------

window.__setScore = (n) => {
  game.score = n;
};
window.__forceOver = () => {
  if (game.state === STATE.IDLE) game.start();
  game.gameOver();
};
window.__invincible = (v) => {
  game.invincible = v;
};
window.__clearObstacles = () => {
  game.obstacles = [];
};
