const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const key = ({ x, y }) => `${x},${y}`;
const game = (options = {}) => new SnakeGame({ random: () => 0, ...options });

test('golden food starts absent and appears after a random 25–55 successful moves', () => {
  for (const [random, delay] of [[() => 0, 25], [() => 0.5, 40], [() => 1, 55]]) {
    const g = game({ random });
    assert.equal(g.goldenFood, null);
    assert.equal(g.goldenDelay, delay);
    g.food = { x: 0, y: 0 }; // Keep prey off the snake’s straight wraparound path.
    for (let i = 1; i < delay; i++) {
      assert.equal(g.tick(), 'moved');
      assert.equal(g.goldenFood, null);
    }
    assert.equal(g.tick(), 'moved');
    assert.ok(g.goldenFood);
    assert.equal(g.goldenTicks, 50);
    assert.deepEqual(g.food, { x: 0, y: 0 });
  }
});

test('golden spawns avoid normal prey, both snakes and obstacles in every mode', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const playerCount of [1, 2]) {
      for (const random of [() => 0, () => 0.5, () => 1]) {
        const g = game({ mode, playerCount, random });
        g.goldenDelay = 1;
        assert.equal(g.tick(), 'moved');
        assert.ok(g.goldenFood);
        assert.ok(![g.food, ...g.players.flatMap((player) => player.snake), ...g.obstacles].some((cell) => key(cell) === key(g.goldenFood)));
        g.placeFood();
        assert.notEqual(key(g.food), key(g.goldenFood));
      }
    }
  }
});

test('golden food expires after 50 moves without scoring, then waits for another random spawn', () => {
  const g = game();
  g.goldenDelay = 1; g.tick();
  for (let i = 1; i < 50; i++) {
    g.tick(); assert.ok(g.goldenFood); assert.equal(g.goldenTicks, 50 - i);
  }
  g.tick();
  assert.equal(g.goldenFood, null);
  assert.equal(g.goldenTicks, 0);
  assert.equal(g.goldenDelay, 25);
  assert.equal(g.score, 0);
  assert.equal(g.goldenCaught, 0);
  for (let i = 1; i < 25; i++) { g.tick(); assert.equal(g.goldenFood, null); }
  g.tick(); assert.ok(g.goldenFood);
});

test('golden food awards exactly five points and one growth to its eater without changing prey or levels', () => {
  for (const playerCount of [1, 2]) {
    for (let index = 0; index < playerCount; index++) {
      const g = game({ playerCount });
      const player = g.players[index];
      const normal = { ...g.food };
      const type = g.foodType;
      const lengths = g.players.map((p) => p.snake.length);
      g.goldenFood = { x: player.snake[0].x + (index === 0 ? 1 : -1), y: player.snake[0].y };
      g.goldenTicks = 50;
      assert.equal(g.tick(), 'ate');
      assert.equal(player.score, 5);
      assert.equal(player.snake.length, lengths[index] + 1);
      assert.equal(player.goldenEaten, 1);
      assert.equal(g.goldenCaught, 1);
      assert.equal(g.totalCatches, 1);
      assert.deepEqual(g.totalEaten, { rat: 0, rabbit: 0, frog: 0 });
      assert.equal(g.foodType, type);
      assert.deepEqual(g.food, normal);
      assert.equal(g.level, 1);
      assert.equal(g.goldenFood, null);
      assert.equal(g.goldenTicks, 0);
      assert.deepEqual(g.lastCatches, [{ playerIndex: index, type: 'golden', points: 5 }]);
      if (playerCount === 2) {
        assert.equal(g.players[1 - index].score, 0);
        assert.equal(g.players[1 - index].snake.length, lengths[1 - index]);
      }
    }
  }
});

test('normal and golden food can be eaten by different players on the same tick', () => {
  const g = game({ playerCount: 2 });
  Object.assign(g.players[0], { snake: [{ x: 3, y: 3 }], direction: 'right' });
  Object.assign(g.players[1], { snake: [{ x: 10, y: 10 }], direction: 'left' });
  g.food = { x: 4, y: 3 }; g.goldenFood = { x: 9, y: 10 }; g.goldenTicks = 50;
  assert.equal(g.tick(), 'ate');
  assert.deepEqual(g.players.map((player) => player.score), [1, 5]);
  assert.deepEqual(g.lastCatches, [{ playerIndex: 0, type: 'rat', points: 1 }, { playerIndex: 1, type: 'golden', points: 5 }]);
  assert.equal(g.foodType, 'rabbit');
  assert.equal(g.totalCatches, 2);
  assert.equal(g.goldenFood, null);
  assert.equal(g.goldenCaught, 1);
});

test('a head-on collision over gold gives neither player bonus points', () => {
  const g = game({ playerCount: 2 });
  Object.assign(g.players[0], { snake: [{ x: 3, y: 3 }], direction: 'right' });
  Object.assign(g.players[1], { snake: [{ x: 5, y: 3 }], direction: 'left' });
  g.goldenFood = { x: 4, y: 3 }; g.goldenTicks = 50;
  assert.equal(g.tick(), 'lost');
  assert.equal(g.totalScore, 0);
  assert.equal(g.goldenCaught, 0);
  assert.deepEqual(g.lastCatches, []);
  assert.equal(g.winner, null);
});

test('growing on golden food keeps the opponent tail solid for collision checks', () => {
  const g = game({ playerCount: 2 });
  Object.assign(g.players[0], { snake: [{ x: 3, y: 3 }], direction: 'right' });
  Object.assign(g.players[1], { snake: [{ x: 5, y: 4 }, { x: 5, y: 3 }, { x: 4, y: 3 }], direction: 'right' });
  g.goldenFood = { x: 6, y: 4 }; g.goldenTicks = 50;
  assert.equal(g.tick(), 'lost');
  assert.equal(g.players[0].collision, 'opponent');
  assert.equal(g.winner, 1);
  assert.equal(g.totalScore, 0);
});

function almostFull() {
  const g = game({ columns: 6, rows: 6 });
  g.snake = [{ x: 3, y: 0 }];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      if (y === 0 && x >= 3) continue;
      g.snake.push({ x, y });
    }
  }
  g.food = { x: 4, y: 0 }; g.goldenFood = { x: 5, y: 0 }; g.goldenTicks = 50;
  return g;
}

test('a lone remaining golden cell does not trigger a premature win', () => {
  const g = almostFull();
  assert.equal(g.tick(), 'ate');
  assert.equal(g.food, null);
  assert.ok(g.goldenFood);
  assert.equal(g.status, 'playing');
  assert.equal(g.tick(), 'won');
  assert.equal(g.score, 6);
  assert.equal(g.snake.length, 36);
  assert.equal(g.goldenFood, null);
});

test('expiring the only remaining golden cell restores normal prey', () => {
  const g = almostFull(); g.tick();
  g.goldenTicks = 1; g.updateGoldenFood();
  assert.equal(g.goldenFood, null);
  assert.deepEqual(g.food, { x: 5, y: 0 });
  assert.equal(g.tick(), 'won');
  assert.equal(g.score, 2);
});

test('crowded boards skip golden spawns safely without hiding normal food', () => {
  const g = almostFull();
  g.goldenFood = null; g.food = { x: 4, y: 0 };
  g.snake.push({ x: 5, y: 0 }); g.goldenDelay = 1;
  g.updateGoldenFood();
  assert.equal(g.goldenFood, null);
  assert.deepEqual(g.food, { x: 4, y: 0 });
  assert.equal(g.goldenTicks, 0);
  assert.equal(g.goldenDelay, 25);
});

test('idle ticks do not age golden food, and resetting clears all bonus state', () => {
  const g = game({ playerCount: 2 });
  g.goldenFood = { x: 4, y: 4 }; g.goldenTicks = 30;
  g.players[1].goldenEaten = 3; g.players[1].score = 15; g.status = 'over';
  assert.equal(g.tick(), 'idle'); assert.equal(g.goldenTicks, 30);
  g.reset();
  assert.equal(g.goldenFood, null); assert.equal(g.goldenTicks, 0);
  assert.equal(g.goldenCaught, 0); assert.equal(g.totalScore, 0);
  assert.deepEqual(g.lastCatches, []); assert.equal(g.goldenDelay, 25);
});
