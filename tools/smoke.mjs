// Headless smoke test: loads the game, captures JS errors, takes screenshots.
// Usage: node tools/smoke.mjs [url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const url = process.argv[2] || 'http://localhost:8123';
const out = here('./shots/');
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER || '/usr/bin/brave-browser',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720', `--user-data-dir=${here('./.profile')}`],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: out + '01-select.png' });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
