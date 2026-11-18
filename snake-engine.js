/* Pure game rules, shared by the browser and the Node test suite. */
(function (root) {
  'use strict';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;

  class SnakeGame {
    constructor({ columns = 24, rows = 20, random = Math.random, mode = 'classic' } = {}) {
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 6 || rows < 6) {
        throw new RangeError('The board must be at least 6 × 6 cells.');
      }
      this.columns = columns;
      this.rows = rows;
      this.random = random;
      this.reset({ mode });
    }

    reset({ mode = this.mode } = {}) {
      if (!['classic', 'obstacles', 'maze'].includes(mode)) throw new RangeError('Unknown game mode.');
      this.mode = mode;
      this.collision = null;
      const x = Math.floor(this.columns / 2);
      const y = Math.floor(this.rows / 2);
      this.snake = [{ x, y }, { x: x - 1, y }, { x: x - 2, y }];
      this.direction = 'right';
      this.turns = [];
      this.score = 0;
      this.eaten = { rat: 0, rabbit: 0, frog: 0 };
      this.status = 'playing';
      this.obstacles = this.createObstacles();
      this.placeFood();
    }

    get wraps() { return this.mode === 'classic'; }

    createObstacles() {
      if (this.wraps) return [];
      const cells = new Map();
      const head = this.snake[0];
      const add = (x, y, type) => {
        const border = x === 0 || y === 0 || x === this.columns - 1 || y === this.rows - 1;
        // Keep the starting body and a three-cell runway clear, including room to turn.
        if (!border && Math.abs(y - head.y) <= 1 && x >= head.x - 3 && x <= head.x + 3) return;
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

    get level() { return 1 + Math.floor(Math.min(...Object.values(this.eaten)) / 10); }
    get speedMultiplier() { return 1 + (this.level - 1) * 0.2; }
    get interval() { return Math.max(40, 160 / this.speedMultiplier); }

    // Each catch reveals a different animal; a complete board has no prey.
    get foodType() { return this.food ? ['rat', 'rabbit', 'frog'][this.score % 3] : null; }

    turn(direction) {
      if (this.status !== 'playing' || !directions[direction] || this.turns.length >= 2) return false;
      const previous = this.turns.at(-1) || this.direction;
      const a = directions[previous];
      const b = directions[direction];
      if (previous === direction || (a.x + b.x === 0 && a.y + b.y === 0)) return false;
      this.turns.push(direction);
      return true;
    }

    placeFood() {
      const occupied = new Set([...this.snake, ...this.obstacles].map(({ x, y }) => `${x},${y}`));
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
      this.direction = this.turns.shift() || this.direction;
      const delta = directions[this.direction];
      const head = {
        x: this.snake[0].x + delta.x,
        y: this.snake[0].y + delta.y,
      };
      if (this.wraps) {
        head.x = (head.x + this.columns) % this.columns;
        head.y = (head.y + this.rows) % this.rows;
      }
      const obstacle = this.obstacles.find((cell) => same(cell, head));
      if (obstacle || head.x < 0 || head.y < 0 || head.x >= this.columns || head.y >= this.rows) {
        this.collision = obstacle ? obstacle.type : 'wall';
        this.status = 'over';
        return 'lost';
      }
      const eats = this.food !== null && same(head, this.food);
      // The tail vacates its cell on a non-growing move.
      const body = eats ? this.snake : this.snake.slice(0, -1);
      if (body.some((cell) => same(cell, head))) {
        this.collision = 'body';
        this.status = 'over';
        return 'lost';
      }
      this.snake.unshift(head);
      if (eats) {
        this.eaten[this.foodType]++;
        this.score++;
        this.placeFood();
        if (!this.food) { this.status = 'won'; return 'won'; }
        return 'ate';
      }
      this.snake.pop();
      return 'moved';
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeGame };
  else root.SnakeGame = SnakeGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
