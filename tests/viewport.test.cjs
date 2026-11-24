const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

// Optional real-browser coverage; the engine/UI tests remain dependency-free.
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const sizes = [
  [1440, 900, false], [1366, 768, false], [1024, 600, false],
  [768, 1024, true], [390, 844, true], [375, 667, true],
  [320, 568, true], [844, 390, true],
];

test('playing fits the viewport without document scrollbars', { skip: !chromium && 'Install Playwright to run browser layout checks' }, async (t) => {
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    headless: true,
  });
  try {
    for (const [width, height, touch] of sizes) {
      for (const selection of ['2', 'ai']) {
        await t.test(`${width}×${height}${touch ? ' touch' : ''} · ${selection === 'ai' ? 'AI Arena' : 'local versus'}`, async () => {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
          try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
            await page.locator('#playerInput').fill('Alex');
            await page.locator('#settingsSummary').click();
            const skin = selection === 'ai' ? 'ember' : 'neon';
            await page.locator('#skinSelect').selectOption(skin);
            if (selection === 'ai') {
              await page.locator('#playersSelect').selectOption('ai');
              await page.locator('#foodSelect').selectOption('10');
            }
            await page.keyboard.press('Escape');
            await page.locator('#playButton').click();
            assert.equal(await page.locator('#board').getAttribute('data-skin'), skin);
            const immersiveFits = await page.locator('#board').evaluate((canvas) => canvas.clientHeight >= 160 && canvas.clientWidth >= 260);
            assert.equal(await page.locator('#board').getAttribute('data-view'), selection === 'ai' && immersiveFits ? 'follow' : 'overview');
            if (selection === 'ai') {
              assert.equal(await page.locator('#opponentScoreLabel').textContent(), 'AI LEFT');
              assert.equal(await page.locator('#preyName').textContent(), '10 items');
              assert.equal(await page.locator('#playerTwoControls').isVisible(), false);
            }
            assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
            assert.equal(await page.locator('#snakeFriends').isVisible(), true);
            assert.equal(await page.locator('#snakeFriends').evaluate((element) => Boolean(element.closest('#gameSettings'))), false);
            assert.equal(await page.locator('#snakeFriends .snake-fan img').count(), 3);
            const layout = await page.evaluate(() => {
              const fits = (selector) => {
                const rect = document.querySelector(selector).getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
              };
              return {
                overflow: getComputedStyle(document.documentElement).overflow,
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                board: fits('#board'),
                scoreboard: fits('.scoreboard'),
                actions: fits('.game-actions'),
                crowd: fits('.friend-crowd') && [...document.querySelectorAll('.snake-fan img')].every((image) => {
                  const rect = image.getBoundingClientRect();
                  return rect.width >= 28 && rect.height > 0 && rect.bottom <= innerHeight;
                }),
                touch: matchMedia('(pointer: coarse)').matches ? fits('.touch-area') : true,
              };
            });
            assert.equal(layout.overflow, 'hidden');
            assert.ok(layout.width <= layout.viewportWidth, 'no horizontal overflow');
            assert.ok(layout.height <= layout.viewportHeight, 'no vertical overflow');
            for (const key of ['board', 'scoreboard', 'actions', 'crowd', 'touch']) assert.ok(layout[key], `${key} fits`);
            await page.mouse.wheel(0, 500);
            assert.equal(await page.evaluate(() => scrollY), 0);
            await page.locator('#settingsSummary').click();
            await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'paused');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#gameSettings').getAttribute('open'), null);
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        });
      }
    }
    for (const [width, height, touch] of [[1280, 800, false], [375, 667, true]]) {
      await t.test(`skin rendering, paused changes and reload · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          const previews = new Set();
          const boards = new Set();
          for (const skin of ['classic', 'neon', 'ember', 'frost']) {
            await page.locator('#skinSelect').selectOption(skin);
            assert.equal(await page.locator('#skinPreview').getAttribute('data-skin'), skin);
            previews.add(await page.locator('#skinPreview').evaluate((canvas) => canvas.toDataURL()));
            boards.add(await page.locator('#board').evaluate((canvas) => canvas.toDataURL()));
          }
          assert.equal(previews.size, 4, 'each skin has distinct preview pixels');
          assert.equal(boards.size, 4, 'each skin changes the actual board rendering');
          await page.keyboard.press('Escape');
          await page.locator('#playButton').click();
          await page.locator('#pauseButton').click();
          const score = await page.locator('#score').textContent();
          await page.locator('#settingsSummary').click();
          await page.locator('#skinSelect').selectOption('ember');
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
          assert.equal(await page.locator('#board').getAttribute('data-skin'), 'ember');
          assert.equal(await page.locator('#score').textContent(), score);
          await page.reload();
          assert.equal(await page.locator('#skinSelect').inputValue(), 'ember');
          assert.equal(await page.locator('#board').getAttribute('data-skin'), 'ember');
          assert.equal(await page.locator('#skinPreview').getAttribute('data-skin'), 'ember');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });
    }
    for (const [width, height] of [[1366, 768], [320, 568]]) {
      await t.test(`three visible friends cheer on an actual catch · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await context.newPage();
          // In Classic solo, this seed places primary prey immediately ahead of the spawn.
          await page.addInitScript(() => { Math.random = () => 250.5 / 477; });
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption('classic');
          await page.keyboard.press('Escape');
          await page.locator('#playButton').click();
          await page.waitForFunction(() => document.getElementById('snakeFriends').dataset.cheering === 'true');
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
          assert.match(await page.locator('#friendMessage').textContent(), /Nice catch, Alex/);
          for (const fan of await page.locator('.snake-fan').all()) {
            assert.equal(await fan.isVisible(), true);
            assert.equal(await fan.evaluate((element) => getComputedStyle(element).animationName), 'friend-bounce');
            assert.equal(await fan.locator('.fan-hands').evaluate((element) => getComputedStyle(element).animationName), 'friend-clap');
          }
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(await page.locator('.snake-fan').first().evaluate((element) => getComputedStyle(element).animationName), 'none');
          await page.locator('#pauseButton').click();
          assert.equal(await page.locator('#snakeFriends').getAttribute('data-cheering'), 'false');
          assert.equal(await page.locator('#snakeFriends').isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
        } finally {
          await context.close();
        }
      });
    }
    for (const [width, height] of [[1366, 768], [320, 568]]) {
      await t.test(`mushroom inversion and delayed herb recovery · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() => { Math.random = () => 0; });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption('classic');
          await page.keyboard.press('Escape');
          // Test-only placement/observation: no production test hooks or altered input rules.
          await page.evaluate(() => {
            const tick = SnakeGame.prototype.tick;
            let first = true;
            SnakeGame.prototype.tick = function () {
              if (first) {
                this.food = { x: 0, y: 0 };
                this.extraFoods = [];
                this.mushrooms = [this.nextHead(this.players[0])];
                this.goldenDelay = 10000;
                first = false;
              }
              if (window.__collectHerb) {
                this.herbs = [this.nextHead(this.players[0])];
                window.__collectHerb = false;
              }
              const previous = { ...this.players[0].snake[0] };
              const result = tick.call(this);
              window.__effectSnapshot = {
                previous, head: { ...this.players[0].snake[0] }, direction: this.players[0].direction,
                reversed: this.players[0].controlsReversed, wait: this.herbWaitMs(this.players[0]),
                elapsed: this.elapsedMs, herbCount: this.herbs.length,
              };
              return result;
            };
          });
          await page.locator('#playButton').click();
          await page.waitForFunction(() => window.__effectSnapshot?.reversed);
          assert.equal(await page.locator('#score').textContent(), '50');
          assert.equal(await page.locator('#controlStatus').isVisible(), true);
          assert.match(await page.locator('#controlStatus').textContent(), /REVERSED/);
          assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
          await page.keyboard.press('ArrowDown');
          await page.waitForFunction(() => window.__effectSnapshot.direction === 'up');
          const inverted = await page.evaluate(() => window.__effectSnapshot);
          assert.equal(inverted.head.y, (inverted.previous.y + 19) % 20, 'Down actually moves up');
          await page.locator('#pauseButton').click();
          const paused = await page.evaluate(() => window.__effectSnapshot.elapsed);
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => window.__effectSnapshot.elapsed), paused);
          await page.locator('#playButton').click();
          await page.waitForFunction(() => window.__effectSnapshot.herbCount > 0, null, { timeout: 10000 });
          assert.match(await page.locator('#controlStatus').textContent(), /herb ready/);
          await page.evaluate(() => { window.__collectHerb = true; });
          await page.waitForFunction(() => !window.__effectSnapshot.reversed);
          assert.equal(await page.locator('#score').textContent(), '50');
          assert.equal(await page.locator('#controlStatus').isVisible(), false);
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(() => window.__effectSnapshot.direction === 'right');
          const cured = await page.evaluate(() => window.__effectSnapshot);
          assert.equal(cured.head.x, (cured.previous.x + 1) % 24, 'Right moves right after recovery');
          assert.equal(await page.locator('#snakeFriends').isVisible(), true);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });
    }
    await t.test('camera switching, paused pixels and saved view work in the orbital theme', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        await page.locator('#playerInput').fill('Alex');
        await page.locator('#settingsSummary').click();
        assert.equal(await page.locator('#viewSelect').isDisabled(), true);
        await page.locator('#playersSelect').selectOption('1');
        await page.locator('#viewSelect').selectOption('follow');
        await page.keyboard.press('Escape');
        await page.locator('#playButton').click();
        assert.equal(await page.locator('#board').getAttribute('data-view'), 'follow');
        await page.locator('#pauseButton').click();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const frozen = await page.locator('#board').evaluate((canvas) => canvas.toDataURL());
        await page.waitForTimeout(150);
        assert.equal(await page.locator('#board').evaluate((canvas) => canvas.toDataURL()), frozen);
        await page.locator('#settingsSummary').click();
        await page.locator('#viewSelect').selectOption('overview');
        assert.equal(await page.locator('#board').getAttribute('data-view'), 'overview');
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
        await page.reload();
        assert.equal(await page.locator('#viewSelect').inputValue(), 'overview');
        assert.equal(await page.locator('#board').getAttribute('data-view'), 'overview');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await t.test('native fullscreen enters and exits without page overflow', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        await page.locator('#playerInput').fill('Alex');
        await page.locator('#playButton').click();
        await page.locator('#fullscreenButton').click();
        await page.waitForFunction(() => Boolean(document.fullscreenElement) && document.getElementById('fullscreenButton').getAttribute('aria-pressed') === 'true');
        assert.equal(await page.locator('#fullscreenButton').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement && document.getElementById('fullscreenButton').getAttribute('aria-pressed') === 'false');
        assert.equal(await page.locator('#fullscreenButton').getAttribute('aria-pressed'), 'false');
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
  }
});
