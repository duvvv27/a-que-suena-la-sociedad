// Fuente bitmap 5x7 propia (sin archivos externos), con acentos del español.
// Filas: 0..6 = altura de mayúscula; 7..8 = descendentes; -2..-1 = acentos de mayúsculas.
const G = {
  A: '.##./#..#/#..#/####/#..#/#..#/#..#', B: '###./#..#/#..#/###./#..#/#..#/###.',
  C: '.###/#.../#.../#.../#.../#.../.###', D: '###./#..#/#..#/#..#/#..#/#..#/###.',
  E: '####/#.../#.../###./#.../#.../####', F: '####/#.../#.../###./#.../#.../#...',
  G: '.###/#.../#.../#.##/#..#/#..#/.###', H: '#..#/#..#/#..#/####/#..#/#..#/#..#',
  I: '###/.#./.#./.#./.#./.#./###', J: '..##/...#/...#/...#/...#/#..#/.##.',
  K: '#..#/#..#/#.#./##../#.#./#..#/#..#', L: '#.../#.../#.../#.../#.../#.../####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#..#/##.#/##.#/#.##/#.##/#..#/#..#',
  O: '.##./#..#/#..#/#..#/#..#/#..#/.##.', P: '###./#..#/#..#/###./#.../#.../#...',
  Q: '.##./#..#/#..#/#..#/#..#/#.#./.#.#', R: '###./#..#/#..#/###./#.#./#..#/#..#',
  S: '.###/#.../#.../.##./...#/...#/###.', T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#..#/#..#/#..#/#..#/#..#/#..#/.##.', V: '#...#/#...#/#...#/.#.#./.#.#./..#../..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '####/...#/...#/..#./.#../#.../####',
  0: '.##./#..#/#.##/#..#/##.#/#..#/.##.', 1: '.#./##./.#./.#./.#./.#./###',
  2: '.##./#..#/...#/..#./.#../#.../####', 3: '###./...#/...#/.##./...#/...#/###.',
  4: '#..#/#..#/#..#/####/...#/...#/...#', 5: '####/#.../#.../###./...#/...#/###.',
  6: '.##./#.../#.../###./#..#/#..#/.##.', 7: '####/...#/...#/..#./.#../.#../.#..',
  8: '.##./#..#/#..#/.##./#..#/#..#/.##.', 9: '.##./#..#/#..#/.###/...#/...#/.##.',
  a: '..../..../.##./...#/.###/#..#/.###', b: '#.../#.../###./#..#/#..#/#..#/###.',
  c: '.../.../.##/#../#../#../.##', d: '...#/...#/.###/#..#/#..#/#..#/.###',
  e: '..../..../.##./#..#/####/#.../.###', f: '.##/#../###/#../#../#../#..',
  g: '..../..../.###/#..#/#..#/#..#/.###/...#/.##.', h: '#.../#.../###./#..#/#..#/#..#/#..#',
  i: '#/./#/#/#/#/#', j: '.#/../.#/.#/.#/.#/.#/.#/#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#', l: '#./#./#./#./#./#./.#',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#', n: '..../..../###./#..#/#..#/#..#/#..#',
  o: '..../..../.##./#..#/#..#/#..#/.##.', p: '..../..../###./#..#/#..#/#..#/###./#.../#...',
  q: '..../..../.###/#..#/#..#/#..#/.###/...#/...#', r: '..../..../#.##/##../#.../#.../#...',
  s: '..../..../.###/#.../.##./...#/###.', t: '.#./.#./###/.#./.#./.#./..#',
  u: '..../..../#..#/#..#/#..#/#..#/.###', v: '.../.../#.#/#.#/#.#/#.#/.#.',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.', x: '.../.../#.#/#.#/.#./#.#/#.#',
  y: '..../..../#..#/#..#/#..#/#..#/.###/...#/.##.', z: '..../..../####/...#/.##./#.../####',
  ' ': '../../../../../../..', '.': '././././././#',
  ',': '../../../../../.#/.#/#.', ':': './././#/././#/.', ';': '../../.#/../../.#/.#/#.',
  '!': '#/#/#/#/#/./#', '¡': '#/./#/#/#/#/#', '?': '.##./#..#/...#/..#./.#../..../.#..',
  '¿': '..#./..../..#./.#../#.../#..#/.##.', '-': '.../.../.../###/.../.../...',
  '+': '.../.../.#./###/.#./.../...', '/': '..#/..#/.#./.#./.#./#../#..',
  '(': '.#/#./#./#./#./#./.#', ')': '#./.#/.#/.#/.#/.#/#.', '"': '#.#/#.#/.../.../.../.../...',
  "'": '#/#/././././.', '%': '##.#/##.#/..#./.#../#.../#.##/#.##', '·': './././#/././.',
  '[': '##/#./#./#./#./#./##', ']': '##/.#/.#/.#/.#/.#/##', '=': '.../.../###/.../###/.../...',
  '>': '.../#../.#./..#/.#./#../...', '<': '.../..#/.#./#../.#./..#/...', '_': '..../..../..../..../..../..../####',
  '*': '.../#.#/.#./#.#/.../.../...', '→': '...../..#../...#./#####/...#./..#../.....',
  '←': '...../..#../.#.../#####/.#.../..#../.....', '♪': '..##/..#./..#./..#./###./###./....',
  '✓': '...../....#/...#./#.#../.#.../...../.....', '✗': '...../#...#/.#.#./..#../.#.#./#...#/.....',
  '—': '...../...../...../#####/...../...../.....', '…': '...../...../...../...../...../...../#.#.#',
  '#': '.#.#./#####/.#.#./#####/.#.#./...../.....', '°': '.#./#.#/.#./.../.../.../...',
  '▶': '#.../##../###./####/###./##../#...',
};
const ACC = { 'á': 'a', 'é': 'e', 'ó': 'o', 'ú': 'u', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U' };
const LINE_ROWS = 11; // -2..8

function parse(src) {
  const rows = src.split('/');
  return { w: rows[0].length, top: 0, rows };
}
const glyphs = {};
for (const ch in G) glyphs[ch] = parse(G[ch]);
glyphs['í'] = parse('.#/#./#./#./#./#./#.');
glyphs['ñ'] = (() => { const g = parse(G.n); g.rows = ['.#.#', '#.#.', ...g.rows.slice(2)]; return g; })();
glyphs['ü'] = (() => { const g = parse(G.u); g.rows = ['....', '#..#', ...g.rows.slice(2)]; return g; })();
glyphs['Ñ'] = (() => { const g = parse(G.N); g.rows = ['.#.#', '#.#.', ...g.rows]; g.top = -2; return g; })();
glyphs['Ü'] = (() => { const g = parse(G.U); g.rows = ['....', '#..#', ...g.rows]; g.top = -2; return g; })();
for (const [ch, base] of Object.entries(ACC)) {
  const g = parse(G[base]);
  const cx = (g.w - 1) >> 1;
  const r0 = '.'.repeat(g.w).split(''), r1 = '.'.repeat(g.w).split('');
  r0[Math.min(g.w - 1, cx + 1)] = '#';
  r1[cx] = '#';
  if (base === base.toUpperCase()) {
    g.rows = [r0.join(''), r1.join(''), ...g.rows];
    g.top = -2;
  } else {
    g.rows = [r0.join(''), r1.join(''), ...g.rows.slice(2)];
  }
  glyphs[ch] = g;
}

let atlas = null;
const tinted = new Map();
function buildAtlas() {
  let x = 0;
  for (const ch in glyphs) { glyphs[ch].ax = x; x += glyphs[ch].w + 1; }
  atlas = document.createElement('canvas');
  atlas.width = x;
  atlas.height = LINE_ROWS;
  const ctx = atlas.getContext('2d');
  ctx.fillStyle = '#fff';
  for (const ch in glyphs) {
    const g = glyphs[ch];
    g.rows.forEach((row, ri) => {
      const y = ri + g.top + 2;
      for (let cx = 0; cx < row.length; cx++) if (row[cx] === '#') ctx.fillRect(g.ax + cx, y, 1, 1);
    });
  }
}
function tint(color) {
  if (!atlas) buildAtlas();
  let t = tinted.get(color);
  if (!t) {
    t = document.createElement('canvas');
    t.width = atlas.width;
    t.height = atlas.height;
    const c = t.getContext('2d');
    c.drawImage(atlas, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, t.width, t.height);
    tinted.set(color, t);
  }
  return t;
}

const g0 = () => glyphs['?'];
export const LINE = 11;

export function measure(str, scale = 1) {
  let w = 0;
  for (const ch of str) w += ((glyphs[ch] || g0()).w + 1) * scale;
  return Math.max(0, w - scale);
}

// y = parte superior de las mayúsculas
export function text(ctx, str, x, y, color = '#ead4aa', scale = 1, align = 'left', shadow = '#181425') {
  str = String(str);
  if (align !== 'left') {
    const w = measure(str, scale);
    x -= align === 'center' ? Math.round(w / 2) : w;
  }
  x = Math.round(x);
  y = Math.round(y);
  if (shadow) draw(ctx, str, x + scale, y + scale, shadow, scale);
  draw(ctx, str, x, y, color, scale);
}
function draw(ctx, str, x, y, color, scale) {
  const img = tint(color);
  for (const ch of str) {
    const g = glyphs[ch] || g0();
    ctx.drawImage(img, g.ax, 0, g.w, LINE_ROWS, x, y - 2 * scale, g.w * scale, LINE_ROWS * scale);
    x += (g.w + 1) * scale;
  }
}

export function wrap(str, maxW, scale = 1) {
  const out = [];
  for (const para of String(str).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (measure(t, scale) > maxW && line) { out.push(line); line = w; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

export function paragraph(ctx, str, x, y, maxW, color, scale = 1, align = 'left', lh = LINE) {
  const lines = wrap(str, maxW, scale);
  lines.forEach((l, i) => {
    const xx = align === 'center' ? x + maxW / 2 : x;
    text(ctx, l, xx, y + i * lh * scale, color, scale, align);
  });
  return lines.length * lh * scale;
}
