const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeGame } = require('../snake-engine.js');
const duel = (options = {}) => new SnakeGame({ playerCount: 2, random: () => 0, ...options });
const key = ({ x, y }) => `${x},${y}`;

function setPlayer(g, index, snake, direction) {
  Object.assign(g.players[index], { snake, direction, turns: [] });
}

test('two independent snakes have safe spawns and connected layouts in every mode', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const columns of [6, 7, 12, 24, 30]) {
      for (const rows of [6, 7, 20, 25]) {
        const g = duel({ mode, columns, rows });
        assert.equal(g.players.length, 2);
        assert.notEqual(g.players[0].turns, g.players[1].turns);
        assert.notEqual(g.players[0].eaten, g.players[1].eaten);
        const occupied = g.players.flatMap((player) => player.snake).map(key);
        assert.equal(new Set(occupied).size, 6);
        const blocked = new Set(g.obstacles.map(key));
        assert.ok(occupied.every((cell) => !blocked.has(cell)));
        const visited = new Set([key(g.snake[0])]);
        const queue = [g.snake[0]];
        for (let i = 0; i < queue.length; i++) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = { x: queue[i].x + dx, y: queue[i].y + dy };
            if (next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || blocked.has(key(next)) || visited.has(key(next))) continue;
            visited.add(key(next)); queue.push(next);
          }
        }
        assert.equal(visited.size + blocked.size, columns * rows);
        const heads = g.players.map((player) => ({ ...player.snake[0] }));
        g.food = null;
        assert.equal(g.tick(), 'moved', `${mode} ${columns}x${rows}`);
        assert.equal(g.players[0].snake[0].x, heads[0].x + 1);
        assert.equal(g.players[1].snake[0].x, heads[1].x - 1);
      }
    }
  }
});

test('food excludes both snakes and obstacles at both random endpoints', () => {
  for (const mode of ['classic', 'obstacles', 'maze']) {
    const g = duel({ mode });
    for (const random of [() => 0, () => 0.5, () => 1]) {
      g.random = random; g.placeFood();
      assert.ok(![...g.players.flatMap((player) => player.snake), ...g.obstacles].some((cell) => key(cell) === key(g.food)));
    }
  }
});

test('turn queues and reversal prevention are independent for each player', () => {
  const g = duel();
  assert.equal(g.turn('up', 0), true);
  assert.equal(g.turn('down', 1), true);
  assert.equal(g.turn('down', 0), false);
  assert.equal(g.turn('up', 1), false);
  assert.equal(g.turn('left', 0), true);
  assert.equal(g.turn('right', 1), true);
  assert.equal(g.turn('up', 0), false);
  assert.equal(g.turn('up', 1), false);
  assert.equal(g.turn('up', 2), false);
  assert.equal(g.turn('__proto__', 0), false);
  assert.equal(g.tick(), 'moved');
  assert.equal(g.players[0].direction, 'up');
  assert.equal(g.players[1].direction, 'down');
  assert.equal(g.tick(), 'moved');
  assert.equal(g.players[0].direction, 'left');
  assert.equal(g.players[1].direction, 'right');
});

test('either player can eat, grow, score and rotate the shared prey', () => {
  const g = duel();
  for (const index of [1, 0, 1]) {
    const lengths = g.players.map((player) => player.snake.length);
    const type = g.foodType;
    const player = g.players[index];
    g.food = { x: player.snake[0].x + (index === 0 ? 1 : -1), y: player.snake[0].y };
    assert.equal(g.tick(), 'ate');
    assert.equal(g.lastEater, index);
    assert.equal(player.snake.length, lengths[index] + 1);
    assert.equal(g.players[1 - index].snake.length, lengths[1 - index]);
    assert.equal(player.eaten[type], 1);
  }
  assert.deepEqual(g.players.map((player) => player.score), [1, 2]);
  assert.equal(g.totalScore, 3);
  assert.equal(g.foodType, 'rat');
  assert.deepEqual(g.totalEaten, { rat: 1, rabbit: 1, frog: 1 });
});

test('a wall, barrier, rock, self or opponent-body crash awards the other player the round', () => {
  for (const type of ['wall', 'barrier', 'rock', 'body', 'opponent']) {
    for (const loser of [0, 1]) {
      const g = duel({ mode: 'obstacles' });
      // Isolate collisions from layout generation while exercising actual resolution.
      g.obstacles = [];
      setPlayer(g, loser, [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], 'right');
      setPlayer(g, 1 - loser, [{ x: 15, y: 15 }, { x: 14, y: 15 }, { x: 13, y: 15 }], 'right');
      if (type === 'body') g.players[loser].snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
      else if (type === 'opponent') g.players[1 - loser].snake.push({ x: 6, y: 5 }, { x: 6, y: 6 });
      else g.obstacles = [{ x: 6, y: 5, type }];
      const before = g.players.map((player) => JSON.stringify(player.snake));
      assert.equal(g.tick(), 'lost');
      assert.equal(g.players[loser].collision, type);
      assert.equal(g.players[1 - loser].collision, null);
      assert.equal(g.winner, 1 - loser);
      assert.deepEqual(g.players.map((player) => JSON.stringify(player.snake)), before);
      assert.equal(g.tick(), 'idle');
    }
  }
});

test('head-on, head-swap and simultaneous independent crashes are draws with no catch awarded', () => {
  for (const scenario of ['head-on', 'swap', 'walls']) {
    const g = duel();
    setPlayer(g, 0, [{ x: 5, y: 5 }], 'right');
    setPlayer(g, 1, [{ x: scenario === 'swap' ? 6 : 7, y: 5 }], 'left');
    g.food = { x: 6, y: 5 };
    if (scenario === 'walls') {
      setPlayer(g, 1, [{ x: 7, y: 8 }], 'left');
      g.obstacles = [{ x: 6, y: 5, type: 'wall' }, { x: 6, y: 8, type: 'wall' }];
    }
    assert.equal(g.tick(), 'lost');
    assert.equal(g.winner, null);
    assert.ok(g.players.every((player) => player.collision));
    assert.equal(g.totalScore, 0);
    assert.equal(g.lastEater, null);
  }
});

test('only a non-growing opponent tail vacates on a simultaneous move', () => {
  for (const grows of [false, true]) {
    const g = duel();
    setPlayer(g, 0, [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }], 'right');
    setPlayer(g, 1, [{ x: 5, y: 4 }, { x: 5, y: 3 }, { x: 4, y: 3 }], 'right');
    g.food = grows ? { x: 6, y: 4 } : { x: 20, y: 10 };
    assert.equal(g.tick(), grows ? 'lost' : 'moved');
    if (grows) { assert.equal(g.players[0].collision, 'opponent'); assert.equal(g.winner, 1); }
    else assert.deepEqual(g.snake[0], { x: 4, y: 3 });
  }
});

test('classic wrapping applies to both players, including wraparound head collisions', () => {
  const g = duel();
  setPlayer(g, 0, [{ x: 23, y: 5 }], 'right');
  setPlayer(g, 1, [{ x: 0, y: 8 }], 'left');
  assert.equal(g.tick(), 'moved');
  assert.deepEqual(g.players[0].snake[0], { x: 0, y: 5 });
  assert.deepEqual(g.players[1].snake[0], { x: 23, y: 8 });
  setPlayer(g, 0, [{ x: 23, y: 5 }], 'right');
  setPlayer(g, 1, [{ x: 1, y: 5 }], 'left');
  assert.equal(g.tick(), 'lost');
  assert.equal(g.winner, null);
});

test('both players contribute to one shared level and pace', () => {
  const g = duel();
  g.players[0].eaten = { rat: 10, rabbit: 6, frog: 4 };
  g.players[1].eaten = { rat: 0, rabbit: 4, frog: 6 };
  assert.equal(g.level, 2);
  assert.equal(g.speedMultiplier, 1.2);
});

test('filling the board compares individual scores, including draws', () => {
  for (const [scores, winner] of [[[2, 1], 0], [[0, 2], 1], [[0, 1], null]]) {
    const g = duel({ columns: 6, rows: 6 });
    setPlayer(g, 0, [{ x: 4, y: 0 }], 'right');
    setPlayer(g, 1, [{ x: 1, y: 1 }, { x: 0, y: 1 }], 'left');
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if ((y === 0 && (x === 4 || x === 5)) || (y === 1 && x < 2)) continue;
        g.snake.push({ x, y });
      }
    }
    g.players.forEach((player, index) => { player.score = scores[index]; });
    g.food = { x: 5, y: 0 };
    assert.equal(g.tick(), 'won');
    assert.equal(g.food, null);
    assert.equal(g.winner, winner);
    assert.equal(g.players.flatMap((player) => player.snake).length, 36);
  }
});

test('reset clears both players and match outcomes, preserves options, and permits solo switching', () => {
  const g = duel({ mode: 'maze' });
  g.players[1].score = 5; g.players[1].collision = 'wall'; g.winner = 0; g.lastEater = 1;
  g.reset();
  assert.equal(g.playerCount, 2); assert.equal(g.mode, 'maze');
  assert.equal(g.winner, null); assert.equal(g.lastEater, null);
  assert.ok(g.players.every((player) => player.score === 0 && player.collision === null && player.snake.length === 3));
  g.reset({ playerCount: 1 }); assert.equal(g.players.length, 1);
  g.reset({ playerCount: 2 }); assert.equal(g.players.length, 2);
  for (const playerCount of [0, 3, '2', null]) assert.throws(() => g.reset({ playerCount }), RangeError);
  assert.equal(g.playerCount, 2);
});
