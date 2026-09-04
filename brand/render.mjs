import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
].find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!CHROME) { console.error("Chrome не найден"); process.exit(1); }

const OUT = "C:/Claude/zalihvat-site/brand/assets";
fs.mkdirSync(OUT, { recursive: true });

// --- badge: ink rounded square, coral+paper double chevron ---
const badge = (sq /*square corners for touch icon*/) => `
<svg viewBox="0 0 512 512" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="512" height="512" rx="${sq ? 96 : 116}" fill="#151210"/>
  <path d="M150 150 L276 256 L150 362" fill="none" stroke="#ff7f50" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M270 150 L396 256 L270 362" fill="none" stroke="#faf5ec" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// --- standalone chevron mark (transparent) ---
const mark = `
<svg viewBox="0 0 300 260" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <path d="M70 60 L150 130 L70 200" fill="none" stroke="#151210" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M150 60 L230 130 L150 200" fill="none" stroke="#ff7f50" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// --- speed wordmark (transparent) ---
const wordmark = `
<svg viewBox="0 0 520 150" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <g><rect x="14" y="58" width="74" height="12" rx="6" fill="#ff7f50"/><rect x="4" y="82" width="56" height="12" rx="6" fill="#ffc9ad"/><rect x="22" y="106" width="42" height="12" rx="6" fill="#ff7f50"/></g>
  <g transform="skewX(-13)" font-family="Oswald" font-weight="700" font-size="86" letter-spacing="0.5">
    <text x="94" y="108" fill="#151210">ЗАЛИХВАТ</text>
    <text x="90" y="104" fill="#ff7f50" stroke="#151210" stroke-width="2.6" paint-order="stroke">ЗАЛИХВАТ</text>
  </g>
</svg>`;

// --- lockup: chevron mark + wordmark (transparent) ---
const lockup = `
<svg viewBox="0 0 640 150" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 44 L74 88 L30 132" fill="none" stroke="#151210" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M62 44 L106 88 L62 132" fill="none" stroke="#ff7f50" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="skewX(-13)" font-family="Oswald" font-weight="700" font-size="72" letter-spacing="0.5">
    <text x="150" y="112" fill="#151210">ЗАЛИХВАТ</text>
    <text x="146" y="108" fill="#ff7f50" stroke="#151210" stroke-width="2.4" paint-order="stroke">ЗАЛИХВАТ</text>
  </g>
</svg>`;

const assets = [
  { name: "apple-touch-icon.png", w: 512, h: 512, svg: badge(true), transparent: false },
  { name: "favicon-32.png", w: 32, h: 32, svg: badge(true), transparent: false },
  { name: "favicon-16.png", w: 16, h: 16, svg: badge(true), transparent: false },
  { name: "favicon.ico", w: 48, h: 48, svg: badge(true), transparent: false },
  { name: "logo-badge-512.png", w: 512, h: 512, svg: badge(false), transparent: true },
  { name: "logo-mark-transparent.png", w: 600, h: 520, svg: mark, transparent: true },
  { name: "logo-wordmark-transparent.png", w: 1040, h: 300, svg: wordmark, transparent: true },
  { name: "logo-lockup-transparent.png", w: 1280, h: 300, svg: lockup, transparent: true },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
for (const a of assets) {
  const page = await browser.newPage();
  await page.setViewport({ width: a.w, height: a.h, deviceScaleFactor: 2 });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">
     <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap" rel="stylesheet">
     <style>*{margin:0;padding:0}html,body{width:${a.w}px;height:${a.h}px}#t{width:${a.w}px;height:${a.h}px}</style></head>
     <body><div id="t">${a.svg}</div></body></html>`,
    { waitUntil: "networkidle0" });
  try { await page.evaluate(async () => { await document.fonts.load("700 80px Oswald"); await document.fonts.ready; }); } catch {}
  const el = await page.$("#t");
  await el.screenshot({ path: path.join(OUT, a.name), omitBackground: a.transparent });
  console.log("ok", a.name);
  await page.close();
}
await browser.close();
console.log("DONE");
