/* Small cached winter artwork and bounded snowfall. Rendering never uses gameplay RNG. */
(function (root) {
  'use strict';
  function surface(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
    }
    return null;
  }
  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function tree(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Bare oak branches, with narrow highlights and snow settled on their upper edges.
    const branches = [
      [[-.12,-1.8],[-.7,-2.75],[-1.45,-3.05],[-1.75,-3.5]],
      [[.12,-2.1],[.72,-2.9],[1.35,-3.0],[1.65,-3.5]],
      [[0,-2.7],[-.26,-3.45],[-.1,-4.0]],
      [[.1,-2.65],[.5,-3.5],[1.02,-3.9]],
    ];
    for (const points of branches) {
      ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.strokeStyle = '#3b2d25'; ctx.lineWidth = .28; ctx.stroke();
      ctx.strokeStyle = '#94704c'; ctx.lineWidth = .15; ctx.stroke();
      ctx.beginPath(); const a = points[1], b = points[2]; ctx.moveTo(a[0],a[1]-.09); ctx.lineTo(b[0],b[1]-.09);
      ctx.strokeStyle = '#e4f1ef'; ctx.lineWidth = .1; ctx.stroke();
    }
    ctx.strokeStyle = '#55402d'; ctx.lineWidth = .08;
    for (const [x,y,side] of [[-1.45,-3.05,-1],[1.35,-3,1],[-.26,-3.45,-1],[.5,-3.5,1]]) {
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+side*.15,y-.45); ctx.lineTo(x+side*.4,y-.62); ctx.stroke();
    }
    const bark = ctx.createLinearGradient(-.65,0,.65,0);
    bark.addColorStop(0,'#3a2c23'); bark.addColorStop(.4,'#a17a50'); bark.addColorStop(.7,'#735034'); bark.addColorStop(1,'#39291f');
    ctx.fillStyle = bark; ctx.strokeStyle = '#30251f'; ctx.lineWidth = .065;
    ctx.beginPath(); ctx.moveTo(-.97,.6); ctx.quadraticCurveTo(-.58,.23,-.53,-.75);
    ctx.lineTo(-.4,-2.85); ctx.quadraticCurveTo(-.08,-3.25,.37,-2.85); ctx.lineTo(.53,-.75);
    ctx.quadraticCurveTo(.58,.23,.97,.6); ctx.quadraticCurveTo(0,.85,-.97,.6); ctx.fill(); ctx.stroke();
    ctx.lineWidth = .035; ctx.strokeStyle = '#d3a77088';
    for (const x of [-.32,-.14,.17,.32]) {
      ctx.beginPath(); ctx.moveTo(x,-2.7); ctx.bezierCurveTo(x-.12,-2.1,x+.1,-1.7,x,-.95); ctx.stroke();
    }
    ctx.strokeStyle = '#35271d'; ctx.lineWidth = .055;
    for (const side of [-1,1]) { ctx.beginPath(); ctx.moveTo(side*.82,.57); ctx.quadraticCurveTo(side*.48,.22,side*.46,-.45); ctx.stroke(); }
    ellipse(ctx,0,.66,1.12,.17,'#dceae9');
    ellipse(ctx,0,.67,.84,.09,'#b5ced0');
    ellipse(ctx,0,-.03,.58,.66,'#3e2b20');
    ellipse(ctx,0,-.03,.51,.6,'#bd9463');
    ellipse(ctx,0,0,.43,.5,'#080f11');
    ctx.strokeStyle = '#f4f8ed'; ctx.lineWidth = .105;
    ctx.beginPath(); ctx.ellipse(0,-.04,.52,.6,0,Math.PI*1.08,Math.PI*1.88); ctx.stroke();
  }
  function createPainter(createSurface = surface) {
    let cached = null;
    return {
      drawTree(ctx, { x, y, cell, pixelRatio = 1 }) {
        const ratio = Math.min(1.5, Math.max(.25,pixelRatio));
        const key = `${cell}:${ratio}`;
        if (!cached || cached.key !== key) {
          const canvas = createSurface(Math.max(1,Math.ceil(cell*4*ratio)),Math.max(1,Math.ceil(cell*5.2*ratio)));
          const buffer = canvas?.getContext('2d');
          cached = { key, canvas: buffer ? canvas : null };
          if (buffer) { buffer.setTransform(cell*ratio,0,0,cell*ratio,cell*2*ratio,cell*4.4*ratio); tree(buffer); }
        }
        if (cached.canvas) ctx.drawImage(cached.canvas,x-cell*2,y-cell*4.4,cell*4,cell*5.2);
        else { ctx.save(); ctx.translate(x,y); ctx.scale(cell,cell); tree(ctx); ctx.restore(); }
      },
    };
  }
  function drawEntrance(ctx, { x,y,cell }) {
    // Foreground lip masks the part of the snake that has actually entered the hollow.
    ctx.save(); ctx.translate(x,y); ctx.scale(cell,cell);
    ellipse(ctx,0,0,.425,.49,'#080f11');
    ellipse(ctx,.02,.27,.25,.12,'#c18d4526');
    ctx.strokeStyle = '#c79b65'; ctx.lineWidth = .055;
    ctx.beginPath(); ctx.ellipse(0,0,.45,.53,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  function drawSnow(ctx, { width,height,time = 0,animate = true }) {
    if (!animate || width <= 0 || height <= 0) return;
    const count = width < 600 ? 20 : 36;
    const seconds = time/1000;
    ctx.save(); ctx.fillStyle = '#eaf5f1'; ctx.globalAlpha = .55; ctx.beginPath();
    for (let i=0;i<count;i++) {
      const x = ((i*137.31 + seconds*(1.5+i%3) + Math.sin(seconds*.35+i)*5)%width+width)%width;
      const y = (i*83.17 + seconds*(11+i%5*3))%height;
      const radius = .65+(i%3)*.35;
      ctx.moveTo(x+radius,y); ctx.arc(x,y,radius,0,Math.PI*2);
    }
    ctx.fill(); ctx.restore();
  }
  const SnakeWinter = Object.freeze({ createPainter,drawEntrance,drawSnow });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeWinter };
  else root.SnakeWinter = SnakeWinter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
