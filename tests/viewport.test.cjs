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
  } finally {
    await browser.close();
  }
});
