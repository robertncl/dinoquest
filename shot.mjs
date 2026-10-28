// Dev-only screenshot harness. Drives the running game with Playwright to
// capture representative frames for visual verification / README assets.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 420 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

const wrap = page.locator(".canvas-wrap");

async function shot(name) {
  await wrap.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

// 1. Idle / title screen.
await page.waitForTimeout(400);
await shot("01-title");

// 2. Start + run a little so obstacles/clouds appear. Invincibility keeps the
// dino from dying mid-capture so frames stay deterministic.
await page.keyboard.press("Space");
await page.evaluate(() => window.__invincible(true));
await page.waitForTimeout(1500);
await shot("02-running");

// 3. Ducking pose.
await page.keyboard.down("ArrowDown");
await page.waitForTimeout(300);
await shot("03-ducking");
await page.keyboard.up("ArrowDown");

// 4. Mid-jump pose.
await page.keyboard.press("Space");
await page.waitForTimeout(180);
await shot("04-jumping");

// 5 + 7–11. Each level's scenery, by day and by night. The score only moves
// forward (levels never go back down), so visit them in increasing order and
// wait out the level + day/night cross-fades before each capture. Scores
// 700–1399 and 2100–2799 fall in the night half of the day/night cycle.
const SCENES = [
  ["07-level-2", 340],
  ["05-night", 820], // Dusty Canyon (level 3) is only ever seen at night
  ["08-level-4-night", 1250],
  ["09-level-4", 1500],
  ["10-level-5", 1950],
  ["11-level-5-night", 2150],
];
for (const [name, score] of SCENES) {
  await page.evaluate((s) => {
    window.__setScore(s);
    window.__clearObstacles();
  }, score);
  await page.waitForTimeout(1800);
  await shot(name);
}
await page.evaluate(() => window.__invincible(false));

// 6. Game over (force a collision via the test hook).
await page.evaluate(() => window.__forceOver && window.__forceOver());
await page.waitForTimeout(400);
await shot("06-gameover");

await browser.close();
console.log("done");
