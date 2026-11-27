const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeAI } = require('../snake-ai.js');
const { SnakeMotion } = require('../snake-motion.js');
const make = (options = {}) => new SnakeGame({ seasonalLevels: true, random: () => 0, ...options });
function complete(g) {
  const player = g.players[0];
  const target = g.levelTarget;
  player.levelEaten = { rat: target, rabbit: target, frog: target - 1 };
  g.food = { ...g.nextHead(player), type: 'frog' };
  assert.equal(g.tick(), 'level-complete');
}
function enter(g, index = 0) {
  const delta = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[g.den.side];
  Object.assign(g.players[index], { snake: [{ x: g.den.x - delta[0], y: g.den.y - delta[1] }], direction: { left: 'left', right: 'right', top: 'up', bottom: 'down' }[g.den.side], turns: [] });
  return g.tick();
}

test('every map has an edge den with a clear approach; only actual entry advances the season', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    const g = make({ mode, mushroomCount: 4, powerupsEnabled: true });
    const original = JSON.stringify(g.obstacles);
    complete(g);
    assert.equal(g.level, 1);
    assert.equal(g.season, 'winter');
    assert.equal(g.startNextLevel(), false);
    assert.ok(g.den.x === 0 || g.den.y === 0 || g.den.x === g.columns - 1 || g.den.y === g.rows - 1);
    assert.ok(!g.obstacles.some((cell) => cell.x === g.den.x && cell.y === g.den.y));
    assert.equal(g.foods.length + g.powerups.length + g.mushrooms.length + g.herbs.length, 0);
    assert.equal(enter(g), 'hibernated');
    const score = g.score;
    const eaten = { ...g.eaten };
    assert.equal(g.tick(), 'idle');
    assert.equal(g.startNextLevel(), true);
    assert.equal(g.level, 2);
    assert.equal(g.levelTarget, 15);
    assert.equal(g.interval, 200);
    assert.equal(g.snake.length, 3);
    assert.equal(g.score, score);
    assert.deepEqual(g.eaten, eaten);
    assert.deepEqual(g.progressionEaten, { rat: 0, rabbit: 0, frog: 0 });
    assert.equal(JSON.stringify(g.obstacles), original, 'the temporary entrance is closed for summer');
  }
});

test('fresh per-level quotas rise by five while round score and catches remain', () => {
  const g = make();
  for (const expected of [10, 15, 20, 25]) {
    assert.equal(g.levelTarget, expected);
    complete(g); enter(g); g.startNextLevel();
  }
  assert.equal(g.level, 5);
  assert.equal(g.levelTarget, 30);
  assert.equal(g.score, 4);
  assert.equal(g.eaten.frog, 4);
  g.reset();
  assert.equal(g.levelTarget, 10);
  assert.equal(g.level, 1);
  assert.equal(g.season, 'summer');
  assert.equal(g.den, null);
});

test('co-op waits for both teammates and removes resting bodies from the shared arena', () => {
  const g = make({ playerCount: 2, teamMode: true });
  complete(g);
  assert.equal(enter(g, 0), 'den-entered');
  assert.equal(g.players[0].hibernating, true);
  assert.equal(g.turn('up', 0), false);
  assert.equal(g.livingPlayers.length, 1);
  const restTime = g.players[0].survivedMs;
  assert.equal(enter(g, 1), 'hibernated');
  assert.equal(g.players[0].survivedMs, restTime);
  assert.equal(g.startNextLevel(), true);
  assert.ok(g.players.every((player) => player.snake.length === 3 && !player.hibernating));
});

test('AI rests automatically without awarding an accidental survival win or resurrecting dead bots', () => {
  const g = make({ aiCount: 3 });
  g.players[3].alive = false;
  complete(g);
  assert.equal(g.status, 'playing');
  assert.ok(g.players.slice(1, 3).every((player) => player.hibernating));
  assert.equal(SnakeAI.chooseDirection(g, 1), null);
  assert.equal(enter(g), 'hibernated');
  g.startNextLevel();
  assert.equal(g.players[3].alive, false);
  assert.ok(g.players.slice(0, 3).every((player) => player.alive && !player.hibernating));
});

test('winter blocks are sparse, spaced out, never spawn on bodies or their clear route, and vanish in summer', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) for (const playerCount of [1, 2]) for (let seed = 1; seed <= 6; seed++) {
    let value = seed;
    const g = make({ mode, playerCount, teamMode: true, random: () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296) });
    const distance = (a,b) => { const x=Math.abs(a.x-b.x), y=Math.abs(a.y-b.y); return g.wraps ? Math.min(x,g.columns-x)+Math.min(y,g.rows-y) : x+y; };
    let routes;
    const add = g.addWinterBlocks.bind(g);
    g.addWinterBlocks = () => { routes = g.players.slice(0,playerCount).map((p) => g.pathToDen(p)); add(); };
    complete(g);
    const blocks = g.obstacles.filter((cell) => cell.type === 'winter-block');
    assert.ok(blocks.length > 0 && blocks.length <= 3);
    assert.notEqual(g.den.side, 'top');
    for (const [index,block] of blocks.entries()) {
      assert.ok(g.players.every((p) => p.snake.every((cell) => distance(cell,block) > 0)));
      assert.ok(g.players.every((p) => distance(p.snake[0],block) > 3));
      assert.ok(distance(g.den,block) > 3);
      assert.ok(routes.flat().every((cell) => distance(cell,block) > 1));
      assert.ok(blocks.slice(index+1).every((other) => distance(block,other) >= 4));
    }
    assert.ok(g.players.slice(0,playerCount).every((p) => g.pathToDen(p)));
    enter(g); if(playerCount===2) enter(g,1); g.startNextLevel();
    assert.ok(g.obstacles.every((cell) => cell.type !== 'winter-block'));
  }
});

test('hitting a frozen winter block loses the run', () => {
  const g=make(); complete(g);
  const block=g.obstacles.find((cell)=>cell.type==='winter-block');
  g.snake=[{x:block.x-1,y:block.y}];g.direction='right';
  assert.equal(g.tick(),'lost'); assert.equal(g.collision,'winter-block');
});

test('winter is still a real steering challenge and collisions can end the run', () => {
  const g = make({ mode: 'obstacles' }); complete(g);
  const wall = g.obstacles.find((cell) => cell.x === 0 && cell.y === 1);
  g.snake = [{ x: 1, y: 1 }]; g.direction = 'left';
  if (wall) assert.equal(g.tick(), 'lost');
  assert.equal(g.level, 1);
});

test('den animation is read-only, begins at the real body, and ends inside the hole', () => {
  const body = [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }];
  const before = JSON.stringify(body); const den = { x: 0, y: 5 };
  const options = { columns: 24, rows: 20, wraps: false };
  assert.deepEqual(SnakeMotion.hibernate(body, den, 0, options), body);
  assert.deepEqual(SnakeMotion.hibernate(body, den, 1, options), []);
  const middle = SnakeMotion.hibernate(body, den, .6, options);
  assert.deepEqual(middle[0], den);
  assert.ok(middle.length < body.length, 'segments disappear inside, rather than the whole snake fading');
  assert.ok(SnakeMotion.hibernationDuration(33) > 10000);
  assert.equal(SnakeMotion.hibernationDuration(500), 15000);
  assert.equal(JSON.stringify(body), before);
});
