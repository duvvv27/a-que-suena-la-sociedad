// Lógica del juego: ESCUCHAR -> BUSCAR (frío/caliente) -> IDENTIFICAR -> RELACIONAR -> ARREGLO, x4 rondas.
import { Camera, LS_MAX } from '../render/camera.js';
import { Ground } from '../render/ground.js';
import { LIGHTS, blendLight } from '../render/light.js';
import { K, WT, HT, wrapDX, wrapX, tileVec, cellAt } from '../world/planet.js';
import { cityAt } from '../world/cities.js';
import { CitySim } from '../world/agents.js';
import { createScenes, angDist, FIX_DUR } from '../world/scenarios.js';
import { FX } from '../render/fx.js';
import { SPR } from '../render/sprites.js';
import { AudioEngine } from '../audio/engine.js';
import { Spectrogram } from '../audio/spectrogram.js';
import { Buttons } from '../ui/buttons.js';
import { Puzzle } from '../ui/puzzle.js';
import * as H from '../ui/hud.js';
import { ROUNDS, FINAL } from '../data/rounds.js';
import { clamp, smooth, mulberry32 } from '../core/rng.js';

const T_HINT1 = 15, T_HINT2 = 28, T_ASSIST = 45;
const MARK_LS = 0.9; // zoom mínimo para marcar (nivel ciudad)

export class Game {
  constructor(o) {
    Object.assign(this, o); // world, renderer, hud, ui, view, stage, seed
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cam = new Camera();
    this.cam.reduced = this.reduced;
    this.ground = new Ground(this.world);
    this.sim = new CitySim();
    this.fx = new FX();
    this.scenes = createScenes(this.world, this.sim, this.seed);
    this.audio = new AudioEngine();
    this.spec = new Spectrogram(128, 48);
    this.btn = new Buttons(this.ui, this.view);
    this.puzzle = new Puzzle(this);
    this.dt = 1 / 60;
    this.live = document.getElementById('live');
    this.light = LIGHTS.dawn;
    this.lightFrom = LIGHTS.dawn;
    this.lightTo = LIGHTS.dawn;
    this.lightT = 1;
    this.ground.cache.setLight(LIGHTS.dawn);
    this.time = 0;
    this.round = 0;
    this.score = 0;
    this.results = [];
    this.heat = 0;
    this.marks = [];
    this.toastMsg = null;
    this.ringT = 0;
    this.lastSay = '';
    this.perf = 1 / 60;
    this.audioReady = false;
    this.audioP = 0;
    this.audio.prepare(['trafico', 'obras', 'marcha', 'tala', 'sanado', 'orbita'], (p) => { this.audioP = p; })
      .then(() => { this.audioReady = true; });
    const s0 = this.scenes[0];
    this.cam.cx = wrapX(s0.x + WT * 0.33);
    this.cam.cy = HT * 0.44;
    this.cam.autoSpin = 16;
    this.layers = [
      this.sim,
      { draw: (v) => { for (const sc of this.scenes) if (this.ground.inView(v, sc.x, sc.y, 40)) sc.draw(v); } },
      this.fx,
      { draw: (v) => this.drawMarks(v) },
    ];
    this.enter('title');
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.cam.resize(W, H);
    this.ground.resize(W, H);
  }

  say(msg) {
    if (!msg || msg === this.lastSay) return;
    this.lastSay = msg;
    this.live.textContent = msg;
  }
  toast(msg, dur = 2.2, col = '#ffffff') {
    this.toastMsg = { msg, t: dur, col };
    this.say(msg);
  }
  get R() { return ROUNDS[this.round]; }
  get S() { return this.scenes[this.round]; }
  bindInput(input) {
    this.input = input;
    const free = () => ['search', 'title', 'explore'].includes(this.state);
    const board = () => this.state === 'identify' || this.state === 'relate';
    input.on('press', (x, y) => { this.cam.stop(); this.cam.autoSpin = 0; if (board()) this.puzzle.press(x, y); });
    input.on('drag', (x0, y0, x1, y1, dt) => {
      if (board()) this.puzzle.move(x1, y1);
      else if (free()) this.cam.drag(x0, y0, x1, y1, dt);
    });
    input.on('release', (fling) => { if (board()) this.puzzle.release(); if (!fling) this.cam.stop(); this.cam.release(); });
    input.on('zoom', (d, x, y) => { if (free()) this.cam.zoomBy(d, x, y); });
    input.on('tap', (x, y) => this.tap(x, y));
    input.on('double', (x, y) => { if (free() && this.cam.ls < MARK_LS) this.cam.zoomBy(1, x, y); });
    input.on('key', (k) => this.key(k));
  }
  tap(x, y) {
    if (this.state === 'identify' || this.state === 'relate') this.puzzle.tap(x, y);
    else if (this.state === 'search') this.tryMark(x, y);
    else if (this.state === 'listen' && this.stateT > 1.5) this.enter('search');
  }
  key(k) {
    const st = this.state;
    if (k === 'm') { this.toggleSound(); return true; }
    if (k === 'f') { this.fullscreen(); return true; }
    if (['search', 'title', 'explore'].includes(st)) {
      if (k === '+' || k === '=' || k === 'e') { this.cam.zoomBy(1); return true; }
      if (k === '-' || k === 'q') { this.cam.zoomBy(-1); return true; }
    }
    if ((k === 'Enter' || k === ' ') && document.activeElement?.tagName !== 'BUTTON') {
      if (st === 'search') { this.tryMark(this.W / 2, this.H / 2); return true; }
      if (st === 'listen' && this.stateT > 1) { this.enter('search'); return true; }
      if (st === 'title') { this.start(); return true; }
    }
    if (/^[1-4]$/.test(k) && (st === 'identify' || st === 'relate')) {
      this.btn.click('opt' + (Number(k) - 1));
      return true;
    }
    return false;
  }
  toggleSound() {
    const m = this.audio.toggleMute();
    this.toast(m ? 'Sonido desactivado' : 'Sonido activado', 1.4);
  }
  fullscreen() {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen?.();
    else d.documentElement.requestFullscreen?.().catch(() => {});
  }
  enter(state) {
    this.state = state;
    this.stateT = 0;
    const R = this.R, S = this.S;
    switch (state) {
      case 'title':
        this.say('¿A qué suena la sociedad? Pulsa Comenzar.');
        break;
      case 'listen': {
        this.cam.autoSpin = 0;
        this.cam.flyTo(this.cam.cx, this.cam.cy, this.cam.lsMin, this.round ? 2.4 : 1.4, false);
        this.lightFrom = this.light;
        this.lightTo = LIGHTS[R.light];
        this.lightT = this.round ? 0 : 1;
        this.ground.cache.setLight(this.lightTo);
        this.audio.signal(R.sound, 1.2);
        this.audio.proximity(1, 0, true);
        this.audio.bed('orbita', 0.3);
        this.audio.blip('radio');
        this.hint = 0;
        this.misses = 0;
        this.assisted = false;
        this.marks = [];
        this.say(`Ronda ${this.round + 1} de 4. ${R.intro} Sonido: ${R.caption}`);
        break;
      }
      case 'search':
        this.searchT = 0;
        this.toast(this.round === 0 ? 'Sigue el sonido: se escucha más claro cuando estás cerca' : '¡A buscar! Sigue el sonido', 3);
        break;
      case 'found': {
        this.audio.blip('ok');
        this.marks = [{ x: S.x, y: S.y, ok: true, t: 0 }];
        this.cam.flyTo(S.x, S.y + this.panelShift(), 3, 1.3, false);
        const pts = Math.max(100, Math.round(600 - 12 * this.searchT)) - 40 * this.misses - (this.assisted ? 100 : 0);
        this.res = { search: Math.max(50, pts), time: this.searchT, sym: 0, con: 0 };
        this.score += this.res.search;
        this.toast(`¡Lo encontraste! +${this.res.search}`, 1.6, '#63c74d');
        this.audio.proximity(1, 0, true);
        break;
      }
      case 'identify':
        this.cards = this.makeCards(R.symptoms, R.symptomQ, 'IDENTIFICAR');
        this.puzzle.drag = null;
        this.say(`${R.symptomQ} Opciones: ${this.cards.opts.map((o, i) => `${i + 1}, ${o.t}`).join('. ')}`);
        break;
      case 'relate':
        this.cards = this.makeCards(R.concepts, R.conceptQ, 'RELACIONAR');
        this.puzzle.drag = null;
        this.say(`${R.conceptQ} Opciones: ${this.cards.opts.map((o, i) => `${i + 1}, ${o.t}`).join('. ')}`);
        break;
      case 'fix': {
        S.startFix();
        this.audio.proximity(0.35, 0);
        this.lightFrom = this.light;
        this.lightTo = LIGHTS[this.round < 3 ? ROUNDS[this.round + 1].light : 'dusk'];
        this.lightT = 0;
        this.results.push(this.res);
        this.say(R.fix + ' ' + R.next);
        break;
      }
      case 'final': {
        this.audio.signal(null, 2);
        this.audio.bed('sanado', 0.75, 3);
        this.cam.flyTo(this.cam.cx, this.cam.cy, this.cam.lsMin, 3, false);
        this.lightFrom = this.light;
        this.lightTo = LIGHTS.dusk;
        this.lightT = 0;
        this.say(`${FINAL.title} Puntaje final: ${this.score}. ${this.rank()}.`);
        break;
      }
      case 'explore':
        this.say('Explora libremente el planeta.');
        break;
    }
  }
  start() {
    if (!this.audioReady) return;
    this.audio.start();
    this.audio.blip('click');
    this.t0 = this.time;
    this.round = 0;
    this.enter('listen');
  }
  panelShift() {
    return (this.H * 0.3) / 8;
  }
  makeCards(options, q, tag) {
    const rng = mulberry32(this.seed + this.round * 13 + tag.length);
    const opts = options.map((o) => ({ ...o }));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return { q, tag, opts, wrong: new Set(), ok: -1, tries: 0, doneT: 0 };
  }
  pick(i) {
    const c = this.cards;
    if (c.ok >= 0 || c.wrong.has(i)) return;
    c.tries++;
    if (c.opts[i].ok) {
      c.ok = i;
      const pts = c.tries === 1 ? 200 : c.tries === 2 ? 80 : 20;
      this.score += pts;
      if (this.state === 'identify') this.res.sym = c.tries; else this.res.con = c.tries;
      this.audio.blip('ok');
      const why = this.state === 'identify' ? this.R.symptomWhy : this.R.conceptWhy;
      this.say(`Correcto: ${c.opts[i].t}. +${pts} puntos. ${why}`);
      this.cardPts = pts;
    } else {
      c.wrong.add(i);
      this.audio.blip('bad');
      this.say(`${c.opts[i].t}: no es esa. Intenta otra opción.`);
    }
  }
  rank() {
    const s = this.score;
    return s >= 3300 ? 'Oído sociológico experto' : s >= 2500 ? 'Supervisor/a atento/a' : s >= 1600 ? 'Escucha en formación' : 'Aprendiz del ruido';
  }

  tryMark(x, y) {
    const cam = this.cam;
    if (cam.flying) return;
    if (cam.ls < MARK_LS - 0.05) {
      cam.zoomBy(1, x, y);
      if (!this.zoomTipShown) { this.toast('Acércate a nivel CIUDAD o CALLE para marcar', 2); this.zoomTipShown = true; }
      return;
    }
    const t = cam.screenToTile(x, y);
    if (!t) return;
    const S = this.S;
    const d = Math.hypot(wrapDX(t[0] - S.x), t[1] - S.y);
    if (d <= S.r) this.enter('found');
    else {
      this.misses++;
      this.audio.blip('bad');
      this.marks.push({ x: t[0], y: t[1], ok: false, t: 0 });
      this.fx.ring(t[0], t[1], 0.5, 4, 0.8, '#e43b44');
      this.toast(`Aquí no suena… estás ${H.heatWord(this.heat).toLowerCase().replace(/[¡!]/g, '')}`, 1.8, '#f6757a');
    }
  }
  frame(dt) {
    this.time += dt;
    this.dt = dt;
    this.stateT += dt;
    this.perf = this.perf * 0.95 + dt * 0.05;
    this.fx.density = this.perf > 1 / 40 ? 0.45 : 1;
    if (this.toastMsg) { this.toastMsg.t -= dt; if (this.toastMsg.t <= 0) this.toastMsg = null; }
    this.updateState(dt);
    if (['search', 'title', 'explore'].includes(this.state) && this.input) {
      const [ax, ay] = this.input.axis();
      if (ax || ay) {
        const [tx, ty] = this.cam.tilesPerPx();
        this.cam.autoSpin = 0;
        this.cam.pan(ax * 170 * dt * tx, ay * 170 * dt * ty);
        this.cam.flight = null;
      }
    }
    this.cam.update(dt);
    if (this.lightT < 1) {
      this.lightT = Math.min(1, this.lightT + dt / (this.state === 'final' ? 3 : FIX_DUR));
      this.light = blendLight(this.lightFrom, this.lightTo, this.lightT);
    } else this.light = this.lightTo;
    this.updateWorld(dt);
    this.render();
    this.drawHUD();
  }

  updateState(dt) {
    const st = this.state, S = this.S;
    if (st === 'listen') {
      if (this.stateT > 7.5) this.enter('search');
    } else if (st === 'search') {
      this.searchT += dt;
      const hv = S ? tileVec(S.x, S.y) : null;
      const th = angDist(this.cam.centerVec(), hv);
      const c = 1 - clamp(Math.log(Math.max(th, 0.0025) / 0.0025) / Math.log(2.2 / 0.0025), 0, 1);
      this.heat += (c - this.heat) * Math.min(1, dt * 4);
      const dx = wrapDX(S.x - this.cam.cx), dy = S.y - this.cam.cy;
      const pan = clamp(dx / (Math.abs(dx) + Math.abs(dy) + 1e-6), -1, 1) * 0.85 * (1 - this.heat ** 3);
      this.audio.proximity(this.heat, th > Math.PI / 2 ? 0 : pan);
      const w = H.heatWord(this.heat);
      if (w !== this.lastWord) { this.lastWord = w; if (this.stateT > 1) this.say(w); }
      if (this.searchT > T_HINT1 && this.hint < 1) { this.hint = 1; this.toast('Pista: la señal viene de la zona marcada en el planeta', 2.6, '#feae34'); }
      if (this.searchT > T_HINT2 && this.hint < 2) { this.hint = 2; this.toast('Pista: sigue la flecha', 2, '#feae34'); }
      if (this.searchT > T_ASSIST && !this.assisted) {
        this.assisted = true;
        this.cam.flyTo(wrapX(S.x + 18), S.y - 10, 1, 2.2, true);
        this.toast('El planeta te acerca a la señal… ¡márcala!', 3, '#feae34');
      }
    } else if (st === 'found') {
      if (this.stateT > 1.7) this.enter('identify');
    } else if (st === 'identify' || st === 'relate') {
      const c = this.cards;
      if (c.ok >= 0) {
        c.doneT += dt;
        if (st === 'identify' && c.doneT > 3) this.enter('relate');
      }
    } else if (st === 'fix') {
      if (this.stateT > 1.2 && this.audio.curId) { this.audio.signal(null, 2.5); this.audio.bed('sanado', 0.55, 2); }
      if (this.stateT > 14) this.nextRound();
    }
    for (const m of this.marks) m.t += dt;
  }
  nextRound() {
    if (this.round < 3) {
      this.round++;
      this.enter('listen');
    } else this.enter('final');
  }

  updateWorld(dt) {
    const cam = this.cam;
    if (cam.ls >= -0.1) {
      const c = cityAt(this.world.cities, cam.cx, cam.cy, 30);
      if (c !== this.sim.city) this.sim.setCity(c, this.seed);
      if (c) this.sim.update(dt);
    }
    for (const sc of this.scenes) sc.update(dt, this.fx);
    this.fx.update(dt);
    const S = this.S;
    if (S && (this.state === 'search' || this.state === 'listen') && S.state === 'problem') {
      this.ringT -= dt;
      if (this.ringT < 0) {
        const lv = this.audio.level();
        this.ringT = 0.5;
        this.ringAlt = !this.ringAlt;
        this.fx.ring(S.x, S.y, 1.5, 6 + 9 * Math.min(1, lv * 1.5 + 0.3), 1.6, this.ringAlt ? '#fee761' : '#f77622');
      }
    }
  }

  drawMarks(v) {
    for (const m of this.marks) {
      if (m.ok) {
        if (v.sb >= 2) {
          const im = SPR.flag.img(v.sb);
          const bob = Math.min(1, m.t * 3);
          v.ctx.drawImage(im, Math.round(v.X(m.x)), Math.round(v.Y(m.y) - im.height * bob));
        }
      } else if (m.t < 1.6) {
        const x = Math.round(v.X(m.x)), y = Math.round(v.Y(m.y));
        v.ctx.fillStyle = '#e43b44';
        for (let k = -3; k <= 3; k++) { v.ctx.fillRect(x + k, y + k, 1, 1); v.ctx.fillRect(x + k, y - k, 1, 1); }
      }
    }
  }

  render() {
    const cam = this.cam;
    const ga = smooth(-1.35, -0.65, cam.ls);
    let gr = [0, 0, 1, 1];
    if (ga > 0) {
      this.ground.render(cam, this.layers, this.perf > 1 / 45 ? 3 : 7);
      this.renderer.uploadGround(this.ground.cv);
      gr = this.ground.rect;
    }
    const L = this.light;
    const S = this.S;
    const hv = S ? tileVec(S.x, S.y) : [0, 1, 0];
    const showHint = this.state === 'search' && this.hint >= 1;
    this.renderer.draw({
      f: cam.f, D: cam.D, K, m: cam.m, s: cam.s, time: this.time, ga,
      ca: 1 - smooth(-2.3, -1.3, cam.ls),
      rot: cam.rot, cx: cam.cx, cy: cam.cy, WT, HT, gr,
      sun: L.sun, tint: L.tint, lift: L.lift, atm: L.atm, space: L.space,
      hot: [hv[0], hv[1], hv[2], 0.09], hotFx: [showHint ? 1 : 0, showHint ? 0.7 : 0, 0],
      heat: [this.heat, this.state === 'search' ? 0.5 : 0],
    });
  }
  drawHUD() {
    const ctx = this.hud, W = this.W, H_ = this.H;
    ctx.clearRect(0, 0, W, H_);
    const st = this.state;
    this.spec.update(this.audio, 1 / 60, st === 'search' ? 0.8 + this.heat * 0.6 : 1.2);
    const buttons = [];
    if (st === 'title') this.hudTitle(ctx, buttons);
    else if (st === 'final') this.hudFinal(ctx, buttons);
    else {
      this.hudCommon(ctx, buttons);
      if (st === 'listen') this.hudListen(ctx, buttons);
      if (st === 'identify' || st === 'relate') this.puzzle.draw(ctx, buttons, this.dt, this.time);
      else this.stage.style.cursor = '';
      if (st === 'fix') this.hudFix(ctx, buttons);
    }
    if (this.toastMsg && st !== 'title') {
      const m = this.toastMsg;
      const lines = H.wrap(m.msg, Math.min(W - 30, 300));
      const w = Math.max(...lines.map((l) => H.measure(l))) + 14, h = lines.length * 11 + 8;
      const y = st === 'search' || st === 'explore' ? Math.round(H_ * 0.2) + 14 : 34;
      ctx.globalAlpha = Math.min(1, m.t * 3);
      H.panel(ctx, (W - w) / 2, y, w, h, { border: m.col });
      lines.forEach((l, i) => H.text(ctx, l, W / 2, y + 5 + i * 11, m.col, 1, 'center'));
      ctx.globalAlpha = 1;
    }
    for (const b of buttons) b.draw ? b.draw(this.btn.state(b.id)) : H.button(ctx, b, this.btn.state(b.id), b.opt || {});
    this.btn.set(buttons);
  }

  hudTitle(ctx, buttons) {
    const W = this.W, H_ = this.H;
    const big = W >= 400 && H_ >= 240 ? 3 : 2;
    const ty = Math.round(H_ * 0.07);
    H.text(ctx, '¿A QUÉ SUENA', W / 2, ty, '#fee761', big, 'center', '#3e2731');
    H.text(ctx, 'LA SOCIEDAD?', W / 2, ty + 11 * big, '#fee761', big, 'center', '#3e2731');
    H.text(ctx, 'Un juego de escucha social', W / 2, ty + 22 * big + 4, '#c0cbdc', 1, 'center');
    const pw = Math.min(W - 16, 320);
    const px = Math.round((W - pw) / 2);
    // opciones: se reparten en filas según el ancho real de su texto
    const opts = H.rowLayout([
      { id: 'snd', label: this.audio.muted ? 'SONIDO: NO' : 'SONIDO: SÍ', aria: 'Activar o desactivar el sonido', onClick: () => this.toggleSound() },
      { id: 'mov', label: this.reduced ? 'ANIMACIÓN: SUAVE' : 'ANIMACIÓN: NORMAL', aria: 'Cambiar a animación reducida o normal', onClick: () => { this.reduced = !this.reduced; this.cam.reduced = this.reduced; } },
      { id: 'fs', label: 'PANTALLA COMPLETA', onClick: () => this.fullscreen() },
    ], px + 8, 0, pw - 16, 15);
    const ph = 72 + opts.height + 8;
    const py = H_ - ph - 8;
    H.panel(ctx, px, py, pw, ph);
    const steps = [['1', 'ESCUCHA', '#2ce8f5'], ['2', 'ENCUENTRA', '#feae34'], ['3', 'RELACIONA', '#63c74d']];
    const sw = (pw - 12) / 3;
    steps.forEach(([n, s, c], i) => {
      const cx = px + 6 + sw * i + sw / 2;
      H.text(ctx, n, cx, py + 6, c, 2, 'center');
      H.text(ctx, s, cx, py + 22, '#ead4aa', 1, 'center');
    });
    H.text(ctx, 'Recomendado: audífonos', W / 2, py + 35, '#8b9bb4', 1, 'center', null);
    const ready = this.audioReady;
    const label = ready ? 'COMENZAR ▶' : `PREPARANDO SONIDOS ${Math.round(this.audioP * 100)}%`;
    const bw = Math.min(pw - 16, Math.max(120, H.measure(label) + 24));
    buttons.push({
      id: 'start', label, aria: 'Comenzar el juego', x: Math.round((W - bw) / 2), y: py + 48, w: bw, h: 18, disabled: !ready,
      onClick: () => this.start(),
    });
    for (const b of opts.buttons) buttons.push({ ...b, y: b.y + py + 72 });
  }

  hudCommon(ctx, buttons) {
    const W = this.W, H_ = this.H, t = this.time, st = this.state;
    const R = this.R;
    const tw = Math.min(170, Math.floor(W * 0.55));
    H.panel(ctx, 4, 4, tw, 24, { accent: '#feae34' });
    H.text(ctx, `RONDA ${this.round + 1}/4 · ${this.light.time}`, 10, 7, '#fee761', 1, 'left', null);
    const phase = { listen: 'ESCUCHANDO', search: 'BUSCANDO', found: '¡ENCONTRADO!', identify: 'IDENTIFICAR', relate: 'RELACIONAR', fix: 'TRANSFORMANDO', explore: 'EXPLORANDO' }[st] || '';
    const sec = st === 'search' ? Math.floor(this.searchT) : null;
    H.text(ctx, phase + (sec !== null ? ` ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : ''), 10, 17, '#c0cbdc', 1, 'left', null);
    const sw = 64;
    H.panel(ctx, W - sw - 4, 4, sw, 24);
    H.text(ctx, 'PUNTAJE', W - sw / 2 - 4, 7, '#8b9bb4', 1, 'center', null);
    H.text(ctx, String(this.score), W - sw / 2 - 4, 17, '#ffffff', 1, 'center', null);
    if (st === 'explore') {
      buttons.push({ id: 'back', label: 'VOLVER AL RESUMEN', x: Math.round(W / 2 - 60), y: H_ - 22, w: 120, h: 16, onClick: () => this.enter('final') });
      this.zoomButtons(buttons);
      return;
    }
    if (st !== 'search') return;
    H.text(ctx, this.placeName(), W / 2, 32, '#ead4aa', 1, 'center');
    const spw = Math.min(124, Math.floor(W * 0.34));
    H.spectroPanel(ctx, this.spec, 4, H_ - 50, spw, 46, 'SEÑAL', t);
    const thw = Math.min(112, Math.floor(W * 0.32));
    H.thermo(ctx, W - thw - 4, H_ - 34, thw, this.heat, t);
    const capW = W - spw - thw - 20;
    const wide = capW > 110;
    const capLines = H.wrap(R.caption, wide ? capW : W - 16).length;
    if (wide) H.paragraph(ctx, R.caption, spw + 10, H_ - 6 - capLines * 11, capW, '#c0cbdc', 1, 'center');
    else H.paragraph(ctx, R.caption, 8, H_ - 56 - capLines * 11, W - 16, '#c0cbdc', 1, 'center');
    H.ladder(ctx, W - 10, Math.round(H_ / 2 - 35), this.cam.ls, this.cam.lsMin, LS_MAX);
    this.zoomButtons(buttons);
    const canMark = this.cam.ls >= MARK_LS - 0.05;
    H.reticle(ctx, W / 2, H_ / 2, t, canMark ? '#fee761' : '#ffffff');
    const m = this.input && this.input.mouse;
    if (canMark && m) H.text(ctx, 'MARCAR', m[0] + 6, m[1] + 6, '#fee761', 1);
    if (!canMark && this.searchT < 10 && this.round === 0) H.text(ctx, 'Arrastra para girar · rueda o +/- para acercar', W / 2, H_ / 2 + 14, '#ffffff', 1, 'center');
    if (this.hint >= 2) {
      const S = this.S;
      const dx = wrapDX(S.x - this.cam.cx), dy = S.y - this.cam.cy;
      const [tx, ty] = this.cam.tilesPerPx();
      const sx = dx / tx, sy = dy / ty;
      if (Math.abs(sx) > W * 0.35 || Math.abs(sy) > H_ * 0.35) {
        const a = Math.atan2(sy, sx);
        const rx = W * 0.36, ry = H_ * 0.3;
        H.arrow(ctx, W / 2 + Math.cos(a) * rx, H_ / 2 + Math.sin(a) * ry, a, '#feae34', t);
      }
    }
  }
  zoomButtons(buttons) {
    const W = this.W, H_ = this.H;
    buttons.push({ id: 'zin', label: '+', aria: 'Acercar', x: W - 18, y: Math.round(H_ / 2 - 54), w: 14, h: 14, onClick: () => this.cam.zoomBy(1) });
    buttons.push({ id: 'zout', label: '-', aria: 'Alejar', x: W - 18, y: Math.round(H_ / 2 + 40), w: 14, h: 14, onClick: () => this.cam.zoomBy(-1) });
  }
  placeName() {
    const cam = this.cam;
    const pl = this.world.planet;
    const id = cellAt(cam.cx, cam.cy);
    const vil = this.world.village;
    if (vil && cam.ls > -1.2 && Math.hypot(wrapDX(cam.cx - vil.x), cam.cy - vil.y) < 40) return vil.name;
    const c = cityAt(this.world.cities, cam.cx, cam.cy, 8);
    const co = pl.country[id] ? pl.countries[pl.country[id] - 1] : null;
    if (c && cam.ls > -1.5) return (co ? co.name + ' · ' : '') + c.name;
    if (!pl.land[id]) return 'Océano';
    return co ? co.name : 'Tierras heladas';
  }

  hudListen(ctx) {
    const W = this.W, H_ = this.H, t = this.time, R = this.R;
    const pw = Math.min(W - 16, 300);
    const px = Math.round((W - pw) / 2);
    const lines = H.wrap(R.intro, pw - 16);
    const cap = H.wrap(R.caption, pw - 16);
    const sh = Math.max(40, Math.min(64, H_ - 150));
    const ph = 22 + lines.length * 11 + sh + 8 + cap.length * 11 + 22;
    const py = Math.round((H_ - ph) / 2);
    H.panel(ctx, px, py, pw, ph, { accent: '#e43b44' });
    if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#e43b44'; ctx.fillRect(px + 9, py + 7, 4, 4); }
    H.text(ctx, `TRANSMISIÓN ENTRANTE · RONDA ${this.round + 1}/4`, px + 17, py + 6, '#fee761', 1, 'left', null);
    let y = py + 20;
    lines.forEach((l) => { H.text(ctx, l, px + 8, y, '#ffffff', 1, 'left', null); y += 11; });
    ctx.drawImage(this.spec.cv, px + 8, y + 2, pw - 16, sh);
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(px + 8, y + 2 + sh, pw - 16, 1);
    y += sh + 8;
    cap.forEach((l) => { H.text(ctx, l, px + pw / 2, y, '#c0cbdc', 1, 'center', null); y += 11; });
    const prog = Math.min(1, this.stateT / 7.5);
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(px + 8, py + ph - 6, pw - 16, 2);
    ctx.fillStyle = '#feae34';
    ctx.fillRect(px + 8, py + ph - 6, Math.round((pw - 16) * prog), 2);
    if (this.stateT > 1.5) H.text(ctx, 'Toca o pulsa Enter para buscar', px + pw / 2, py + ph - 18, '#8b9bb4', 1, 'center', null);
  }

  hudFix(ctx, buttons) {
    const W = this.W, H_ = this.H, R = this.R, t = this.stateT;
    const pw = Math.min(W - 12, 330);
    const px = Math.round((W - pw) / 2);
    const fl = H.wrap(R.fix, pw - 16);
    const nl = R.next && t > 2.6 ? H.wrap(R.next, pw - 16) : [];
    const ph = 20 + fl.length * 11 + (nl.length ? nl.length * 11 + 8 : 0) + (t > 3 ? 22 : 0);
    const py = H_ - ph - 6;
    H.panel(ctx, px, py, pw, ph, { accent: '#63c74d' });
    H.text(ctx, 'LA SIMULACIÓN SE TRANSFORMA', px + 8, py + 5, '#63c74d', 1, 'left', null);
    let y = py + 18;
    fl.forEach((l) => { H.text(ctx, l, px + 8, y, '#ffffff', 1, 'left', null); y += 11; });
    if (nl.length) {
      y += 4;
      nl.forEach((l) => { H.text(ctx, l, px + 8, y, '#feae34', 1, 'left', null); y += 11; });
    }
    if (t > 3) {
      const last = this.round === 3;
      buttons.push({ id: 'next', label: last ? 'VER RESULTADO ▶' : 'SIGUIENTE SONIDO ▶', x: px + pw - 128, y: y + 2, w: 120, h: 16, onClick: () => this.nextRound() });
      if (!this.focusedNext) { this.focusedNext = true; setTimeout(() => this.btn.map.get('next')?.focus({ preventScroll: true }), 50); }
    } else this.focusedNext = false;
  }

  hudFinal(ctx, buttons) {
    const W = this.W, H_ = this.H;
    const pw = Math.min(W - 12, 360);
    const px = Math.round((W - pw) / 2);
    const tl = H.wrap(FINAL.text, pw - 16);
    const rows = ROUNDS.length;
    const ph = 20 + tl.length * 11 + 6 + rows * 22 + 26 + 24;
    const py = Math.max(4, Math.round((H_ - ph) / 2));
    const a = Math.min(1, this.stateT / 1.5);
    ctx.globalAlpha = a;
    H.panel(ctx, px, py, pw, ph, { accent: '#fee761' });
    H.text(ctx, FINAL.title.toUpperCase(), px + pw / 2, py + 6, '#fee761', 1, 'center', null);
    let y = py + 20;
    tl.forEach((l) => { H.text(ctx, l, px + 8, y, '#ead4aa', 1, 'left', null); y += 11; });
    y += 4;
    ROUNDS.forEach((r, i) => {
      const res = this.results[i] || {};
      const perfect = res.sym === 1 && res.con === 1;
      H.text(ctx, H.fitLines(`♪ ${r.stimulus}`, pw - 24, 1)[0], px + 8, y, '#2ce8f5', 1, 'left', null);
      H.text(ctx, perfect ? '✓' : '·', px + pw - 12, y, perfect ? '#63c74d' : '#feae34', 1, 'left', null);
      const s2 = r.symptoms.find((o) => o.ok).t, c2 = r.concepts.find((o) => o.ok).t;
      // misma cadena de colores que el rompecabezas: síntoma (naranjo) → diagnóstico (verde)
      if (H.measure(`→ ${s2} → ${c2}`) <= pw - 24) {
        H.text(ctx, `→ ${s2}`, px + 14, y + 10, '#feae34', 1, 'left', null);
        H.text(ctx, `→ ${c2}`, px + 14 + H.measure(`→ ${s2} `), y + 10, '#63c74d', 1, 'left', null);
      } else H.text(ctx, H.fitLines(`→ ${c2}`, pw - 24, 1)[0], px + 14, y + 10, '#63c74d', 1, 'left', null);
      y += 22;
    });
    const mins = Math.floor((this.finalTime ??= this.time - (this.t0 || 0)) / 60);
    const secs = Math.floor(this.finalTime % 60);
    H.text(ctx, `PUNTAJE ${this.score} · ${mins}:${String(secs).padStart(2, '0')} min`, px + 8, y + 2, '#ffffff', 1, 'left', null);
    H.text(ctx, this.rank().toUpperCase(), px + 8, y + 13, '#feae34', 1, 'left', null);
    ctx.globalAlpha = 1;
    const bw = Math.floor((pw - 24) / 2);
    buttons.push({ id: 'again', label: 'JUGAR OTRA VEZ', x: px + 8, y: py + ph - 22, w: bw, h: 16, onClick: () => window.location.reload() });
    buttons.push({ id: 'explore', label: 'EXPLORAR EL PLANETA', x: px + 16 + bw, y: py + ph - 22, w: bw, h: 16, onClick: () => this.enter('explore') });
  }
}
