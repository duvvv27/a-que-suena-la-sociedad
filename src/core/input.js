// Entrada unificada: arrastrar (ratón/táctil), rueda, pellizco, toque, doble toque y teclado.
export class Input {
  constructor(el, toInternal) {
    this.el = el;
    this.toInternal = toInternal;
    this.ptrs = new Map();
    this.keys = new Set();
    this.h = {};
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.mouse = null;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', () => { this.mouse = null; });
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  on(name, fn) { this.h[name] = fn; }
  emit(name, ...a) { if (this.h[name]) return this.h[name](...a); }
  down(e) {
    if (e.target.closest && e.target.closest('button')) return;
    this.el.setPointerCapture?.(e.pointerId);
    const [x, y] = this.toInternal(e.clientX, e.clientY);
    this.ptrs.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now(), tl: performance.now(), moved: 0 });
    if (this.ptrs.size === 2) this.pinch = this.pinchState();
    this.emit('press', x, y);
  }
  pinchState() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  move(e) {
    const [x, y] = this.toInternal(e.clientX, e.clientY);
    this.mouse = [x, y];
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    if (this.ptrs.size >= 2) {
      p.x = x; p.y = y;
      const n = this.pinchState();
      if (this.pinch && n.d > 0 && this.pinch.d > 0) {
        this.emit('zoom', Math.log2(n.d / this.pinch.d), n.mx, n.my, true);
        this.emit('drag', this.pinch.mx, this.pinch.my, n.mx, n.my, 0);
      }
      this.pinch = n;
      p.moved = 99;
      return;
    }
    const dt = (now - p.tl) / 1000;
    p.moved += Math.hypot(x - p.x, y - p.y);
    if (p.moved > 3) this.emit('drag', p.x, p.y, x, y, dt);
    p.x = x; p.y = y; p.tl = now;
  }
  up(e, cancel) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    if (cancel) return;
    const now = performance.now();
    if (p.moved <= 3 && now - p.t0 < 450) {
      const lt = this.lastTap;
      if (now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 10) {
        this.lastTap.t = 0;
        this.emit('double', p.x, p.y);
      } else {
        this.lastTap = { t: now, x: p.x, y: p.y };
        this.emit('tap', p.x, p.y);
      }
    } else this.emit('release', now - p.tl > 90);
  }
  wheel(e) {
    e.preventDefault();
    const [x, y] = this.toInternal(e.clientX, e.clientY);
    let d = -e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    const notch = Math.abs(d) >= 50;
    this.emit('zoom', notch ? Math.sign(d) : d / 160, x, y, !notch);
  }
  key(e, isDown) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (isDown) {
      if (!this.keys.has(k)) {
        const used = this.emit('key', k, e);
        if (used) e.preventDefault();
      }
      this.keys.add(k);
      if (k.startsWith('Arrow')) e.preventDefault();
    } else this.keys.delete(k);
  }
  axis() {
    const K = this.keys;
    let x = 0, y = 0;
    if (K.has('ArrowLeft') || K.has('a')) x -= 1;
    if (K.has('ArrowRight') || K.has('d')) x += 1;
    if (K.has('ArrowUp') || K.has('w')) y -= 1;
    if (K.has('ArrowDown') || K.has('s')) y += 1;
    return [x, y];
  }
}
