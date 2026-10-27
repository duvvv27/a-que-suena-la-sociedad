// Botones accesibles: elementos <button> reales (teclado, lector de pantalla, foco)
// colocados sobre los botones pixel-art que se dibujan en el canvas del HUD.
export class Buttons {
  constructor(root, view) {
    this.root = root;
    this.view = view;
    this.map = new Map();
    this.list = [];
    this.hover = null;
  }
  // items: [{ id, label, aria, x, y, w, h, onClick, disabled }]
  set(items) {
    const keep = new Set();
    for (const it of items) {
      keep.add(it.id);
      let el = this.map.get(it.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = this.list.find((b) => b.id === it.id);
          if (cur && !cur.disabled && cur.onClick) cur.onClick();
        });
        el.addEventListener('pointerenter', () => { this.hover = it.id; });
        el.addEventListener('pointerleave', () => { if (this.hover === it.id) this.hover = null; });
        this.root.appendChild(el);
        this.map.set(it.id, el);
      }
      const W = this.view.W, H = this.view.H;
      const k = [it.x, it.y, it.w, it.h, W, H, it.label, it.aria, !!it.disabled, !!it.passive].join('|');
      if (el._k === k) continue; // sin cambios: no tocar el DOM
      el._k = k;
      el.style.left = (it.x / W) * 100 + '%';
      el.style.top = (it.y / H) * 100 + '%';
      el.style.width = (it.w / W) * 100 + '%';
      el.style.height = (it.h / H) * 100 + '%';
      el.textContent = it.label;
      el.setAttribute('aria-label', it.aria || it.label);
      el.disabled = !!it.disabled;
      // pasivo: el puntero lo maneja el canvas (arrastrar); el botón sigue sirviendo para teclado y lector
      el.style.pointerEvents = it.passive ? 'none' : '';
    }
    for (const [id, el] of this.map) {
      if (!keep.has(id)) {
        if (document.activeElement === el) el.blur();
        el.remove();
        this.map.delete(id);
        if (this.hover === id) this.hover = null;
      }
    }
    this.list = items;
  }
  state(id) {
    const el = this.map.get(id);
    return { hover: this.hover === id, focus: !!el && document.activeElement === el && el.matches(':focus-visible') };
  }
  click(id) {
    const b = this.list.find((x) => x.id === id);
    if (b && !b.disabled && b.onClick) b.onClick();
  }
}
