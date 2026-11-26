const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');

const game = () => new SnakeGame({ random: () => 0 });
const key = ({ x, y }) => `${x},${y}`;

test('obstacle layouts have connected open cells, safe spawns and safe food at all supported sizes', () => {
  for (const mode of ['obstacles', 'maze']) {
    for (let columns = 6; columns <= 30; columns++) {
      for (let rows = 6; rows <= 25; rows++) {
        const g = new SnakeGame({ columns, rows, mode, random: () => 0 });
        const blocked = new Set(g.obstacles.map(key));
        assert.equal(blocked.size, g.obstacles.length);
        assert.ok(g.obstacles.every(({ x, y }) => x >= 0 && x < columns && y >= 0 && y < rows));
        assert.ok(g.snake.every((cell) => !blocked.has(key(cell))));
        assert.ok(!blocked.has(key(g.food)));
        const visited = new Set([key(g.snake[0])]);
        const queue = [g.snake[0]];
        for (let i = 0; i < queue.length; i++) {
          const { x, y } = queue[i];
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const next = { x: x + dx, y: y + dy };
            if (next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || blocked.has(key(next)) || visited.has(key(next))) continue;
            visited.add(key(next)); queue.push(next);
          }
        }
        assert.equal(visited.size + blocked.size, columns * rows, `${mode} ${columns}x${rows} must have no sealed pockets`);
        assert.equal(g.tick(), 'moved', `${mode} ${columns}x${rows} needs a safe first move`);
        for (const random of [() => 0, () => 0.5, () => 1]) {
          g.random = random;
          g.placeFood();
          assert.ok(!blocked.has(key(g.food)));
          assert.ok(!g.snake.some((cell) => key(cell) === key(g.food)));
        }
      }
    }
  }
});

test('walls, barriers and rocks end play without moving, growing or awarding points', () => {
  for (const mode of ['obstacles', 'maze']) {
    const layout = new SnakeGame({ mode });
    const types = new Set(layout.obstacles.map((cell) => cell.type));
    assert.ok(types.has('wall'));
    if (mode === 'obstacles') assert.deepEqual([...types].sort(), ['barrier', 'rock', 'wall']);
    for (const type of types) {
      const g = new SnakeGame({ mode });
      const target = g.obstacles.find((cell) => cell.type === type && cell.x > 0);
      g.snake = [{ x: target.x - 1, y: target.y }];
      g.food = { x: target.x, y: target.y }; // Even a stale food position cannot override collision.
      const before = JSON.stringify(g.snake);
      assert.equal(g.tick(), 'lost');
      assert.equal(g.collision, type);
      assert.equal(g.status, 'over');
      assert.equal(g.score, 0);
      assert.equal(JSON.stringify(g.snake), before);
      assert.equal(g.tick(), 'idle');
      assert.equal(g.turn('up'), false);
    }
  }
});

test('all four edges are solid in obstacle and maze modes', () => {
  for (const mode of ['obstacles', 'maze']) {
    for (const [direction, head] of [
      ['left', { x: 1, y: 5 }], ['right', { x: 22, y: 5 }],
      ['up', { x: 5, y: 1 }], ['down', { x: 5, y: 18 }],
    ]) {
      const g = new SnakeGame({ mode });
      g.snake = [head]; g.direction = direction;
      assert.equal(g.tick(), 'lost');
      assert.equal(g.collision, 'wall');
      assert.deepEqual(g.snake[0], head);
    }
  }
});

test('filling all open cells wins without counting walls as empty cells', () => {
  for (const mode of ['obstacles', 'maze']) {
    const g = new SnakeGame({ columns: 6, rows: 6, mode });
    const blocked = new Set(g.obstacles.map(key));
    g.snake = [{ x: 3, y: 3 }];
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.columns; x++) {
        if (!blocked.has(`${x},${y}`) && !(y === 3 && (x === 3 || x === 4))) g.snake.push({ x, y });
      }
    }
    g.food = { x: 4, y: 3 };
    assert.equal(g.tick(), 'won');
    assert.equal(g.food, null);
    assert.equal(g.snake.length + blocked.size, 36);
  }
});

test('reset preserves the selected mode, rebuilds hazards, and switching to classic clears them', () => {
  const g = new SnakeGame({ mode: 'maze' });
  const layout = JSON.stringify(g.obstacles);
  g.collision = 'wall'; g.status = 'over'; g.score = 10;
  g.reset();
  assert.equal(g.mode, 'maze');
  assert.equal(JSON.stringify(g.obstacles), layout);
  assert.equal(g.collision, null);
  assert.equal(g.score, 0);
  g.reset({ mode: 'obstacles' });
  assert.ok(g.obstacles.some(({ type }) => type === 'rock'));
  g.reset({ mode: 'classic' });
  assert.deepEqual(g.obstacles, []);
  assert.equal(g.wraps, true);
  assert.throws(() => new SnakeGame({ mode: 'unknown' }), RangeError);
  assert.throws(() => g.reset({ mode: 'unknown' }), RangeError);
  assert.equal(g.mode, 'classic');
});

test('starts with three segments, zero score and food outside the snake', () => {
  const g = game();
  assert.equal(g.snake.length, 3);
  assert.equal(g.score, 0);
  assert.equal(g.status, 'playing');
  assert.ok(!g.snake.some((cell) => cell.x === g.food.x && cell.y === g.food.y));
  const head = { ...g.snake[0] };
  assert.equal(g.tick(), 'moved');
  assert.deepEqual(g.snake[0], { x: head.x + 1, y: head.y });
  assert.equal(g.snake.length, 3);
});

test('eating grows by one, scores, counts the animal and places unoccupied food', () => {
  const g = game();
  g.food = { x: g.snake[0].x + 1, y: g.snake[0].y };
  const interval = g.interval;
  assert.equal(g.tick(), 'ate');
  assert.equal(g.snake.length, 4);
  assert.equal(g.score, 1);
  assert.equal(g.interval, interval); // Speed changes only after 10 of every animal.
  assert.deepEqual(g.eaten, { rat: 1, rabbit: 0, frog: 0 });
  assert.ok(!g.snake.some((cell) => cell.x === g.food.x && cell.y === g.food.y));
  assert.equal(g.level, 1);
});

test('rejects reversals, duplicate directions and invalid input; queues two legal turns', () => {
  const g = game();
  assert.equal(g.turn('left'), false);
  assert.equal(g.turn('right'), false);
  assert.equal(g.turn('unknown'), false);
  assert.equal(g.turn('up'), true);
  assert.equal(g.turn('down'), false);
  assert.equal(g.turn('left'), true);
  assert.equal(g.turn('down'), false); // Queue is full.
  const head = { ...g.snake[0] };
  g.tick();
  assert.deepEqual(g.snake[0], { x: head.x, y: head.y - 1 });
  g.tick();
  assert.deepEqual(g.snake[0], { x: head.x - 1, y: head.y - 1 });
});

test('all four edges wrap to the opposite side without ending play', () => {
  for (const [direction, head] of [
    ['left', { x: 0, y: 5 }], ['right', { x: 23, y: 5 }],
    ['up', { x: 5, y: 0 }], ['down', { x: 5, y: 19 }],
  ]) {
    const g = game();
    g.snake = [head];
    g.direction = direction;
    assert.equal(g.tick(), 'moved');
    assert.equal(g.status, 'playing');
    const expected = { left: { x: 23, y: 5 }, right: { x: 0, y: 5 }, up: { x: 5, y: 19 }, down: { x: 5, y: 0 } };
    assert.deepEqual(g.snake[0], expected[direction]);
  }
});

test('hitting the body loses, but moving into the vacating tail is legal', () => {
  const g = game();
  g.snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }];
  g.direction = 'left';
  assert.equal(g.tick(), 'moved');
  assert.deepEqual(g.snake[0], { x: 2, y: 3 });
  g.snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 1, y: 3 }];
  assert.equal(g.tick(), 'lost');
  assert.equal(g.tick(), 'idle');
  assert.equal(g.turn('up'), false);
});

test('eating the last empty cell wins without a food-placement loop', () => {
  const g = new SnakeGame({ columns: 6, rows: 6, random: () => 0.999999 });
  g.snake = [{ x: 4, y: 0 }];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (y === 0 && (x === 4 || x === 5)) continue;
      g.snake.push({ x, y });
    }
  }
  g.food = { x: 5, y: 0 };
  assert.equal(g.tick(), 'won');
  assert.equal(g.status, 'won');
  assert.equal(g.snake.length, 36);
  assert.equal(g.food, null);
  assert.equal(g.tick(), 'idle');
});

test('reset restores the board, direction, queue, score and speed', () => {
  const g = game();
  g.score = 12;
  g.status = 'over';
  g.turns = ['down'];
  g.reset();
  assert.equal(g.snake.length, 3);
  assert.equal(g.direction, 'right');
  assert.deepEqual(g.turns, []);
  assert.equal(g.score, 0);
  assert.equal(g.interval, 240);
  assert.equal(g.level, 1);
  assert.deepEqual(g.eaten, { rat: 0, rabbit: 0, frog: 0 });
  assert.equal(g.status, 'playing');
});

test('food placement stays valid at both random endpoints', () => {
  for (const random of [() => 0, () => 1]) {
    const g = new SnakeGame({ random });
    assert.ok(g.food.x >= 0 && g.food.x < g.columns);
    assert.ok(g.food.y >= 0 && g.food.y < g.rows);
    assert.ok(!g.snake.some((cell) => cell.x === g.food.x && cell.y === g.food.y));
  }
  assert.throws(() => new SnakeGame({ columns: 3 }), RangeError);
});

test('wrapping can catch prey or hit the body on the opposite side', () => {
  const g = game();
  g.snake = [{ x: 23, y: 5 }, { x: 22, y: 5 }, { x: 21, y: 5 }];
  g.food = { x: 0, y: 5 };
  assert.equal(g.tick(), 'ate');
  assert.deepEqual(g.snake[0], { x: 0, y: 5 });
  g.snake = [{ x: 23, y: 5 }, { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 23, y: 6 }];
  g.food = { x: 1, y: 1 };
  assert.equal(g.tick(), 'lost');
});

test('prey changes after every catch through rat, rabbit and frog', () => {
  const g = game();
  for (const expected of ['rat', 'rabbit', 'frog', 'rat', 'rabbit', 'frog']) {
    assert.equal(g.foodType, expected);
    g.food = { x: g.snake[0].x + 1, y: g.snake[0].y };
    assert.equal(g.tick(), 'ate');
  }
  g.food = null;
  assert.equal(g.foodType, null);
  g.reset();
  assert.equal(g.foodType, 'rat');
});

test('levels require 10 of every animal, repeat at 20 each, and reset each round', () => {
  const g = game();
  for (let catches = 1; catches <= 60; catches++) {
    // Isolate catches from body collision while exercising real tick/count rules.
    g.snake = [{ x: 12, y: 10 }];
    g.food = { x: 13, y: 10 };
    assert.equal(g.tick(), 'ate');
    assert.equal(g.level, 1 + Math.floor(catches / 30));
    assert.equal(Object.values(g.eaten).reduce((a, b) => a + b), catches);
    if (catches === 29) { assert.equal(g.eaten.frog, 9); assert.equal(g.interval, 240); }
    if (catches === 30) { assert.deepEqual(g.eaten, { rat: 10, rabbit: 10, frog: 10 }); assert.equal(g.speedMultiplier, 1.2); }
  }
  assert.deepEqual(g.eaten, { rat: 20, rabbit: 20, frog: 20 });
  assert.equal(g.speedMultiplier, 1.4);
  assert.ok(g.interval < 240 / 1.2);
  g.reset();
  assert.equal(g.level, 1);
  assert.equal(g.interval, 240);
  assert.deepEqual(g.eaten, { rat: 0, rabbit: 0, frog: 0 });
});
