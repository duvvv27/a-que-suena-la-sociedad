// Piezas de HUD en pixel art: paneles, botones, termómetro frío/caliente, espectrograma, escalera de zoom.
import { text, measure, paragraph, wrap, LINE } from '../render/font.js';

export function panel(ctx, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.fillStyle = o.bg || '#181425';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = o.border || '#3a4466';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = o.hi || '#5a6988';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  if (o.accent) {
    ctx.fillStyle = o.accent;
    ctx.fillRect(x + 1, y + 1, 3, h - 2);
  }
}

export function button(ctx, b, st, o = {}) {
  const { x, y, w, h } = b;
  const on = st.hover || st.focus;
  const sel = o.state; // 'ok' | 'bad' | undefined
  let bg = on ? '#3a4466' : '#262b44', bd = on ? '#fee761' : '#8b9bb4', fg = on ? '#ffffff' : '#ead4aa';
  if (sel === 'ok') { bg = '#265c42'; bd = '#63c74d'; fg = '#ffffff'; }
  if (sel === 'bad') { bg = '#3e2731'; bd = '#a22633'; fg = '#8b9bb4'; }
  if (b.disabled && !sel) { fg = '#5a6988'; bd = '#3a4466'; }
  ctx.fillStyle = '#181425';
  ctx.fillRect(x + 1, y + 2, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = bd;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  if (st.focus) {
    ctx.fillStyle = '#fee761';
    ctx.fillRect(x - 2, y - 2, w + 4, 1); ctx.fillRect(x - 2, y + h + 1, w + 4, 1);
    ctx.fillRect(x - 2, y - 2, 1, h + 4); ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
  }
  const sc = o.scale || 1;
  const pre = o.key ? `${o.key} ` : '';
  const tw = w - 10 - measure(pre, sc);
  const lh = LINE * sc;
  const lines = fitLines(b.label, tw, Math.max(1, Math.floor((h - 2) / lh)), sc);
  const ty = y + Math.round((h - lines.length * lh) / 2) + 2 * sc;
  if (o.key) text(ctx, o.key, x + 5, ty, on ? '#fee761' : '#feae34', sc, 'left', null);
  lines.forEach((l, i) => {
    if (o.align === 'left') text(ctx, l, x + 5 + measure(pre, sc), ty + i * lh, fg, sc, 'left', null);
    else text(ctx, l, x + w / 2, ty + i * lh, fg, sc, 'center', null);
  });
  if (sel === 'ok') text(ctx, '✓', x + w - 9, y + Math.round(h / 2) - 3, '#63c74d', 1, 'left', null);
  if (sel === 'bad') text(ctx, '✗', x + w - 9, y + Math.round(h / 2) - 3, '#e43b44', 1, 'left', null);
}

// ajusta un texto a un máximo de líneas; si no cabe, recorta la última con "…"
export function fitLines(str, maxW, maxLines, sc = 1) {
  const lines = wrap(str, maxW, sc);
  if (lines.length <= maxLines && lines.every((l) => measure(l, sc) <= maxW)) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[out.length - 1];
  while (last.length > 1 && measure(last + '…', sc) > maxW) last = last.slice(0, -1);
  out[out.length - 1] = last.trimEnd() + '…';
  return out;
}

// reparte botones en filas centradas según el ancho real de su texto
export function rowLayout(items, x, y, w, h, gap = 6) {
  const rows = [[]];
  let used = 0;
  for (const it of items) {
    const bw = Math.min(w, measure(it.label) + 14);
    if (rows[rows.length - 1].length && used + gap + bw > w) { rows.push([]); used = 0; }
    const row = rows[rows.length - 1];
    used += (row.length ? gap : 0) + bw;
    row.push({ ...it, w: bw, h });
  }
  const out = [];
  rows.forEach((row, ri) => {
    const total = row.reduce((s, b) => s + b.w, 0) + gap * (row.length - 1);
    let bx = x + Math.round((w - total) / 2);
    for (const b of row) { out.push({ ...b, x: bx, y: y + ri * (h + gap) }); bx += b.w + gap; }
  });
  return { buttons: out, height: rows.length * h + (rows.length - 1) * gap };
}

const HEAT_COLS =['#2ce8f5', '#0099db', '#63c74d', '#feae34', '#f77622', '#e43b44'];
export function heatWord(c) {
  return c < 0.25 ? 'HELADO' : c < 0.45 ? 'FRÍO' : c < 0.65 ? 'TIBIO' : c < 0.82 ? 'CALIENTE' : '¡ARDIENDO!';
}
export function thermo(ctx, x, y, w, c, t) {
  x = Math.round(x); y = Math.round(y);
  panel(ctx, x, y, w, 30);
  text(ctx, 'FRÍO', x + 4, y + 4, '#2ce8f5', 1, 'left', null);
  text(ctx, 'CALIENTE', x + w - 4, y + 4, '#f77622', 1, 'right', null);
  const bx = x + 4, by = y + 14, bw = w - 8;
  for (let i = 0; i < bw; i++) {
    const u = i / bw;
    ctx.fillStyle = HEAT_COLS[Math.min(5, Math.floor(u * 6))];
    ctx.globalAlpha = u <= c ? 1 : 0.22;
    ctx.fillRect(bx + i, by, 1, 5);
  }
  ctx.globalAlpha = 1;
  // marcas de forma (no solo color)
  ctx.fillStyle = '#181425';
  for (let k = 1; k < 6; k++) ctx.fillRect(bx + Math.round((k / 6) * bw), by, 1, 5);
  const mx = bx + Math.round(c * (bw - 1));
  const bob = c > 0.82 ? Math.round(Math.sin(t * 20)) : 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx - 1, by - 2 + bob, 3, 1);
  ctx.fillRect(mx, by - 1 + bob, 1, 7);
  ctx.fillRect(mx - 1, by + 6 + bob, 3, 1);
  const word = heatWord(c);
  text(ctx, word, x + w / 2, y + 22, HEAT_COLS[Math.min(5, Math.floor(c * 6))], 1, 'center', null);
}

export function spectroPanel(ctx, spec, x, y, w, h, label, t) {
  x = Math.round(x); y = Math.round(y);
  panel(ctx, x, y, w, h);
  const iw = w - 6, ih = h - 15;
  ctx.drawImage(spec.cv, spec.cv.width - Math.min(spec.cv.width, iw), 0, Math.min(spec.cv.width, iw), spec.cv.height, x + 3, y + 12, iw, ih);
  text(ctx, label, x + 4, y + 3, '#c0cbdc', 1, 'left', null);
  if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#e43b44'; ctx.fillRect(x + w - 7, y + 4, 3, 3); }
  const n = spec.bars.length;
  const bw = 2;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, spec.bars[i]);
    const bh = Math.round(v * 6);
    ctx.fillStyle = v > 0.7 ? '#fee761' : '#63c74d';
    ctx.fillRect(x + w - 10 - (n - i) * (bw + 1), y + 9 - bh, bw, Math.max(1, bh));
  }
}

export const LEVELS = [
  { name: 'ÓRBITA', ls: -99 },
  { name: 'CONTINENTE', ls: -2.4 },
  { name: 'REGIÓN', ls: -1 },
  { name: 'CIUDAD', ls: 0.5 },
  { name: 'CALLE', ls: 2.5 },
];
export function levelOf(ls) {
  let k = 0;
  for (let i = 0; i < LEVELS.length; i++) if (ls >= LEVELS[i].ls) k = i;
  return k;
}
export function ladder(ctx, x, y, ls, lsMin, lsMax) {
  const h = 70;
  const k = levelOf(ls);
  ctx.fillStyle = '#181425';
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x - 1, y, 5, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3a4466';
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  for (let i = 0; i < 5; i++) {
    const yy = y + h - 4 - Math.round((i / 4) * (h - 8));
    ctx.fillStyle = i === k ? '#fee761' : '#5a6988';
    ctx.fillRect(x, yy, 3, 1);
  }
  const u = (ls - lsMin) / (lsMax - lsMin);
  const my = y + h - 4 - Math.round(Math.max(0, Math.min(1, u)) * (h - 8));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, my - 1, 5, 3);
  text(ctx, LEVELS[k].name, x - 4, my - 3, '#fee761', 1, 'right');
}

export function arrow(ctx, cx, cy, ang, col, t) {
  const r = 5 + Math.round(Math.sin(t * 8));
  ctx.fillStyle = col;
  for (let i = 0; i < 7; i++) {
    const s = 7 - i;
    const px = cx + Math.cos(ang) * (i - 3 + r * 0.2), py = cy + Math.sin(ang) * (i - 3 + r * 0.2);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    for (let k = -s / 2; k <= s / 2; k += 1) ctx.fillRect(Math.round(px + nx * k), Math.round(py + ny * k), 1, 1);
  }
}

export function reticle(ctx, x, y, t, col = '#ffffff') {
  x = Math.round(x); y = Math.round(y);
  const g = 3 + (Math.floor(t * 2) % 2);
  ctx.fillStyle = '#181425';
  ctx.fillRect(x - g - 4, y, 4, 2); ctx.fillRect(x + g + 1, y, 4, 2);
  ctx.fillRect(x, y - g - 4, 2, 4); ctx.fillRect(x, y + g + 1, 2, 4);
  ctx.fillStyle = col;
  ctx.fillRect(x - g - 4, y, 4, 1); ctx.fillRect(x + g + 1, y, 4, 1);
  ctx.fillRect(x, y - g - 4, 1, 4); ctx.fillRect(x, y + g + 1, 1, 4);
}

export { text, measure, paragraph, wrap, LINE };
