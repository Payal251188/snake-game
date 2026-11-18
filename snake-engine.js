/* Pure game rules, shared by the browser and the Node test suite. */
(function (root) {
  'use strict';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const animals = ['rat', 'rabbit', 'frog'];

  class SnakeGame {
    constructor({ columns = 24, rows = 20, random = Math.random, mode = 'classic', playerCount = 1 } = {}) {
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 6 || rows < 6) {
        throw new RangeError('The board must be at least 6 × 6 cells.');
      }
      this.columns = columns;
      this.rows = rows;
      this.random = random;
      this.reset({ mode, playerCount });
    }

    reset({ mode = this.mode, playerCount = this.playerCount } = {}) {
      if (!['classic', 'obstacles', 'maze'].includes(mode)) throw new RangeError('Unknown game mode.');
      if (![1, 2].includes(playerCount)) throw new RangeError('Choose one or two players.');
      this.mode = mode;
      this.playerCount = playerCount;
      this.winner = null;
      this.lastEater = null;
      const x = Math.floor(this.columns / 2);
      const y = playerCount === 2 ? Math.floor(this.rows / 3) : Math.floor(this.rows / 2);
      this.players = Array.from({ length: playerCount }, (_, index) => {
        const headX = index === 0 ? x : this.columns - 1 - x;
        const headY = index === 0 ? y : this.rows - 1 - y;
        return {
          snake: Array.from({ length: 3 }, (__, i) => ({ x: headX + (index === 0 ? -i : i), y: headY })),
          direction: index === 0 ? 'right' : 'left', turns: [], score: 0,
          eaten: { rat: 0, rabbit: 0, frog: 0 }, collision: null,
        };
      });
      this.status = 'playing';
      this.obstacles = this.createObstacles();
      this.placeFood();
    }

    // Preserve the solo API for callers that address player one directly.
    get snake() { return this.players[0].snake; }
    set snake(value) { this.players[0].snake = value; }
    get direction() { return this.players[0].direction; }
    set direction(value) { this.players[0].direction = value; }
    get turns() { return this.players[0].turns; }
    set turns(value) { this.players[0].turns = value; }
    get score() { return this.players[0].score; }
    set score(value) { this.players[0].score = value; }
    get eaten() { return this.players[0].eaten; }
    set eaten(value) { this.players[0].eaten = value; }
    get collision() { return this.players[0].collision; }
    set collision(value) { this.players[0].collision = value; }
    get totalScore() { return this.players.reduce((sum, player) => sum + player.score, 0); }
    get totalEaten() {
      return Object.fromEntries(animals.map((animal) => [animal, this.players.reduce((sum, player) => sum + player.eaten[animal], 0)]));
    }
    get wraps() { return this.mode === 'classic'; }

    createObstacles() {
      if (this.wraps) return [];
      const cells = new Map();
      const add = (x, y, type) => {
        const border = x === 0 || y === 0 || x === this.columns - 1 || y === this.rows - 1;
        // Give both starting bodies a clear runway and room to turn.
        if (!border && this.players.some(({ snake }) => Math.abs(y - snake[0].y) <= 1 && Math.abs(x - snake[0].x) <= 3)) return;
        cells.set(`${x},${y}`, { x, y, type });
      };
      for (let x = 0; x < this.columns; x++) {
        add(x, 0, 'wall'); add(x, this.rows - 1, 'wall');
      }
      for (let y = 1; y < this.rows - 1; y++) {
        add(0, y, 'wall'); add(this.columns - 1, y, 'wall');
      }
      if (this.mode === 'maze') {
        // Alternating three-cell gates connect every lane; no sealed-off food pockets.
        for (let x = 4, lane = 0; x < this.columns - 2; x += 4, lane++) {
          const gap = lane % 2 === 0 ? this.rows - 5 : 2;
          for (let y = 1; y < this.rows - 1; y++) {
            if (y < gap || y >= gap + 3) add(x, y, 'wall');
          }
        }
      } else {
        for (const y of new Set([3, this.rows - 4])) {
          for (let x = 3; x < this.columns - 3; x++) {
            if ((x - 3) % 8 < 4) add(x, y, 'barrier');
          }
        }
        for (let y = 6; y < this.rows - 3; y += 6) {
          for (let x = 3; x < this.columns - 3; x += 6) add(x, y, 'rock');
        }
      }
      return [...cells.values()];
    }

    // Both players share one pace; catches from either count toward the next level.
    get level() { return 1 + Math.floor(Math.min(...Object.values(this.totalEaten)) / 10); }
    get speedMultiplier() { return 1 + (this.level - 1) * 0.2; }
    get interval() { return Math.max(40, 160 / this.speedMultiplier); }
    get foodType() { return this.food ? animals[this.totalScore % 3] : null; }

    turn(direction, playerIndex = 0) {
      const player = this.players[playerIndex];
      if (this.status !== 'playing' || !player || !Object.hasOwn(directions, direction) || player.turns.length >= 2) return false;
      const previous = player.turns.at(-1) || player.direction;
      const a = directions[previous];
      const b = directions[direction];
      if (previous === direction || (a.x + b.x === 0 && a.y + b.y === 0)) return false;
      player.turns.push(direction);
      return true;
    }

    placeFood() {
      const occupied = new Set([...this.players.flatMap((player) => player.snake), ...this.obstacles].map(({ x, y }) => `${x},${y}`));
      const empty = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.columns; x++) {
          if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
        }
      }
      this.food = empty.length ? empty[Math.min(empty.length - 1, Math.max(0, Math.floor(this.random() * empty.length)))] : null;
    }

    tick() {
      if (this.status !== 'playing') return 'idle';
      this.lastEater = null;
      const foodType = this.foodType;
      // Predict all moves before resolving collisions: neither player has first-move priority.
      const moves = this.players.map((player) => {
        player.direction = player.turns.shift() || player.direction;
        const delta = directions[player.direction];
        const head = { x: player.snake[0].x + delta.x, y: player.snake[0].y + delta.y };
        if (this.wraps) {
          head.x = (head.x + this.columns) % this.columns;
          head.y = (head.y + this.rows) % this.rows;
        }
        const eats = this.food !== null && same(head, this.food);
        return { head, eats, body: eats ? player.snake : player.snake.slice(0, -1) };
      });
      const headClash = moves.length === 2 && (same(moves[0].head, moves[1].head)
        || (same(moves[0].head, this.players[1].snake[0]) && same(moves[1].head, this.players[0].snake[0])));
      this.players.forEach((player, index) => {
        const { head } = moves[index];
        const obstacle = this.obstacles.find((cell) => same(cell, head));
        if (headClash) player.collision = 'head-on';
        else if (obstacle) player.collision = obstacle.type;
        else if (head.x < 0 || head.y < 0 || head.x >= this.columns || head.y >= this.rows) player.collision = 'wall';
        else if (moves[index].body.some((cell) => same(cell, head))) player.collision = 'body';
        else if (moves.some((move, other) => other !== index && move.body.some((cell) => same(cell, head)))) player.collision = 'opponent';
      });
      if (this.players.some((player) => player.collision)) {
        this.status = 'over';
        const survivors = this.players.map((player, index) => player.collision ? -1 : index).filter((index) => index !== -1);
        this.winner = this.playerCount === 2 && survivors.length === 1 ? survivors[0] : null;
        return 'lost';
      }
      this.players.forEach((player, index) => {
        player.snake.unshift(moves[index].head);
        if (moves[index].eats) {
          player.eaten[foodType]++;
          player.score++;
          this.lastEater = index;
        } else player.snake.pop();
      });
      if (this.lastEater !== null) {
        this.placeFood();
        if (!this.food) {
          this.status = 'won';
          this.winner = this.playerCount === 1 || this.players[0].score > this.players[1].score ? 0
            : this.players[1].score > this.players[0].score ? 1 : null;
          return 'won';
        }
        return 'ate';
      }
      return 'moved';
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeGame };
  else root.SnakeGame = SnakeGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
