// Tablero rompecabezas: el jugador arma la cadena ESTÍMULO → SÍNTOMA → DIAGNÓSTICO
// arrastrando (o tocando) piezas que encajan en el hueco libre.
import * as H from './hud.js';

const COL = ['#2ce8f5', '#feae34', '#63c74d'];
const LABEL = ['ESTÍMULO', 'SÍNTOMA', 'DIAGNÓSTICO'];
const BG = '#181425';

export class Puzzle {
  constructor(game) {
    this.g = game;
    this.drag = null;
    this.sparks = [];
    this.flash = 0;
    this.L = null;
  }
  // índice del hueco activo: 1 = síntoma (identificar), 2 = diagnóstico (relacionar)
  get active() { return this.g.state === 'identify' ? 1 : 2; }
  get cards() { return this.g.cards; }

  layout() {
    const g = this.g, W = g.W, H_ = g.H, R = g.R, c = this.cards;
    const pw = Math.min(W - 12, 420);
    const px = Math.round((W - pw) / 2);
    const gap = 12;
    const sw = Math.floor((pw - 16 - gap * 2) / 3);
    const tw = sw - 20;
    const done = c.ok >= 0;
    const symOk = R.symptoms.find((o) => o.ok).t;
    const texts = [R.stimulus, this.active === 2 || done ? symOk : null, this.active === 2 && done ? c.opts[c.ok].t : null];
    const fill = texts.map((t) => (t ? H.wrap(t, tw) : null));
    const pieceLines = c.opts.map((o) => H.wrap(o.t, tw));
    const maxL = Math.max(...fill.map((l) => (l ? l.length : 1)), ...pieceLines.map((l) => l.length));
    const slotH = Math.max(30, maxL * 11 + 12);
    const why = done ? H.wrap(this.active === 1 ? R.symptomWhy : R.conceptWhy, pw - 16) : [];
    // bandeja: filas de hasta 3 piezas
    const rows = [];
    c.opts.forEach((o, i) => { if (!rows.length || rows[rows.length - 1].length === 3) rows.push([]); rows[rows.length - 1].push(i); });
    const ph = pieceLines.map((l) => l.length * 11 + 10);
    const rowH = rows.map((r) => Math.max(...r.map((i) => ph[i])));
    const trayH = rowH.reduce((a, b) => a + b, 0) + 5 * (rows.length - 1);
    const qLines = H.wrap(c.q + (done ? '' : ' Arrastra o toca la pieza correcta.'), pw - 16);
    const btnH = done && this.active === 2 ? 22 : 0;
    const bodyH = done ? why.length * 11 + 2 : trayH;
    const boardH = 15 + slotH + 8 + qLines.length * 11 + 4 + bodyH + 8 + btnH;
    const py = H_ - boardH - 6;
    const sy = py + 15;
    const slots = [0, 1, 2].map((k) => ({ x: px + 8 + k * (sw + gap), y: sy, w: sw, h: slotH }));
    const homes = [];
    let ty = sy + slotH + 8 + qLines.length * 11 + 4;
    rows.forEach((r, ri) => {
      const rw = r.length * sw + (r.length - 1) * gap;
      let x = px + Math.round((pw - rw) / 2);
      for (const i of r) { homes[i] = { x, y: ty, w: sw, h: ph[i] }; x += sw + gap; }
      ty += rowH[ri] + 5;
    });
    this.L = { px, py, pw, sw, gap, slotH, slots, homes, fill, pieceLines, why, qLines, boardH, sy, done, btnY: py + boardH - btnH - 4 };
    return this.L;
  }

  ensurePieces() {
    const c = this.cards;
    if (!c.pieces) c.pieces = c.opts.map((o, i) => ({ i, x: null, y: null, shake: 0, delay: i * 0.07, inSlot: false }));
  }
  hit(x, y) {
    const c = this.cards;
    if (!c || !c.pieces || c.ok >= 0) return null;
    for (let k = c.pieces.length - 1; k >= 0; k--) {
      const p = c.pieces[k];
      const h = this.L.homes[p.i];
      if (c.wrong.has(p.i) || p.x === null) continue;
      if (x >= p.x && x < p.x + h.w && y >= p.y && y < p.y + h.h) return p;
    }
    return null;
  }
  press(x, y) {
    const p = this.hit(x, y);
    if (!p) return false;
    this.drag = { p, ox: x - p.x, oy: y - p.y, x, y };
    return true;
  }
  move(x, y) {
    if (!this.drag) return false;
    this.drag.x = x;
    this.drag.y = y;
    return true;
  }
  release() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const s = this.L.slots[this.active];
    if (this.overSlot(d.x, d.y, s)) this.place(d.p.i);
  }
  tap(x, y) {
    this.drag = null;
    const p = this.hit(x, y);
    if (p) this.place(p.i);
  }
  overSlot(x, y, s) {
    return x > s.x - 10 && x < s.x + s.w + 10 && y > s.y - 14 && y < s.y + s.h + 14;
  }
  place(i) {
    const c = this.cards;
    if (c.ok >= 0 || c.wrong.has(i)) return;
    this.g.pick(i);
    const p = c.pieces[i];
    const s = this.L.slots[this.active];
    if (c.ok === i) {
      p.inSlot = true;
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
        this.sparks.push({ x: s.x + s.w / 2, y: s.y + s.h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0.6 + Math.random() * 0.4, col: COL[this.active] });
      }
    } else {
      p.shake = 0.5;
      this.flash = 0.4;
    }
  }
  draw(ctx, buttons, dt, time) {
    this.ensurePieces();
    const L = this.layout();
    const c = this.cards, g = this.g;
    const act = this.active;
    H.panel(ctx, L.px, L.py, L.pw, L.boardH, { accent: COL[act] });
    L.slots.forEach((s, k) => {
      H.text(ctx, LABEL[k], s.x + s.w / 2, L.py + 5, k <= act ? COL[k] : '#5a6988', 1, 'center', null);
      const lines = L.fill[k];
      if (lines && (k !== act || this.arrived(c))) this.piece(ctx, s.x, s.y, s.w, s.h, lines, COL[k], { left: k > 0, right: k < 2, placed: true, icon: k === 0 });
      else if (k === act) this.hole(ctx, s, time);
      else this.locked(ctx, s);
    });
    // conectores: brillan cuando ambas piezas están puestas
    for (let k = 0; k < 2; k++) {
      const a = L.slots[k], b = L.slots[k + 1];
      const on = L.fill[k] && L.fill[k + 1] && (k + 1 !== act || this.arrived(c));
      const y = a.y + Math.round(a.h / 2);
      for (let x = a.x + a.w + 5; x < b.x - 3; x++) {
        const lit = on && ((x + Math.floor(time * 30)) % 4 === 0);
        ctx.fillStyle = on ? (lit ? '#ffffff' : COL[k + 1]) : '#3a4466';
        if (on || x % 2) ctx.fillRect(x, y, 1, 1);
      }
    }
    let y = L.sy + L.slotH + 8;
    L.qLines.forEach((l) => { H.text(ctx, l, L.px + 8, y, '#ffffff', 1, 'left', null); y += 11; });
    y += 4;
    if (L.done) {
      L.why.forEach((l) => { H.text(ctx, l, L.px + 8, y, '#ead4aa', 1, 'left', null); y += 11; });
    }
    const order = [...c.pieces].sort((a, b) => (this.drag && this.drag.p === a ? 1 : 0) - (this.drag && this.drag.p === b ? 1 : 0));
    for (const p of order) {
      const h = L.homes[p.i];
      const wrong = c.wrong.has(p.i);
      if (L.done && !p.inSlot) continue;
      let tx = h.x, ty = h.y;
      if (p.inSlot) { const s = L.slots[act]; tx = s.x; ty = s.y; }
      if (p.x === null) { p.x = h.x; p.y = h.y + 30; }
      p.delay -= dt;
      if (this.drag && this.drag.p === p) { p.x = this.drag.x - this.drag.ox; p.y = this.drag.y - this.drag.oy; }
      else if (p.delay <= 0) { const k = Math.min(1, dt * 14); p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
      if (p.inSlot && this.arrived(c)) continue;
      p.shake = Math.max(0, p.shake - dt);
      const sx = p.shake > 0 ? Math.round(Math.sin(p.shake * 60) * 3) : 0;
      const st = g.btn.state('opt' + p.i);
      const dragging = this.drag && this.drag.p === p;
      const hov = !wrong && (st.hover || this.hoverPiece === p) && !L.done;
      this.piece(ctx, Math.round(p.x) + sx, Math.round(p.y) - (dragging ? 2 : hov ? 1 : 0), h.w, p.inSlot ? L.slotH : h.h, L.pieceLines[p.i], COL[act], {
        left: true, right: act < 2, wrong, lifted: dragging, hover: hov, focus: st.focus, key: String(p.i + 1),
      });
      if (!L.done && !p.inSlot) {
        buttons.push({
          id: 'opt' + p.i, label: c.opts[p.i].t, passive: true,
          aria: `Pieza ${p.i + 1}: ${c.opts[p.i].t}. Colocar en ${LABEL[act]}`,
          x: h.x, y: h.y, w: h.w, h: h.h, disabled: wrong, onClick: () => this.place(p.i), draw: () => {},
        });
      }
    }
    // chispas al encajar
    this.flash = Math.max(0, this.flash - dt);
    this.sparks = this.sparks.filter((s) => (s.t -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt;
      ctx.fillStyle = Math.random() < 0.3 ? '#ffffff' : s.col;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    if (L.done && act === 2) {
      buttons.push({ id: 'cont', label: 'VER CÓMO SE TRANSFORMA ▶', aria: 'Continuar', x: L.px + L.pw - 172, y: L.btnY, w: 164, h: 16, onClick: () => g.enter('fix') });
      if (!c.focused) { c.focused = true; setTimeout(() => g.btn.map.get('cont')?.focus({ preventScroll: true }), 60); }
    }
    // cursor de mano sobre piezas
    const m = g.input && g.input.mouse;
    this.hoverPiece = m ? this.hit(m[0], m[1]) : null;
    g.stage.style.cursor = this.drag ? 'grabbing' : this.hoverPiece ? 'grab' : '';
  }
  arrived(c) {
    if (c.ok < 0) return false;
    const p = c.pieces[c.ok], s = this.L.slots[this.active];
    return Math.abs(p.x - s.x) < 2 && Math.abs(p.y - s.y) < 2;
  }

  hole(ctx, s, time) {
    const pulse = Math.floor(time * 3) % 2;
    const col = this.flash > 0 ? '#e43b44' : this.drag && this.overSlot(this.drag.x, this.drag.y, s) ? '#fee761' : pulse ? COL[this.active] : '#5a6988';
    ctx.fillStyle = '#0f0d1a';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = col;
    for (let x = s.x; x < s.x + s.w; x += 4) { ctx.fillRect(x, s.y, 2, 1); ctx.fillRect(x, s.y + s.h - 1, 2, 1); }
    for (let y = s.y; y < s.y + s.h; y += 4) { ctx.fillRect(s.x, y, 1, 2); ctx.fillRect(s.x + s.w - 1, y, 1, 2); }
    if (this.drag && this.overSlot(this.drag.x, this.drag.y, s)) H.text(ctx, 'SUELTA AQUÍ', s.x + s.w / 2, s.y + s.h / 2 - 3, col, 1, 'center', null);
    else H.text(ctx, '?', s.x + s.w / 2, s.y + s.h / 2 - 7, col, 2, 'center', null);
  }
  locked(ctx, s) {
    ctx.fillStyle = '#0f0d1a';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(s.x, s.y, s.w, 1); ctx.fillRect(s.x, s.y + s.h - 1, s.w, 1);
    ctx.fillRect(s.x, s.y, 1, s.h); ctx.fillRect(s.x + s.w - 1, s.y, 1, s.h);
    H.text(ctx, '…', s.x + s.w / 2, s.y + s.h / 2 - 4, '#5a6988', 1, 'center', null);
  }

  // pieza de rompecabezas: muesca a la izquierda, pestaña a la derecha
  piece(ctx, x, y, w, h, lines, col, o) {
    const ty = y + Math.round(h / 2) - 4;
    const body = o.wrong ? '#2a2236' : o.placed ? '#1f2f2a' : o.hover ? '#3a4466' : '#262b44';
    const edge = o.wrong ? '#5a3a4a' : o.focus ? '#fee761' : col;
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(x + 1, y + (o.lifted ? 4 : 2), w, h);
    if (o.right) ctx.fillRect(x + w + 1, ty + (o.lifted ? 4 : 2), 5, 8);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    if (o.right) {
      ctx.fillStyle = body;
      ctx.fillRect(x + w - 1, ty + 1, 5, 6);
      ctx.fillStyle = edge;
      ctx.fillRect(x + w, ty, 4, 1); ctx.fillRect(x + w, ty + 7, 4, 1); ctx.fillRect(x + w + 4, ty + 1, 1, 6);
      ctx.fillStyle = body;
      ctx.fillRect(x + w - 1, ty + 1, 1, 6);
    }
    if (o.left) {
      ctx.fillStyle = o.placed ? BG : '#181425';
      ctx.fillRect(x, ty + 1, 4, 6);
      ctx.fillStyle = edge;
      ctx.fillRect(x, ty, 5, 1); ctx.fillRect(x, ty + 7, 5, 1); ctx.fillRect(x + 4, ty + 1, 1, 6);
    }
    if (o.focus) {
      ctx.fillStyle = '#fee761';
      ctx.fillRect(x - 2, y - 2, w + 4, 1); ctx.fillRect(x - 2, y + h + 1, w + 4, 1);
      ctx.fillRect(x - 2, y - 2, 1, h + 4); ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
    }
    const fg = o.wrong ? '#5a6988' : o.placed ? '#ffffff' : '#ead4aa';
    const ly = y + Math.round((h - lines.length * 11) / 2) + 2;
    lines.forEach((l, i) => H.text(ctx, l, x + w / 2 + 4, ly + i * 11, fg, 1, 'center', null));
    if (o.icon) H.text(ctx, '♪', x + 6, y + 3, col, 1, 'left', null);
    if (o.key && !o.wrong) H.text(ctx, o.key, x + 6, y + 3, '#feae34', 1, 'left', null);
    if (o.wrong) H.text(ctx, '✗', x + w - 9, y + 3, '#e43b44', 1, 'left', null);
  }
}
