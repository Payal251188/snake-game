const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { SnakeMotion } = require('../snake-motion.js');
const { SnakeBoard } = require('../snake-board.js');
const player = (snake) => ({ snake, alive: true, direction: 'right' });

function recording() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => name === 'createLinearGradient' ? () => { calls.push('gradient'); return { addColorStop() {} }; } : (...args) => calls.push([name, ...args]),
    set: (_, name, value) => { calls.push(['set', name, value]); return true; },
  });
  return { ctx, calls };
}

test('snake interpolation is continuous between cells without modifying simulation data', () => {
  const old = SnakeMotion.capture([player([{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }])]);
  const current = [player([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }])];
  const snapshot = JSON.stringify(current);
  const options = { columns: 24, rows: 20, wraps: true };
  const positions = [0, .25, .5, .75, 1].map((amount) => SnakeMotion.interpolate(old, current, amount, options)[0].snake[0].x);
  assert.deepEqual(positions, [5, 5.25, 5.5, 5.75, 6]);
  assert.equal(JSON.stringify(current), snapshot);
  assert.notEqual(SnakeMotion.interpolate(old, current, .5, options)[0].snake, current[0].snake);
});

test('wraps use the short path, growth stays attached, and resets do not slide through the board', () => {
  const options = { columns: 24, rows: 20, wraps: true };
  const old = SnakeMotion.capture([player([{ x: 23, y: 5 }, { x: 22, y: 5 }])]);
  const current = [player([{ x: 0, y: 5 }, { x: 23, y: 5 }, { x: 22, y: 5 }])];
  const middle = SnakeMotion.interpolate(old, current, .5, options)[0];
  assert.equal(middle.snake[0].x, 23.5);
  assert.equal(middle.snake[2].x, 22);
  const reset = [player([{ x: 12, y: 10 }])];
  assert.deepEqual(SnakeMotion.interpolate(old, reset, .5, options)[0].snake[0], { x: 12, y: 10 });
});

test('food actions interpolate smoothly and hopping animals lift off the board', () => {
  const options = { columns: 24, rows: 20, wraps: true };
  for (const type of ['rat', 'rabbit', 'frog']) {
    const food = { x: 8, y: 5, type, motion: { from: { x: 6, y: 5 }, startedAt: 1000, duration: 200 } };
    assert.equal(SnakeMotion.foodPosition(food, 1000, options).x, 6);
    const middle = SnakeMotion.foodPosition(food, 1100, options);
    assert.equal(middle.x, 7);
    assert.equal(middle.lift > 0, type !== 'rat');
    assert.equal(SnakeMotion.foodPosition(food, 1200, options).x, 8);
  }
});

test('board bounds fit the viewport and high-DPI raster sizes stay bounded', () => {
  for (const [width, height] of [[1, 1], [320, 200], [1366, 600], [3840, 1800]]) {
    const frame = SnakeBoard.layout(width, height, 24, 20);
    assert.ok(frame.left >= 0 && frame.top >= 0);
    assert.ok(frame.left + frame.cell * 24 <= width + .001);
    assert.ok(frame.top + frame.cell * 20 <= height + .001);
    const ratio = SnakeBoard.pixelRatio(width, height, 3);
    assert.ok(ratio <= 1.5);
    assert.ok(width * height * ratio * ratio <= 2000001);
  }
});

test('static board bitmap is reused and invalidates only for map, backdrop or size changes', () => {
  const { ctx, calls } = recording();
  let surfaces = 0;
  const painter = SnakeBoard.createPainter((width, height) => { surfaces++; return { width, height, getContext: () => ctx }; });
  const options = { width: 800, height: 500, columns: 24, rows: 20, obstacles: [{ x: 1, y: 1, type: 'wall' }], theme: 'night', pixelRatio: 1 };
  painter.draw(ctx, options);
  const gradients = calls.filter((call) => call === 'gradient').length;
  painter.draw(ctx, options);
  assert.equal(surfaces, 1);
  assert.equal(calls.filter((call) => call === 'gradient').length, gradients);
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === 'drawImage').length, 2);
  painter.draw(ctx, { ...options, theme: 'meadow' });
  painter.draw(ctx, { ...options, width: 900 });
  options.obstacles.push({ x: 2, y: 2, type: 'rock' });
  painter.draw(ctx, options);
  assert.equal(surfaces, 4);
});

test('single stones use square masonry blocks and an outlined warning cross on every backdrop', () => {
  for (const theme of Object.keys(SnakeBoard.themes)) {
    const { ctx, calls } = recording();
    const obstacles = [{ x: 3, y: 6, type: 'rock' }];
    const before = JSON.stringify(obstacles);
    const frame = SnakeBoard.createPainter(() => null).draw(ctx, { width: 320, height: 400, columns: 24, rows: 20, obstacles, theme });
    const tiles = calls.filter((call) => Array.isArray(call) && call[0] === 'roundRect');
    assert.equal(tiles.length, 3, 'board floor plus two rectangular stone faces');
    assert.ok(Math.abs(tiles[1][3] - frame.cell * 0.84) < .001);
    assert.ok(Math.abs(tiles[1][4] - frame.cell * 0.84) < .001);
    const strokes = calls.filter((call) => Array.isArray(call) && call[0] === 'set' && call[1] === 'strokeStyle').map((call) => call[2]);
    assert.ok(strokes.includes('#263b44'), 'dark outline makes the mark readable on the stone');
    assert.ok(strokes.includes('#ffd181'), 'amber warning cross distinguishes hazards from animals');
    assert.equal(JSON.stringify(obstacles), before, 'visual changes never alter collision cells');
  }
});

test('all simple backdrops render without gameplay randomness or an offscreen canvas', () => {
  const { ctx } = recording();
  const painter = SnakeBoard.createPainter(() => null);
  const random = Math.random;
  Math.random = () => { throw Error('Drawing must never consume game RNG'); };
  try {
    for (const theme of Object.keys(SnakeBoard.themes)) painter.draw(ctx, { width: 800, height: 500, columns: 24, rows: 20, obstacles: [], theme });
  } finally { Math.random = random; }
  assert.equal(SnakeBoard.resolve('__proto__'), 'night');
});

test('summer uses a cached golden-yellow floor and sunshine while winter keeps its blue palette', () => {
  for(const season of ['summer','winter','sleeping']){
    const {ctx,calls}=recording();
    SnakeBoard.createPainter(()=>null).draw(ctx,{width:800,height:500,columns:24,rows:20,obstacles:[],theme:'night',season});
    const fills=calls.filter(c=>Array.isArray(c)&&c[0]==='set'&&c[1]==='fillStyle').map(c=>c[2]);
    assert.ok(fills.includes(season==='summer'?'#f2d98b':'#29414c'));
    assert.equal(fills.includes('#fff7c8'),season==='summer','only summer paints sunshine');
  }
});

test('orbital arena assets and controls are completely removed', () => {
  const root = join(__dirname, '..');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /snake-scene|orbital-theme|viewSelect|cameraLabel|fullscreenButton/);
  assert.equal(existsSync(join(root, 'snake-scene.js')), false);
  assert.equal(existsSync(join(root, 'orbital-theme.css')), false);
});
