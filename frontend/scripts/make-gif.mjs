// Dev-only helper to regenerate docs/demo.gif from a generated report HTML.
// Not part of the shipped package. Usage (from frontend/):
//   npm i --no-save puppeteer-core
//   node scripts/make-gif.mjs <abs/path/report.html> [chromePath]
//   ffmpeg -y -framerate 0.8 -i docs/frames/frame%02d.png \
//     -vf "scale=1100:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 docs/demo.gif
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const file = process.argv[2];
const chrome = process.argv[3] || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!file) {
  console.error("usage: node scripts/make-gif.mjs <abs/path/report.html> [chromePath]");
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("docs/frames", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 880, deviceScaleFactor: 2 });
await page.goto("file://" + encodeURI(file), { waitUntil: "networkidle0" });
await page.waitForSelector("tbody tr");

const clickLabel = (text) =>
  page.evaluate((t) => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.includes(t));
    l.querySelector("input").click();
  }, text);
const shot = (n) => page.screenshot({ path: `docs/frames/frame${String(n).padStart(2, "0")}.png` });

let i = 0;
await shot(i++); // default
await clickLabel("Unreviewed"); await wait(120); await shot(i++);
await clickLabel("Unreviewed");
await clickLabel("Inspect Only"); await wait(120); await shot(i++);
await clickLabel("Inspect Only");
await clickLabel("Hide Unapproved"); await wait(120); await shot(i++);

await browser.close();
console.log("frames written:", i);
