/* Render-only interpolation. Simulation positions and collision rules stay on the grid. */
(function (root) {
  'use strict';
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const capture = (players) => players.map((player) => ({
    snake: player.snake.map(({ x, y }) => ({ x, y })),
  }));

  function axis(from, to, amount, size, wraps) {
    let distance = to - from;
    if (wraps && Math.abs(distance) > size / 2) distance -= Math.sign(distance) * size;
    // Resets/teleports are not movement; never animate through the entire arena.
    if (Math.abs(distance) > 1.001) return to;
    const value = from + distance * amount;
    return wraps ? (value % size + size) % size : value;
  }

  function interpolate(previous, players, amount, { columns, rows, wraps }) {
    const progress = clamp(amount);
    return players.map((player, index) => {
      const old = previous[index]?.snake;
      if (!old?.length || !player.alive || progress === 1) return player;
      return {
        ...player,
        snake: player.snake.map((cell, segment) => {
          const from = old[Math.min(segment, old.length - 1)];
          let dx = Math.abs(from.x - cell.x); let dy = Math.abs(from.y - cell.y);
          if (wraps) { dx = Math.min(dx, columns - dx); dy = Math.min(dy, rows - dy); }
          if (dx + dy > 1.001) return { ...cell };
          return {
            x: axis(from.x, cell.x, progress, columns, wraps),
            y: axis(from.y, cell.y, progress, rows, wraps),
          };
        }),
      };
    });
  }

  function foodPosition(food, time, { columns, rows, wraps }) {
    const motion = food.motion;
    if (!motion?.from) return { x: food.x, y: food.y, lift: 0 };
    const amount = clamp((time - motion.startedAt) / motion.duration);
    const blend = (from, to, size) => {
      let delta = to - from;
      if (wraps && Math.abs(delta) > size / 2) delta -= Math.sign(delta) * size;
      const value = from + delta * amount;
      return wraps ? (value % size + size) % size : value;
    };
    return {
      x: blend(motion.from.x, food.x, columns), y: blend(motion.from.y, food.y, rows),
      lift: food.type === 'rat' ? 0 : Math.sin(amount * Math.PI) * (food.type === 'frog' ? 0.75 : 0.45),
    };
  }

  function hibernate(snake, den, amount, { columns, rows, wraps }) {
    const time = clamp(amount);
    const ramp = 0.12;
    const progress = time < ramp ? time * time / (2 * ramp * (1 - ramp))
      : time > 1 - ramp ? 1 - (1 - time) ** 2 / (2 * ramp * (1 - ramp)) : (time - ramp / 2) / (1 - ramp);
    const travel = progress * (snake.length + 1);
    const path = [{ x: den.x, y: den.y }, ...snake];
    const blend = (from, to, fraction, size) => {
      let delta = to - from;
      if (wraps && Math.abs(delta) > size / 2) delta -= Math.sign(delta) * size;
      const value = from + delta * fraction;
      return wraps ? (value % size + size) % size : value;
    };
    if (time >= 1 || !snake.length) return [];
    const visible = [];
    if (travel >= 1) visible.push({ x: den.x, y: den.y });
    for (let index = 0; index < snake.length; index++) {
      const position = index + 1 - travel;
      if (position <= 0) continue;
      const a = path[Math.floor(position)] || path.at(-1);
      const b = path[Math.min(path.length - 1, Math.ceil(position))] || a;
      visible.push({ x: blend(a.x, b.x, position % 1, columns), y: blend(a.y, b.y, position % 1, rows) });
    }
    return visible;
  }

  const hibernationDuration = (length, interval = 240) => Math.min(15000, Math.max(3000, (length + 1) * interval * 1.3));
  const SnakeMotion = Object.freeze({ capture, interpolate, foodPosition, hibernate, hibernationDuration });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeMotion };
  else root.SnakeMotion = SnakeMotion;
})(typeof globalThis !== 'undefined' ? globalThis : this);
