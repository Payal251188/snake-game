const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeAI } = require('../snake-ai.js');
const { SnakeItemsRenderer } = require('../snake-items-renderer.js');
const key = ({ x, y }) => `${x},${y}`;
const game = (options = {}) => new SnakeGame({ mushroomCount: 4, random: () => 0, ...options });

function poison(g, index = 0) {
  const target = g.nextHead(g.players[index]);
  g.food = { x: 20, y: 18 };
  g.extraFoods = [];
  g.goldenFood = null;
  g.goldenDelay = 10000;
  g.mushrooms = [target];
  assert.equal(g.tick(), 'ate');
  return g.players[index];
}

function assertSafeItems(g) {
  const items = [...g.foods, ...g.mushrooms, ...g.herbs, g.goldenFood].filter(Boolean);
  const blocked = new Set([...g.obstacles, ...g.livingPlayers.flatMap((player) => player.snake)].map(key));
  assert.equal(new Set(items.map(key)).size, items.length, 'items never overlap each other');
  assert.ok(items.every((cell) => !blocked.has(key(cell))), 'items never overlap bodies or obstacles');
}

test('four random mushrooms spawn safely in all layouts and player configurations', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const options of [{ playerCount: 1 }, { playerCount: 2 }, { aiCount: 3 }]) {
      for (const random of [() => 0, () => 0.5, () => 1]) {
        const g = game({ mode, foodCount: 10, random, ...options });
        assert.equal(g.mushrooms.length, 4);
        assert.deepEqual(g.herbs, []);
        assertSafeItems(g);
        g.goldenDelay = 1;
        g.updateGoldenFood();
        assertSafeItems(g);
      }
    }
  }
});

test('a mushroom gives exactly 50 points, grows once, reverses controls and refills to four', () => {
  const g = game();
  const length = g.snake.length;
  const player = poison(g);
  assert.equal(g.score, 50);
  assert.equal(g.snake.length, length + 1);
  assert.equal(player.controlsReversed, true);
  assert.equal(g.herbWaitMs(player), 5000);
  assert.equal(player.mushroomsEaten, 1);
  assert.equal(g.mushroomCaught, 1);
  assert.equal(g.totalCatches, 1);
  assert.equal(g.mushrooms.length, 4);
  assert.equal(g.level, 1);
  assert.deepEqual(g.totalEaten, { rat: 0, rabbit: 0, frog: 0 });
  assert.deepEqual(g.lastCatches, [{ playerIndex: 0, type: 'mushroom', points: 50 }]);
  assertSafeItems(g);
});

test('input commands reverse on both axes while physical turn rules stay unchanged', () => {
  const g = game();
  poison(g);
  for (const [input, physical] of [['left', 'right'], ['right', 'left'], ['up', 'down'], ['down', 'up']]) {
    g.direction = ['left', 'right'].includes(input) ? 'up' : 'right';
    g.turns = [];
    assert.equal(g.steer(input), true);
    assert.deepEqual(g.turns, [physical]);
  }
  g.direction = 'right';
  g.turns = [];
  assert.equal(g.steer('right'), false, 'inversion does not allow a 180-degree reversal');
  assert.equal(g.steer('nonsense'), false);
  assert.equal(g.steer('up', 99), false);
  assert.equal(g.turn('up'), true, 'physical API supports AI compensation');
  assert.deepEqual(g.turns, ['up']);
});

test('herbs wait five simulation seconds, stay available, and a cure gives no points or growth', () => {
  const g = game();
  const player = poison(g);
  for (let i = 0; i < 31; i++) g.tick();
  assert.equal(g.herbs.length, 0);
  assert.equal(g.herbWaitMs(player), 40);
  g.status = 'paused';
  const paused = JSON.stringify(g);
  assert.equal(g.tick(), 'idle');
  assert.equal(JSON.stringify(g), paused);
  g.status = 'playing';
  g.tick();
  assert.equal(g.herbWaitMs(player), 0);
  assert.equal(g.herbs.length, 1);
  assertSafeItems(g);
  const herb = { ...g.herbs[0] };
  g.tick();
  assert.deepEqual(g.herbs[0], herb, 'cure does not expire');
  g.herbs = [g.nextHead(player)];
  const length = g.snake.length;
  assert.equal(g.tick(), 'ate');
  assert.equal(g.score, 50);
  assert.equal(g.snake.length, length);
  assert.equal(player.controlsReversed, false);
  assert.equal(player.herbReadyAt, null);
  assert.equal(player.herbsEaten, 1);
  assert.equal(g.herbsCaught, 1);
  assert.equal(g.herbs.length, 0);
  assert.deepEqual(g.lastCatches, [{ playerIndex: 0, type: 'herb', points: 0 }]);
  g.turns = [];
  assert.equal(g.steer('up'), true);
  assert.deepEqual(g.turns, ['up']);
});

test('herb timing uses active milliseconds rather than a fixed number of moves', () => {
  const g = game();
  const player = poison(g);
  g.eaten = { rat: 10, rabbit: 10, frog: 10 }; // Level two: 133.33 ms per step.
  for (let i = 0; i < 37; i++) g.tick();
  assert.equal(g.herbs.length, 0);
  assert.ok(g.herbWaitMs(player) > 0);
  g.tick();
  assert.equal(g.herbs.length, 1);
});

test('repeated mushrooms do not toggle inversion or postpone a pending/available cure', () => {
  const g = game();
  const player = poison(g);
  const readyAt = player.herbReadyAt;
  g.mushrooms[0] = g.nextHead(player);
  g.tick();
  assert.equal(g.score, 100);
  assert.equal(player.controlsReversed, true);
  assert.equal(player.herbReadyAt, readyAt);
  assert.equal(g.herbWaitMs(player), 4840);
  g.elapsedMs = readyAt;
  g.updateConsumables();
  const herb = { ...g.herbs[0] };
  g.mushrooms[0] = g.nextHead(player);
  g.tick();
  assert.equal(g.score, 150);
  assert.equal(player.herbReadyAt, readyAt);
  assert.deepEqual(g.herbs[0], herb);
});

test('effect transitions discard buffered turns from the previous control mapping', () => {
  const g = game();
  g.turn('up');
  g.turn('left');
  g.mushrooms = [g.nextHead(g.players[0], 'up')];
  g.tick();
  assert.equal(g.players[0].controlsReversed, true);
  assert.deepEqual(g.turns, []);
  g.players[0].herbReadyAt = g.elapsedMs;
  g.turn('left');
  g.turn('down');
  g.herbs = [g.nextHead(g.players[0], 'left')];
  g.tick();
  assert.equal(g.players[0].controlsReversed, false);
  assert.deepEqual(g.turns, []);
});

test('simultaneous catches and cures belong to the individual snake, not the whole match', () => {
  const g = game({ playerCount: 2 });
  g.mushrooms = [g.nextHead(g.players[0])];
  g.food = g.nextHead(g.players[1]);
  g.tick();
  assert.deepEqual(g.players.map((player) => player.score), [50, 1]);
  assert.deepEqual(g.players.map((player) => player.controlsReversed), [true, false]);
  g.players[0].herbReadyAt = g.elapsedMs;
  g.herbs = [g.nextHead(g.players[0])];
  g.mushrooms[0] = g.nextHead(g.players[1]);
  g.tick();
  assert.deepEqual(g.players.map((player) => player.score), [50, 51]);
  assert.deepEqual(g.players.map((player) => player.controlsReversed), [false, true]);
  assert.equal(g.herbWaitMs(g.players[1]), 5000);
});

test('collisions take precedence over mushrooms, including shared head-on catches', () => {
  for (const playerCount of [1, 2]) {
    const g = game({ mode: 'obstacles', playerCount });
    Object.assign(g.players[0], { snake: [{ x: 4, y: 5 }], direction: 'right' });
    g.mushrooms = [{ x: 5, y: 5 }];
    if (playerCount === 1) g.obstacles = [{ x: 5, y: 5, type: 'wall' }];
    else Object.assign(g.players[1], { snake: [{ x: 6, y: 5 }], direction: 'left' });
    assert.equal(g.tick(), 'lost');
    assert.equal(g.totalScore, 0);
    assert.ok(g.players.every((player) => !player.controlsReversed));
    assert.deepEqual(g.lastCatches, []);
  }
});

test('a needed herb takes priority over a mushroom when the board is crowded', () => {
  const g = game({ columns: 6, rows: 6 });
  const reserved = new Set([...g.foods, ...g.mushrooms].map(key));
  g.snake = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (!reserved.has(`${x},${y}`)) g.snake.push({ x, y });
  g.players[0].controlsReversed = true;
  g.players[0].herbReadyAt = 0;
  g.updateConsumables();
  assert.equal(g.herbs.length, 1);
  assert.equal(g.mushrooms.length, 3);
  assertSafeItems(g);
});

test('remaining mushrooms prevent premature board-completion wins', () => {
  const g = game({ columns: 6, rows: 6 });
  g.snake = [{ x: 4, y: 0 }];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    if (!(x === 4 && y === 0) && !(x === 5 && y < 2)) g.snake.push({ x, y });
  }
  g.food = { x: 5, y: 0 };
  g.mushrooms = [{ x: 5, y: 1 }];
  g.goldenDelay = 10000;
  assert.equal(g.tick(), 'ate');
  assert.equal(g.status, 'playing');
  assert.equal(g.food, null);
  assert.equal(g.mushrooms.length, 1);
  g.turn('down');
  assert.equal(g.tick(), 'won');
  assert.equal(g.snake.length, 36);
  assert.equal(g.score, 51);
});

test('restart clears all effects, timers and counters while preserving the four-mushroom setting', () => {
  const g = game();
  poison(g);
  g.reset();
  assert.equal(g.elapsedMs, 0);
  assert.equal(g.mushroomCount, 4);
  assert.equal(g.mushrooms.length, 4);
  assert.equal(g.herbs.length, 0);
  assert.equal(g.mushroomCaught, 0);
  assert.equal(g.herbsCaught, 0);
  assert.equal(g.players[0].controlsReversed, false);
  assert.equal(g.players[0].herbReadyAt, null);
  for (const mushroomCount of [-1, 5, 2.5, '4']) assert.throws(() => g.reset({ mushroomCount }), RangeError);
});

test('AI avoids mushrooms and seeks herbs when affected, without changing physical turn semantics', () => {
  const g = game({ aiCount: 2 });
  Object.assign(g.players[1], { snake: [{ x: 5, y: 5 }], direction: 'right' });
  g.obstacles = [];
  g.food = { x: 8, y: 5 };
  g.mushrooms = [{ x: 6, y: 5 }];
  assert.ok(['up', 'down'].includes(SnakeAI.chooseDirection(g, 1)));
  g.players[1].controlsReversed = true;
  g.players[1].herbReadyAt = 0;
  g.herbs = [{ x: 5, y: 4 }];
  assert.equal(SnakeAI.chooseDirection(g, 1), 'up');
  SnakeAI.steer(g);
  assert.deepEqual(g.players[1].turns, ['up']);
});

test('seeded multi-snake games retain safe food, mushroom and herb placement', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    let seed = 71;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const g = game({ aiCount: 3, mode, foodCount: 10, random });
    g.players[0].ai = true;
    for (let i = 0; i < 180 && g.status === 'playing'; i++) {
      SnakeAI.steer(g);
      g.tick();
      assertSafeItems(g);
      assert.ok(g.mushrooms.length <= 4);
    }
  }
});

test('mushroom and herb rendering is distinct and does not mutate item data', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, method) => (...args) => calls.push([method, ...args]),
    set: (_, property, value) => { calls.push([property, value]); return true; },
  });
  const mushrooms = [{ x: 2, y: 3 }];
  const herbs = [{ x: 4, y: 5 }];
  const before = JSON.stringify({ mushrooms, herbs });
  SnakeItemsRenderer.draw(ctx, { mushrooms, herbs, left: 0, top: 0, cell: 20 });
  assert.equal(JSON.stringify({ mushrooms, herbs }), before);
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text === '+50'));
  assert.ok(calls.some(([property, color]) => property === 'fillStyle' && color === '#b5f4a0'));
});
