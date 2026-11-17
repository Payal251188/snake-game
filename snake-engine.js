/* Pure game rules, shared by the browser and the Node test suite. */
(function (root) {
  'use strict';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;

  class SnakeGame {
    constructor({ columns = 24, rows = 20, random = Math.random } = {}) {
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 6 || rows < 6) {
        throw new RangeError('The board must be at least 6 × 6 cells.');
      }
      this.columns = columns;
      this.rows = rows;
      this.random = random;
      this.reset();
    }

    reset() {
      const x = Math.floor(this.columns / 2);
      const y = Math.floor(this.rows / 2);
      this.snake = [{ x, y }, { x: x - 1, y }, { x: x - 2, y }];
      this.direction = 'right';
      this.turns = [];
      this.score = 0;
      this.eaten = { rat: 0, rabbit: 0, frog: 0 };
      this.status = 'playing';
      this.placeFood();
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
      const occupied = new Set(this.snake.map(({ x, y }) => `${x},${y}`));
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
        x: (this.snake[0].x + delta.x + this.columns) % this.columns,
        y: (this.snake[0].y + delta.y + this.rows) % this.rows,
      };
      const eats = this.food !== null && same(head, this.food);
      // The tail vacates its cell on a non-growing move.
      const body = eats ? this.snake : this.snake.slice(0, -1);
      if (body.some((cell) => same(cell, head))) {
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
