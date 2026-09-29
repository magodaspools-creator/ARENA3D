// Automated playthrough in headless Brave/Chromium. Drives the real game
// through the whole Area 1 loop, checks state at each step, saves screenshots.
// Usage: node tools/playtest.mjs [vocation] [url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const voc = process.argv[2] || 'knight';
const url = process.argv[3] || 'http://localhost:8123';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = (name) => page.screenshot({ path: `${out}${voc}-${name}.png` });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };
const tp = (x, z) => ev((x, z) => { const p = game.player; p.pos.set(x, 0, z); game.rig.snap(p.pos); }, x, z);
const godmode = () => ev(() => { const p = game.player; p.hp = p.maxHp; });
const state = () => ev(() => ({
  stage: game.area.progression.id, state: game.state, hp: game.player?.hp, pos: game.player && [game.player.pos.x, game.player.pos.z],
  kills: game.stats.kills, boss: game.area.boss.state, bossHp: game.area.boss.hp, fps: game.fps,
}));
async function press(key, ms = 80) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }

/** Holds Space (auto-target attack) near a group until it is dead. */
async function clearGroup(group, x, z, timeout = 60000) {
  await tp(x, z);
  const t0 = Date.now();
  await page.keyboard.down('Space');
  while (Date.now() - t0 < timeout) {
    await godmode();
    const left = await ev((g) => game.enemies.filter((e) => e.alive && e.group === g).map((e) => [e.pos.x, e.pos.z]), group);
    if (!left.length) break;
    const [ex, ez] = left[0];
    // stay close to the nearest enemy of the group
    await ev((ex, ez) => { const p = game.player.pos; const dx = ex - p.x, dz = ez - p.z, d = Math.hypot(dx, dz); if (d > 2.2) { game.collision.move(p, dx / d * (d - 1.8), dz / d * (d - 1.8), 0.45); } }, ex, ez);
    await sleep(250);
  }
  await page.keyboard.up('Space');
  return ev((g) => game.enemies.filter((e) => e.alive && e.group === g).length, group);
}

await page.goto(url, { waitUntil: 'load' });
await sleep(3500);
await ev(() => { let n = 0, t = performance.now(); const f = () => { n++; if (performance.now() - t > 1000) { game.fps = n; n = 0; t = performance.now(); } requestAnimationFrame(f); }; f(); });
await page.click(`.voc[data-id="${voc}"]`);
await sleep(1200);
await shot('01-select');
check(await ev(() => !!game.player && game.state === 'select'), 'select screen shows a preview character');

await page.click('#start-btn');
await sleep(1500);
check((await state()).state === 'play', 'game started');
const hpAtStart = await ev(() => game.player.hp);
await ev(() => { game.player.hp = Math.max(1, Math.floor(game.player.maxHp * 0.5)); });
await sleep(6500);
check(await ev((before) => Math.abs(game.player.hp - before) < 0.01, hpAtStart), 'player does not regenerate HP while idle');
await ev(() => { game.player.hp = hpAtStart; });
await shot('02-start');

// movement
const p0 = (await state()).pos;
await page.mouse.move(640, 200);
await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
const p1 = (await state()).pos;
check(p1[1] < p0[1] - 1, `W moves the player north (z ${p0[1].toFixed(1)} → ${p1[1].toFixed(1)})`);
await page.keyboard.down('KeyD'); await sleep(700); await page.keyboard.up('KeyD');
check((await state()).pos[0] > p1[0] + 0.5, 'D moves the player east');

// collision: walk into a tree / the world edge
await tp(-9, 42);
await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
let s = await state();
check(Math.hypot(s.pos[0] + 9, s.pos[1] - 40) > 0.9, `tree at (-9,40) blocks the player (pos ${s.pos.map((v) => v.toFixed(2))})`);
await tp(12, 30);
await page.keyboard.down('KeyD'); await sleep(2000); await page.keyboard.up('KeyD');
s = await state();
check(s.pos[0] <= 14, `world edge blocks the player (x=${s.pos[0].toFixed(2)})`);

// NPC
await tp(-3.2, 33.5);
await sleep(600);
check(await ev(() => game.ui.prompt.visible), 'interaction prompt appears near the NPC');
await shot('03-npc-prompt');
await press('KeyE');
await sleep(1200);
check(await ev(() => game.ui.bubble.visible), 'dialogue bubble opens');
await shot('04-npc-dialog');
for (let i = 0; i < 12 && (await state()).stage === 'arrive'; i++) { await press('KeyE'); await sleep(500); }
check((await state()).stage === 'braziers', 'talking to the NPC gives the Watchfire objective');

// healer service: buy a portable healing potion, reject insufficient gold, and reject a full inventory
await tp(4.8, 35.2);
await sleep(500);
await press('KeyE');
await sleep(900);
for (let i = 0; i < 3; i++) { await press('KeyE'); await sleep(500); }
check(await ev(() => game.character.gold === 0 && game.character.getItemCount('red_potion') === 0), 'healer does not sell a potion when the player cannot pay');
await ev(() => game.character.addGold(20));
await press('KeyE');
await sleep(900);
for (let i = 0; i < 3; i++) { await press('KeyE'); await sleep(500); }
const potionResult = await ev(() => ({ gold: game.character.gold, potions: game.character.getItemCount('red_potion') }));
check(potionResult.potions === 1, 'healer sells one portable healing potion');
check(potionResult.gold === 0, 'healer charges exactly 20 gold for the potion');
await ev(() => { game.character.addGold(20); game.character.addItem('red_potion', 19, 20); });
await press('KeyE');
await sleep(900);
for (let i = 0; i < 3; i++) { await press('KeyE'); await sleep(500); }
check(await ev(() => game.character.getItemCount('red_potion') === 20 && game.character.gold === 20), 'healer fills the existing potion stack without spending extra gold');
await shot('05-healer');

// rune stone clue
await tp(9, 22.2);
await sleep(400);
await press('KeyE');
await sleep(900);
check(await ev(() => game.dialogue.active?.name === 'Pedra Rúnica'), 'rune stone can be read');
await shot('05-runestone');
await tp(1, 23); await sleep(300);

// brazier refuses while enemies are near
await tp(-13.5, 2.5);
await sleep(300);
await press('KeyE');
await sleep(300);
check(!(await ev(() => game.area.braziers[0].lit)), 'brazier refuses to light with enemies nearby');

// combat
await tp(1, 23);
await sleep(300);
const hollowHp0 = await ev(() => game.enemies.find((e) => e.group === 'path').hp);
let left = await clearGroup('path', 1, 20);
check(left === 0, 'path Hollows defeated');
await shot('06-combat');
for (const [g, x, z] of [['west', -12, 3], ['east', 12, 3], ['north', 0, -7]]) {
  left = await clearGroup(g, x, z);
  check(left === 0, `${g} group defeated`);
}
s = await state();
check(s.kills === 10, `kill count = ${s.kills}`);
check(hollowHp0 > 0, 'enemies had HP before dying');

// light braziers
for (let i = 0; i < 3; i++) {
  const [bx, bz] = await ev((i) => [game.area.braziers[i].pos.x, game.area.braziers[i].pos.z], i);
  await tp(bx + 1.8, bz + 0.5);
  await sleep(400);
  await press('KeyE');
  await sleep(700);
  if (i === 0) await shot('07-brazier-lit');
}
check(await ev(() => game.area.braziers.every((b) => b.lit)), 'all 3 braziers lit');
check((await state()).stage === 'shrine', 'stage → shrine');
await sleep(1600);
await shot('08-gate-opening');
await sleep(3500);
check(await ev(() => game.area.gate.openT >= 1), 'gate fully opened');

// enter arena
await tp(0, -24);
await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
s = await state();
check(s.stage === 'boss' && s.boss !== 'dormant', `boss fight starts on entering the arena (${s.boss})`);
await sleep(2500);
await shot('09-boss-intro');

// boss fight — fight for real for a while, then speed up
await page.keyboard.down('Space');
const t0 = Date.now();
let sawTelegraph = false, sawEnrage = false;
while (Date.now() - t0 < 150000) {
  await godmode();
  const b = await ev(() => { const b = game.area.boss; return { st: b.state, hp: b.hp, alive: b.alive, x: b.pos.x, z: b.pos.z, phase: b.phase, tele: game.fx.items.length }; });
  if (!b.alive) break;
  if (b.st === 'cleave' || b.st === 'slam') { if (!sawTelegraph) { sawTelegraph = true; await shot('10-boss-telegraph'); } }
  if (b.phase === 2 && !sawEnrage) { sawEnrage = true; await sleep(800); await shot('11-boss-enraged'); }
  // stay near the boss
  await ev((bx, bz) => { const p = game.player.pos; const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz); if (d > 3.5) game.collision.move(p, dx / d * (d - 3), dz / d * (d - 3), 0.45); }, b.x, b.z);
  if (Date.now() - t0 > 45000) await ev(() => { const b = game.area.boss; if (b.targetable) b.takeDamage(60, game.player.pos, false); });
  await sleep(300);
}
await page.keyboard.up('Space');
s = await state();
check(sawTelegraph, 'boss used telegraphed attacks');
check(sawEnrage, 'boss entered phase 2');
check(s.boss === 'dead', 'boss defeated');
check(s.stage === 'portal', 'stage → portal');
await sleep(2000);
await shot('12-victory');
check(await ev(() => +localStorage.getItem('arena.proto.bossKills') >= 1), 'boss defeat registered in localStorage');
await sleep(6000);
check(await ev(() => game.area.portal.active), 'exit portal active');
await shot('13-portal');
const [px, pz] = await ev(() => [game.area.portal.pos.x, game.area.portal.pos.z]);
await tp(px, pz + 4);
await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
await sleep(2500);
s = await state();
check(s.state === 'complete' && s.stage === 'complete', 'entering the portal completes the area');
await shot('14-complete');

console.log(`fps (swiftshader): ${s.fps}`);
console.log(errors.length ? 'JS ERRORS:\n' + [...new Set(errors)].join('\n') : 'no JS errors');
console.log(failed ? `${failed} check(s) FAILED` : 'ALL CHECKS PASSED');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
