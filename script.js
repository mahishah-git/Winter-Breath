// WINTERBREATH
// Two canvases: a snow canvas behind, and a fog canvas on top.
// Dragging "erases" the fog so the scene underneath shows through.

(() => {
  const windowEl = document.getElementById('window');
  const fogCanvas = document.getElementById('fog');
  const snowCanvas = document.getElementById('snow');
  const hint = document.getElementById('hint');
  const resetBtn = document.getElementById('resetBtn');

  const fog = fogCanvas.getContext('2d');
  const snow = snowCanvas.getContext('2d');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const REGROW_ALPHA = 0.008;     // how fast mist creeps back (0 = never)
  const REGROW_EVERY = 700;       // milliseconds

  let width = 0, height = 0, dpr = 1;
  let fogTexture = null;          // a fresh, fully fogged picture we can reuse

  /* ---------- 1. Making the fog ---------- */

  // Draws a full, untouched layer of condensation onto any canvas context.
  function paintFog(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#d5e0e8';
    ctx.fillRect(0, 0, w, h);

    // soft cloudy patches
    for (let i = 0; i < (w * h) / 900; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = 20 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() < 0.7;
      g.addColorStop(0, light ? 'rgba(255,255,255,0.10)' : 'rgba(170,190,205,0.08)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // tiny water droplets
    for (let i = 0; i < (w * h) / 450; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = 0.5 + Math.random() * 1.4;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,140,155,0.12)';
      ctx.beginPath(); ctx.arc(x, y + r * 0.7, r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function newFogTexture() {
    fogTexture = document.createElement('canvas');
    fogTexture.width = width * dpr;
    fogTexture.height = height * dpr;
    const t = fogTexture.getContext('2d');
    t.scale(dpr, dpr);
    paintFog(t, width, height);
  }

  function resetFog() {
    fog.save();
    fog.setTransform(1, 0, 0, 1, 0, 0);
    fog.globalCompositeOperation = 'source-over';
    fog.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    fog.drawImage(fogTexture, 0, 0);
    fog.restore();
  }

  /* ---------- 2. Sizing ---------- */

  function resize() {
    const rect = windowEl.getBoundingClientRect();
    const style = getComputedStyle(windowEl);
    const bw = parseFloat(style.borderLeftWidth) || 0;
    const w = Math.round(rect.width - bw * 2);
    const h = Math.round(rect.height - bw * 2);
    if (w === width && h === height) return;

    // keep what the person already drew when the window changes size
    let old = null;
    if (width && height) {
      old = document.createElement('canvas');
      old.width = fogCanvas.width;
      old.height = fogCanvas.height;
      old.getContext('2d').drawImage(fogCanvas, 0, 0);
    }

    width = w; height = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [fogCanvas, snowCanvas]) {
      c.width = width * dpr;
      c.height = height * dpr;
    }
    snow.setTransform(dpr, 0, 0, dpr, 0, 0);
    fog.setTransform(dpr, 0, 0, dpr, 0, 0);

    newFogTexture();
    resetFog();

    if (old) {
      // keep new fog only where the old fog still existed
      fog.save();
      fog.setTransform(1, 0, 0, 1, 0, 0);
      fog.globalCompositeOperation = 'destination-in';
      fog.drawImage(old, 0, 0, fogCanvas.width, fogCanvas.height);
      fog.restore();
    }
  }

  /* ---------- 3. Wiping with a finger ---------- */

  let drawing = false;
  let lastX = 0, lastY = 0;

  // A finger-sized radius that scales with the window
  function fingerRadius() {
    return Math.max(14, Math.min(26, width * 0.025));
  }

  // One "touch" of a fingertip on the glass
  function stamp(x, y, r) {
    const rim = r * 0.35;

    // 1) denser moisture gathers just outside the wiped edge (only where fog exists)
    fog.globalCompositeOperation = 'source-atop';
    let g = fog.createRadialGradient(x, y, r * 0.85, x, y, r + rim);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    fog.fillStyle = g;
    fog.beginPath(); fog.arc(x, y, r + rim, 0, Math.PI * 2); fog.fill();

    // 2) wipe the fog away with soft edges
    fog.globalCompositeOperation = 'destination-out';
    g = fog.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fog.fillStyle = g;
    fog.beginPath(); fog.arc(x, y, r, 0, Math.PI * 2); fog.fill();

    fog.globalCompositeOperation = 'source-over';
  }

  // Place stamps along the line so fast swipes stay smooth
  function wipeLine(x0, y0, x1, y1) {
    const r = fingerRadius();
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1.5, r * 0.25);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
    }
  }

  function position(e) {
    const rect = fogCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  fogCanvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    fogCanvas.setPointerCapture(e.pointerId);
    const p = position(e);
    lastX = p.x; lastY = p.y;
    stamp(p.x, p.y, fingerRadius());   // a single tap leaves a mark too
    hint.classList.add('gone');
  });

  fogCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    // use all the little in-between points when the browser provides them
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) {
      const p = position(ev);
      wipeLine(lastX, lastY, p.x, p.y);
      lastX = p.x; lastY = p.y;
    }
  });

  const stop = () => { drawing = false; };
  fogCanvas.addEventListener('pointerup', stop);
  fogCanvas.addEventListener('pointercancel', stop);

  /* ---------- 4. Mist slowly creeping back ---------- */

  if (REGROW_ALPHA > 0 && !reducedMotion) {
    setInterval(() => {
      if (drawing || !fogTexture || document.hidden) return;
      fog.save();
      fog.setTransform(1, 0, 0, 1, 0, 0);
      fog.globalCompositeOperation = 'source-over';
      fog.globalAlpha = REGROW_ALPHA;
      fog.drawImage(fogTexture, 0, 0);
      fog.restore();
    }, REGROW_EVERY);
  }

  /* ---------- 5. Gentle snow behind the glass ---------- */

  const flakes = [];
  function makeFlakes() {
    flakes.length = 0;
    const count = Math.round(Math.min(90, (width * height) / 9000));
    for (let i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.8 + Math.random() * 2,
        speed: 0.15 + Math.random() * 0.4,
        drift: Math.random() * Math.PI * 2
      });
    }
  }

  function drawSnow() {
    snow.clearRect(0, 0, width, height);
    snow.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of flakes) {
      f.y += f.speed;
      f.drift += 0.008;
      f.x += Math.sin(f.drift) * 0.25;
      if (f.y > height + 4) { f.y = -4; f.x = Math.random() * width; }
      snow.beginPath();
      snow.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      snow.fill();
    }
    requestAnimationFrame(drawSnow);
  }

  /* ---------- 6. Buttons & start-up ---------- */

  resetBtn.addEventListener('click', () => {
    resetFog();
    hint.classList.remove('gone');
  });

  new ResizeObserver(() => { resize(); makeFlakes(); }).observe(windowEl);
  resize();
  makeFlakes();
  if (reducedMotion) {
    drawSnow = () => {};      // no falling snow if the person prefers less motion
  }
  requestAnimationFrame(drawSnow);
})();