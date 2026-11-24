const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { SnakeSkins } = require('../snake-skins.js');
const { SnakeRenderer } = require('../snake-renderer.js');

function recordingContext() {
  const calls = [];
  const context = new Proxy({}, {
    get: (_, method) => method === 'createLinearGradient'
      ? () => ({ addColorStop: (...args) => calls.push(['colorStop', ...args]) })
      : (...args) => calls.push([method, ...args]),
    set: (_, property, value) => { calls.push([property, value]); return true; },
  });
  return { context, calls };
}

const sample = () => ({ direction: 'right', snake: Array.from({ length: 8 }, (_, i) => ({ x: 8 - i, y: 2 })) });

test('skin catalog has four immutable, distinct cosmetic definitions', () => {
  const skins = Object.values(SnakeSkins.catalog);
  assert.equal(skins.length, 4);
  assert.equal(new Set(skins.map((skin) => skin.pattern)).size, 4);
  assert.equal(new Set(skins.map((skin) => skin.palette.headLight)).size, 4);
  for (const skin of skins) {
    assert.ok(skin.name && skin.description);
    assert.ok(Object.isFrozen(skin) && Object.isFrozen(skin.palette));
    for (const color of Object.values(skin.palette)) assert.match(color, /^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
  }
});

test('unknown and prototype-like skin IDs safely use Classic Olive', () => {
  for (const value of ['unknown', '__proto__', 'constructor', 'toString', '', null, undefined, 0, {}]) {
    assert.equal(SnakeSkins.has(value), false);
    assert.equal(SnakeSkins.get(value).id, 'classic');
  }
});

test('selecting skins changes only player one, never local or AI opponent colors', () => {
  for (const id of Object.keys(SnakeSkins.catalog)) {
    assert.equal(SnakeSkins.forPlayer(0, id), SnakeSkins.get(id));
    for (const [index, label] of [[1, '#f8b487'], [2, '#83d9f2'], [3, '#d3b0ff']]) {
      assert.equal(SnakeSkins.forPlayer(index, id).palette.label, label);
      assert.equal(SnakeSkins.forPlayer(index, id), SnakeSkins.forPlayer(index, 'classic'));
    }
  }
});

test('shared renderer uses every selected palette without mutating snake data', () => {
  const player = sample();
  player.snake.forEach(Object.freeze);
  Object.freeze(player.snake);
  Object.freeze(player);
  const before = JSON.stringify(player);
  const traces = [];
  for (const skin of Object.values(SnakeSkins.catalog)) {
    const { context, calls } = recordingContext();
    SnakeRenderer.draw(context, { left: 0, top: 0, cell: 20, player, skin });
    assert.ok(calls.some(([method, , color]) => method === 'colorStop' && color === skin.palette.headLight));
    assert.ok(calls.some(([method, value]) => method === 'fillStyle' && value === skin.palette.eye));
    for (const [method, , , rx, ry] of calls) if (method === 'ellipse') assert.ok(rx >= 0 && ry >= 0);
    assert.equal(JSON.stringify(player), before);
    traces.push(JSON.stringify(calls));
  }
  assert.equal(new Set(traces).size, 4, 'skins produce different drawing commands');
});

test('static previews omit animation while gameplay can animate the tongue', () => {
  const skin = SnakeSkins.get('classic');
  for (const animate of [false, true]) {
    const { context, calls } = recordingContext();
    SnakeRenderer.draw(context, { left: 0, top: 0, cell: 20, player: sample(), skin, time: 200, animate });
    assert.equal(calls.some(([method, color]) => method === 'strokeStyle' && color === skin.palette.tongue), animate);
  }
});

test('renderer handles wraparound bodies and skips empty or collapsed previews', () => {
  const { context, calls } = recordingContext();
  const skin = SnakeSkins.get('neon');
  const player = { direction: 'right', snake: [{ x: 0, y: 2 }, { x: 23, y: 2 }, { x: 22, y: 2 }] };
  SnakeRenderer.draw(context, { left: 0, top: 0, cell: 20, player, skin });
  assert.ok(calls.length > 0);
  calls.length = 0;
  SnakeRenderer.draw(context, { left: 0, top: 0, cell: 20, player: { snake: [] }, skin });
  SnakeRenderer.draw(context, { left: 0, top: 0, cell: 0, player, skin });
  assert.equal(calls.length, 0);
});

test('browser scripts export without a DOM or bundler and picker options match the catalog', () => {
  const sandbox = {};
  for (const path of ['snake-skins.js', 'snake-renderer.js']) {
    vm.runInNewContext(readFileSync(join(__dirname, '..', path), 'utf8'), sandbox);
  }
  assert.equal(sandbox.SnakeSkins.get('neon').id, 'neon');
  assert.equal(typeof sandbox.SnakeRenderer.draw, 'function');
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const select = html.match(/<select id="skinSelect"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.equal((select.match(/<option /g) || []).length, Object.keys(SnakeSkins.catalog).length);
  for (const skin of Object.values(SnakeSkins.catalog)) assert.ok(select.includes(`>${skin.name}</option>`));
  assert.ok(html.indexOf('snake-skins.js') < html.indexOf('game.js'));
  assert.ok(html.indexOf('snake-renderer.js') < html.indexOf('game.js'));
});
