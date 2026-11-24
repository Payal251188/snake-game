const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeAI } = require('../snake-ai.js');
const key = ({ x, y }) => `${x},${y}`;
const arena = (options = {}) => new SnakeGame({ aiCount: 3, foodCount: 5, random: () => 0, ...options });
const setPlayer = (g, index, x, y, direction = 'right') => {
  Object.assign(g.players[index], { snake: [{ x, y }], direction, turns: [] });
};

function isolatedArena(options = {}) {
  const g = arena(options);
  g.obstacles = [];
  [[2, 2], [6, 6], [10, 10], [16, 16]].slice(0, g.players.length)
    .forEach(([x, y], index) => setPlayer(g, index, x, y));
  g.food = { x: 20, y: 1 };
  g.extraFoods = [];
  return g;
}

test('AI spawns and plentiful food are distinct, in bounds, and clear of every hazard', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const columns of [6, 7, 24]) {
      for (const rows of [6, 20]) {
        for (const aiCount of [2, 3]) {
          for (const foodCount of [1, 5, 10]) {
            const g = arena({ mode, columns, rows, aiCount, foodCount });
            assert.equal(g.playerCount, 1);
            assert.equal(g.players.length, aiCount + 1);
            assert.equal(g.players.filter((player) => player.ai).length, aiCount);
            const bodies = g.players.flatMap((player) => player.snake);
            const blocked = [...bodies, ...g.obstacles];
            assert.equal(new Set(bodies.map(key)).size, bodies.length);
            assert.ok(bodies.every((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < columns && cell.y < rows));
            assert.ok(!bodies.some((cell) => g.obstacles.some((wall) => key(wall) === key(cell))));
            assert.equal(new Set(g.foods.map(key)).size, g.foods.length);
            assert.ok(g.foods.length > 0 && g.foods.length <= foodCount);
            assert.ok(g.foods.every((food) => !blocked.some((cell) => key(cell) === key(food))));
            assert.ok(g.foods.every((food) => ['rat', 'rabbit', 'frog'].includes(food.type)));
          }
        }
      }
    }
  }
});

test('simultaneous human, AI and golden catches retain individual attribution and refill safely', () => {
  const g = isolatedArena({ aiCount: 2 });
  g.food = { x: 3, y: 2 };
  g.extraFoods = [{ x: 7, y: 6, type: 'rabbit' }, { x: 20, y: 15, type: 'frog' }];
  g.goldenFood = { x: 11, y: 10 };
  g.goldenTicks = 50;
  assert.equal(g.tick(), 'ate');
  assert.deepEqual(g.players.map((player) => player.score), [1, 1, 5]);
  assert.deepEqual(g.totalEaten, { rat: 1, rabbit: 1, frog: 0 });
  assert.deepEqual(g.lastCatches, [
    { playerIndex: 0, type: 'rat', points: 1 },
    { playerIndex: 1, type: 'rabbit', points: 1 },
    { playerIndex: 2, type: 'golden', points: 5 },
  ]);
  assert.equal(g.foods.length, 5);
  assert.equal(new Set(g.foods.map(key)).size, 5);
  assert.ok(g.foods.every((food) => !g.players.some((player) => player.snake.some((cell) => key(cell) === key(food)))));
  assert.equal(g.goldenFood, null);
});

test('an eliminated bot disappears from collisions while remaining opponents keep playing', () => {
  const g = isolatedArena({ aiCount: 2 });
  g.obstacles = [{ x: 7, y: 6, type: 'wall' }];
  assert.equal(g.tick(), 'eliminated');
  assert.equal(g.players[1].alive, false);
  assert.equal(g.players[1].collision, 'wall');
  assert.equal(g.status, 'playing');
  assert.equal(g.livingPlayers.length, 2);
  assert.equal(g.turn('up', 1), false);
  assert.ok(g.emptyCells().some((cell) => cell.x === 6 && cell.y === 6), 'dead body frees its cells');
  g.obstacles.push({ x: 12, y: 10, type: 'rock' });
  assert.equal(g.tick(), 'won');
  assert.equal(g.winner, 0);
  assert.equal(g.endReason, 'survival');
  assert.equal(g.tick(), 'idle');
});

test('human death ends an AI round even when multiple bots survive', () => {
  const g = isolatedArena();
  g.obstacles = [{ x: 3, y: 2, type: 'barrier' }];
  g.food = { x: 3, y: 2 };
  assert.equal(g.tick(), 'lost');
  assert.equal(g.players[0].alive, false);
  assert.equal(g.score, 0);
  assert.equal(g.livingPlayers.length, 3);
  assert.equal(g.winner, null);
});

test('three-way head clashes eliminate all participants without awarding food', () => {
  const g = isolatedArena({ aiCount: 2 });
  setPlayer(g, 0, 4, 5);
  setPlayer(g, 1, 6, 5, 'left');
  setPlayer(g, 2, 5, 4, 'down');
  g.food = { x: 5, y: 5 };
  assert.equal(g.tick(), 'lost');
  assert.ok(g.players.every((player) => !player.alive && player.collision === 'head-on'));
  assert.equal(g.totalScore, 0);
  assert.deepEqual(g.lastCatches, []);
});

test('AI head swaps are simultaneous, and the surviving human wins', () => {
  const g = isolatedArena({ aiCount: 2 });
  setPlayer(g, 1, 5, 5);
  setPlayer(g, 2, 6, 5, 'left');
  assert.equal(g.tick(), 'won');
  assert.equal(g.winner, 0);
  assert.ok(g.players.slice(1).every((player) => player.collision === 'head-on'));
});

test('golden food never overlaps any of the plentiful prey items', () => {
  for (const random of [() => 0, () => 0.5, () => 1]) {
    const g = arena({ foodCount: 10, random });
    g.goldenDelay = 1;
    g.updateGoldenFood();
    assert.ok(g.goldenFood);
    assert.ok(!g.foods.some((food) => key(food) === key(g.goldenFood)));
    assert.ok(!g.players.some((player) => player.snake.some((cell) => key(cell) === key(g.goldenFood))));
  }
});

test('food refilling terminates on a nearly full board and reset preserves preferences', () => {
  const g = new SnakeGame({ columns: 6, rows: 6, foodCount: 10, random: () => 0 });
  g.snake = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (x !== 5 || y !== 5) g.snake.push({ x, y });
  g.food = null;
  g.extraFoods = [];
  g.replenishFood();
  assert.deepEqual(g.foods, [{ x: 5, y: 5, type: 'rat' }]);
  const ai = arena();
  ai.players[1].alive = false;
  ai.reset();
  assert.equal(ai.aiCount, 3);
  assert.equal(ai.foodCount, 5);
  assert.ok(ai.players.every((player) => player.alive && player.score === 0 && player.snake.length === 3));
  ai.reset({ aiCount: 0, playerCount: 2, foodCount: 1 });
  assert.equal(ai.players.length, 2);
  assert.equal(ai.foods.length, 1);
  for (const options of [{ aiCount: 4 }, { aiCount: -1 }, { aiCount: 2.5 }, { aiCount: 2, playerCount: 2 }, { foodCount: 0 }, { foodCount: 11 }, { foodCount: '5' }]) {
    assert.throws(() => ai.reset(options), RangeError);
  }
});

test('AI seeks reachable food, avoids walls and never reverses', () => {
  const g = isolatedArena({ aiCount: 2 });
  setPlayer(g, 1, 5, 5);
  g.food = { x: 8, y: 5 };
  assert.equal(SnakeAI.chooseDirection(g, 1), 'right');
  g.obstacles = [{ x: 6, y: 5, type: 'wall' }];
  const direction = SnakeAI.chooseDirection(g, 1);
  assert.ok(['up', 'down'].includes(direction));
  assert.equal(g.turn(direction, 1), true);
});

test('AI routes around a barrier and respects reserved next cells', () => {
  const g = isolatedArena({ aiCount: 2 });
  setPlayer(g, 1, 5, 5);
  g.food = { x: 7, y: 5 };
  g.obstacles = [4, 5, 6].map((y) => ({ x: 6, y, type: 'wall' }));
  assert.ok(['up', 'down'].includes(SnakeAI.chooseDirection(g, 1)));
  g.obstacles = [];
  assert.notEqual(SnakeAI.chooseDirection(g, 1, new Set(['6,5'])), 'right');
});

test('AI uses classic wraparound routes and leaves human and dead-bot input alone', () => {
  const g = isolatedArena({ aiCount: 2 });
  setPlayer(g, 1, 23, 5);
  g.food = { x: 0, y: 5 };
  assert.equal(SnakeAI.chooseDirection(g, 1), 'right');
  g.turn('up', 0);
  g.players[2].alive = false;
  const humanTurns = [...g.turns];
  SnakeAI.steer(g);
  assert.deepEqual(g.turns, humanTurns);
  assert.deepEqual(g.players[2].turns, []);
  g.status = 'over';
  const snapshot = JSON.stringify(g.players);
  SnakeAI.steer(g);
  assert.equal(JSON.stringify(g.players), snapshot);
});

test('seeded AI simulations stay legal and collect food in every map mode', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    let seed = 42;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const g = arena({ mode, random, foodCount: 10 });
    g.players[0].ai = true; // Autopilot the human only inside this simulation.
    for (let tick = 0; tick < 300 && g.status === 'playing'; tick++) {
      SnakeAI.steer(g);
      g.tick();
      const bodies = g.livingPlayers.flatMap((player) => player.snake);
      assert.equal(new Set(bodies.map(key)).size, bodies.length);
      assert.equal(new Set(g.foods.map(key)).size, g.foods.length);
      assert.ok(g.foods.every((food) => !bodies.some((cell) => key(cell) === key(food))));
    }
    assert.ok(g.totalScore > 0, `${mode} bots collect food`);
  }
});
