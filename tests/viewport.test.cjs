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

async function createTestPage(context) {
  const page = await context.newPage();
  await page.clock.install();
  return page;
}

async function startPlaying(page) {
  await page.locator('#playButton').click();
  if (await page.locator('.game-shell').getAttribute('data-state') === 'countdown') await page.clock.runFor(3600);
  await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'playing');
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
            const page = await createTestPage(context);
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
            assert.equal(await page.locator('#homeIntro').isVisible(), true);
            const homeFits = await page.locator('#playButton').evaluate((button) => {
              const rect = button.getBoundingClientRect();
              return rect.top >= 0 && rect.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight;
            });
            assert.equal(homeFits, true, 'home Play button is visible without scrolling');
            await page.locator('#playerInput').fill('Alex');
            await page.locator('#homeSettings').click();
            await page.getByText('Appearance', { exact: true }).click();
            const skin = selection === 'ai' ? 'ember' : 'neon';
            await page.locator('#skinSelect').selectOption(skin);
            if (selection === 'ai') {
              await page.locator('#playersSelect').selectOption('ai');
              await page.getByText('More options', { exact: true }).click();
              await page.locator('#foodSelect').selectOption('10');
            }
            await page.keyboard.press('Escape');
            await startPlaying(page);
            assert.equal(await page.locator('#board').getAttribute('data-skin'), skin);
            assert.equal(await page.locator('#board').getAttribute('data-layout'), '2d');
            assert.equal(await page.locator('#viewSelect').count(), 0);
            assert.equal(await page.locator('#mushroomStatus').isVisible(), false);
            if (selection === 'ai') {
              assert.equal(await page.locator('#opponentScoreLabel').textContent(), 'AI LEFT');
              assert.equal(await page.locator('#preyName').textContent(), '10 items');
              assert.equal(await page.locator('#playerTwoControls').isVisible(), false);
            }
            assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
            assert.equal(await page.locator('#snakeFriends').isVisible(), true);
            assert.equal(await page.locator('#snakeFriends').evaluate((element) => Boolean(element.closest('#gameSettings'))), false);
            assert.equal(await page.locator('#snakeFriends .snake-fan img').count(), 3);
            assert.equal(await page.locator('#snakeFriends').evaluate((element) => Boolean(element.closest('.scoreboard'))), true);
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
                crowdAtTop: document.querySelector('#snakeFriends').getBoundingClientRect().bottom <= document.querySelector('#board').getBoundingClientRect().top,
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
            for (const key of ['board', 'scoreboard', 'actions', 'crowd', 'crowdAtTop', 'touch']) assert.ok(layout[key], `${key} fits`);
            await page.mouse.wheel(0, 500);
            assert.equal(await page.evaluate(() => scrollY), 0);
            await page.locator('#settingsSummary').click();
            await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'paused');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#gameSettings').getAttribute('open'), null);
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
            await page.evaluate(() => {
              const tick = SnakeGame.prototype.tick;
              SnakeGame.prototype.tick = function () {
                this.obstacles.push({ ...this.nextHead(this.players[0]), type: 'wall' });
                return tick.call(this);
              };
            });
            await startPlaying(page);
            await page.clock.runFor(1000);
            assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'over');
            assert.equal(await page.locator('#roundResults').isVisible(), true);
            assert.equal(await page.locator('#playerEntry').isVisible(), false);
            const resultsFit = await page.evaluate(() => {
              const fits = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; };
              return { play: fits('playButton'), home: fits('resultHome'), cards: fits('roundResults'), noScroll: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight };
            });
            assert.deepEqual(resultsFit, { play: true, home: true, cards: true, noScroll: true });
            await page.locator('#resultHome').click();
            assert.equal(await page.locator('#homeIntro').isVisible(), true);
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
          const page = await createTestPage(context);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          await page.getByText('Appearance', { exact: true }).click();
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
          await startPlaying(page);
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
          const page = await createTestPage(context);
          // In Classic solo, this seed places primary prey immediately ahead of the spawn.
          await page.addInitScript(() => { Math.random = () => 250.5 / 477; });
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption('classic');
          await page.keyboard.press('Escape');
          await startPlaying(page);
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
          const page = await createTestPage(context);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() => { Math.random = () => 0; });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#settingsSummary').click();
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption('classic');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#mushroomStatus').getAttribute('hidden'), null);
          assert.match(await page.locator('#mushroomStatus').textContent(), /4/);
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
          await startPlaying(page);
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
          await startPlaying(page);
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
    for (const [width, height] of [[1280, 800], [320, 568]]) {
      await t.test(`combo rewards, shield clarity and round medals · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await createTestPage(context);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() => { Math.random = () => 0; });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.evaluate(() => {
            const reset = SnakeGame.prototype.reset;
            const tick = SnakeGame.prototype.tick;
            SnakeGame.prototype.reset = function (options) { const result = reset.call(this, options); this.mushroomCount = 0; this.mushrooms = []; window.rewardTestEngine = this; return result; };
            SnakeGame.prototype.tick = function () {
              const plan = window.rewardPickup;
              if (plan) {
                window.rewardPickup = null;
                const player = this.players[0];
                const head = this.nextHead(player, player.turns[0] || player.direction);
                this.food = { x: 0, y: 0, type: 'rat' }; this.extraFoods = []; this.mushrooms = []; this.herbs = []; this.powerups = []; this.nextPowerupAt = Infinity;
                if (['rat', 'rabbit', 'frog'].includes(plan)) this.food = { ...head, type: plan };
                if (plan === 'shield') this.powerups = [{ ...head, type: 'shield', expiresAt: this.elapsedMs + 10000 }];
                if (plan === 'block' || plan === 'fatal') this.obstacles.push({ ...head, type: 'wall' });
                if (plan === 'mushroom') this.mushrooms = [head];
                if (plan === 'herb') { player.herbReadyAt = this.elapsedMs; this.herbs = [head]; }
              }
              const result = tick.call(this);
              if (plan === 'block') this.turn('up', 0); // Leave the stopped hazard on the next legal tick.
              return result;
            };
          });
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#homeSettings').click();
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption('classic');
          await page.keyboard.press('Escape');
          await startPlaying(page);
          const collect = async (type) => { await page.evaluate((pickup) => { window.rewardPickup = pickup; }, type); await page.clock.runFor(600); };
          for (const type of ['rat', 'rabbit', 'frog']) await collect(type);
          assert.equal(await page.locator('#score').textContent(), '04');
          assert.equal(await page.locator('#comboStatus').isVisible(), true);
          assert.match(await page.locator('#eventNotice').textContent(), /combo bonus.*goal complete/);
          await collect('shield'); await collect('block');
          assert.match(await page.locator('#eventNotice').textContent(), /shield saved you.*turn now/);
          await collect('mushroom');
          assert.equal(await page.locator('#playerOneControls').getAttribute('data-reversed'), 'true');
          assert.match(await page.locator('#playerOneControls button[data-direction="left"]').getAttribute('aria-label'), /moves right.*reversed/);
          await collect('herb');
          assert.equal(await page.locator('#playerOneControls').getAttribute('data-reversed'), 'false');
          await collect('fatal');
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'over');
          assert.equal(await page.locator('#result0Score').textContent(), '54');
          assert.equal(await page.locator('#result0Animals').textContent(), '3');
          assert.match(await page.locator('#result0Medals').textContent(), /Balanced diet.*Shield save.*Catch rhythm.*New record/);
          assert.equal(await page.locator('#resultHome').isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    for (const [width, height] of [[1280, 800], [375, 667]]) {
      await t.test(`home, real countdown, rematch and paused countdown · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await createTestPage(context);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          assert.equal(await page.locator('#homeIntro').isVisible(), true);
          await page.evaluate(() => {
            const reset = SnakeGame.prototype.reset;
            SnakeGame.prototype.reset = function (options) {
              const result = reset.call(this, options);
              window.homeTestEngine = this;
              return result;
            };
          });
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#playButton').click();
          await page.clock.runFor(100);
          const snakes = await page.evaluate(() => JSON.stringify(window.homeTestEngine.players.map((player) => player.snake)));
          assert.equal(await page.locator('#countdownNumber').textContent(), '1');
          for (const word of ['2', '3', 'GO!']) {
            await page.clock.runFor(1000);
            assert.equal(await page.locator('#countdownNumber').textContent(), word);
            assert.equal(await page.evaluate(() => window.homeTestEngine.elapsedMs), 0);
            assert.equal(await page.evaluate(() => JSON.stringify(window.homeTestEngine.players.map((player) => player.snake))), snakes);
          }
          await page.clock.runFor(1100);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
          assert.ok(await page.evaluate(() => window.homeTestEngine.elapsedMs > 0));
          await page.evaluate(() => {
            const g = window.homeTestEngine;
            g.obstacles.push({ ...g.nextHead(g.players[0]), type: 'wall' });
          });
          await page.clock.runFor(300);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'over');
          await page.locator('#playButton').click();
          assert.equal(await page.locator('#countdownNumber').textContent(), '1');
          await page.clock.runFor(1100);
          assert.equal(await page.locator('#countdownNumber').textContent(), '2');
          await page.locator('#settingsSummary').click();
          await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'paused');
          await page.clock.runFor(5000);
          assert.equal(await page.evaluate(() => window.homeTestEngine.elapsedMs), 0);
          await page.keyboard.press('Escape');
          await page.locator('#playButton').click();
          assert.equal(await page.locator('#countdownNumber').textContent(), '2');
          await page.clock.runFor(2600);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
          await page.locator('#homeButton').click();
          assert.equal(await page.locator('#homeIntro').isVisible(), true);
          await page.clock.runFor(5000);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'ready');
          assert.equal(await page.evaluate(() => window.homeTestEngine.elapsedMs), 0);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    for (const [width, height] of [[1280, 800], [375, 667]]) {
      await t.test(`per-map/play-type best scores persist independently · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await createTestPage(context);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() => { Math.random = () => 0; });
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.evaluate(() => {
            let score = 10;
            for (const mode of ['classic', 'obstacles', 'maze']) {
              for (const type of ['solo', 'versus', 'ai']) localStorage.setItem(`snake-club-record-v3:${mode}:${type}`, JSON.stringify({ score: score++, name: `${mode}-${type}` }));
            }
          });
          await page.reload();
          let score = 10;
          for (const [mode, title] of [['classic', 'Classic'], ['obstacles', 'Obstacles'], ['maze', 'Maze']]) {
            for (const [players, type, label] of [['1', 'solo', 'Solo'], ['2', 'versus', 'Local versus'], ['ai', 'ai', 'AI Arena']]) {
              await page.locator('#settingsSummary').click();
              await page.locator('#modeSelect').selectOption(mode);
              await page.locator('#playersSelect').selectOption(players);
              await page.keyboard.press('Escape');
              assert.equal(await page.locator('#best').textContent(), String(score++));
              assert.equal(await page.locator('#recordType').textContent(), `${title} · ${label}`);
              assert.equal(await page.locator('#bestName').textContent(), `${mode}-${type}`);
            }
          }
          await page.locator('#settingsSummary').click();
          await page.locator('#modeSelect').selectOption('classic');
          await page.locator('#playersSelect').selectOption('1');
          await page.keyboard.press('Escape');
          await page.evaluate(() => {
            const tick = SnakeGame.prototype.tick;
            let first = true;
            SnakeGame.prototype.tick = function () {
              if (first) {
                this.players[0].score = 10;
                this.food = this.nextHead(this.players[0]);
                this.extraFoods = [];
                this.mushrooms = [];
                this.mushroomCount = 0;
                first = false;
              }
              return tick.call(this);
            };
          });
          await page.locator('#playerInput').fill('Alex');
          await startPlaying(page);
          await page.waitForFunction(() => document.querySelector('#best').textContent === '11');
          await page.locator('#pauseButton').click();
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('snake-club-record-v3:classic:solo')).name), 'Alex');
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('snake-club-record-v3:maze:solo')).score), 16);
          await page.reload();
          assert.equal(await page.locator('#best').textContent(), '11');
          assert.equal(await page.locator('#bestName').textContent(), 'Alex');
          await page.locator('#statsSummary').click();
          await page.getByText('Round details', { exact: true }).click();
          assert.equal(await page.locator('#recordType').isVisible(), true);
          assert.equal(await page.locator('#bestDetailScore').textContent(), '11');
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    await t.test('mushroom status follows Classic/Obstacles/Maze selection', async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
      try {
        const page = await createTestPage(context);
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        for (const mode of ['classic', 'obstacles', 'maze', 'classic']) {
          await page.locator('#settingsSummary').click();
          await page.locator('#modeSelect').selectOption(mode);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#mushroomStatus').getAttribute('hidden') === null, mode === 'classic');
          for (const id of ['mushroomRow', 'herbRow']) {
            assert.equal(await page.locator(`#${id}`).getAttribute('hidden') === null, mode === 'classic');
          }
        }
        await page.reload();
        assert.equal(await page.locator('#mushroomStatus').getAttribute('hidden'), null);
      } finally { await context.close(); }
    });
    await t.test('simple settings, separate stats and saved backdrops', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await createTestPage(context);
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        await page.locator('#playerInput').fill('Alex');
        await startPlaying(page);
        await page.locator('#settingsSummary').click();
        await page.getByText('Appearance', { exact: true }).click();
        await page.locator('#backdropSelect').selectOption('meadow');
        assert.equal(await page.locator('#board').getAttribute('data-backdrop'), 'meadow');
        await page.keyboard.press('Escape');
        await page.locator('#statsSummary').click();
        assert.equal(await page.locator('#gameSettings').getAttribute('open'), null);
        assert.equal(await page.locator('#ratProgress').isVisible(), true);
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
        await page.reload();
        assert.equal(await page.locator('#board').getAttribute('data-backdrop'), 'meadow');
        assert.equal(await page.locator('#viewSelect').count(), 0);
        assert.equal(await page.locator('#fullscreenButton').count(), 0);
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
  }
});
