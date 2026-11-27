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

async function createTestPage(context, { autoGuest = true } = {}) {
  const page = await context.newPage();
  await page.clock.install();
  if (autoGuest) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.getElementById('guestPlayButton')?.click()));
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
        await t.test(`${width}×${height}${touch ? ' touch' : ''} · ${selection === 'ai' ? 'AI Arena' : 'local team'}`, async () => {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
          try {
            const page = await createTestPage(context);
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
            assert.equal(await page.locator('#authPanel').isVisible(), true);
            await page.locator('#playButton').scrollIntoViewIfNeeded();
            const homeFits = await page.locator('#playButton').evaluate((button) => {
              const rect = button.getBoundingClientRect();
              return rect.top >= 0 && rect.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight;
            });
            assert.equal(homeFits, true, 'home setup scrolls locally while keeping the Play button reachable');
            await page.locator('#playerInput').fill('Alex');
            await page.locator('#playersSelect').selectOption(selection);
            assert.equal(await page.locator('#playersSelect').evaluate((field) => Boolean(field.closest('#homeSetup')) && !field.closest('#gameSettings')), true);
            assert.equal(await page.locator('#modeSelect').evaluate((field) => Boolean(field.closest('#homeSetup')) && !field.closest('#gameSettings')), true);
            await page.locator('#settingsSummary').click();
            await page.getByText('Appearance', { exact: true }).click();
            const skin = selection === 'ai' ? 'ember' : 'neon';
            await page.locator('#skinSelect').selectOption(skin);
            if (selection === 'ai') {
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
                chart: fits('#levelChart') && [...document.querySelectorAll('#levelChart th, #levelChart td')].every((cell) => { const r=cell.getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight; }),
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
            for (const key of ['board', 'chart', 'scoreboard', 'actions', 'crowd', 'crowdAtTop', 'touch']) assert.ok(layout[key], `${key} fits`);
            await page.mouse.wheel(0, 500);
            assert.equal(await page.evaluate(() => scrollY), 0);
            await page.locator('#settingsSummary').click();
            await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'paused');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#gameSettings').getAttribute('open'), null);
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
            await page.locator('#helpSummary').click();
            assert.equal(await page.locator('#helpTitle').textContent(), 'How to play');
            assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
            const helpFits = await page.locator('#helpPanel').evaluate((panel) => {
              const r = panel.getBoundingClientRect();
              return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && panel.scrollHeight > panel.clientHeight && panel.scrollWidth <= panel.clientWidth;
            });
            assert.equal(helpFits, true, 'instructions fit and scroll inside their panel');
            await page.locator('#helpPanel').hover();
            await page.mouse.wheel(0, 600);
            await page.waitForFunction(() => document.querySelector('#helpPanel').scrollTop > 0);
            assert.equal(await page.evaluate(() => scrollY), 0);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#gameHelp').getAttribute('open'), null);
            assert.equal(await page.locator('#helpSummary').evaluate((summary) => document.activeElement === summary), true);
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
            assert.equal(await page.locator('#authPanel').isVisible(), true);
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
          await page.locator('#settingsSummary').click();
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
          assert.equal(await page.locator('#authPanel').isVisible(), true);
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
          await page.locator('#helpSummary').click();
          await page.waitForFunction(() => document.querySelector('.game-shell').dataset.state === 'paused');
          await page.clock.runFor(5000);
          assert.equal(await page.evaluate(() => window.homeTestEngine.elapsedMs), 0);
          await page.keyboard.press('r');
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
          assert.equal(await page.locator('#countdownNumber').textContent(), '2');
          await page.locator('#helpCloseButton').click();
          await page.locator('#playButton').click();
          assert.equal(await page.locator('#countdownNumber').textContent(), '2');
          await page.clock.runFor(2600);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
          await page.locator('#homeButton').click();
          assert.equal(await page.locator('#homeDialog').isVisible(), true);
          await page.locator('#endHomeButton').click();
          assert.equal(await page.locator('#authPanel').isVisible(), true);
          await page.clock.runFor(5000);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'ready');
          assert.equal(await page.evaluate(() => window.homeTestEngine.elapsedMs), 0);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    for (const [width,height] of [[320,568],[844,390]]) {
      await t.test(`Home confirmation and exact resume · ${width}×${height}`,async()=>{
        const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
        try{
          const page=await createTestPage(context);const errors=[];page.on('pageerror',e=>errors.push(e.message));
          await page.goto(pathToFileURL(join(__dirname,'..','index.html')).href);
          await page.evaluate(()=>{const reset=SnakeGame.prototype.reset;SnakeGame.prototype.reset=function(options){const result=reset.call(this,options);window.resumeEngine=this;return result;};});
          await page.locator('#playerInput').fill('Long player name Alex');
          await page.locator('#playersSelect').selectOption('1');await startPlaying(page);await page.clock.runFor(600);
          await page.locator('#homeButton').click();
          assert.equal(await page.locator('#homeDialog').isVisible(),true);
          const frozen=await page.evaluate(()=>JSON.stringify(window.resumeEngine));
          await page.clock.runFor(5000);
          assert.equal(await page.evaluate(()=>JSON.stringify(window.resumeEngine)),frozen);
          for(let i=0;i<4;i++){await page.keyboard.press('Tab');assert.equal(await page.locator('#homeDialog').evaluate(d=>d.contains(document.activeElement)),true);}
          const fits=await page.locator('#homeDialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
          assert.equal(fits,true);await page.keyboard.press('Escape');
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'),'playing');
          await page.locator('#homeButton').click();await page.locator('#saveHomeButton').click();
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'),'ready');
          assert.equal(await page.locator('#homeResume').isVisible(),true);
          assert.equal(await page.locator('#modeSelect').isDisabled(),true);
          const saved=await page.evaluate(()=>JSON.stringify(window.resumeEngine));await page.clock.runFor(10000);
          assert.equal(await page.evaluate(()=>JSON.stringify(window.resumeEngine)),saved);
          await page.keyboard.press('r');assert.equal(await page.locator('#homeDialogTitle').textContent(),'End your saved game?');
          await page.locator('#cancelHomeButton').click();
          await page.locator('#resumeGameButton').scrollIntoViewIfNeeded();
          assert.equal(await page.locator('#resumeGameButton').evaluate(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&scrollY===0;}),true);
          const restored=await page.evaluate(()=>{document.getElementById('resumeGameButton').click();return JSON.stringify(window.resumeEngine);});
          assert.equal(restored,saved);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'),'playing');
          await page.locator('#homeButton').click();await page.locator('#endHomeButton').click();
          assert.equal(await page.locator('#homeResume').isVisible(),false);
          assert.equal(await page.locator('#homeSetup').isVisible(),true);
          assert.equal(await page.locator('#modeSelect').isDisabled(),false);
          assert.equal(await page.evaluate(()=>window.resumeEngine.elapsedMs),0);
          assert.deepEqual(errors,[]);
        }finally{await context.close();}
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
              for (const type of ['solo', 'team', 'ai']) localStorage.setItem(`snake-club-record-v3:${mode}:${type}`, JSON.stringify({ score: score++, name: `${mode}-${type}` }));
            }
          });
          await page.reload();
          let score = 10;
          for (const [mode, title] of [['classic', 'Classic'], ['obstacles', 'Obstacles'], ['maze', 'Maze']]) {
            for (const [players, type, label] of [['1', 'solo', 'Solo'], ['2', 'team', 'Local team'], ['ai', 'ai', 'AI Arena']]) {
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
    for (const [width, height, mode] of [[1280, 800, 'obstacles'], [320, 568, 'maze']]) {
      await t.test(`winter den and faster summer transition · ${width}×${height}`, async () => {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
        try {
          const page = await createTestPage(context);
          const errors = []; page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
          await page.locator('#playerInput').fill('Alex');
          await page.locator('#playersSelect').selectOption('1');
          await page.locator('#modeSelect').selectOption(mode);
          await page.evaluate(() => {
            const tick = SnakeGame.prototype.tick; let first = true;
            SnakeGame.prototype.tick = function () {
              window.seasonGame = this;
              if (first) { this.players[0].levelEaten = { rat: 10, rabbit: 10, frog: 9 }; this.players[0].eaten = { rat: 10, rabbit: 10, frog: 9 }; this.players[0].score = 29; this.food = { ...this.nextHead(this.players[0]), type: 'frog' }; first = false; }
              return tick.call(this);
            };
          });
          await startPlaying(page); await page.clock.runFor(600);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'level-complete');
          assert.equal(await page.locator('#overlayTitle').textContent(), 'Winter is coming');
          assert.equal(await page.locator('#chartStatus').textContent(), 'HURRAY! ALL DONE');
          await page.waitForFunction(() => document.getElementById('hurray').readyState >= 2);
          assert.equal(await page.locator('#hurray').evaluate((sound) => sound.error), null);
          for(const animal of ['rat','rabbit','frog']){
            assert.equal(await page.locator(`#${animal}LevelEaten`).textContent(),'10');
            assert.equal(await page.locator(`#${animal}LevelPending`).textContent(),'0');
          }
          assert.equal(await page.locator('#level').textContent(), '1');
          await page.locator('#playButton').click();
          await page.evaluate(() => {
            const g = window.seasonGame; const d = g.den;
            const delta = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[d.side];
            g.snake = [{ x: d.x - delta[0], y: d.y - delta[1] }];
            g.direction = { left: 'left', right: 'right', top: 'up', bottom: 'down' }[d.side];
          });
          await page.clock.runFor(600);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'season-transition');
          await page.locator('#pauseButton').click();
          await page.clock.runFor(5000);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
          assert.equal(await page.evaluate(() => window.seasonGame.level), 1);
          await page.locator('#playButton').click();
          await page.clock.runFor(4400);
          assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'level-ready');
          assert.match(await page.locator('#overlayTag').textContent(), /SUMMER/);
          assert.equal(await page.locator('#ratProgressText').textContent(), '0/15');
          assert.equal(await page.locator('#ratLevelEaten').textContent(),'0');
          assert.equal(await page.locator('#ratLevelRequired').textContent(),'15');
          assert.equal(await page.locator('#ratLevelPending').textContent(),'15');
          assert.equal(await page.locator('#score').textContent(), '30');
          assert.equal(await page.evaluate(() => window.seasonGame.snake.length), 3);
          assert.equal(await page.evaluate(() => window.seasonGame.interval), 200);
          await startPlaying(page);
          assert.equal(await page.locator('#board').getAttribute('data-season'), 'summer');
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    await t.test('account choice, guest co-op team names and shared team records', async () => {
      const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
      try {
        const page = await createTestPage(context, { autoGuest: false });
        const remoteAuth = [];
        page.on('request', (request) => { if (request.url().startsWith('https://www.gstatic.com/firebasejs/')) remoteAuth.push(request.url()); });
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        assert.equal(await page.locator('#authChoices').isVisible(), true);
        assert.equal(await page.locator('#playerEntry').isVisible(), false);
        assert.equal(await page.locator('#playButton').isVisible(), false);
        await page.locator('#googleLoginButton').click();
        assert.match(await page.locator('#authStatus').textContent(), /OAuth configuration/);
        assert.equal(await page.locator('#inviteFriendsButton').isVisible(), false);
        await page.locator('#guestPlayButton').click();
        await page.locator('#playerInput').fill('Alex');
        await page.locator('#opponentInput').fill('Jamie');
        await page.locator('#teamInput').fill('River Runners');
        await page.evaluate(() => {
          const tick = SnakeGame.prototype.tick; let index = 0;
          SnakeGame.prototype.tick = function () { this.food = this.nextHead(this.players[index++ % 2]); window.teamTestEngine = this; return tick.call(this); };
        });
        await startPlaying(page); await page.clock.runFor(700);
        assert.equal(await page.locator('#scoreLabel').textContent(), 'TEAM SCORE');
        assert.match(await page.locator('#teamNameBanner').textContent(), /River Runners/);
        const total = await page.evaluate(() => window.teamTestEngine.totalScore);
        assert.ok(total > 0);
        assert.equal(Number(await page.locator('#score').textContent()), total);
        assert.equal(await page.locator('#bestName').textContent(), 'River Runners');
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snake-club-record-v3:obstacles:team')));
        assert.equal(saved.name, 'River Runners'); assert.equal(saved.score, total);
        await page.reload();
        assert.equal(await page.locator('#teamInput').inputValue(), 'River Runners');
        assert.equal(await page.locator('#bestName').textContent(), 'River Runners');
        assert.equal(await page.locator('#authChoices').isVisible(), true);
        assert.deepEqual(remoteAuth, []);
      } finally { await context.close(); }
    });
    await t.test('break auto-pause uses continuous foreground minutes and is silent when disabled', async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
      try {
        const page = await createTestPage(context);
        await page.goto(pathToFileURL(join(__dirname, '..', 'index.html')).href);
        await page.locator('#playerInput').fill('Alex');
        await page.locator('#settingsSummary').click();
        await page.locator('#playersSelect').selectOption('1');
        await page.locator('#modeSelect').selectOption('classic');
        await page.getByText('More options', { exact: true }).click();
        await page.locator('#breakToggle').check();
        await page.locator('#breakMinutes').fill('1');
        await page.locator('#breakMinutes').press('Tab');
        await page.keyboard.press('Escape');
        await startPlaying(page);
        assert.equal(await page.locator('#gameClock').isVisible(), true);
        assert.equal(await page.locator('#breakTime').textContent(), '01:00');
        await page.clock.runFor(40); await page.clock.fastForward(61000);
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
        assert.equal(await page.locator('#overlayTitle').textContent(), 'Rest your eyes.');
        assert.equal(await page.locator('#breakTime').textContent(), '00:00');
        await startPlaying(page); await page.clock.runFor(40); await page.clock.fastForward(31000);
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
        await page.clock.fastForward(31000);
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'paused');
        await page.locator('#settingsSummary').click();
        await page.locator('#breakToggle').uncheck();
        assert.equal(await page.locator('#breakReadout').isVisible(), false);
        await page.keyboard.press('Escape');
        await startPlaying(page); await page.clock.runFor(40); await page.clock.fastForward(180000);
        assert.equal(await page.locator('.game-shell').getAttribute('data-state'), 'playing');
        await page.reload();
        assert.equal(await page.locator('#breakToggle').isChecked(), false);
        assert.equal(await page.locator('#breakMinutes').inputValue(), '1');
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
