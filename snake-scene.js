/* Read-only 2.5D scene presentation. No simulation RNG, DOM, or game-rule changes. */
(function (root) {
  'use strict';
  const skew = 0.12;
  const tilt = 0.88;
  const fract = (value) => value - Math.floor(value);
  const stars = Array.from({ length: 88 }, (_, i) => ({
    x: fract(Math.sin(i * 127.1 + 17) * 43758.5453),
    y: fract(Math.sin(i * 311.7 + 31) * 28543.123),
    depth: 0.3 + (i % 4) * 0.23,
  }));
  const backgrounds = new WeakMap();

  function layout({ width, height, columns, rows, view = 'overview', focus }) {
    const inset = Math.min(28, Math.min(width, height) * 0.045);
    const toolbar = height > 120 ? 32 : 0;
    const base = Math.max(0.01, Math.min(
      Math.max(0.01, width - inset * 2) / (columns + rows * skew + 0.5),
      Math.max(0.01, height - toolbar - inset * 2) / (rows * tilt + 0.55),
    ));
    const following = view === 'follow' && height >= 160 && width >= 260;
    const cell = base * (following ? width > 600 ? 1.65 : 1.5 : 1);
    const center = following && focus ? focus : { x: columns / 2, y: rows / 2 };
    return {
      width, height, columns, rows, cell, skew, tilt,
      view: following ? 'follow' : 'overview',
      left: -center.x * cell, top: -center.y * cell,
      centerX: width / 2, centerY: toolbar + (height - toolbar) / 2 - cell * 0.12,
    };
  }

  function project(frame, x, y) {
    const px = frame.left + x * frame.cell;
    const py = frame.top + y * frame.cell;
    return { x: frame.centerX + px - frame.skew * py, y: frame.centerY + frame.tilt * py };
  }

  function unproject(frame, x, y) {
    const py = (y - frame.centerY) / frame.tilt;
    const px = x - frame.centerX + frame.skew * py;
    return { x: (px - frame.left) / frame.cell, y: (py - frame.top) / frame.cell };
  }

  function follow(previous, target, { columns, rows, delta = 16, snap = false }) {
    if (!previous || snap || Math.abs(previous.x - target.x) > columns / 2 || Math.abs(previous.y - target.y) > rows / 2) return { ...target };
    const amount = 1 - Math.exp(-Math.max(0, Math.min(delta, 50)) / 110);
    return { x: previous.x + (target.x - previous.x) * amount, y: previous.y + (target.y - previous.y) * amount };
  }

  function gradient(ctx, points, colors, radial = false) {
    const result = radial ? ctx.createRadialGradient(...points) : ctx.createLinearGradient(...points);
    colors.forEach(([offset, color]) => result.addColorStop(offset, color));
    return result;
  }
  function rounded(ctx, x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill();
  }

  function background(ctx, { width, height, time = 0, focus = { x: 12, y: 10 }, pixelRatio = 1 }) {
    if (width <= 0 || height <= 0) return;
    let cache = backgrounds.get(ctx);
    if (!cache || cache.width !== width || cache.height !== height || cache.pixelRatio !== pixelRatio) {
      const radius = Math.max(1, Math.min(width * 0.2, height * 0.43));
      const x = width * 0.86; const y = height * 0.2;
      cache = {
        width, height, x, y, radius, pixelRatio,
        sky: gradient(ctx, [0, 0, width, height], [[0, '#030713'], [0.55, '#081725'], [1, '#07121d']]),
        nebula: gradient(ctx, [width * 0.3, height * 0.7, 0, width * 0.3, height * 0.7, Math.max(width, height) * 0.7], [[0, '#14484b48'], [0.5, '#142b4030'], [1, '#03071300']], true),
        halo: gradient(ctx, [x, y, radius * 0.7, x, y, radius * 1.8], [[0, '#3b8cbb25'], [1, '#0b163000']], true),
        planet: gradient(ctx, [x - radius * 0.45, y - radius * 0.5, radius * 0.02, x, y, radius], [[0, '#6598aa'], [0.28, '#2b526b'], [0.7, '#102a43'], [1, '#030b18']], true),
        vignette: gradient(ctx, [width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.68], [[0, '#02061000'], [0.6, '#02061000'], [1, '#020610cc']], true),
      };
      backgrounds.set(ctx, cache);
    }
    ctx.fillStyle = cache.sky; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = cache.nebula; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = cache.halo; ctx.fillRect(0, 0, width, height);
    ellipse(ctx, cache.x, cache.y, cache.radius, cache.radius, cache.planet);
    ctx.save();
    ctx.beginPath(); ctx.arc(cache.x, cache.y, cache.radius, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#a9e3ee12'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cache.x, cache.y + i * cache.radius * 0.22, cache.radius * 1.15, cache.radius * 0.23, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#83c9e51a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(width * 0.52, height * 0.9, width * 0.56, height * 0.47, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([2, 9]);
    ctx.beginPath(); ctx.ellipse(width * 0.52, height * 0.9, width * 0.59, height * 0.51, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const x = (star.x * width + Math.sin(time / 21000 + i) * 3 - focus.x * star.depth + width) % width;
      const y = (star.y * height + Math.cos(time / 24000 + i) * 2 - focus.y * star.depth + height) % height;
      ctx.globalAlpha = 0.24 + star.depth * 0.4;
      ellipse(ctx, x, y, i % 13 === 0 ? 1.5 : 0.7, i % 13 === 0 ? 1.5 : 0.7, '#c8e9f2');
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = cache.vignette; ctx.fillRect(0, 0, width, height);
  }

  function terrain(ctx, frame, obstacles) {
    const { left, top, cell, columns, rows } = frame;
    const width = columns * cell; const height = rows * cell; const depth = cell * 0.35;
    ctx.save(); ctx.shadowColor = '#000c'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 14;
    rounded(ctx, left, top + depth, width, height, cell * 0.35, '#020b13');
    ctx.restore();
    rounded(ctx, left - cell * 0.12, top - cell * 0.12, width + cell * 0.24, height + cell * 0.24, cell * 0.4, '#143c48');
    const floor = gradient(ctx, [left, top, left + width, top + height], [[0, '#18373d'], [0.48, '#102a32'], [1, '#0b202c']]);
    rounded(ctx, left, top, width, height, cell * 0.28, floor);
    ctx.strokeStyle = '#8ce4d414'; ctx.lineWidth = Math.max(0.5, cell * 0.018);
    ctx.beginPath();
    for (let x = 1; x < columns; x++) { ctx.moveTo(left + x * cell, top); ctx.lineTo(left + x * cell, top + height); }
    for (let y = 1; y < rows; y++) { ctx.moveTo(left, top + y * cell); ctx.lineTo(left + width, top + y * cell); }
    ctx.stroke();
    ctx.strokeStyle = '#9bffe229'; ctx.lineWidth = Math.max(0.7, cell * 0.025);
    ctx.beginPath();
    for (let x = 4; x < columns; x += 4) { ctx.moveTo(left + x * cell, top); ctx.lineTo(left + x * cell, top + height); }
    for (let y = 4; y < rows; y += 4) { ctx.moveTo(left, top + y * cell); ctx.lineTo(left + width, top + y * cell); }
    ctx.stroke();
    ctx.strokeStyle = '#8fe9dd70'; ctx.lineWidth = Math.max(1, cell * 0.04);
    ctx.strokeRect(left, top, width, height);
    // Raised blocks retain the exact original cell footprint used by collision rules.
    for (const obstacle of obstacles) {
      const x = left + obstacle.x * cell + cell * 0.07;
      const groundY = top + obstacle.y * cell + cell * 0.07;
      const size = cell * 0.86; const lift = cell * (obstacle.type === 'rock' ? 0.13 : 0.2);
      const y = groundY - lift;
      const amber = obstacle.type === 'barrier';
      rounded(ctx, x + cell * 0.08, groundY + cell * 0.12, size, size, cell * 0.1, '#0006');
      rounded(ctx, x, y + lift, size, size, cell * 0.09, amber ? '#714225' : '#1b3847');
      const surface = gradient(ctx, [x, y, x + size, y + size], amber
        ? [[0, '#ffd39c'], [0.45, '#dca25f'], [1, '#a86e3e']]
        : obstacle.type === 'rock' ? [[0, '#a6b8ac'], [1, '#506e73']] : [[0, '#719ba2'], [0.45, '#496c79'], [1, '#2f4b60']]);
      rounded(ctx, x, y, size, size, cell * 0.09, surface);
      ctx.strokeStyle = amber ? '#ffe6bb80' : '#c0eee960'; ctx.lineWidth = Math.max(0.6, cell * 0.025);
      ctx.beginPath(); ctx.moveTo(x + size * 0.12, y + size * 0.12); ctx.lineTo(x + size * 0.85, y + size * 0.12); ctx.stroke();
      if (amber) {
        ctx.strokeStyle = '#65452dd9'; ctx.lineWidth = cell * 0.1;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.18, y + size * 0.65); ctx.lineTo(x + size * 0.65, y + size * 0.18);
        ctx.moveTo(x + size * 0.42, y + size * 0.85); ctx.lineTo(x + size * 0.85, y + size * 0.42); ctx.stroke();
      } else {
        ctx.strokeStyle = '#b3dfdf2a'; ctx.lineWidth = Math.max(0.6, cell * 0.025);
        ctx.beginPath(); ctx.moveTo(x + size * 0.15, y + size * 0.65); ctx.lineTo(x + size * 0.85, y + size * 0.65); ctx.stroke();
      }
    }
  }

  function minimap(ctx, { width, height, columns, rows, players, colors, obstacles, foods, mushrooms, herbs, goldenFood, frame }) {
    if (width < 260 || height < 160) return;
    const mapWidth = Math.min(152, width * 0.28);
    const unit = mapWidth / columns; const mapHeight = rows * unit;
    const x = width - mapWidth - 14; const y = height - mapHeight - 14;
    rounded(ctx, x - 8, y - 23, mapWidth + 16, mapHeight + 31, 10, '#040c18e8');
    ctx.font = '9px system-ui'; ctx.fillStyle = '#a8cbd3'; ctx.textAlign = 'left'; ctx.fillText('SECTOR MAP', x, y - 9);
    ctx.fillStyle = '#44616c';
    for (const cell of obstacles) ctx.fillRect(x + cell.x * unit, y + cell.y * unit, unit, unit);
    for (const [items, color] of [[foods, '#dcebd2'], [goldenFood ? [goldenFood] : [], '#ffe09b'], [mushrooms, '#fa947b'], [herbs, '#9af0a1']]) {
      ctx.fillStyle = color;
      for (const item of items) ctx.fillRect(x + item.x * unit, y + item.y * unit, Math.max(1.5, unit * 0.65), Math.max(1.5, unit * 0.65));
    }
    players.forEach((player, index) => {
      if (!player.alive) return;
      ctx.fillStyle = colors[index];
      for (const cell of player.snake) ctx.fillRect(x + cell.x * unit, y + cell.y * unit, Math.max(2, unit * 0.85), Math.max(2, unit * 0.85));
    });
    if (frame) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, mapWidth, mapHeight); ctx.clip();
      ctx.strokeStyle = '#d5fff4aa'; ctx.lineWidth = 1;
      ctx.beginPath();
      [[0, 0], [width, 0], [width, height], [0, height]].forEach(([px, py], index) => {
        const cell = unproject(frame, px, py);
        if (index === 0) ctx.moveTo(x + cell.x * unit, y + cell.y * unit);
        else ctx.lineTo(x + cell.x * unit, y + cell.y * unit);
      });
      ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = '#8fc7ca55'; ctx.lineWidth = 1; ctx.strokeRect(x, y, mapWidth, mapHeight);
  }

  class PickupEffects {
    constructor() { this.items = []; }
    clear() { this.items = []; }
    emit({ x, y, type, points }, time) {
      this.items.push({ x, y, type, points, time });
      if (this.items.length > 24) this.items.shift();
    }
    draw(ctx, frame, time) {
      this.items = this.items.filter((item) => time - item.time < 850);
      for (const item of this.items) {
        const progress = Math.max(0, (time - item.time) / 850);
        const x = frame.left + (item.x + 0.5) * frame.cell;
        const y = frame.top + (item.y + 0.5) * frame.cell;
        const color = item.type === 'mushroom' ? '#ffad89' : item.type === 'herb' ? '#b6ffbc' : item.type === 'golden' ? '#ffe09b' : '#c7ffe4';
        ctx.save(); ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, frame.cell * (0.3 + progress * 1.1), 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          const radius = frame.cell * progress * 1.5;
          ellipse(ctx, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 1.6, 1.6, color);
        }
        ctx.fillStyle = color; ctx.font = `bold ${Math.max(11, frame.cell * 0.45)}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText(item.type === 'herb' ? 'CURED' : `+${item.points}`, x, y - frame.cell * (0.8 + progress));
        ctx.restore();
      }
    }
  }

  const SnakeScene = Object.freeze({ layout, project, unproject, follow, background, terrain, minimap, PickupEffects });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeScene };
  else root.SnakeScene = SnakeScene;
})(typeof globalThis !== 'undefined' ? globalThis : this);
