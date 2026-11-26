const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeAI } = require('../snake-ai.js');
const key = ({ x, y }) => `${x},${y}`;
const game = (options = {}) => new SnakeGame({ random: () => 0, ...options });
const pickup = (g, type, index = 0) => {
  g.nextPowerupAt = Infinity;
  g.powerups = [{ ...g.nextHead(g.players[index]), type, expiresAt: g.elapsedMs + 10000 }];
  return g.tick();
};

function safeItems(g) {
  const items = [...g.foods, ...g.mushrooms, ...g.herbs, ...g.powerups, g.goldenFood].filter(Boolean);
  const blocked = new Set([...g.obstacles, ...g.livingPlayers.flatMap((player) => player.snake)].map(key));
  assert.equal(new Set(items.map(key)).size, items.length);
  assert.ok(items.every((item) => !blocked.has(key(item))));
}

test('the slower starting pace changes only after humans meet all three animal targets', () => {
  const g = game({ aiCount: 3 });
  assert.equal(g.interval, 240);
  g.players.slice(1).forEach((player) => { player.eaten = { rat: 100, rabbit: 100, frog: 100 }; });
  assert.equal(g.level, 1);
  g.eaten = { rat: 9, rabbit: 10, frog: 10 };
  assert.equal(g.level, 1);
  g.eaten.rat++;
  assert.equal(g.level, 2);
  assert.equal(g.interval, 200);
  g.eaten = { rat: 20, rabbit: 20, frog: 20 };
  assert.equal(g.level, 3);
  assert.equal(g.speedMultiplier, 1.4);
  assert.deepEqual(g.progressionEaten, { rat: 20, rabbit: 20, frog: 20 });
  assert.ok(g.totalEaten.rat > g.progressionEaten.rat, 'AI catches remain visible in round statistics');
});

test('both human players contribute in local versus', () => {
  const g = game({ playerCount: 2 });
  g.players[0].eaten = { rat: 10, rabbit: 0, frog: 10 };
  g.players[1].eaten = { rat: 0, rabbit: 10, frog: 0 };
  assert.equal(g.level, 2);
  assert.equal(g.interval, 200);
});

test('rats scurry, rabbits hop and frogs choose safe random landing cells', () => {
  const g = game({ animatedFood: true, foodCount: 3, mode: 'classic' });
  const before = [g.food, ...g.extraFoods].map((food) => ({ ...food }));
  g.elapsedMs = 10000;
  [g.food, ...g.extraFoods].forEach((food) => { food.motion.nextAt = 0; });
  g.updateAnimalMotion();
  const after = [g.food, ...g.extraFoods];
  after.forEach((food, i) => {
    assert.notEqual(key(food), key(before[i]));
    assert.deepEqual(food.motion.from, { x: before[i].x, y: before[i].y });
    assert.ok(food.motion.duration < g.interval);
    const dx = Math.min(Math.abs(food.x - before[i].x), g.columns - Math.abs(food.x - before[i].x));
    const dy = Math.min(Math.abs(food.y - before[i].y), g.rows - Math.abs(food.y - before[i].y));
    if (food.type === 'rat') assert.equal(dx + dy, 1);
    if (food.type === 'rabbit') assert.equal(dx + dy, 2);
  });
  safeItems(g);
});

test('nearby animals stay catchable and their types stay stable when another animal is eaten', () => {
  const g = game({ animatedFood: true, foodCount: 3 });
  g.food.x = g.snake[0].x + 1; g.food.y = g.snake[0].y;
  g.food.motion.nextAt = 0;
  g.elapsedMs = 10000;
  const position = key(g.food);
  g.updateAnimalMotion();
  assert.equal(key(g.food), position, 'food does not escape at the last instant');
  g.food.x = 20; g.food.y = 18;
  const rabbit = g.extraFoods.find((food) => food.type === 'rabbit');
  g.snake = [{ x: rabbit.x - 1, y: rabbit.y }];
  assert.equal(g.tick(), 'ate');
  assert.equal(g.foodType, 'rat');
  assert.equal(g.eaten.rabbit, 1);
});

test('shield pickup gives one safe collision without points, growth or invalid movement', () => {
  const g = game({ powerupsEnabled: true });
  assert.equal(pickup(g, 'shield'), 'ate');
  assert.equal(g.score, 0);
  assert.equal(g.snake.length, 3);
  assert.equal(g.shieldRemainingMs(g.players[0]), 8000);
  const before = JSON.stringify(g.snake);
  g.obstacles = [{ ...g.nextHead(g.players[0]), type: 'wall' }];
  assert.equal(g.tick(), 'blocked');
  assert.equal(JSON.stringify(g.snake), before);
  assert.equal(g.status, 'playing');
  assert.equal(g.shieldRemainingMs(g.players[0]), 0);
  assert.deepEqual(g.lastEvents, [{ type: 'shield-block', playerIndex: 0 }]);
  assert.equal(g.tick(), 'lost', 'a shield is consumed by the first collision');
});

test('both shielded snakes stop safely before a shared head-on pickup', () => {
  const g = game({ playerCount: 2 });
  Object.assign(g.players[0], { snake: [{ x: 4, y: 5 }], direction: 'right', shieldUntil: 8000 });
  Object.assign(g.players[1], { snake: [{ x: 6, y: 5 }], direction: 'left', shieldUntil: 8000 });
  g.food = { x: 5, y: 5 };
  assert.equal(g.tick(), 'blocked');
  assert.deepEqual(g.players.map((player) => player.snake[0]), [{ x: 4, y: 5 }, { x: 6, y: 5 }]);
  assert.equal(g.totalScore, 0);
  assert.equal(g.lastEvents.length, 2);
});

test('a shield-stopped tail stays solid for simultaneous opponent collision checks', () => {
  const g = game({ playerCount: 2 });
  Object.assign(g.players[0], { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], direction: 'right', shieldUntil: 8000 });
  Object.assign(g.players[1], { snake: [{ x: 3, y: 4 }], direction: 'down' });
  g.food = { x: 20, y: 18 };
  g.obstacles = [{ x: 6, y: 5, type: 'wall' }];
  assert.equal(g.tick(), 'lost');
  assert.equal(g.players[0].collision, null);
  assert.equal(g.players[1].collision, 'opponent');
  assert.equal(g.winner, 0);
});

test('shield expiry and slow motion use active time, freeze on pause and clear on reset', () => {
  const g = game({ powerupsEnabled: true });
  pickup(g, 'slow');
  assert.equal(g.interval, 360);
  assert.equal(g.slowRemainingMs, 6000);
  const paused = JSON.stringify(g);
  g.status = 'paused';
  const stopped = JSON.stringify(g);
  assert.equal(g.tick(), 'idle');
  assert.equal(JSON.stringify(g), stopped);
  g.status = 'playing';
  assert.equal(JSON.stringify(g), paused);
  g.eaten = { rat: 10, rabbit: 10, frog: 10 };
  assert.equal(g.interval, 300, 'slow motion scales the current level speed');
  for (let i = 0; i < 20; i++) g.tick();
  assert.equal(g.slowRemainingMs, 0);
  assert.equal(g.interval, 200);
  g.reset();
  assert.equal(g.interval, 240);
  assert.equal(g.powerups.length, 0);
  g.players[0].shieldUntil = g.elapsedMs + 100;
  g.obstacles = [{ ...g.nextHead(g.players[0]), type: 'wall' }];
  assert.equal(g.tick(), 'lost', 'expired shields do not protect');
});

test('powerups spawn one at a time away from other items and expire when untouched', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const random of [() => 0, () => 1]) {
      const g = game({ powerupsEnabled: true, mushroomCount: 4, foodCount: 10, mode, random });
      assert.equal(g.powerups.length, 0);
      g.elapsedMs = 7000;
      g.updatePowerups();
      assert.equal(g.powerups.length, 1);
      assert.ok(['shield', 'slow'].includes(g.powerups[0].type));
      g.updatePowerups();
      assert.equal(g.powerups.length, 1);
      safeItems(g);
      g.elapsedMs = g.powerups[0].expiresAt;
      g.updatePowerups();
      assert.equal(g.powerups.length, 0);
    }
  }
});

test('moving foods and powerups remain safe across seeded multi-snake games', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    let seed = 104;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const g = game({ aiCount: 3, animatedFood: true, powerupsEnabled: true, mushroomCount: 4, foodCount: 10, mode, random });
    g.players[0].ai = true;
    for (let i = 0; i < 220 && g.status === 'playing'; i++) {
      SnakeAI.steer(g); g.tick(); safeItems(g);
      assert.ok(g.powerups.length <= 1);
    }
  }
});
