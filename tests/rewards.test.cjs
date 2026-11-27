const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeRewards } = require('../snake-rewards.js');
const game = (options = {}) => new SnakeGame({ random: () => 0, combosEnabled: true, ...options });
function catchAnimal(g, type = 'rat', index = 0) {
  g.food = { ...g.nextHead(g.players[index]), type };
  return g.tick();
}

test('animal chains award just one extra point per third human catch, without extra growth', () => {
  const g = game();
  const length = g.snake.length;
  for (let i = 1; i <= 6; i++) {
    assert.equal(catchAnimal(g), 'ate');
    assert.equal(g.score, i + Math.floor(i / 3));
    assert.equal(g.snake.length, length + i);
    assert.equal(g.players[0].comboCount, i);
    assert.equal(g.players[0].bestCombo, i);
    assert.equal(g.lastCatches[0].points, i % 3 === 0 ? 2 : 1);
  }
  assert.equal(g.players[0].comboBonus, 2);
  assert.deepEqual(g.lastEvents, [{ type: 'combo-bonus', playerIndex: 0, streak: 6, bonus: 1 }]);
});

test('the 12-second active-time window expires independently of level speed and resets on restart', () => {
  const g = game(); catchAnimal(g);
  const player = g.players[0];
  assert.equal(g.comboRemainingMs(player), 12000);
  g.eaten = { rat: 10, rabbit: 10, frog: 10 };
  g.elapsedMs = player.comboUntil - g.interval;
  catchAnimal(g);
  assert.equal(player.comboCount, 2, 'a catch exactly at the deadline still counts');
  g.elapsedMs = player.comboUntil;
  catchAnimal(g);
  assert.equal(player.comboCount, 1);
  assert.equal(player.bestCombo, 2);
  g.reset();
  assert.equal(g.combosEnabled, true);
  assert.equal(g.players[0].comboCount, 0);
  assert.equal(g.players[0].bestCombo, 0);
  assert.equal(g.players[0].comboBonus, 0);
});

test('golden food and power-ups neither extend nor add to an animal chain', () => {
  const g = game(); catchAnimal(g);
  const player = g.players[0]; const deadline = player.comboUntil;
  g.food = { x: 0, y: 0 };
  g.goldenFood = g.nextHead(player); g.goldenTicks = 50;
  assert.equal(g.tick(), 'ate');
  assert.equal(player.comboCount, 1);
  assert.equal(player.comboUntil, deadline);
  g.powerups = [{ ...g.nextHead(player), type: 'shield', expiresAt: 10000 }];
  g.tick();
  assert.equal(player.comboCount, 1);
  assert.equal(player.comboUntil, deadline);
  assert.equal(g.score, 6);
});

test('pause freezes chain and survival time while AI receives no human chain bonuses', () => {
  const g = game({ aiCount: 2 });
  catchAnimal(g); g.status = 'paused';
  const snapshot = JSON.stringify(g);
  assert.equal(g.tick(), 'idle');
  assert.equal(JSON.stringify(g), snapshot);
  g.status = 'playing';
  for (let i = 0; i < 3; i++) catchAnimal(g, 'rabbit', 1);
  assert.equal(g.players[1].score, 3);
  assert.equal(g.players[1].comboCount, 0);
  assert.equal(g.players[1].comboBonus, 0);
});

test('local human chains remain independent and do not change animal-based levels', () => {
  const g = game({ playerCount: 2 });
  for (let i = 0; i < 3; i++) catchAnimal(g, 'rat', 0);
  catchAnimal(g, 'rabbit', 1);
  assert.equal(g.players[0].comboCount, 3);
  assert.equal(g.players[0].comboBonus, 1);
  assert.equal(g.players[1].comboCount, 1);
  assert.equal(g.players[1].comboBonus, 0);
  assert.equal(g.level, 1);
  const solo = game();
  for (const type of ['rat', 'rabbit', 'frog']) {
    for (let i = 0; i < 10; i++) { solo.snake = [{ x: 12, y: 10 }]; catchAnimal(solo, type); }
  }
  assert.equal(solo.level, 2);
  assert.equal(solo.interval, 200);
  assert.deepEqual(solo.eaten, { rat: 10, rabbit: 10, frog: 10 });
  assert.equal(solo.score, 40);
});

test('legacy engine callers can keep base scoring without enabling combos', () => {
  const g = new SnakeGame({ random: () => 0 });
  for (let i = 0; i < 3; i++) catchAnimal(g);
  assert.equal(g.score, 3);
  assert.equal(g.players[0].bestCombo, 0);
});

test('shield saves are counted once and survival time stops for eliminated players', () => {
  const g = game({ aiCount: 2 });
  const bot = g.players[1];
  bot.shieldUntil = 8000;
  g.obstacles = [{ ...g.nextHead(bot), type: 'wall' }];
  g.tick();
  assert.equal(bot.shieldSaves, 1);
  g.tick();
  assert.equal(bot.alive, false);
  const survived = bot.survivedMs;
  g.tick();
  assert.equal(bot.survivedMs, survived);
});

test('round goals rotate without randomness and are genuinely optional non-scoring progress', () => {
  assert.deepEqual([1, 2, 3, 4].map((round) => SnakeRewards.goalFor(round).id), ['balanced', 'survivor', 'combo', 'balanced']);
  assert.equal(Object.isFrozen(SnakeRewards.goalFor(1)), true);
  const g = game();
  const player = g.players[0];
  for (const type of ['rat', 'rabbit', 'frog']) catchAnimal(g, type);
  assert.deepEqual(SnakeRewards.goalProgress(player, SnakeRewards.goalFor(1)), { value: 3, target: 3, complete: true });
  assert.equal(SnakeRewards.goalProgress(player, SnakeRewards.goalFor(3)).complete, true);
  assert.equal(SnakeRewards.goalProgress(player, SnakeRewards.goalFor(2)).complete, false);
  assert.equal(player.score, 4, 'goals add no extra score beyond ordinary catches and combo');
});

test('medals and summaries are read-only, human-specific and report the supplied record holder', () => {
  const g = game(); const player = g.players[0];
  Object.assign(player, { eaten: { rat: 2, rabbit: 1, frog: 3 }, survivedMs: 61000, shieldSaves: 1, bestCombo: 4, comboBonus: 1 });
  const before = JSON.stringify(player);
  const result = SnakeRewards.summary(player, { goal: SnakeRewards.goalFor(2), newRecord: true });
  assert.equal(result.time, '1:01');
  assert.equal(result.animals, 6);
  assert.equal(result.medals.length, 5);
  assert.equal(result.goal.complete, true);
  result.eaten.rat = 100;
  assert.equal(JSON.stringify(player), before);
  assert.equal(SnakeRewards.summary(player).medals.some((medal) => medal.includes('New record')), false);
  assert.deepEqual(SnakeRewards.medals({ ...player, ai: true }, true), []);
  assert.equal(SnakeRewards.timeLabel(Infinity), '0:00');
  assert.equal(SnakeRewards.timeLabel(-10), '0:00');
});
