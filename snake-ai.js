/* Deterministic, snapshot-based steering; game rules remain in snake-engine.js. */
(function (root) {
  'use strict';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const profiles = Object.freeze({
    balanced: Object.freeze({ name: 'Balanced', foodWeight: 10, powerBonus: 0, riskPenalty: 1000, spaceWeight: 0.1, roomMargin: 2 }),
    hungry: Object.freeze({ name: 'Hungry', foodWeight: 14, powerBonus: 0, riskPenalty: 1000, spaceWeight: 0.05, roomMargin: 2 }),
    cautious: Object.freeze({ name: 'Cautious', foodWeight: 7, powerBonus: 0, riskPenalty: 2200, spaceWeight: 0.8, roomMargin: 8 }),
    collector: Object.freeze({ name: 'Collector', foodWeight: 9, powerBonus: 60, riskPenalty: 1400, spaceWeight: 0.15, roomMargin: 4 }),
  });
  function personality(game, index) {
    return game.players[index]?.ai ? profiles[['balanced', 'hungry', 'cautious', 'collector'][index] || 'balanced'] : profiles.balanced;
  }
  const key = ({ x, y }) => `${x},${y}`;
  const legalDirections = (player) => Object.keys(directions).filter((direction) => {
    const current = directions[player.direction];
    const next = directions[direction];
    return current.x + next.x !== 0 || current.y + next.y !== 0;
  });
  const inside = (game, cell) => cell.x >= 0 && cell.y >= 0 && cell.x < game.columns && cell.y < game.rows;

  function neighbors(game, cell) {
    return Object.values(directions).map((delta) => {
      const next = { x: cell.x + delta.x, y: cell.y + delta.y };
      if (game.wraps) {
        next.x = (next.x + game.columns) % game.columns;
        next.y = (next.y + game.rows) % game.rows;
      }
      return next;
    }).filter((next) => inside(game, next));
  }

  // One bounded flood fill measures escape space and shortest reachable food distance.
  function inspectSpace(game, start, blocked, targets, powerTargets) {
    const queue = [{ cell: start, distance: 0 }];
    const visited = new Set([key(start)]);
    let foodDistance = game.columns * game.rows + 1;
    let powerDistance = foodDistance;
    for (let i = 0; i < queue.length; i++) {
      const { cell, distance } = queue[i];
      if (targets.has(key(cell))) foodDistance = Math.min(foodDistance, distance);
      if (powerTargets.has(key(cell))) powerDistance = Math.min(powerDistance, distance);
      for (const next of neighbors(game, cell)) {
        const id = key(next);
        if (blocked.has(id) || visited.has(id)) continue;
        visited.add(id);
        queue.push({ cell: next, distance: distance + 1 });
      }
    }
    return { area: visited.size, foodDistance, powerDistance };
  }

  function chooseDirection(game, playerIndex, reserved = new Set()) {
    const player = game.players[playerIndex];
    if (!player || !player.alive || game.status !== 'playing') return null;
    const ordinaryFood = [...game.foods, game.goldenFood].filter(Boolean);
    const profile = personality(game, playerIndex);
    const needsCure = player.controlsReversed && game.herbs.length > 0;
    const targets = new Set((needsCure ? game.herbs : ordinaryFood).map(key));
    const powerTargets = new Set((needsCure ? [] : game.powerups).map(key));
    const growthCells = new Set([...ordinaryFood, ...game.mushrooms].map(key));
    const mushrooms = new Set(game.mushrooms.map(key));
    const occupied = new Set([
      ...game.obstacles,
      ...game.livingPlayers.flatMap((other) => other.snake),
    ].map(key));
    const threats = new Set();
    for (const other of game.livingPlayers) {
      if (other === player) continue;
      for (const direction of legalDirections(other)) threats.add(key(game.nextHead(other, direction)));
    }
    let best = null;
    for (const direction of legalDirections(player)) {
      const next = game.nextHead(player, direction);
      const id = key(next);
      if (!inside(game, next) || reserved.has(id)) continue;
      const blocked = new Set(occupied);
      // Only our own non-growing tail is guaranteed to vacate this step.
      if (!growthCells.has(id)) blocked.delete(key(player.snake.at(-1)));
      if (blocked.has(id)) continue;
      for (const cell of mushrooms) if (cell !== id) blocked.add(cell);
      for (const cell of reserved) blocked.add(cell);
      const { area, foodDistance, powerDistance } = inspectSpace(game, next, blocked, targets, powerTargets);
      const enoughSpace = area >= player.snake.length + profile.roomMargin;
      const attraction = Math.max(-foodDistance * profile.foodWeight,
        powerDistance <= game.columns * game.rows ? profile.powerBonus - powerDistance * 10 : -Infinity);
      // Room to survive outranks a tempting dead end, including for long snakes.
      const score = (enoughSpace ? 100000 : area * 100) - (threats.has(id) ? profile.riskPenalty : 0) - (mushrooms.has(id) ? 2000 : 0)
        + attraction + Math.min(area, 100) * profile.spaceWeight + (direction === player.direction ? 0.01 : 0);
      if (!best || score > best.score) best = { direction, score };
    }
    // A trapped snake still follows normal collision rules; it never teleports or reverses.
    return best ? best.direction : player.direction;
  }

  function steer(game) {
    if (game.status !== 'playing') return;
    const reserved = new Set();
    game.players.forEach((player, index) => {
      if (!player.ai || !player.alive) return;
      const direction = chooseDirection(game, index, reserved);
      // AI chooses physical directions, compensating for inversion just as a human can.
      game.turn(direction, index);
      reserved.add(key(game.nextHead(player, player.turns[0] || player.direction)));
    });
  }

  const SnakeAI = Object.freeze({ chooseDirection, steer, personality });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeAI };
  else root.SnakeAI = SnakeAI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
