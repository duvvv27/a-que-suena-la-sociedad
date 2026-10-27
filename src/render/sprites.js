// Módulos plantilla pixel-art. Cada plantilla es una matriz de caracteres -> colores.
// Se pre-renderizan una vez (con versiones a 1/2 y 1/4 para niveles de zoom lejanos).

const FIXED = {
  k: '#181425', w: '#ffffff', g: '#c0cbdc', G: '#8b9bb4', n: '#5a6988', N: '#3a4466',
  y: '#fee761', Y: '#feae34', o: '#f77622', r: '#e43b44', R: '#a22633', l: '#2ce8f5',
  L: '#0099db', B: '#124e89', f: '#63c74d', F: '#3e8948', v: '#265c42', e: '#b86f50',
  E: '#733e39', u: '#e4a672', U: '#ead4aa', m: '#b55088', P: '#f6757a',
};

export const T = {
  person0: ['.hh.', '.ss.', 'aaaa', 'aaaa', 'saas', '.pp.', '.pp.', '.kk.'],
  person1: ['.hh.', '.ss.', 'aaaa', 'aaaa', 'saas', '.pp.', 'p..p', 'k..k'],
  personUp: ['s..s', 'shhs', 'assa', 'aaaa', 'aaaa', '.pp.', '.pp.', '.kk.'],
  personSit: ['.hh.', '.ss.', 'aaaa', 'saas', 'pppp', 'k..k'],
  carE: ['...aaaa...', '..aLLaLa..', '.aaaaaaaay', 'baaaaaaaab', 'bbbbbbbbbb', '.kk....kk.'],
  carN: ['.yaay.', 'kaaaak', 'aLLLLa', 'aaaaaa', 'aaaaaa', 'abbbba', 'aLLLLa', 'kaaaak', '.raar.'],
  busE: [
    '..aaaaaaaaaaaaaaa.', '.aLLaLLaLLaLLaLLLa', '.aLLaLLaLLaLLaLLLa', 'aaaaaaaaaaaaaaaaay',
    'cccccccccccccccccc', 'bbbbbbbbbbbbbbbbbb', '..kk.........kk...',
  ],
  truckE: [
    'cccccccc......', 'cccccccc.aaa..', 'cccccccc.aLLa.', 'cccccccc.aaaay',
    'dddddddddaaaaa', 'nnnnnnnnnbbbbb', '.kk.kk.....kk.',
  ],
  logTruckE: [
    'eeeeeeee......', 'UEUEUEUE.aaa..', 'eeeeeeee.aLLa.', 'UEUEUEUE.aaaay',
    'nnnnnnnnnaaaaa', 'nnnnnnnnnbbbbb', '.kk.kk.....kk.',
  ],
  amb0: ['.....rL.....', '..wwwwwwww..', '.wwwwwwwLLw.', 'wwwrwwwwwwwy', 'wwrrrwwwwwww', 'gggrgggggggg', '.kk.....kk..'],
  amb1: ['.....Lr.....', '..wwwwwwww..', '.wwwwwwwLLw.', 'wwwrwwwwwwwy', 'wwrrrwwwwwww', 'gggrgggggggg', '.kk.....kk..'],
  excavator: [
    '........aaa.....', '.......a...a....', '......a.....a...', '.....a.......a..',
    '....a.........kk', '.aaaa.........kk', '.aLLa...........', 'aaaaaaaa........',
    'bbbbbbbbb.......', 'nnnnnnnnn.......', 'knknknknk.......', '.kkkkkkk........',
  ],
  cyclist: ['.....hh..', '.....ss..', '....aaa..', '....aas..', '.k..pp.k.', 'k.knnnk.k', '.k.....k.'],
  treeRound: [
    '...bbbb...', '..baaaab..', '.baaaaaab.', 'baaaabaabc', 'baabaaabbc', 'bbaabbbbbc',
    '.bbbbbbcc.', '..cbbbcc..', '...cccc...', '....Ee....', '....Ee....', '...EEEe...',
  ],
  treePine: [
    '...bb...', '...ab...', '..abbc..', '..abbc..', '.aabbbc.', '..abbc..', '.aabbbc.',
    'aabbbbcc', '.abbbbc.', 'aabbbbcc', '...Ee...', '...Ee...', '..EEe...',
  ],
  treeBushy: [
    '..bb..bb..', '.baabbaab.', 'baaaabaaab', 'baabaaabbc', '.bbbbbbbc.', 'baabbcbbbc',
    'bbbbccbcc.', '.cbcccccc.', '....Ee....', '....Ee....', '...EEe....',
  ],
  sapling: ['..a..', '.aba.', 'abcba', '..b..', '..e..', '.EEe.'],
  stump: ['.UUU.', 'eUuUe', 'eeeee', '.E.E.'],
  log: ['.eeeeeeU', 'eEeeeeeu', '.EEEEEEU'],
  bush: ['.aaab.', 'aabbbc', 'abbbcc', '.cccc.'],
  bench: ['eeeeee', 'EEEEEE', 'k....k'],
  hut: [
    '.....uu.....', '....uUUu....', '...uuUUuu...', '..uuuuuuuu..', '.uuuuuuuuuu.',
    'eeeeeeeeeeee', '.EeeeeeeeeE.', '.EeeEkkEeeE.', '.EeeEkkEeeE.', '.EEEEkkEEEE.',
  ],
  table: ['uuuuuuuuuu', 'UUUUUUUUUU', 'e........e', 'e........e'],
  placard: ['ccccc', 'cdcdc', 'ccccc', '..e..', '..e..'],
  bubHonk: ['.wwwww.', 'wwwkwww', 'wwwkwww', 'wwwkwww', 'wwwwwww', '.wwkww.', '.w.....'],
  bubNote: ['.wwwww.', 'wwwkkww', 'wwwkwkw', 'wwwkwww', 'wkkkwww', '.kkkww.', '.w.....'],
  bubTalk: ['.wwwww.', 'wwwwwww', 'wkwkwkw', 'wwwwwww', '.wwwww.', '..w....'],
  bubEar: ['.wwwww.', 'wwrrrww', 'wwrwwrw', 'wwwwrww', 'wwwrwww', '.wwwww.', '.w.....'],
  bird0: ['k.k', '.k.'],
  bird1: ['.k.', 'k.k'],
  flag: ['nrrrrr.', 'nrrwrrr', 'nrrrrr.', 'n......', 'n......', 'n......', 'n......', 'n......', 'n......', 'n......', 'n......', 'kkk....'],
};

function render(rows, colors, flipX = false, flipY = false) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[flipY ? h - 1 - y : y];
    for (let x = 0; x < w; x++) {
      const ch = row[flipX ? w - 1 - x : x];
      if (ch === '.' || ch === undefined) continue;
      const col = colors[ch] || FIXED[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// Reducción 2:1 promediando color y umbralizando alfa (mantiene el look pixel)
function half(src) {
  const w = Math.max(1, Math.ceil(src.width / 2)), h = Math.max(1, Math.ceil(src.height / 2));
  const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx, sy = y * 2 + dy;
          if (sx >= src.width || sy >= src.height) continue;
          const i = (sy * src.width + sx) * 4;
          if (sd[i + 3] > 0) { r += sd[i]; g += sd[i + 1]; b += sd[i + 2]; n++; }
        }
      }
      if (n >= 2 || (n === 1 && w * h <= 4)) {
        const i = (y * w + x) * 4;
        o[i] = r / n; o[i + 1] = g / n; o[i + 2] = b / n; o[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}

class Sprite {
  constructor(rows, colors = {}, flipX = false, flipY = false) {
    const c8 = render(rows, colors, flipX, flipY);
    const c4 = half(c8);
    const c2 = half(c4);
    this.lv = [c8, c4, c2];
    this.w = c8.width;
    this.h = c8.height;
  }
  // p = píxeles por tile del búfer (8, 4, 2)
  img(p) {
    return p >= 8 ? this.lv[0] : p >= 4 ? this.lv[1] : this.lv[2];
  }
}

const cache = new Map();
export function sprite(name, colors = {}, flipX = false, flipY = false) {
  const key = name + JSON.stringify(colors) + flipX + flipY;
  let s = cache.get(key);
  if (!s) {
    s = new Sprite(T[name], colors, flipX, flipY);
    cache.set(key, s);
  }
  return s;
}

export const SHIRTS = ['#e43b44', '#0099db', '#feae34', '#63c74d', '#b55088', '#f77622', '#ffffff', '#3a4466', '#2ce8f5', '#f6757a', '#733e39', '#fee761'];
const PANTS = ['#3a4466', '#262b44', '#733e39', '#124e89', '#5a6988', '#b86f50'];
const SKIN = ['#e8b796', '#c28569', '#b86f50', '#733e39', '#ead4aa'];
const HAIR = ['#181425', '#733e39', '#3e2731', '#feae34', '#b86f50', '#c0cbdc', '#e43b44'];
export const CAR_COLORS = ['#e43b44', '#0099db', '#feae34', '#ffffff', '#63c74d', '#b55088', '#c0cbdc', '#3a4466'];

export const SPR = {};

export function buildSprites(rng) {
  SPR.people = [];
  for (let i = 0; i < 32; i++) {
    const col = {
      a: SHIRTS[(rng() * SHIRTS.length) | 0], p: PANTS[(rng() * PANTS.length) | 0],
      s: SKIN[(rng() * SKIN.length) | 0], h: HAIR[(rng() * HAIR.length) | 0],
    };
    SPR.people.push({
      walk: [sprite('person0', col), sprite('person1', col)],
      up: sprite('personUp', col),
      sit: sprite('personSit', col),
      col,
    });
  }
  const worker = (shirt, helmet) => {
    const col = { a: shirt, p: '#3a4466', s: '#c28569', h: helmet };
    return { walk: [sprite('person0', col), sprite('person1', col)], up: sprite('personUp', col), sit: sprite('personSit', col), col };
  };
  SPR.worker = worker('#f77622', '#fee761');
  SPR.logger = worker('#a22633', '#f77622');
  SPR.planter = [worker('#63c74d', '#733e39'), worker('#3e8948', '#181425'), worker('#fee761', '#3e2731')];

  SPR.cars = CAR_COLORS.map((c) => {
    const col = { a: c, b: shade(c) };
    return {
      E: sprite('carE', col), W: sprite('carE', col, true),
      N: sprite('carN', col), S: sprite('carN', col, false, true), col: c,
    };
  });
  SPR.bus = sprite('busE', { a: '#e43b44', b: '#a22633', c: '#fee761' });
  SPR.busW = sprite('busE', { a: '#e43b44', b: '#a22633', c: '#fee761' }, true);
  SPR.truck = sprite('truckE', { a: '#0099db', b: '#124e89', c: '#ead4aa', d: '#c0cbdc' });
  SPR.dump = sprite('truckE', { a: '#feae34', b: '#d77643', c: '#feae34', d: '#d77643' });
  SPR.logTruck = sprite('logTruckE', { a: '#3e8948', b: '#265c42' });
  SPR.logTruckW = sprite('logTruckE', { a: '#3e8948', b: '#265c42' }, true);
  SPR.amb = [sprite('amb0'), sprite('amb1')];
  SPR.excavator = sprite('excavator', { a: '#feae34', b: '#d77643' });
  SPR.excavatorW = sprite('excavator', { a: '#feae34', b: '#d77643' }, true);
  SPR.cyclists = [0, 1, 2, 3].map((i) => {
    const col = { a: SHIRTS[(i * 5 + 2) % SHIRTS.length], p: '#3a4466', s: SKIN[i % SKIN.length], h: HAIR[i % HAIR.length] };
    return sprite('cyclist', col);
  });
  const greens = [
    { a: '#63c74d', b: '#3e8948', c: '#265c42' },
    { a: '#8fd36b', b: '#4fa046', c: '#2f6b3a' },
    { a: '#3e8948', b: '#265c42', c: '#193c3e' },
  ];
  SPR.trees = [
    greens.map((g) => sprite('treeRound', g)),
    greens.map((g) => sprite('treePine', g)),
    greens.map((g) => sprite('treeBushy', g)),
  ];
  SPR.autumn = sprite('treeRound', { a: '#feae34', b: '#d77643', c: '#be4a2f' });
  SPR.sapling = sprite('sapling', greens[1]);
  SPR.bush = sprite('bush', greens[0]);
  SPR.stump = sprite('stump');
  SPR.log = sprite('log');
  SPR.bench = sprite('bench');
  SPR.hut = sprite('hut');
  SPR.table = sprite('table');
  SPR.placards = ['#ffffff', '#fee761', '#2ce8f5', '#f6757a', '#63c74d'].map((c) => sprite('placard', { c, d: shade(c) }));
  SPR.bub = { honk: sprite('bubHonk'), note: sprite('bubNote'), talk: sprite('bubTalk'), ear: sprite('bubEar') };
  SPR.bird = [sprite('bird0'), sprite('bird1')];
  SPR.flag = sprite('flag');
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.7).toString(16).padStart(2, '0');
  return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}
