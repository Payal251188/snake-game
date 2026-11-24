const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeScene } = require('../snake-scene.js');
const { SnakeGame } = require('../snake-engine.js');

function context() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, method) => ['createLinearGradient', 'createRadialGradient'].includes(method)
      ? (...args) => { calls.push([method, ...args]); return { addColorStop: (...colors) => calls.push(['colorStop', ...colors]) }; }
      : (...args) => calls.push([method, ...args]),
    set: (_, property, value) => { calls.push([property, value]); return true; },
  });
  return { ctx, calls };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('orbit projection fits the complete arena inside all supported canvas sizes', () => {
  for (const [width, height] of [[1, 1], [320, 180], [375, 400], [800, 120], [1440, 650], [2560, 1100]]) {
    for (const [columns, rows] of [[6, 6], [24, 20], [48, 40]]) {
      const frame = SnakeScene.layout({ width, height, columns, rows });
      assert.ok(frame.cell > 0 && Number.isFinite(frame.cell));
      for (const [x, y] of [[0, 0], [columns, 0], [0, rows], [columns, rows]]) {
        const point = SnakeScene.project(frame, x, y);
        assert.ok(point.x >= 0 && point.x <= width, `${width}×${height}: x ${point.x}`);
        assert.ok(point.y >= 0 && point.y <= height, `${width}×${height}: y ${point.y}`);
      }
    }
  }
});

test('projection round-trips and immersive view centers the player without changing world coordinates', () => {
  const focus = Object.freeze({ x: 3.5, y: 17.5 });
  const args = { width: 1400, height: 650, columns: 24, rows: 20 };
  const orbit = SnakeScene.layout(args);
  const frame = SnakeScene.layout({ ...args, view: 'follow', focus });
  assert.ok(frame.cell > orbit.cell);
  const center = SnakeScene.project(frame, focus.x, focus.y);
  assert.equal(center.x, frame.centerX);
  assert.equal(center.y, frame.centerY);
  for (const [x, y] of [[0, 0], [23.5, 19.5], [12, 10]]) {
    const projected = SnakeScene.project(frame, x, y);
    const restored = SnakeScene.unproject(frame, projected.x, projected.y);
    assert.ok(Math.abs(restored.x - x) < 1e-9 && Math.abs(restored.y - y) < 1e-9);
  }
  assert.equal(SnakeScene.layout({ ...args, height: 90, view: 'follow', focus }).view, 'overview');
});

test('follow camera eases locally, snaps at wrap seams, and supports reduced-motion snapping', () => {
  const previous = Object.freeze({ x: 10, y: 10 });
  const target = Object.freeze({ x: 12, y: 11 });
  const options = { columns: 24, rows: 20, delta: 16 };
  const result = SnakeScene.follow(previous, target, options);
  assert.ok(result.x > previous.x && result.x < target.x);
  assert.ok(result.y > previous.y && result.y < target.y);
  assert.deepEqual(SnakeScene.follow(previous, target, { ...options, delta: 0 }), previous);
  assert.deepEqual(SnakeScene.follow(previous, target, { ...options, snap: true }), target);
  assert.deepEqual(SnakeScene.follow({ x: 23.5, y: 10 }, { x: 0.5, y: 10 }, options), { x: 0.5, y: 10 });
});

test('scene rendering is read-only and never consumes gameplay randomness', () => {
  const game = freeze(new SnakeGame({ aiCount: 3, mushroomCount: 4, foodCount: 5, mode: 'obstacles', random: () => 0.3 }));
  const before = JSON.stringify(game);
  const { ctx, calls } = context();
  const frame = SnakeScene.layout({ width: 1000, height: 600, columns: game.columns, rows: game.rows, view: 'follow', focus: { x: 12, y: 5 } });
  const random = Math.random;
  Math.random = () => { throw new Error('Visuals must not advance gameplay RNG'); };
  try {
    SnakeScene.background(ctx, { width: 1000, height: 600, time: 2000 });
    SnakeScene.terrain(ctx, frame, game.obstacles);
    SnakeScene.minimap(ctx, { ...frame, frame, players: game.players, colors: ['#fff', '#f80', '#0ff', '#80f'], obstacles: game.obstacles, foods: game.foods, mushrooms: game.mushrooms, herbs: game.herbs, goldenFood: { x: 20, y: 10 } });
  } finally { Math.random = random; }
  assert.equal(JSON.stringify(game), before);
  assert.ok(calls.some(([method]) => method === 'createRadialGradient'));
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text === 'SECTOR MAP'));
  for (const call of calls) for (const value of call.slice(1)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('backdrop gradients are reused until canvas dimensions change', () => {
  const { ctx, calls } = context();
  SnakeScene.background(ctx, { width: 800, height: 600 });
  const count = calls.filter(([method]) => /create.*Gradient/.test(method)).length;
  SnakeScene.background(ctx, { width: 800, height: 600, time: 1000 });
  assert.equal(calls.filter(([method]) => /create.*Gradient/.test(method)).length, count);
  SnakeScene.background(ctx, { width: 900, height: 600 });
  const resized = calls.filter(([method]) => /create.*Gradient/.test(method)).length;
  assert.ok(resized > count);
  SnakeScene.background(ctx, { width: 900, height: 600, pixelRatio: 2 });
  assert.ok(calls.filter(([method]) => /create.*Gradient/.test(method)).length > resized);
});

test('pickup effects are bounded, expire on visual time and keep event data independent', () => {
  const effects = new SnakeScene.PickupEffects();
  for (let i = 0; i < 50; i++) effects.emit({ x: i % 24, y: 5, type: 'mushroom', points: 50 }, i);
  assert.equal(effects.items.length, 24);
  const { ctx, calls } = context();
  const frame = SnakeScene.layout({ width: 800, height: 600, columns: 24, rows: 20 });
  effects.draw(ctx, frame, 400);
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text === '+50'));
  effects.draw(ctx, frame, 1000);
  assert.equal(effects.items.length, 0);
  effects.emit({ x: 1, y: 1, type: 'herb', points: 0 }, 1000);
  effects.draw(ctx, frame, 1000);
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text === 'CURED'));
  effects.clear();
  assert.equal(effects.items.length, 0);
});
