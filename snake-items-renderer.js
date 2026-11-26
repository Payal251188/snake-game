/* Mushroom and herb sprites. Drawing never changes the game state. */
(function (root) {
  'use strict';
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  }

  function mushroom(ctx) {
    ellipse(ctx, 0, 0, 0.48, 0.45, '#ff856633');
    ctx.fillStyle = '#ffe1ad';
    ctx.beginPath(); ctx.roundRect(-0.12, -0.02, 0.24, 0.38, 0.06); ctx.fill();
    ctx.fillStyle = '#ed6354';
    ctx.strokeStyle = '#ffcab0'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.42, -0.01);
    ctx.bezierCurveTo(-0.37, -0.55, 0.37, -0.55, 0.42, -0.01);
    ctx.quadraticCurveTo(0, 0.13, -0.42, -0.01); ctx.fill(); ctx.stroke();
    for (const [x, y, r] of [[-0.2, -0.15, 0.065], [0.04, -0.29, 0.07], [0.24, -0.1, 0.05]]) {
      ellipse(ctx, x, y, r, r * 0.8, '#fff4d5');
    }
    ctx.fillStyle = '#ffe8b0'; ctx.font = 'bold 0.29px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('+50', 0, 0.62);
  }

  function herb(ctx) {
    ellipse(ctx, 0, 0, 0.48, 0.45, '#8fff9d33');
    ctx.strokeStyle = '#c6ffc0'; ctx.lineWidth = 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0.36); ctx.lineTo(0.04, -0.25); ctx.stroke();
    ellipse(ctx, -0.17, -0.02, 0.23, 0.105, '#83d583', 0.55);
    ellipse(ctx, 0.19, -0.15, 0.23, 0.11, '#b5f4a0', -0.55);
    ellipse(ctx, -0.11, -0.28, 0.18, 0.09, '#5daf75', 0.6);
    ctx.strokeStyle = '#efffe5'; ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.moveTo(0.28, 0.15); ctx.lineTo(0.28, 0.36);
    ctx.moveTo(0.175, 0.255); ctx.lineTo(0.385, 0.255); ctx.stroke();
  }

  function powerup(ctx, item) {
    const shield = item.type === 'shield';
    ellipse(ctx, 0.04, 0.05, 0.41, 0.41, shield ? '#367d9b' : '#7153a3');
    ellipse(ctx, -0.03, -0.04, 0.36, 0.36, shield ? '#a2e5ee' : '#c6a9f5');
    ellipse(ctx, -0.14, -0.18, 0.1, 0.065, '#ffffff99', -0.5);
    ctx.strokeStyle = '#f5fff4'; ctx.lineWidth = 0.05;
    if (shield) {
      ctx.fillStyle = '#2c7a96'; ctx.beginPath(); ctx.moveTo(0, -0.23); ctx.lineTo(0.2, -0.15);
      ctx.lineTo(0.16, 0.1); ctx.quadraticCurveTo(0, 0.34, -0.16, 0.1); ctx.lineTo(-0.2, -0.15);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.15); ctx.lineTo(0, 0); ctx.lineTo(0.12, 0.08); ctx.stroke();
    }
  }

  function draw(ctx, { mushrooms, herbs, powerups = [], left, top, cell, time = 0, animate = false }) {
    if (cell <= 0) return;
    for (const [items, sprite] of [[mushrooms, mushroom], [herbs, herb], [powerups, powerup]]) {
      for (const item of items) {
        ctx.save();
        ctx.translate(left + (item.x + 0.5) * cell, top + (item.y + 0.5) * cell);
        ctx.scale(cell, cell);
        ellipse(ctx, 0.05, 0.27, 0.34, 0.12, '#0008');
        ctx.translate(0, -0.08 - (animate ? Math.sin(time / 900 + item.x + item.y) * 0.03 : 0));
        sprite(ctx, item);
        ctx.restore();
      }
    }
  }
  const SnakeItemsRenderer = Object.freeze({ draw });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeItemsRenderer };
  else root.SnakeItemsRenderer = SnakeItemsRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
