// Lightweight audition illustration, not the editor or a terrain implementation.
export class Garden {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.tiles = Array.from({ length: 14 * 14 }, (_, i) => {
      const x = i % 14, y = Math.floor(i / 14);
      return { x, y, h: 0.3 + Math.max(0, 2.8 - Math.hypot(x - 4, y - 4) * 0.55), water: x > 7 && y < 8 && x + y > 10, tree: (i * 37 % 29 < 4 && x < 8), berry: i === 115 };
    });
    this.phase = ''; this.cursor = null; this.draw();
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas);
  }
  point(x, y, h = 0) { return [500 + (x - y) * 26, 73 + (x + y) * 10 - h * 16]; }
  hit(event) {
    const r = this.canvas.getBoundingClientRect();
    const px = (event.clientX - r.left) * 1000 / r.width, py = (event.clientY - r.top) * 420 / r.height;
    let best = null, d = Infinity;
    for (const tile of this.tiles) { const [x, y] = this.point(tile.x, tile.y, tile.h), dist = Math.hypot(px - x, py - y); if (dist < d) { d = dist; best = tile; } }
    return best;
  }
  change(name, tile, size = 0.35) {
    if (!tile) return;
    for (const t of this.tiles) {
      const d = Math.hypot(tile.x - t.x, tile.y - t.y), influence = Math.max(0, 1 - d / (1.3 + size * 3));
      if (!influence) continue;
      if (name === 'raise') t.h = Math.min(5, t.h + influence * 0.09);
      if (name === 'lower') t.h = Math.max(0.1, t.h - influence * 0.09);
      if (name === 'flatten') t.h += (1 - t.h) * influence * 0.08;
      if (name === 'smooth' || name === 'naturalize') t.h += (1.5 - t.h) * influence * 0.025;
      if (name === 'remove') { t.tree = false; t.berry = false; }
    }
    if (name === 'tree') tile.tree = true;
    if (name === 'berry') tile.berry = true;
    this.cursor = tile; this.draw();
  }
  draw() {
    const c = this.ctx, canvas = this.canvas;
    const ratio = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * ratio), h = Math.round(canvas.clientHeight * ratio);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    c.setTransform(canvas.width / 1000, 0, 0, canvas.height / 420, 0, 0); c.clearRect(0, 0, 1000, 420);
    const poly = (points, fill) => { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle = fill; c.fill(); };
    c.fillStyle = '#b8c7a552'; c.beginPath(); c.ellipse(503, 315, 340, 65, 0, 0, Math.PI * 2); c.fill();
    const sorted = [...this.tiles].sort((a,b) => a.x + a.y - b.x - b.y);
    for (const t of sorted) {
      const [x,y] = this.point(t.x, t.y, t.h), bottom = 31 + t.h * 16;
      poly([[x-26,y],[x,y+10],[x,y+bottom],[x-26,y+bottom-10]], '#9a8563');
      poly([[x,y+10],[x+26,y],[x+26,y+bottom-10],[x,y+bottom]], '#85795b');
      const hue = 83 + (t.x * 7 + t.y * 3) % 12, light = 48 + (t.x + t.y * 3) % 8;
      poly([[x,y-10],[x+26,y],[x,y+10],[x-26,y]], t.water ? '#80afb0' : `hsl(${hue} 25% ${light}%)`);
      if (t.water) { c.strokeStyle='#b9d7c9'; c.lineWidth=1; c.beginPath(); c.moveTo(x-9,y-1); c.lineTo(x+3,y+3); c.stroke(); }
      if (t.tree) {
        c.fillStyle='#796247'; c.fillRect(x-2,y-30,4,31);
        poly([[x,y-68],[x-16,y-20],[x+17,y-20]],'#456b4d');
        poly([[x,y-57],[x-20,y-8],[x+21,y-8]],'#507a51');
        poly([[x,y-57],[x,y-8],[x+21,y-8]],'#3d6749');
      }
      if (t.berry) { c.fillStyle='#71824a'; c.beginPath(); c.ellipse(x,y-6,13,11,0,0,7); c.fill(); c.fillStyle='#8b5550'; c.beginPath(); c.arc(x-4,y-9,2,0,7); c.arc(x+4,y-5,2,0,7); c.fill(); }
      if (t.x === 4 && t.y === 9) {
        poly([[x-23,y-24],[x,y-15],[x,y+3],[x-23,y-6]],'#b19a68'); poly([[x,y-15],[x+25,y-24],[x+25,y-6],[x,y+3]],'#8b7955');
        poly([[x-29,y-25],[x-3,y-49],[x+28,y-28],[x,y-14]],'#675d49');
        c.fillStyle='#4e5241'; c.fillRect(x+7,y-15,8,13);
      }
    }
    if (this.phase) {
      const [x,y] = this.point(6,7,3);
      if (this.phase === 'plume' || this.phase === 'rumble') {
        for(let i=0;i<7;i++){c.fillStyle=`rgba(96,101,87,${0.3-i*.022})`;c.beginPath();c.ellipse(x+Math.sin(i*2)*18,y-30-i*15,20+i*4,17+i*2,0,0,7);c.fill();}
      }
      if (this.phase === 'cool') { c.strokeStyle='#ac8e65'; c.lineWidth=5; c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+60,y+15,x-10,y+50,x+70,y+70);c.stroke(); }
    }
    if (this.cursor) { const [x,y] = this.point(this.cursor.x,this.cursor.y,this.cursor.h); c.strokeStyle='#fffcdf';c.lineWidth=2;c.beginPath();c.ellipse(x,y,31,13,0,0,7);c.stroke(); }
  }
}
