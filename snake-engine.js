/* Pure game rules, shared by the browser and the Node test suite. */
(function (root) {
  'use strict';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const animals = ['rat', 'rabbit', 'frog'];
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const herbDelayMs = 5000;

  class SnakeGame {
    constructor({ columns = 24, rows = 20, random = Math.random, mode = 'classic', playerCount = 1, aiCount = 0, foodCount = 1, mushroomCount = 0 } = {}) {
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 6 || rows < 6) {
        throw new RangeError('The board must be at least 6 × 6 cells.');
      }
      this.columns = columns;
      this.rows = rows;
      this.random = random;
      this.reset({ mode, playerCount, aiCount, foodCount, mushroomCount });
    }

    reset({ mode = this.mode, playerCount = this.playerCount, aiCount = this.aiCount, foodCount = this.foodCount, mushroomCount = this.mushroomCount } = {}) {
      if (!['classic', 'obstacles', 'maze'].includes(mode)) throw new RangeError('Unknown game mode.');
      if (![1, 2].includes(playerCount)) throw new RangeError('Choose one or two players.');
      if (!Number.isInteger(aiCount) || aiCount < 0 || aiCount > 3 || (aiCount > 0 && playerCount !== 1)) throw new RangeError('AI Arena supports one human and up to three bots.');
      if (!Number.isInteger(foodCount) || foodCount < 1 || foodCount > 10) throw new RangeError('Choose between one and ten food items.');
      if (!Number.isInteger(mushroomCount) || mushroomCount < 0 || mushroomCount > 4) throw new RangeError('Choose between zero and four mushrooms.');
      this.mode = mode;
      this.playerCount = playerCount;
      this.aiCount = aiCount;
      this.foodCount = foodCount;
      this.mushroomCount = mushroomCount;
      this.mushrooms = [];
      this.herbs = [];
      this.elapsedMs = 0;
      this.food = null;
      this.extraFoods = [];
      this.endReason = null;
      this.winner = null;
      this.lastEater = null;
      this.lastCatches = [];
      this.goldenFood = null;
      this.goldenTicks = 0;
      const x = Math.floor(this.columns / 2);
      const y = playerCount === 2 ? Math.floor(this.rows / 3) : Math.floor(this.rows / 2);
      const totalPlayers = playerCount + aiCount;
      this.players = Array.from({ length: totalPlayers }, (_, index) => {
        const facingRight = index % 2 === 0;
        const headX = facingRight ? x : this.columns - 1 - x;
        const headY = aiCount ? Math.floor((index + 1) * (this.rows - 1) / (totalPlayers + 1))
          : index === 0 ? y : this.rows - 1 - y;
        return {
          snake: Array.from({ length: 3 }, (__, i) => ({ x: headX + (facingRight ? -i : i), y: headY })),
          direction: facingRight ? 'right' : 'left', turns: [], score: 0,
          ai: index >= playerCount, alive: true,
          controlsReversed: false, herbReadyAt: null, mushroomsEaten: 0, herbsEaten: 0,
          eaten: { rat: 0, rabbit: 0, frog: 0 }, goldenEaten: 0, collision: null,
        };
      });
      this.status = 'playing';
      this.obstacles = this.createObstacles();
      this.placeFood();
      this.replenishFood();
      this.scheduleGoldenFood();
      this.updateConsumables();
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
    get preyCaught() { return Object.values(this.totalEaten).reduce((sum, count) => sum + count, 0); }
    get goldenCaught() { return this.players.reduce((sum, player) => sum + player.goldenEaten, 0); }
    get mushroomCaught() { return this.players.reduce((sum, player) => sum + player.mushroomsEaten, 0); }
    get herbsCaught() { return this.players.reduce((sum, player) => sum + player.herbsEaten, 0); }
    get totalCatches() { return this.preyCaught + this.goldenCaught + this.mushroomCaught + this.herbsCaught; }
    get wraps() { return this.mode === 'classic'; }
    get livingPlayers() { return this.players.filter((player) => player.alive); }
    get foods() {
      return [...(this.food ? [{ ...this.food, type: this.foodType }] : []), ...this.extraFoods];
    }

    createObstacles() {
      if (this.wraps) return [];
      const cells = new Map();
      const add = (x, y, type) => {
        const border = x === 0 || y === 0 || x === this.columns - 1 || y === this.rows - 1;
        // Give every starting body a clear runway and room to turn.
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

    // All snakes share one pace; combined catches count toward the next level.
    get level() { return 1 + Math.floor(Math.min(...Object.values(this.totalEaten)) / 10); }
    get speedMultiplier() { return 1 + (this.level - 1) * 0.2; }
    get interval() { return Math.max(40, 160 / this.speedMultiplier); }
    get foodType() { return this.food ? animals[this.preyCaught % 3] : null; }

    turn(direction, playerIndex = 0) {
      const player = this.players[playerIndex];
      if (this.status !== 'playing' || !player || !player.alive || !Object.hasOwn(directions, direction) || player.turns.length >= 2) return false;
      const previous = player.turns.at(-1) || player.direction;
      const a = directions[previous];
      const b = directions[direction];
      if (previous === direction || (a.x + b.x === 0 && a.y + b.y === 0)) return false;
      player.turns.push(direction);
      return true;
    }

    // Input commands are inverted; turn() remains the physical-direction API used by AI.
    steer(direction, playerIndex = 0) {
      const player = this.players[playerIndex];
      if (!Object.hasOwn(directions, direction)) return false;
      return this.turn(player?.controlsReversed ? opposite[direction] : direction, playerIndex);
    }

    herbWaitMs(player) {
      return player.controlsReversed ? Math.max(0, player.herbReadyAt - this.elapsedMs) : 0;
    }

    updateConsumables() {
      const ready = this.livingPlayers.filter((player) => player.controlsReversed && this.herbWaitMs(player) === 0).length;
      this.herbs.splice(ready); // Remove unneeded cures after recovery or elimination.
      while (this.herbs.length < ready) {
        let empty = this.emptyCells([...this.foods, this.goldenFood]);
        if (!empty.length && this.mushrooms.length) {
          this.mushrooms.pop(); // A needed cure takes priority on a crowded board.
          empty = this.emptyCells([...this.foods, this.goldenFood]);
        }
        const cell = this.pickCell(empty);
        if (!cell) break;
        this.herbs.push(cell);
      }
      if (this.mushrooms.length >= this.mushroomCount) return;
      const empty = this.emptyCells([...this.foods, this.goldenFood]);
      while (this.mushrooms.length < this.mushroomCount && empty.length) {
        const cell = this.pickCell(empty);
        empty.splice(empty.indexOf(cell), 1);
        this.mushrooms.push(cell);
      }
    }

    emptyCells(reserved = []) {
      const occupied = new Set([...this.livingPlayers.flatMap((player) => player.snake), ...this.obstacles, ...this.mushrooms, ...this.herbs, ...reserved.filter(Boolean)].map(({ x, y }) => `${x},${y}`));
      const empty = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.columns; x++) {
          if (!occupied.has(`${x},${y}`)) empty.push({ x, y });
        }
      }
      return empty;
    }

    pickCell(empty) {
      return empty.length ? empty[Math.min(empty.length - 1, Math.max(0, Math.floor(this.random() * empty.length)))] : null;
    }

    placeFood() {
      this.food = this.pickCell(this.emptyCells([this.goldenFood, ...this.extraFoods]));
    }

    replenishFood() {
      if (!this.food) this.placeFood();
      const empty = this.emptyCells([this.food, this.goldenFood, ...this.extraFoods]);
      while (this.foods.length < this.foodCount && empty.length) {
        const cell = this.pickCell(empty);
        const index = empty.indexOf(cell);
        empty.splice(index, 1);
        this.extraFoods.push({ ...cell, type: animals[(this.preyCaught + this.foods.length) % animals.length] });
      }
    }

    scheduleGoldenFood() {
      // A random 25–55 successful moves between bonuses; game pauses freeze the timer.
      this.goldenDelay = 25 + Math.min(30, Math.max(0, Math.floor(this.random() * 31)));
    }

    updateGoldenFood() {
      if (this.goldenFood) {
        this.goldenTicks--;
        if (this.goldenTicks <= 0) {
          this.goldenFood = null;
          this.goldenTicks = 0;
          this.scheduleGoldenFood();
          // Reuse the released bonus cell if a crowded board was below its food target.
          this.replenishFood();
        }
      } else if (--this.goldenDelay <= 0) {
        this.goldenFood = this.pickCell(this.emptyCells(this.foods));
        this.goldenTicks = this.goldenFood ? 50 : 0;
        if (!this.goldenFood) this.scheduleGoldenFood();
      }
    }

    nextHead(player, direction = player.direction) {
      const delta = directions[direction];
      const head = { x: player.snake[0].x + delta.x, y: player.snake[0].y + delta.y };
      if (this.wraps) {
        head.x = (head.x + this.columns) % this.columns;
        head.y = (head.y + this.rows) % this.rows;
      }
      return head;
    }

    predictMoves() {
      const foods = this.foods;
      return this.players.map((player) => {
        if (!player.alive) return null;
        player.direction = player.turns.shift() || player.direction;
        const head = this.nextHead(player);
        const prey = foods.find((food) => same(head, food));
        const eatsGolden = this.goldenFood !== null && same(head, this.goldenFood);
        const mushroom = this.mushrooms.find((cell) => same(cell, head));
        const herb = this.herbs.find((cell) => same(cell, head));
        return { head, prey, eatsGolden, mushroom, herb, body: prey || eatsGolden || mushroom ? player.snake : player.snake.slice(0, -1) };
      });
    }

    resolveCollisions(moves) {
      // Resolve every pair from the same snapshot, including three-way clashes and head swaps.
      this.players.forEach((player, index) => {
        const move = moves[index];
        if (!move) return;
        const { head } = move;
        const headClash = moves.some((other, j) => other && j !== index && (
          same(head, other.head) || (same(head, this.players[j].snake[0]) && same(other.head, player.snake[0]))
        ));
        const obstacle = this.obstacles.find((cell) => same(cell, head));
        if (headClash) player.collision = 'head-on';
        else if (obstacle) player.collision = obstacle.type;
        else if (head.x < 0 || head.y < 0 || head.x >= this.columns || head.y >= this.rows) player.collision = 'wall';
        else if (move.body.some((cell) => same(cell, head))) player.collision = 'body';
        else if (moves.some((other, j) => other && j !== index && other.body.some((cell) => same(cell, head)))) player.collision = 'opponent';
      });
    }

    scoreWinner() {
      const contenders = this.players.map((player, index) => ({ player, index })).filter(({ player }) => player.alive);
      const highest = Math.max(...contenders.map(({ player }) => player.score));
      const leaders = contenders.filter(({ player }) => player.score === highest);
      return leaders.length === 1 ? leaders[0].index : null;
    }

    tick() {
      if (this.status !== 'playing') return 'idle';
      this.lastEater = null;
      this.lastCatches = [];
      this.elapsedMs += this.interval;
      this.updateConsumables();
      const moves = this.predictMoves();
      this.resolveCollisions(moves);
      const crashed = this.players.filter((player) => player.alive && player.collision);
      // Preserve the original sudden-death solo/local-versus rules.
      if (!this.aiCount && crashed.length) {
        this.status = 'over';
        this.endReason = 'collision';
        const survivors = this.players.map((player, index) => player.collision ? -1 : index).filter((index) => index !== -1);
        this.winner = this.playerCount === 2 && survivors.length === 1 ? survivors[0] : null;
        return 'lost';
      }
      this.players.forEach((player, index) => {
        const move = moves[index];
        if (!move) return;
        if (player.collision) {
          player.alive = false;
          player.turns = [];
          return;
        }
        player.snake.unshift(move.head);
        const grows = move.prey || move.eatsGolden || move.mushroom;
        if (!grows) player.snake.pop();
        if (grows || move.herb) {
          const type = move.mushroom ? 'mushroom' : move.herb ? 'herb' : move.eatsGolden ? 'golden' : move.prey.type;
          const points = move.mushroom ? 50 : move.herb ? 0 : move.eatsGolden ? 5 : 1;
          if (move.mushroom) {
            player.mushroomsEaten++;
            if (!player.controlsReversed) {
              player.controlsReversed = true;
              player.herbReadyAt = this.elapsedMs + herbDelayMs;
              player.turns = []; // Discard input queued before the effect changed.
            }
          } else if (move.herb) {
            player.herbsEaten++;
            player.controlsReversed = false;
            player.herbReadyAt = null;
            player.turns = [];
          } else if (move.eatsGolden) player.goldenEaten++;
          else player.eaten[type]++;
          player.score += points;
          this.lastEater = index;
          this.lastCatches.push({ playerIndex: index, type, points });
        }
      });
      const successfulMoves = moves.filter((move, index) => move && !this.players[index].collision);
      const consumed = successfulMoves.filter((move) => move.prey).map((move) => move.prey);
      const caughtGolden = successfulMoves.some((move) => move.eatsGolden);
      this.mushrooms = this.mushrooms.filter((cell) => !successfulMoves.some((move) => move.mushroom && same(cell, move.mushroom)));
      this.herbs = this.herbs.filter((cell) => !successfulMoves.some((move) => move.herb && same(cell, move.herb)));
      if (caughtGolden) {
        this.goldenFood = null;
        this.goldenTicks = 0;
        this.scheduleGoldenFood();
      }
      if (consumed.some((food) => this.food && same(food, this.food))) this.food = null;
      this.extraFoods = this.extraFoods.filter((food) => !consumed.some((eaten) => same(food, eaten)));
      if (this.lastCatches.length || crashed.length) this.replenishFood();
      if (!caughtGolden) this.updateGoldenFood();
      this.updateConsumables();

      if (this.aiCount) {
        if (!this.players[0].alive) {
          this.status = 'over';
          this.endReason = 'collision';
          this.winner = this.livingPlayers.length === 1 ? this.players.indexOf(this.livingPlayers[0]) : null;
          return 'lost';
        }
        if (this.livingPlayers.length === 1) {
          this.status = 'won';
          this.endReason = 'survival';
          this.winner = 0;
          return 'won';
        }
      }
      if (this.lastCatches.length) {
        if (!this.foods.length && !this.goldenFood && !this.mushrooms.length && !this.herbs.length) {
          this.status = 'won';
          this.endReason = 'filled';
          this.winner = this.scoreWinner();
          return 'won';
        }
        return 'ate';
      }
      return crashed.length ? 'eliminated' : 'moved';
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeGame };
  else root.SnakeGame = SnakeGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
