// Punto de entrada: tamaño de pantalla, arranque (generación del planeta) y bucle principal.
import { mulberry32, fbm3 } from './core/rng.js';
import { generatePlanet, buildTextures, CW, CH } from './world/planet.js';
import { placeCities } from './world/cities.js';
import { Renderer } from './render/gl.js';
import { buildSprites } from './render/sprites.js';
import { Input } from './core/input.js';
import { text } from './render/font.js';
import { Game } from './game/game.js';

const SEED = 20261026;
const stage = document.getElementById('stage');
const glc = document.getElementById('gl');
const hudc = document.getElementById('hud');
const hud = hudc.getContext('2d');
const ui = document.getElementById('ui');

const view = { W: 480, H: 270, css: 1 };
let renderer, game;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  const dev = Math.max(1, Math.round((Math.min(vw, vh) * dpr) / 270));
  let W = Math.floor((vw * dpr) / dev), H = Math.floor((vh * dpr) / dev);
  W = Math.max(64, Math.min(W, 760));
  H = Math.max(64, Math.min(H, 760));
  view.W = W;
  view.H = H;
  view.css = dev / dpr;
  stage.style.width = W * view.css + 'px';
  stage.style.height = H * view.css + 'px';
  hudc.width = W;
  hudc.height = H;
  hud.imageSmoothingEnabled = false;
  if (renderer) renderer.resize(W, H);
  if (game) game.resize(W, H);
}

function toInternal(cx, cy) {
  const r = stage.getBoundingClientRect();
  return [((cx - r.left) / r.width) * view.W, ((cy - r.top) / r.height) * view.H];
}

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent = msg;
}

function drawLoading(p, label) {
  const { W, H } = view;
  hud.fillStyle = '#181425';
  hud.fillRect(0, 0, W, H);
  text(hud, '¿A QUÉ SUENA LA SOCIEDAD?', W / 2, H / 2 - 30, '#fee761', 2, 'center');
  text(hud, label, W / 2, H / 2 + 4, '#c0cbdc', 1, 'center');
  const bw = Math.min(200, W - 40);
  hud.fillStyle = '#3a4466';
  hud.fillRect((W - bw) / 2, H / 2 + 18, bw, 6);
  hud.fillStyle = '#63c74d';
  hud.fillRect((W - bw) / 2 + 1, H / 2 + 19, Math.round((bw - 2) * p), 4);
}

// cede el control para pintar el progreso (setTimeout como respaldo si la pestaña está oculta)
const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  try {
    renderer = new Renderer(glc);
  } catch (e) {
    fatal('Tu navegador no tiene WebGL activado; el juego lo necesita para dibujar el planeta. Detalle: ' + e.message);
    return;
  }
  renderer.resize(view.W, view.H);
  drawLoading(0, 'Generando el planeta…');
  await frame();

  // el planeta se genera repartido en varios cuadros para mostrar el progreso
  const gen = generatePlanet(SEED);
  let res = gen.next();
  let t0 = performance.now();
  while (!res.done) {
    if (performance.now() - t0 > 40) {
      drawLoading(res.value * 0.8, 'Generando continentes, climas y países…');
      await frame();
      t0 = performance.now();
    }
    res = gen.next();
  }
  const planet = res.value;
  drawLoading(0.82, 'Fundando ciudades…');
  await frame();
  const { cities, roads } = placeCities(planet, SEED);
  const world = { planet, cities, roads, village: null, seed: SEED };

  drawLoading(0.9, 'Formando nubes…');
  await frame();
  const cw = 512, ch = 256, cl = new Uint8Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / ch) * Math.PI;
    for (let i = 0; i < cw; i++) {
      const lon = ((i + 0.5) / cw) * Math.PI * 2;
      const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      cl[j * cw + i] = Math.round(fbm3(x * 3 + 20, y * 3, z * 3, 5, SEED + 7) * 255);
    }
  }
  renderer.setTexture('uCld', cw, ch, cl, 'L');
  buildSprites(mulberry32(SEED ^ 0x5e1));

  game = new Game({ world, renderer, hud, ui, view, stage, seed: SEED });
  const tex = buildTextures(planet);
  renderer.setTexture('uTex', CW, CH, tex.color);
  renderer.setTexture('uDat', CW, CH, tex.data);
  game.resize(view.W, view.H);

  const input = new Input(stage, toInternal);
  game.bindInput(input);

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) game.frame(dt, now / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  fatal('Ocurrió un error al iniciar el juego: ' + e.message);
});

