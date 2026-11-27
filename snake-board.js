/* Lightweight fixed 2D board. Static backdrops and terrain are rasterized once. */
(function (root) {
  'use strict';
  const themes = Object.freeze({
    night: Object.freeze({ name: 'Golden glow', top: '#ffe57b', bottom: '#d6a94a', floor: '#f2d98b', grid: '#785a2b2c', edge: '#fff2b3' }),
    meadow: Object.freeze({ name: 'Sunny meadow', top: '#f5e58d', bottom: '#a8b96b', floor: '#e6dc99', grid: '#66733a2c', edge: '#fff5c6' }),
    sunset: Object.freeze({ name: 'Amber sunset', top: '#ffdf86', bottom: '#d39b57', floor: '#efd09a', grid: '#9367352c', edge: '#ffe9ac' }),
  });
  const resolve = (name) => Object.hasOwn(themes, name) ? name : 'night';
  function layout(width, height, columns, rows) {
    const margin = Math.min(12, Math.min(width, height) * 0.04);
    const cell = Math.max(0.01, Math.min((width - margin * 2) / columns, (height - margin * 2) / rows));
    return { cell, left: (width - columns * cell) / 2, top: (height - rows * cell) / 2 };
  }
  function pixelRatio(width, height, requested = 1) {
    return Math.min(requested, 1.5, Math.sqrt(2000000 / Math.max(1, width * height)));
  }
  function surface(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
    }
    return null;
  }
  function rounded(ctx, x, y, w, h, r, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  }
  function paint(ctx, { width, height, columns, rows, obstacles, theme, season }, frame) {
    const winter = season === 'winter' || season === 'sleeping';
    const colors = winter
      ? { top: '#192c3b', bottom: '#395563', floor: '#29414c', grid: '#d8eff326', edge: '#d9edf088' } : themes[resolve(theme)];
    const sky = ctx.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, colors.top); sky.addColorStop(1, colors.bottom);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    const { left, top, cell } = frame;
    const w = columns * cell; const h = rows * cell;
    if (!winter) {
      const sunX=width*.86, sunY=Math.max(24,top*.45), radius=Math.min(32,cell*1.2);
      for (const [scale,color] of [[2.4,'#fff2b32b'],[1.7,'#fff4bf55'],[1,'#fff7c8']]) {
        ctx.fillStyle=color; ctx.beginPath(); ctx.arc(sunX,sunY,radius*scale,0,Math.PI*2); ctx.fill();
      }
    }
    rounded(ctx, left, top, w, h, 4, colors.floor);
    if (!winter) {
      const shine=ctx.createLinearGradient(left,top,left+w,top+h);
      shine.addColorStop(0,'#fffbe674'); shine.addColorStop(.35,'#ffffff09');
      shine.addColorStop(.54,'#fff9d75c'); shine.addColorStop(1,'#b9802624');
      ctx.fillStyle=shine; ctx.fillRect(left,top,w,h);
    }
    ctx.strokeStyle = colors.grid; ctx.lineWidth = 0.7; ctx.beginPath();
    for (let x = 1; x < columns; x++) { ctx.moveTo(left + x * cell, top); ctx.lineTo(left + x * cell, top + h); }
    for (let y = 1; y < rows; y++) { ctx.moveTo(left, top + y * cell); ctx.lineTo(left + w, top + y * cell); }
    ctx.stroke(); ctx.strokeStyle = colors.edge; ctx.lineWidth = 1; ctx.strokeRect(left, top, w, h);
    for (const obstacle of obstacles) {
      const x = left + obstacle.x * cell; const y = top + obstacle.y * cell; const inset = cell * 0.08;
      if (obstacle.type === 'winter-block') {
        rounded(ctx, x + cell * .12, y + cell * .17, cell * .76, cell * .72, cell * .04, '#416574');
        rounded(ctx, x + cell * .16, y + cell * .12, cell * .68, cell * .66, cell * .04, '#92c2d0');
        rounded(ctx, x + cell * .16, y + cell * .12, cell * .68, cell * .12, cell * .04, '#eef8f6');
        ctx.lineWidth = Math.max(1.2,cell*.09); ctx.strokeStyle = '#244852'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x+cell*.34,y+cell*.34); ctx.lineTo(x+cell*.66,y+cell*.64);
        ctx.moveTo(x+cell*.66,y+cell*.34); ctx.lineTo(x+cell*.34,y+cell*.64); ctx.stroke();
      } else if (obstacle.type === 'rock') {
        // A full-cell masonry block and high-contrast × read as a hurdle, not a pickup.
        rounded(ctx, x + inset, y + inset, cell * 0.84, cell * 0.84, cell * 0.05, '#293f49');
        rounded(ctx, x + cell * 0.14, y + cell * 0.14, cell * 0.72, cell * 0.65, cell * 0.025, '#748a90');
        ctx.save(); ctx.lineCap = 'square';
        ctx.strokeStyle = '#b4c4c5'; ctx.lineWidth = Math.max(0.6, cell * 0.04);
        ctx.beginPath(); ctx.moveTo(x + cell * 0.17, y + cell * 0.72);
        ctx.lineTo(x + cell * 0.17, y + cell * 0.17); ctx.lineTo(x + cell * 0.8, y + cell * 0.17); ctx.stroke();
        ctx.strokeStyle = '#263b44'; ctx.lineWidth = Math.max(1.5, cell * 0.2);
        ctx.beginPath(); ctx.moveTo(x + cell * 0.35, y + cell * 0.32); ctx.lineTo(x + cell * 0.65, y + cell * 0.62);
        ctx.moveTo(x + cell * 0.65, y + cell * 0.32); ctx.lineTo(x + cell * 0.35, y + cell * 0.62); ctx.stroke();
        ctx.strokeStyle = '#ffd181'; ctx.lineWidth = Math.max(1, cell * 0.09); ctx.stroke();
        ctx.restore();
      } else {
        const barrier = obstacle.type === 'barrier';
        rounded(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, inset, barrier ? '#e5ad68' : '#738d92');
        ctx.strokeStyle = barrier ? '#64452c' : '#3c555e'; ctx.lineWidth = Math.max(1, cell * (barrier ? 0.12 : 0.05));
        ctx.beginPath();
        if (barrier) {
          ctx.moveTo(x + cell * 0.2, y + cell * 0.55); ctx.lineTo(x + cell * 0.55, y + cell * 0.2);
          ctx.moveTo(x + cell * 0.45, y + cell * 0.8); ctx.lineTo(x + cell * 0.8, y + cell * 0.45);
        } else {
          ctx.moveTo(x + inset, y + cell * 0.5); ctx.lineTo(x + cell - inset, y + cell * 0.5);
          ctx.moveTo(x + cell * 0.5, y + inset); ctx.lineTo(x + cell * 0.5, y + cell * 0.5);
        }
        ctx.stroke();
      }
    }
  }
  function signature(obstacles) {
    let hash = 0;
    for (const cell of obstacles) hash = (Math.imul(hash, 31) + cell.x * 7 + cell.y * 197 + (cell.type === 'wall' ? 1 : cell.type === 'rock' ? 2 : cell.type === 'winter-block' ? 4 : 3)) | 0;
    return hash;
  }
  function createPainter(createSurface = surface) {
    let cached = null;
    return {
      draw(ctx, options) {
        const frame = layout(options.width, options.height, options.columns, options.rows);
        const scale = options.pixelRatio || 1;
        const key = [options.width, options.height, options.columns, options.rows, scale, resolve(options.theme), options.season || 'summer', signature(options.obstacles)].join(':');
        if (!cached || cached.key !== key) {
          const canvas = createSurface(Math.max(1, Math.round(options.width * scale)), Math.max(1, Math.round(options.height * scale)));
          const buffer = canvas?.getContext('2d');
          cached = { key, canvas: buffer ? canvas : null };
          if (buffer) { buffer.setTransform(scale, 0, 0, scale, 0, 0); paint(buffer, options, frame); }
        }
        if (cached.canvas) ctx.drawImage(cached.canvas, 0, 0, options.width, options.height);
        else paint(ctx, options, frame);
        return frame;
      },
    };
  }
  const SnakeBoard = Object.freeze({ themes, resolve, layout, pixelRatio, createPainter });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeBoard };
  else root.SnakeBoard = SnakeBoard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
