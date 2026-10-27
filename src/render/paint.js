// Pintado de un chunk del suelo a una escala p (píxeles por tile).
// Terreno por píxel + carreteras + ciudades (módulos plantilla) + bosques, con sombras según la hora.
import { sampleTerrain, TREE_DENSITY, B, wrapDX } from '../world/planet.js';
import { PITCH, ROAD, BT, blockExists, hEdge, vEdge, getBlock, baseY } from '../world/cities.js';
import { SPR } from './sprites.js';
import { h12 } from '../core/rng.js';
import { shadeHex } from '../core/palette.js';

export const CHUNK_PX = 128;

let shadowCv = null, shadowCtx = null;
const shadeCache = new Map();
function sh(hex, k) {
  const key = hex + k;
  let v = shadeCache.get(key);
  if (!v) { v = shadeHex(hex, k); shadeCache.set(key, v); }
  return v;
}

// contexto de pintado: convierte tiles -> píxeles del chunk
class PC {
  constructor(ctx, x0, y0, p) {
    this.ctx = ctx; this.x0 = x0; this.y0 = y0; this.p = p;
  }
  X(tx) { return Math.floor(wrapDX(tx - this.x0) * this.p); }
  Y(ty) { return Math.floor((ty - this.y0) * this.p); }
  rect(col, tx, ty, tw, th) {
    const x = this.X(tx), y = this.Y(ty);
    const w = Math.max(1, Math.floor(wrapDX(tx + tw - this.x0) * this.p) - x);
    const h = Math.max(1, Math.floor((ty + th - this.y0) * this.p) - y);
    this.ctx.fillStyle = col;
    this.ctx.fillRect(x, y, w, h);
  }
}

export function paintChunk(canvas, world, p, tx0, ty0, light) {
  const ctx = canvas.getContext('2d');
  const S = CHUNK_PX;
  const ct = S / p;
  // Terreno por píxel
  const img = ctx.createImageData(S, S);
  const d32 = new Uint32Array(img.data.buffer);
  const pl = world.planet;
  for (let y = 0; y < S; y++) {
    const ty = ty0 + (y + 0.5) / p;
    for (let x = 0; x < S; x++) {
      d32[y * S + x] = sampleTerrain(pl, tx0 + (x + 0.5) / p, ty, p);
    }
  }
  ctx.putImageData(img, 0, 0);
  const pc = new PC(ctx, tx0, ty0, p);

  // Carreteras entre ciudades
  const segs = [];
  for (const r of world.roads) if (paintRoad(pc, r, ct)) segs.push(r);

  // Comunidad del bosque (estática)
  const vil = world.village;
  if (vil && near(vil.village.x, vil.village.y, 14, tx0, ty0, ct)) paintVillageGround(pc, vil);
  const objs = [];
  // Ciudades
  for (const c of world.cities) {
    const dx = wrapDX(c.x0 - tx0);
    if (dx > ct + 10 || dx + c.w < -10 || c.y0 > ty0 + ct + 10 || c.y0 + c.h < ty0 - 2) continue;
    paintCityGround(pc, c, tx0, ty0, ct, objs);
  }
  if (vil && p >= 2 && near(vil.village.x, vil.village.y, 14, tx0, ty0, ct)) {
    for (const [hx, hy] of vil.huts) objs.push({ k: 'hut', x: hx, y: hy });
  }
  // Bosques
  if (p >= 1) collectTrees(world, pc, tx0, ty0, ct, objs, segs);

  objs.sort((a, b) => baseY(a) - baseY(b));
  if (p >= 2 && objs.length) {
    // sombras: máscara opaca y luego composición con alfa (bordes nítidos)
    if (!shadowCv) {
      shadowCv = document.createElement('canvas');
      shadowCv.width = shadowCv.height = S;
      shadowCtx = shadowCv.getContext('2d');
    }
    shadowCtx.clearRect(0, 0, S, S);
    shadowCtx.fillStyle = '#000';
    const spc = new PC(shadowCtx, tx0, ty0, p);
    for (const o of objs) drawShadow(spc, o, light);
    ctx.globalAlpha = 0.26;
    ctx.drawImage(shadowCv, 0, 0);
    ctx.globalAlpha = 1;
  }
  for (const o of objs) drawObj(pc, o);
}

function near(x, y, r, tx0, ty0, ct) {
  const dx = wrapDX(x - tx0);
  return dx > -r && dx < ct + r && y > ty0 - r && y < ty0 + ct + r;
}

function paintRoad(pc, r, ct) {
  const { p } = pc;
  // recorte del segmento contra el chunk (con margen)
  let ax = pc.x0 + wrapDX(r.ax - pc.x0), ay = r.ay;
  let bx = ax + (r.bx - r.ax), by = r.by;
  const m = 3;
  const minX = pc.x0 - m, maxX = pc.x0 + ct + m, minY = pc.y0 - m, maxY = pc.y0 + ct + m;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [pp, q] of [[-dx, ax - minX], [dx, maxX - ax], [-dy, ay - minY], [dy, maxY - ay]]) {
    if (pp === 0) { if (q < 0) return false; continue; }
    const t = q / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  if (t1 <= t0) return false;
  const len = Math.hypot(dx, dy) * (t1 - t0);
  const dirt = r.kind === 'dirt';
  const wt = dirt ? 1.4 : 2;
  const w = Math.max(1, Math.round(wt * p));
  const steps = Math.ceil(len * p) + 1;
  const ctx = pc.ctx;
  ctx.fillStyle = dirt ? (p <= 1 ? '#b86f50' : '#c28569') : p <= 1 ? '#8b9bb4' : '#3a4466';
  const pts = [];
  for (let s = 0; s <= steps; s++) {
    const t = t0 + (t1 - t0) * (s / steps);
    const x = (ax + dx * t - pc.x0) * p, y = (ay + dy * t - pc.y0) * p;
    pts.push(x, y);
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w);
  }
  if (p >= 4 && !dirt) {
    ctx.fillStyle = '#fee761';
    for (let i = 0; i < pts.length; i += 2) {
      if (((i >> 1) / (p * 0.8)) % 2 < 1) ctx.fillRect(Math.round(pts[i]), Math.round(pts[i + 1]), 1, 1);
    }
  }
  return true;
}

function paintVillageGround(pc, vil) {
  const { ctx, p } = pc;
  const v = vil.village;
  const cx = (wrapDX(v.x - pc.x0)) * p, cy = (v.y - pc.y0) * p, r = v.r * p;
  ctx.fillStyle = '#c28569';
  for (let y = Math.floor(-r); y <= r; y++) {
    const hw = Math.sqrt(Math.max(0, r * r - y * y)) * (0.92 + 0.08 * Math.sin(y * 1.3));
    ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), Math.max(1, Math.round(hw * 2)), 1);
  }
  if (p >= 4) {
    ctx.fillStyle = '#b86f50';
    for (let i = 0; i < 40; i++) {
      const a = h12(i, 7) * 6.283, rr = h12(i, 9) * r;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1);
    }
    ctx.fillStyle = '#5a6988';
    ctx.fillRect(Math.round(cx - p * 0.5), Math.round(cy - p * 0.25), Math.round(p), Math.max(1, Math.round(p * 0.5)));
  }
}

const BLOCK_FAR = {
  [BT.HOUSES]: '#b0805a', [BT.APTS]: '#a7a8b8', [BT.DOWNTOWN]: '#5a6988', [BT.PARK]: '#3e8948',
  [BT.PLAZA]: '#e4a672', [BT.INDUSTRY]: '#9a7a66', [BT.CIVIC]: '#d9b090', [BT.WORKS]: '#b86f50',
};

function paintCityGround(pc, c, tx0, ty0, ct, objs) {
  const { ctx, p } = pc;
  const asphalt = p <= 1 ? '#5a6988' : '#3a4466';
  for (let j = 0; j <= c.by; j++) {
    for (let i = 0; i < c.bx; i++) if (hEdge(c, i, j)) pc.rect(asphalt, c.x0 + i * PITCH, c.y0 + j * PITCH, PITCH + ROAD, ROAD);
  }
  for (let i = 0; i <= c.bx; i++) {
    for (let j = 0; j < c.by; j++) if (vEdge(c, i, j)) pc.rect(asphalt, c.x0 + i * PITCH, c.y0 + j * PITCH, ROAD, PITCH + ROAD);
  }
  const m = 10;
  for (let bj = 0; bj < c.by; bj++) {
    const by0 = c.y0 + bj * PITCH + ROAD;
    if (by0 > ty0 + ct + m || by0 + 10 < ty0 - 2) continue;
    for (let bi = 0; bi < c.bx; bi++) {
      if (!blockExists(c, bi, bj)) continue;
      const bx0 = c.x0 + bi * PITCH + ROAD;
      const dx = wrapDX(bx0 - tx0);
      if (dx > ct + m || dx + 10 < -m) continue;
      const blk = getBlock(c, bi, bj);
      const inChunk = dx > -10 && dx < ct && by0 > ty0 - 10 && by0 < ty0 + ct;
      if (inChunk) {
        if (p <= 0.5) {
          pc.rect(BLOCK_FAR[blk.type] || '#8b9bb4', bx0, by0, 10, 10);
          continue;
        }
        pc.rect('#8b9bb4', bx0, by0, 10, 10);
        if (p >= 4) {
          ctx.fillStyle = '#5a6988';
          const x = pc.X(bx0), y = pc.Y(by0), w = Math.round(10 * p);
          ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + w - 1, w, 1);
          ctx.fillRect(x, y, 1, w); ctx.fillRect(x + w - 1, y, 1, w);
        }
        pc.rect(blk.ground, blk.ix, blk.iy, 8, 8);
        for (const it of blk.items) if (it.k === 'g') paintGroundItem(pc, it);
      }
      if (p > 0.5) for (const it of blk.items) if (it.k !== 'g') objs.push(it);
    }
  }
  if (p >= 4) paintMarkings(pc, c);
}

function paintGroundItem(pc, it) {
  const { ctx, p } = pc;
  pc.rect(it.c, it.x, it.y, it.w, it.h);
  if (it.tiles && p >= 4) {
    ctx.fillStyle = sh(it.c, 0.86);
    const x = pc.X(it.x), y = pc.Y(it.y), w = Math.round(it.w * p), h = Math.round(it.h * p);
    const step = p >= 8 ? 4 : 2;
    for (let yy = 0; yy < h; yy += step) ctx.fillRect(x, y + yy, w, 1);
    for (let xx = 0; xx < w; xx += step * 2) ctx.fillRect(x + xx, y, 1, h);
  }
  if (it.field && p >= 4) {
    ctx.fillStyle = '#ffffff';
    const x = pc.X(it.x), y = pc.Y(it.y), w = Math.round(it.w * p), h = Math.round(it.h * p);
    ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    ctx.fillRect(x + (w >> 1), y + 1, 1, h - 2);
  }
}

function paintMarkings(pc, c) {
  const { ctx, p } = pc;
  const dash = p >= 8 ? 5 : 3;
  for (let j = 0; j <= c.by; j++) {
    for (let i = 0; i < c.bx; i++) {
      if (!hEdge(c, i, j)) continue;
      const y = pc.Y(c.y0 + j * PITCH + 1);
      const xa = pc.X(c.x0 + i * PITCH + ROAD + 1), xb = pc.X(c.x0 + (i + 1) * PITCH - 1);
      ctx.fillStyle = '#c0cbdc';
      for (let x = xa; x < xb; x += dash * 2) ctx.fillRect(x, y, Math.min(dash, xb - x), 1);
      // pasos de cebra junto a cruces
      ctx.fillStyle = '#ffffff';
      const ya = pc.Y(c.y0 + j * PITCH), hh = Math.round(ROAD * p);
      const z1 = pc.X(c.x0 + i * PITCH + ROAD), z2 = pc.X(c.x0 + (i + 1) * PITCH - 1);
      const zw = Math.max(1, Math.round(p * 0.75));
      for (let yy = 1; yy < hh - 1; yy += 2) {
        ctx.fillRect(z1, ya + yy, zw, 1);
        ctx.fillRect(z2, ya + yy, zw, 1);
      }
    }
  }
  for (let i = 0; i <= c.bx; i++) {
    for (let j = 0; j < c.by; j++) {
      if (!vEdge(c, i, j)) continue;
      const x = pc.X(c.x0 + i * PITCH + 1);
      const ya = pc.Y(c.y0 + j * PITCH + ROAD + 1), yb = pc.Y(c.y0 + (j + 1) * PITCH - 1);
      ctx.fillStyle = '#c0cbdc';
      for (let y = ya; y < yb; y += dash * 2) ctx.fillRect(x, y, 1, Math.min(dash, yb - y));
      ctx.fillStyle = '#ffffff';
      const xa = pc.X(c.x0 + i * PITCH), ww = Math.round(ROAD * p);
      const z1 = pc.Y(c.y0 + j * PITCH + ROAD), z2 = pc.Y(c.y0 + (j + 1) * PITCH - 1);
      const zh = Math.max(1, Math.round(p * 0.75));
      for (let xx = 1; xx < ww - 1; xx += 2) {
        ctx.fillRect(xa + xx, z1, 1, zh);
        ctx.fillRect(xa + xx, z2, 1, zh);
      }
    }
  }
}

function collectTrees(world, pc, tx0, ty0, ct, objs, segs) {
  const pl = world.planet;
  const vil = world.village;
  const x1 = Math.floor(tx0) - 1, x2 = Math.ceil(tx0 + ct) + 1;
  const y1 = Math.floor(ty0) - 1, y2 = Math.ceil(ty0 + ct) + 2;
  const nearCities = world.cities.filter((c) => {
    const dx = wrapDX(c.x0 - tx0);
    return !(dx > ct + 4 || dx + c.w < -4 || c.y0 > ty0 + ct + 4 || c.y0 + c.h < ty0 - 4);
  });
  for (let ty = y1; ty < y2; ty++) {
    for (let tx = x1; tx < x2; tx++) {
      const r = h12(tx * 1.7 + 3.1, ty * 2.3 + 7.7);
      if (r > 0.6) continue;
      sampleTerrain(pl, tx + 0.5, ty + 0.5, pc.p);
      const cid = sampleTerrain.cell;
      if (sampleTerrain.river || !pl.land[cid]) continue;
      const b = pl.biome[cid];
      if (r >= TREE_DENSITY[b]) continue;
      if (nearCities.some((c) => cityOccupied(c, tx, ty))) continue;
      if (vil) {
        const dvx = wrapDX(tx - vil.village.x), dvy = ty - vil.village.y;
        if (dvx * dvx + dvy * dvy < (vil.village.r + 1) ** 2) continue;
        const dcx = wrapDX(tx - vil.cut.x), dcy = ty - vil.cut.y;
        if (dcx * dcx + dcy * dcy < vil.cut.r ** 2) continue;
      }
      if (segs.length && onRoad(segs, tx + 0.5, ty + 0.5)) continue;
      const hv = h12(tx * 0.37, ty * 0.91);
      const sp = b === B.TAIGA ? 1 : b === B.JUNGLE ? 2 : b === B.FOREST ? (hv < 0.3 ? 1 : 0) : 0;
      objs.push({ k: 't', x: tx + 0.2 + 0.6 * h12(tx, ty * 3.3), y: ty + 0.6 + 0.4 * hv, sp, v: (hv * 3) | 0 });
    }
  }
}

// el tile pertenece a una manzana o a una calle existente de la ciudad
function cityOccupied(c, tx, ty) {
  const dx = wrapDX(tx - c.x0), dy = ty - c.y0;
  if (dx < -1 || dx > c.w || dy < -1 || dy > c.h) return false;
  const bi = Math.floor(dx / PITCH), bj = Math.floor(dy / PITCH);
  const bi2 = Math.floor((dx - ROAD - 1) / PITCH), bj2 = Math.floor((dy - ROAD - 1) / PITCH);
  return blockExists(c, bi, bj) || blockExists(c, bi2, bj) || blockExists(c, bi, bj2) || blockExists(c, bi2, bj2);
}

function onRoad(segs, x, y) {
  for (const r of segs) {
    const ax = r.ax, ay = r.ay, bx = r.bx, by = r.by;
    const px = ax + wrapDX(x - ax);
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    const ex = ax + dx * t - px, ey = ay + dy * t - y;
    if (ex * ex + ey * ey < 2.6) return true;
  }
  return false;
}

// Objetos (edificios, árboles, mobiliario)
function bH(o, p) { return Math.round((o.h * p) / 8); }

function drawShadow(pc, o, light) {
  const { ctx, p } = pc;
  const sx = light.shadow[0], sy = light.shadow[1];
  if (o.k === 'b') {
    const H = bH(o, p);
    const x = pc.X(o.x), y = pc.Y(o.y);
    const w = Math.max(1, Math.round(o.w * p)), d = Math.max(1, Math.round(o.d * p));
    const steps = Math.max(1, Math.round(H * Math.hypot(sx, sy)));
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * H;
      ctx.fillRect(x + Math.round(sx * t), y + Math.round(sy * t), w, d);
    }
  } else if (o.k === 't' || o.k === 'hut') {
    const s = o.k === 'hut' ? 1.3 : 1;
    const x = pc.X(o.x), y = pc.Y(o.y);
    const hh = 10 * (p / 8) * s;
    const w = Math.max(1, Math.round(p * 0.9 * s)), d = Math.max(1, Math.round(p * 0.45 * s));
    ctx.fillRect(Math.round(x - w / 2 + sx * hh), Math.round(y - d + sy * hh * 0.6), w, d);
  }
}

function drawObj(pc, o) {
  const { ctx, p } = pc;
  if (o.k === 'b') return drawBuilding(pc, o);
  if (o.k === 't') {
    if (p < 2) {
      if ((o.v + Math.floor(o.x * 3)) % 3 === 0 || p >= 1) {
        ctx.fillStyle = o.sp === 1 ? '#265c42' : '#2f6b3a';
        ctx.fillRect(pc.X(o.x), pc.Y(o.y) - 1, 1, 1);
      }
      return;
    }
    const s = SPR.trees[o.sp % 3][(o.v || 0) % 3];
    const im = s.img(p);
    ctx.drawImage(im, Math.round(pc.X(o.x) - im.width / 2), pc.Y(o.y) - im.height);
    return;
  }
  if (o.k === 'hut') {
    const im = SPR.hut.img(p);
    ctx.drawImage(im, Math.round(pc.X(o.x) - im.width / 2), pc.Y(o.y) - im.height);
    return;
  }
  if (o.k === 'p') drawProp(pc, o);
}

function ellipse(ctx, cx, cy, rx, ry, col) {
  ctx.fillStyle = col;
  for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
  }
}

function drawProp(pc, o) {
  const { ctx, p } = pc;
  const x = pc.X(o.x), y = pc.Y(o.y);
  switch (o.s) {
    case 'bench':
      if (p >= 4) { const im = SPR.bench.img(p); ctx.drawImage(im, Math.round(x - im.width / 2), y - im.height); }
      break;
    case 'fountain': {
      if (p < 2) { ctx.fillStyle = '#0099db'; ctx.fillRect(x - 1, y - 1, 2, 2); break; }
      const rx = 1.7 * p, ry = 1.15 * p;
      ellipse(ctx, x, y, rx, ry, '#c0cbdc');
      ellipse(ctx, x, y, rx - Math.max(1, p / 4), ry - Math.max(1, p / 4), '#0099db');
      if (p >= 4) {
        ellipse(ctx, x, y - 1, rx * 0.35, ry * 0.35, '#c0cbdc');
        ctx.fillStyle = '#2ce8f5';
        ctx.fillRect(x - 1, y - Math.round(p * 0.9), 2, Math.round(p * 0.8));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y - Math.round(p * 1.1), 1, 2);
      }
      break;
    }
    case 'lamp':
      if (p >= 4) {
        const hh = Math.round(p * 1.4);
        ctx.fillStyle = '#3a4466';
        ctx.fillRect(x, y - hh, 1, hh);
        ctx.fillStyle = '#fee761';
        ctx.fillRect(x - 1, y - hh - 1, 3, 1);
      }
      break;
    case 'flag':
      if (p >= 2) {
        const hh = Math.round(p * 2.2);
        ctx.fillStyle = '#c0cbdc';
        ctx.fillRect(x, y - hh, 1, hh);
        ctx.fillStyle = o.c || '#e43b44';
        ctx.fillRect(x + 1, y - hh, Math.max(2, Math.round(p * 0.6)), Math.max(1, Math.round(p * 0.4)));
      }
      break;
    case 'pool':
      pc.rect('#ffffff', o.x - 1, o.y - 0.7, 2, 1.4);
      pc.rect('#2ce8f5', o.x - 0.9, o.y - 0.6, 1.8, 1.2);
      break;
    case 'pond':
      if (p >= 1) {
        ellipse(ctx, x, y, 1.6 * p, 1.1 * p, '#2ce8f5');
        ellipse(ctx, x, y, 1.6 * p - 1, 1.1 * p - 1, '#0099db');
      }
      break;
    case 'chimney':
      if (p >= 2) {
        const hh = Math.round(p * 3), w = Math.max(1, Math.round(p * 0.6));
        ctx.fillStyle = '#b86f50';
        ctx.fillRect(x - (w >> 1), y - hh, w, hh);
        ctx.fillStyle = '#733e39';
        for (let k = 2; k < hh; k += 4) ctx.fillRect(x - (w >> 1), y - hh + k, w, 1);
      }
      break;
  }
}

function drawBuilding(pc, b) {
  const { ctx, p } = pc;
  const X = pc.X(b.x), Y = pc.Y(b.y);
  const W = Math.max(1, Math.round(b.w * p)), D = Math.max(1, Math.round(b.d * p));
  if (p <= 1) {
    ctx.fillStyle = b.roof;
    ctx.fillRect(X, Y, W, D);
    return;
  }
  const H = bH(b, p);
  const fy = Y + D - H; // parte superior de la fachada
  const top = Y - H;    // parte superior del techo
  ctx.fillStyle = b.style === 2 ? '#3f6f9e' : b.wall;
  ctx.fillRect(X, fy, W, H);
  if (p >= 4) {
    ctx.fillStyle = sh(b.style === 2 ? '#3f6f9e' : b.wall, 0.78);
    ctx.fillRect(X + W - 1, fy, 1, H);
    ctx.fillRect(X, Y + D - 1, W, 1);
  }
  if (p >= 4 && H >= 4) {
    const big = p >= 8;
    const ww = big ? 2 : 1, wh = big ? 3 : 1, sx = big ? 4 : 2, sy = big ? 6 : 3;
    if (b.style === 2) {
      ctx.fillStyle = '#7fb0d8';
      for (let yy = fy + 2; yy < Y + D - 2; yy += sy - 2) ctx.fillRect(X + 1, yy, W - 2, 1);
    } else if (b.shape === 'gable') {
      ctx.fillStyle = '#3a4466';
      const wy = fy + Math.max(1, (H >> 1) - 1);
      if (W >= 6 * (p / 4)) {
        ctx.fillRect(X + Math.round(W * 0.18), wy, ww, wh);
        ctx.fillRect(X + Math.round(W * 0.82) - ww, wy, ww, wh);
      }
    } else {
      let r = 0;
      for (let yy = fy + 2; yy + wh <= Y + D - (big ? 5 : 2); yy += sy, r++) {
        let cIdx = 0;
        for (let xx = X + 2; xx + ww <= X + W - 2; xx += sx, cIdx++) {
          const lit = h12(b.s + cIdx * 7, r * 13) > 0.8;
          ctx.fillStyle = lit ? '#fee761' : b.style === 1 ? '#262b44' : '#3a4466';
          ctx.fillRect(xx, yy, ww, wh);
        }
      }
    }
    ctx.fillStyle = b.style >= 3 ? '#262b44' : '#733e39';
    const dw = big ? (b.style >= 3 ? 6 : 3) : b.style >= 3 ? 2 : 1, dh = big ? 4 : 2;
    if (H > dh) ctx.fillRect(X + ((W - dw) >> 1), Y + D - dh, dw, dh);
    if (b.style === 5 && big) {
      ctx.fillStyle = '#ffffff';
      for (let xx = X + 2; xx < X + W - 2; xx += 4) ctx.fillRect(xx, fy + 1, 1, H - 2);
    }
  }
  if (b.shape === 'gable') {
    const ov = p >= 4 ? 1 : 0;
    const half = Math.ceil(D / 2);
    ctx.fillStyle = sh(b.roof, 1.15);
    ctx.fillRect(X - ov, top, W + ov * 2, half);
    ctx.fillStyle = sh(b.roof, 0.82);
    ctx.fillRect(X - ov, top + half, W + ov * 2, D - half);
    if (p >= 8) {
      ctx.fillStyle = sh(b.roof, 1.35);
      ctx.fillRect(X - ov, top + half - 1, W + ov * 2, 1);
      ctx.fillStyle = sh(b.roof, 0.6);
      ctx.fillRect(X - ov, top + D - 1, W + ov * 2, 1);
    }
  } else if (b.shape === 'saw') {
    ctx.fillStyle = b.roof;
    ctx.fillRect(X, top, W, D);
    if (p >= 4) {
      for (let xx = X; xx < X + W; xx += Math.max(3, p)) {
        ctx.fillStyle = sh(b.roof, 1.25);
        ctx.fillRect(xx, top, Math.max(1, p >> 2), D);
        ctx.fillStyle = '#7fb0d8';
        ctx.fillRect(xx + Math.max(1, p >> 2), top, 1, D);
      }
    }
  } else {
    ctx.fillStyle = b.roof;
    ctx.fillRect(X, top, W, D);
    if (p >= 4) {
      ctx.fillStyle = sh(b.roof, 1.22);
      ctx.fillRect(X, top, W, 1);
      ctx.fillRect(X, top, 1, D);
      ctx.fillStyle = sh(b.roof, 0.75);
      ctx.fillRect(X + W - 1, top + 1, 1, D - 1);
      ctx.fillRect(X + 1, top + D - 1, W - 1, 1);
      roofDetails(ctx, b, X, top, W, D, p);
    }
  }
}

function roofDetails(ctx, b, X, top, W, D, p) {
  const big = p >= 8;
  const r = (n) => h12(b.s * 0.013 + n, b.s * 0.007 + n * 3);
  if (b.style === 3 && big) {
    // hospital: cruz roja
    const cx = X + (W >> 1), cy = top + (D >> 1);
    ctx.fillStyle = '#e43b44';
    ctx.fillRect(cx - 1, cy - 3, 3, 7);
    ctx.fillRect(cx - 3, cy - 1, 7, 3);
    return;
  }
  if (b.h > 50 && big && W >= 20) {
    // helipuerto
    const cx = X + (W >> 1), cy = top + (D >> 1);
    ctx.fillStyle = '#3a4466';
    ellipse(ctx, cx, cy, 6, 6, '#3a4466');
    ctx.fillStyle = '#fee761';
    ctx.fillRect(cx - 2, cy - 3, 1, 7);
    ctx.fillRect(cx + 2, cy - 3, 1, 7);
    ctx.fillRect(cx - 2, cy, 5, 1);
    return;
  }
  const n = big ? 1 + Math.floor(r(1) * 3) : 1;
  const s = big ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const ax = X + 2 + Math.floor(r(i + 2) * Math.max(1, W - 4 - s));
    const ay = top + 2 + Math.floor(r(i + 5) * Math.max(1, D - 4 - s));
    ctx.fillStyle = '#c0cbdc';
    ctx.fillRect(ax, ay, s, s);
    if (big) { ctx.fillStyle = '#5a6988'; ctx.fillRect(ax, ay + s - 1, s, 1); }
  }
  if (b.style === 1 && big && W > 12) {
    // tanque de agua
    ctx.fillStyle = '#733e39';
    ctx.fillRect(X + W - 7, top + 2, 4, 4);
    ctx.fillStyle = '#b86f50';
    ctx.fillRect(X + W - 7, top + 2, 4, 2);
  }
  if (r(9) > 0.7 && big && W > 10 && D > 10) {
    // azotea verde
    ctx.fillStyle = '#63c74d';
    ctx.fillRect(X + 2, top + D - 6, Math.min(8, W - 4), 4);
    ctx.fillStyle = '#3e8948';
    ctx.fillRect(X + 3, top + D - 5, 2, 2);
  }
}
