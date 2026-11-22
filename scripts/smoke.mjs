import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.SMOKE_URL ?? 'http://localhost:3000';
const screenshotDir = process.env.SCREENSHOT_DIR ?? 'screenshots';
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
  executablePath: process.env.CHROME_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function expectText(locator, expected) {
  assert.match(await locator.innerText(), expected);
}

async function expectScene(page) {
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('Loading 3D scene').waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await page.getByText('3D viewer unavailable').count(), 0);
}

async function save(page, name) {
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true, animations: 'disabled' });
}

async function expectIdleScene(page) {
  const count = () => page.evaluate(() => window.demoDrawCalls);
  const before = await count();
  assert.ok(before > 0, 'The WebGL canvas should have rendered geometry');
  await page.waitForTimeout(260);
  assert.equal(await count(), before, 'An idle scene should stop issuing WebGL draw calls');
}

async function raycastAvailableSeat(page, occupied) {
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  for (let row = .45; row < .78; row += .05) {
    for (let column = .31; column < .70; column += .045) {
      const x = bounds.x + bounds.width * column;
      const y = bounds.y + bounds.height * row;
      await page.mouse.move(x, y);
      await page.waitForTimeout(45);
      const badge = page.locator('[data-seat-preview]');
      const id = await badge.count() ? await badge.getAttribute('data-seat-preview') : null;
      if (id && !occupied.includes(id)) {
        await page.mouse.click(x, y);
        return id;
      }
    }
  }
  throw new Error('No selectable seat was hit by the browser raycast');
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  await desktop.addInitScript(() => {
    window.demoDrawCalls = 0;
    const renderer = WebGL2RenderingContext.prototype;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = renderer[name];
      renderer[name] = function (...args) {
        window.demoDrawCalls += 1;
        return original.apply(this, args);
      };
    }
  });
  desktop.on('pageerror', (error) => errors.push(error.message));
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await desktop.goto(origin);
  await expectScene(desktop);
  await desktop.waitForTimeout(850);
  await expectIdleScene(desktop);
  await save(desktop, 'aircraft-desktop');

  const canvas = desktop.locator('canvas');
  const before = await canvas.screenshot();
  const { x, y, width, height } = await canvas.boundingBox();
  await desktop.mouse.move(x + width * .54, y + height * .52);
  await desktop.mouse.down();
  await desktop.mouse.move(x + width * .64, y + height * .60, { steps: 10 });
  await desktop.mouse.up();
  await desktop.waitForTimeout(350);
  assert.notDeepEqual(await canvas.screenshot(), before, 'Pointer drag should rotate the aircraft');
  const rotated = await canvas.screenshot();
  await desktop.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await desktop.waitForTimeout(600);
  assert.notDeepEqual(await canvas.screenshot(), rotated, 'Zoom should change framing');
  await desktop.getByRole('button', { name: 'Reset camera' }).click();

  const { occupiedIds } = await (await desktop.request.get(`${origin}/api/demo`)).json();
  await desktop.getByRole('button', { name: 'Explore the cabin' }).click();
  await desktop.getByRole('heading', { name: 'Choose a seat.' }).waitFor();
  await desktop.mouse.move(10, 10);
  await desktop.waitForTimeout(2200);
  await expectIdleScene(desktop);
  await save(desktop, 'cabin-desktop');
  const id = await raycastAvailableSeat(desktop, occupiedIds);
  await desktop.getByRole('heading', { name: `Seat ${id}`, exact: true }).waitFor();
  await desktop.mouse.move(12, 12);
  await desktop.waitForTimeout(1200);
  await save(desktop, 'seat-detail');
  const selectedView = await canvas.screenshot();
  await desktop.getByRole('button', { name: 'Seat view', exact: true }).click();
  await desktop.waitForTimeout(1750);
  assert.notDeepEqual(await canvas.screenshot(), selectedView, 'Seat view should move the camera to eye level');
  await save(desktop, 'seat-view');

  await desktop.getByRole('button', { name: 'Seat map', exact: true }).click();
  assert.equal(await desktop.locator(`[data-seat="${id}"]`).getAttribute('aria-pressed'), 'true');
  const occupied = desktop.locator('[data-seat="1K"]');
  assert.equal(await occupied.getAttribute('aria-disabled'), 'true');
  await occupied.focus();
  await occupied.press('Enter');
  await desktop.getByRole('heading', { name: `Seat ${id}`, exact: true }).waitFor();
  const choices = ['12A', '12C', '12E', '12G', '12H'].filter((seat) => !occupiedIds.includes(seat));
  assert.ok(choices.length, 'Use an isolated demo data directory for the smoke test');
  const choice = choices[0];
  await desktop.locator('[data-seat="11A"]').focus();
  await desktop.keyboard.press('ArrowDown');
  assert.equal(await desktop.evaluate(() => document.activeElement.dataset.seat), '12A');
  await desktop.locator(`[data-seat="${choice}"]`).focus();
  await desktop.keyboard.press('Enter');
  await desktop.getByRole('heading', { name: `Seat ${choice}`, exact: true }).waitFor();
  await save(desktop, 'seat-map');
  await desktop.getByRole('button', { name: '3D View', exact: true }).click();
  await desktop.locator(`[data-seat-preview="${choice}"]`).waitFor();
  await desktop.getByRole('button', { name: 'Seat map', exact: true }).click();

  await desktop.getByRole('button', { name: 'Continue to checkout' }).click();
  const checkout = desktop.getByRole('dialog', { name: 'Demo checkout' });
  await checkout.waitFor();
  await expectText(checkout, /USD/);
  await save(desktop, 'checkout');
  await checkout.getByRole('button', { name: 'Confirm demo booking' }).click();
  const receipt = desktop.getByRole('dialog', { name: 'Booking confirmation' });
  await receipt.waitFor();
  await expectText(receipt, /AF-[A-F0-9]{12}/);
  await save(desktop, 'receipt');
  const reference = await desktop.evaluate(() => localStorage.getItem('aeriform-reference'));
  assert.ok(reference);
  await receipt.getByRole('button', { name: 'Back to experience' }).click();
  assert.equal(await desktop.locator(`[data-seat="${choice}"]`).getAttribute('aria-disabled'), 'true');
  await desktop.reload();
  await desktop.getByRole('button', { name: 'View demo receipt' }).click();
  await expectText(receipt, new RegExp(reference));
  assert.deepEqual(errors, [], 'No browser console or runtime errors in the desktop journey');
  console.log(`Desktop camera controls, idle rendering, raycast (${id}), keyboard map, checkout (${choice}), and receipt reload passed.`);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.goto(origin);
  await expectScene(mobile);
  await save(mobile, 'aircraft-mobile');
  await mobile.getByRole('button', { name: 'Seat map', exact: true }).tap();
  await mobile.locator('[data-seat="1A"]').tap();
  await mobile.getByRole('heading', { name: 'Seat 1A', exact: true }).waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await save(mobile, 'seat-map-mobile');
  await mobile.setViewportSize({ width: 320, height: 740 });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('Mobile touch seat map, reduced motion, and layout passed.');

  const candidate = ['19A', '19B', '19C', '19D', '19E'].find((seat) => !occupiedIds.includes(seat));
  assert.ok(candidate);
  const requests = await Promise.all([randomUUID(), randomUUID()].map(async (requestId) => ({
    requestId,
    response: await desktop.request.post(`${origin}/api/demo`, { data: { seatId: candidate, requestId } }),
  })));
  assert.deepEqual(requests.map(({ response }) => response.status()).sort(), [201, 409]);
  const winner = requests.find(({ response }) => response.status() === 201);
  const retry = await desktop.request.post(`${origin}/api/demo`, { data: { seatId: candidate, requestId: winner.requestId } });
  assert.equal(retry.status(), 200);
  assert.deepEqual(await retry.json(), await winner.response.json());
  console.log('Concurrent claims and idempotent retry passed.');

  const fallback = await browser.newPage();
  await fallback.route('**/models/aeriform-widebody.glb', (route) => route.abort());
  await fallback.goto(origin);
  await fallback.getByText('3D viewer unavailable').waitFor();
  await fallback.getByRole('button', { name: 'Open seat map', exact: true }).click();
  await fallback.locator('[data-seat="1A"]').click();
  await fallback.getByRole('heading', { name: 'Seat 1A', exact: true }).waitFor();
  await fallback.unroute('**/models/aeriform-widebody.glb');
  await fallback.getByRole('button', { name: '3D View', exact: true }).click();
  await fallback.getByRole('button', { name: 'Retry 3D', exact: true }).click();
  await expectScene(fallback);
  console.log('Failed GLB load preserved the 2D booking path and retry recovered the viewer.');

  const noWebGL = await browser.newPage();
  await noWebGL.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      return type.includes('webgl') ? null : getContext.call(this, type, ...options);
    };
  });
  await noWebGL.goto(origin);
  await noWebGL.getByText('3D viewer unavailable').waitFor();
  await noWebGL.getByRole('button', { name: 'Explore the cabin' }).click();
  await noWebGL.locator('[data-seat="1A"]').click();
  await noWebGL.getByRole('heading', { name: 'Seat 1A', exact: true }).waitFor();
  console.log('The seat map remained usable with WebGL disabled.');
} finally {
  await browser.close();
}
