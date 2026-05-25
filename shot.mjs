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

// Force deterministic state for clean sprite captures.
await page.evaluate(() => window.__shotMode && window.__shotMode());

// 2. Start + run a little so obstacles/clouds appear.
await page.keyboard.press("Space");
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

// 5. Night mode (drive score up via the test hook).
await page.evaluate(() => window.__setScore && window.__setScore(820));
await page.waitForTimeout(900);
await shot("05-night");

// 6. Game over (force a collision via the test hook).
await page.evaluate(() => window.__forceOver && window.__forceOver());
await page.waitForTimeout(400);
await shot("06-gameover");

await browser.close();
console.log("done");
