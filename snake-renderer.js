/* Shared Canvas snake rendering for the board and cosmetic preview. No game rules. */
(function (root) {
  'use strict';
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPattern(ctx, radius, index, skin) {
    const palette = skin.palette;
    if (skin.pattern === 'plain') return;
    if (skin.pattern === 'bands') {
      for (const x of [-0.22, 0.14]) ellipse(ctx, x, 0, 0.045, radius * 0.9, palette.mark);
    } else if (skin.pattern === 'spots') {
      const size = Math.min(0.075, radius * 0.4);
      ellipse(ctx, -0.18, -radius * 0.3, size, size, palette.mark);
      ellipse(ctx, 0.12, radius * 0.25, size * 1.2, size, palette.mark);
    } else {
      ellipse(ctx, 0, 0, 0.21, radius * 0.58, palette.mark, index % 2 ? 0.22 : -0.22);
      ctx.strokeStyle = palette.scales;
      ctx.lineWidth = 0.014;
      for (const side of [-1, 0, 1]) {
        for (const offset of [-0.28, -0.09, 0.1, 0.29]) {
          ctx.beginPath();
          ctx.ellipse(offset + (side === 0 ? 0.05 : 0), side * radius * 0.62, 0.09, Math.max(0.015, radius * 0.25), 0, 0, Math.PI);
          ctx.stroke();
        }
      }
    }
    if (radius > 0.12) {
      ctx.strokeStyle = palette.flank;
      ctx.lineWidth = 0.026;
      ctx.beginPath();
      ctx.moveTo(-0.35, radius * 0.8);
      ctx.lineTo(0.35, radius * 0.8);
      ctx.stroke();
    }
  }

  function draw(ctx, { left, top, cell, time = 0, player, skin, animate = false }) {
    if (!player.snake.length || cell <= 0) return;
    const palette = skin.palette;
    const points = player.snake.map(({ x, y }) => ({ x: left + (x + 0.5) * cell, y: top + (y + 0.5) * cell }));
    const radius = (i) => cell * (0.025 + 0.3 * Math.min(1, (points.length - 1 - i) / 3));
    // A separate contact shadow makes the rounded body read as raised above the arena.
    ctx.save();
    ctx.translate(cell * 0.05, cell * 0.15);
    ctx.strokeStyle = '#0008'; ctx.lineWidth = cell * 0.38; ctx.lineCap = 'round';
    ctx.shadowColor = '#0008'; ctx.shadowBlur = cell * 0.16;
    ctx.beginPath();
    for (let i = points.length - 1; i > 0; i--) {
      const a = points[i]; const b = points[i - 1];
      if (Math.abs(a.x - b.x) > cell * 1.5 || Math.abs(a.y - b.y) > cell * 1.5) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ellipse(ctx, points[0].x, points[0].y, cell * 0.4, cell * 0.25, '#0007');
    ctx.restore();
    ctx.lineCap = 'round';
    // Connected, tapered body rather than separate square tiles.
    for (let i = points.length - 1; i > 0; i--) {
      const a = points[i]; const b = points[i - 1];
      // Never draw a line across the whole court when the body wraps an edge.
      if (Math.abs(a.x - b.x) > cell * 1.5 || Math.abs(a.y - b.y) > cell * 1.5) {
        ellipse(ctx, a.x, a.y, radius(i), radius(i), palette.body);
        ellipse(ctx, b.x, b.y, radius(i - 1), radius(i - 1), palette.body);
        continue;
      }
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(angle); const ny = Math.cos(angle);
      const ra = radius(i); const rb = radius(i - 1);
      const bodyGradient = ctx.createLinearGradient(b.x - nx * rb, b.y - ny * rb, b.x + nx * rb, b.y + ny * rb);
      bodyGradient.addColorStop(0, palette.shadow); bodyGradient.addColorStop(0.28, palette.low);
      bodyGradient.addColorStop(0.52, palette.light); bodyGradient.addColorStop(0.8, palette.mid); bodyGradient.addColorStop(1, palette.edge);
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.moveTo(a.x + nx * ra, a.y + ny * ra); ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
      ctx.lineTo(b.x - nx * rb, b.y - ny * rb); ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
      ctx.closePath(); ctx.fill();
      // Rounded joints and a narrowing tail keep the silhouette continuous.
      ellipse(ctx, b.x, b.y, rb, rb, bodyGradient);
      ellipse(ctx, a.x, a.y, ra, ra, bodyGradient);
      ctx.save(); ctx.globalAlpha = 0.24;
      ctx.strokeStyle = palette.light; ctx.lineWidth = cell * 0.055;
      ctx.beginPath(); ctx.moveTo(a.x - nx * ra * 0.45, a.y - ny * ra * 0.45);
      ctx.lineTo(b.x - nx * rb * 0.45, b.y - ny * rb * 0.45); ctx.stroke(); ctx.restore();
    }
    for (let i = points.length - 1; i > 0; i--) {
      const p = points[i]; const next = points[i - 1];
      let dx = next.x - p.x; let dy = next.y - p.y;
      if (Math.abs(dx) > cell * 1.5) dx = -Math.sign(dx) * cell;
      if (Math.abs(dy) > cell * 1.5) dy = -Math.sign(dy) * cell;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dy, dx)); ctx.scale(cell, cell);
      const r = radius(i) / cell;
      drawPattern(ctx, r, i, skin);
      ctx.restore();
    }
    const head = points[0];
    ctx.save(); ctx.translate(head.x, head.y);
    ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[player.direction]);
    ctx.scale(cell, cell);
    if (animate && Math.sin(time / 160) > 0.6) {
      ctx.strokeStyle = palette.tongue; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(0.34, 0); ctx.lineTo(0.62, 0); ctx.lineTo(0.71, -0.07);
      ctx.moveTo(0.62, 0); ctx.lineTo(0.71, 0.07); ctx.stroke();
    }
    const headSkin = ctx.createLinearGradient(0, -0.32, 0.12, 0.32);
    headSkin.addColorStop(0, palette.headShadow); headSkin.addColorStop(0.4, palette.headLight); headSkin.addColorStop(1, palette.headMid);
    // Narrow neck, broad cheeks and a gently flattened snout.
    ctx.fillStyle = headSkin; ctx.strokeStyle = palette.outline; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.43, -0.19);
    ctx.bezierCurveTo(-0.25, -0.2, -0.2, -0.34, 0.03, -0.33);
    ctx.bezierCurveTo(0.25, -0.32, 0.5, -0.22, 0.5, 0);
    ctx.bezierCurveTo(0.5, 0.22, 0.25, 0.32, 0.03, 0.33);
    ctx.bezierCurveTo(-0.2, 0.34, -0.25, 0.2, -0.43, 0.19);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = palette.jaw; ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.moveTo(-0.02, 0.27); ctx.quadraticCurveTo(0.41, 0.25, 0.47, 0.04); ctx.stroke();
    for (const side of [-1, 1]) {
      ellipse(ctx, 0.06, side * 0.25, 0.075, 0.065, palette.eye);
      ellipse(ctx, 0.08, side * 0.25, 0.018, 0.054, palette.pupil);
      ellipse(ctx, 0.045, side * 0.25 - 0.018, 0.015, 0.013, palette.glint);
      ellipse(ctx, 0.35, side * 0.105, 0.022, 0.016, palette.nostril);
    }
    ctx.strokeStyle = palette.headMark; ctx.lineWidth = 0.015;
    ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(0.31, 0);
    ctx.moveTo(-0.15, -0.16); ctx.lineTo(0.15, -0.13); ctx.lineTo(0.29, 0); ctx.lineTo(0.15, 0.13); ctx.lineTo(-0.15, 0.16);
    ctx.moveTo(-0.12, -0.15); ctx.lineTo(-0.12, 0.15); ctx.stroke();
    ctx.restore();
  }

  const SnakeRenderer = Object.freeze({ draw });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeRenderer };
  else root.SnakeRenderer = SnakeRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
