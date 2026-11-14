(() => {
  'use strict';

  const PAIRS = [ // coppie di colori per i riquadri illuminati (dalla palette dei loghi)
    ['#2e94b4', '#5b4794'], ['#8b6cf0', '#c014b4'], ['#6bc1b0', '#2e94b4'], ['#c014b4', '#5b4794'],
    ['#5b4794', '#2e94b4'], ['#2e94b4', '#c014b4'], ['#8b6cf0', '#2e94b4'], ['#6bc1b0', '#8b6cf0'],
    ['#c014b4', '#8b6cf0'], ['#5b4794', '#c014b4'],
  ];
  const FX_COLORS = ['#ffffff', '#ffd25e', '#6bc1b0', '#2e94b4', '#8b6cf0', '#c014b4'];

  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const tiles = new Map();
  let current = null;
  let animating = false;
  let lastRevealAt = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- costruzione -----------------------------------------------------------
  function buildTiles(topics) {
    if (tiles.size) return;
    topics.forEach((t, i) => {
      const el = document.createElement('article');
      el.className = 'tile';
      el.style.setProperty('--i', i);
      el.style.setProperty('--c1', PAIRS[i % PAIRS.length][0]);
      el.style.setProperty('--c2', PAIRS[i % PAIRS.length][1]);
      el.innerHTML =
        `<div class="tile-num"><span>${String(i + 1).padStart(2, '0')}</span><span class="tile-badge"></span></div>` +
        `<div><div class="tile-label"></div><div class="tile-line"></div><div class="tile-meta"></div></div>`;
      el.querySelector('.tile-label').textContent = t.label;
      grid.appendChild(el);
      tiles.set(t.id, el);
    });
    fitLabels();
    if (document.fonts) document.fonts.ready.then(fitLabels);
  }

  function buildBulbs() {
    const host = $('bulbs');
    host.innerHTML = '';
    const r = host.getBoundingClientRect();
    const u = Math.min(innerWidth / 100, innerHeight * 1.78 / 100);
    const inset = u * 1.45; // al centro del canale tra bordo e pannello
    const w = r.width - inset * 2;
    const h = r.height - inset * 2;
    const step = u * 2.4;
    const pts = [];
    const nx = Math.round(w / step);
    const ny = Math.round(h / step);
    for (let i = 0; i < nx; i++) pts.push([inset + (w * i) / nx, inset]);
    for (let i = 0; i < ny; i++) pts.push([inset + w, inset + (h * i) / ny]);
    for (let i = 0; i < nx; i++) pts.push([inset + w - (w * i) / nx, inset + h]);
    for (let i = 0; i < ny; i++) pts.push([inset, inset + h - (h * i) / ny]);
    const cornerSkip = u * 5.2;
    const frag = document.createDocumentFragment();
    let k = 0;
    pts.forEach(([x, y]) => {
      const nearX = x < cornerSkip || x > r.width - cornerSkip;
      const nearY = y < cornerSkip || y > r.height - cornerSkip;
      if (nearX && nearY) return; // lascia spazio agli ornamenti angolari
      const b = document.createElement('i');
      b.className = 'bulb';
      b.style.left = x + 'px';
      b.style.top = y + 'px';
      b.style.setProperty('--i', k);
      b.style.setProperty('--c', FX_COLORS[(k % (FX_COLORS.length - 1)) + 1]);
      frag.appendChild(b);
      k++;
    });
    host.appendChild(frag);
  }

  // adatta la dimensione del testo: tutte le etichette con la stessa misura, nessuna parola tagliata
  function fitLabels() {
    const u = Math.min(innerWidth / 100, innerHeight * 1.78 / 100);
    const labels = [...grid.querySelectorAll('.tile-label')];
    if (!labels.length) return;
    let fs = u * 2.1;
    const fits = () => labels.every((l) => l.scrollWidth <= l.clientWidth + 1);
    grid.style.setProperty('--fs', fs + 'px');
    while (fs > u * 0.9 && !fits()) {
      fs -= u * 0.05;
      grid.style.setProperty('--fs', fs + 'px');
    }
  }

  // --- rendering -------------------------------------------------------------
  function setLit(el, info, order, total) {
    el.classList.add('lit');
    el.querySelector('.tile-badge').textContent = `Scelto · ${order}`;
    const pct = info.total ? Math.round((info.votes / info.total) * 100) : 0;
    el.querySelector('.tile-meta').textContent =
      `${info.votes} ${info.votes === 1 ? 'voto' : 'voti'} · ${pct}%${info.tie ? ' · spareggio' : ''}`;
  }

  function render(s) {
    buildTiles(s.topics);
    const hold = animating ? current && current.reveal && current.reveal.id : null;

    document.body.classList.remove('phase-idle', 'phase-voting', 'phase-revealing');
    document.body.classList.add('phase-' + (animating ? 'revealing' : s.phase));

    const chosenMap = new Map(s.chosen.map((c, i) => [c.id, { c, order: i + 1 }]));
    tiles.forEach((el, id) => {
      const hit = chosenMap.get(id);
      if (hit && id !== hold) setLit(el, hit.c, hit.order);
      else if (!hit) {
        el.classList.remove('lit');
        el.querySelector('.tile-badge').textContent = '';
        el.querySelector('.tile-meta').textContent = '';
      }
    });

    // stato
    const n = s.chosen.length;
    const all = s.topics.length;
    let text = 'In attesa del via';
    let hint = n ? 'Prossima votazione in arrivo' : 'La votazione si aprirà a breve';
    let count = '';
    if (s.phase === 'voting') {
      text = `Votazione ${s.round} aperta`;
      count = `${s.total} ${s.total === 1 ? 'voto' : 'voti'}`;
      hint = 'Inquadra il QR e scegli!';
    } else if (s.phase === 'revealing' || animating) {
      text = 'Ecco l\'argomento scelto…';
      hint = 'Votazione chiusa';
    } else if (n >= all) {
      text = 'Tutti gli argomenti scelti';
      hint = 'Grazie a tutti per aver votato!';
    } else if (n) {
      text = `Votazione ${s.round} conclusa`;
    }
    $('statusText').textContent = text;
    $('statusCount').textContent = count;
    $('qrHint').textContent = hint;
    $('progressText').textContent = `${n} / ${all}`;
    $('progressBar').style.width = `${(n / all) * 100}%`;
  }

  // --- animazione di rivelazione (~3,6 s) -----------------------------------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function playReveal(s) {
    const id = s.reveal.id;
    const target = tiles.get(id);
    if (!target) return;
    animating = true;
    render(s);
    target.classList.remove('lit'); // (in caso di "ripeti animazione")

    const chosenBefore = new Set(s.chosen.map((c) => c.id).filter((x) => x !== id));
    const pool = [...tiles.keys()].filter((k) => !chosenBefore.has(k));

    if (!reduced && pool.length > 1) {
      // 1) scansione: la luce salta tra gli argomenti rallentando fino al vincitore (~2 s)
      const steps = 16;
      const seq = [];
      let prev = null;
      for (let i = 0; i < steps - 1; i++) {
        let next;
        do { next = pool[Math.floor(Math.random() * pool.length)]; } while (next === prev || (i === steps - 2 && next === id));
        seq.push(next);
        prev = next;
      }
      seq.push(id);
      for (let i = 0; i < seq.length; i++) {
        tiles.forEach((el) => el.classList.remove('scan'));
        tiles.get(seq[i]).classList.add('scan');
        const p = i / (seq.length - 1);
        await wait(45 + 230 * p * p * p); // decelerazione cubica
      }
      await wait(120);
    }

    // 2) accensione: flash, onde d'urto, particelle, banner (~1,6 s)
    tiles.forEach((el) => el.classList.remove('scan'));
    target.classList.add('igniting');
    document.body.classList.add('reveal-focus');
    const flash = document.createElement('div');
    flash.className = 'flash';
    target.appendChild(flash);

    const info = s.chosen.find((c) => c.id === id);
    const order = s.chosen.findIndex((c) => c.id === id) + 1;
    setLit(target, info, order);

    const r = target.getBoundingClientRect();
    ['', 'late'].forEach((cls) => {
      const w = document.createElement('div');
      w.className = 'shockwave ' + cls;
      Object.assign(w.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.appendChild(w);
      setTimeout(() => w.remove(), 1500);
    });
    burst(r.left + r.width / 2, r.top + r.height / 2, r);

    $('wbEyebrow').textContent = `Argomento scelto · n. ${order}`;
    $('wbTitle').textContent = s.topics.find((t) => t.id === id).label;
    $('winnerBanner').classList.add('show');

    await wait(1700);
    document.body.classList.remove('reveal-focus');
    target.classList.remove('igniting');
    flash.remove();
    await wait(1400);
    $('winnerBanner').classList.remove('show');

    animating = false;
    if (current) render(current);
  }

  // --- particelle --------------------------------------------------------------
  const canvas = $('fx');
  const ctx = canvas.getContext('2d');
  let parts = [];
  let raf = 0;

  function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(cx, cy, rect) {
    if (reduced) return;
    const u = Math.min(innerWidth, innerHeight * 1.78) / 100;
    for (let i = 0; i < 170; i++) {
      // partono dal perimetro del riquadro
      const side = Math.random();
      let x = cx, y = cy;
      if (side < .5) { x = rect.left + Math.random() * rect.width; y = Math.random() < .5 ? rect.top : rect.bottom; }
      else { y = rect.top + Math.random() * rect.height; x = Math.random() < .5 ? rect.left : rect.right; }
      const ang = Math.atan2(y - cy, x - cx) + (Math.random() - .5) * .6;
      const sp = (0.35 + Math.random() * 1.1) * u * .9;
      parts.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - u * .25,
        life: 0,
        max: 55 + Math.random() * 45,
        size: (0.18 + Math.random() * .42) * u,
        color: FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)],
        spark: Math.random() < .45,
        rot: Math.random() * Math.PI,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const u = Math.min(innerWidth, innerHeight * 1.78) / 100;
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life++;
      p.vx *= .965;
      p.vy = p.vy * .965 + u * .018;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += .15;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.spark) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * .45;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  // --- socket ----------------------------------------------------------------
  const socket = io();
  socket.on('state', (s) => {
    const isNewReveal = s.phase === 'revealing' && s.reveal && s.reveal.at !== lastRevealAt;
    current = s;
    if (isNewReveal) {
      lastRevealAt = s.reveal.at;
      if (!animating) { playReveal(s); return; }
    }
    if (!animating) render(s);
  });

  fetch('/api/vote-url').then((r) => r.json()).then((d) => {
    $('qrUrl').textContent = d.url.replace(/^https?:\/\//, '');
  }).catch(() => {});

  // --- utilità di regia sul tabellone -----------------------------------------
  addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  addEventListener('dblclick', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  });
  let cursorTimer;
  addEventListener('mousemove', () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2500);
  });

  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { buildBulbs(); sizeCanvas(); fitLabels(); }, 150); });
  buildBulbs();
  sizeCanvas();
})();
