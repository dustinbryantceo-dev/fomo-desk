// galaxy.js - the Yobel gold galaxy backdrop (MEM-24). One fixed canvas behind the app: three layers of gold stardust at different depths
// plus a few soft nebula wisps (pre-rendered sprites). They drift slowly and react to scrolling (parallax + a little streaking) on iPhone and
// desktop, and to the mouse on desktop. Cheap on purpose: ~150 dots + 4 sprites per frame, 20 fps when idle, 60 fps while scrolling,
// no loop at all when the tab is hidden, the replay is open or prefers-reduced-motion is on (then one still frame).
// Local only. No network, no data. Swap the look by editing the constants below.
(() => {
  "use strict";
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  const low = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 4) <= 2;
  const cv = document.createElement("canvas"); cv.id = "yo-galaxy"; cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1;pointer-events:none";
  let g = null, W = 0, H = 0, dpr = 1, stars = [], wisps = [], glow = null, raf = 0, tmo = 0, last = 0, t = 0, sy = 0, tsy = 0, vel = 0, scrolledAt = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  const mod = (a, n) => ((a % n) + n) % n;
  const rnd = (() => { let s = 20261128; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();   // seeded: same sky every launch

  function sprite(w, h, rgb) {            // a soft, uneven gold cloud: several offset radial blobs
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    for (let i = 0; i < 6; i++) {
      const r = h * (0.26 + 0.22 * rnd()), cx = r + (w - 2 * r) * rnd(), cy = r + (h - 2 * r) * rnd(), gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(${rgb},${0.34 + 0.2 * rnd()})`); gr.addColorStop(0.5, `rgba(${rgb},0.10)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    }
    return c;
  }
  function build() {
    const n = Math.round(Math.min(220, Math.max(70, (W * H) / 9000)) * (low ? 0.55 : 1));
    stars = []; for (let i = 0; i < n; i++) { const z = 0.15 + 0.85 * rnd() ** 1.4; stars.push({ x: rnd(), y: rnd(), z, r: 0.8 + 2.0 * z * rnd() + 0.4, a: 0.4 + 0.6 * rnd(), ph: rnd() * 6.28, sp: 0.6 + 1.6 * rnd(), c: rnd() < 0.2 ? "255,236,190" : rnd() < 0.5 ? "245,199,107" : "226,170,80" }); }
    const sp = [sprite(360, 220, "245,190,95"), sprite(360, 220, "205,140,60"), sprite(360, 220, "255,215,140")];
    wisps = [[0.12, 0.10, 1.0, 0, -0.35, 0.10, 0.34], [0.80, 0.34, 1.2, 1, 0.5, 0.14, 0.30], [0.30, 0.66, 1.3, 2, -0.15, 0.08, 0.26], [0.86, 0.88, 0.9, 0, 0.7, 0.12, 0.28]]
      .map(([x, y, s, i, rot, z, a]) => ({ x, y, s, sp: sp[i], rot, z, a, ph: rnd() * 6.28 }));
    if (!glow) { glow = document.createElement("canvas"); glow.width = glow.height = 32; const x = glow.getContext("2d"), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,226,160,.9)"); gr.addColorStop(0.25, "rgba(245,199,107,.35)"); gr.addColorStop(1, "rgba(245,199,107,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); }
  }
  function size() {
    const w = innerWidth, h = innerHeight; if (g && w === W && Math.abs(h - H) < 120) return;
    W = w; H = h; dpr = Math.min(1.5, devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g = cv.getContext("2d"); build(); draw(0);
  }
  function draw(dt) {
    if (!g) return; t += dt; sy += (tsy - sy) * (dt ? 0.14 : 1); vel = dt ? (tsy - sy) : 0; mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    const Hv = H * 1.3, still = mq.matches, k = still ? 0 : 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    for (const w of wisps) {                                               // nebula wisps: slow drift, deepest parallax
      const cx = w.x * W + Math.sin(t * 0.03 + w.ph) * 46 * k + mx * 26 * w.z * 4, cy = mod(w.y * Hv - sy * w.z * k - t * 1.2 * k + my * 20 * w.z * 4, Hv) - (Hv - H) / 2;
      const sw = w.sp.width * w.s * (W < 700 ? 1.1 : 1.6), sh = w.sp.height * w.s * (W < 700 ? 1.1 : 1.6);
      g.save(); g.translate(cx, cy); g.rotate(w.rot + Math.sin(t * 0.02 + w.ph) * 0.08 * k); g.globalAlpha = w.a * (0.85 + 0.15 * Math.sin(t * 0.25 + w.ph)); g.drawImage(w.sp, -sw / 2, -sh / 2, sw, sh); g.restore();
    }
    const streak = Math.min(26, Math.abs(vel) * 1.4) * k;
    for (const s of stars) {                                               // stardust: near stars move more with scroll and mouse
      const x = mod(s.x * W + Math.sin(t * 0.05 * s.z + s.ph) * 14 * s.z * k + mx * 22 * s.z, W), y = mod(s.y * Hv - sy * s.z * 0.45 * k - t * 7 * s.z * k + my * 16 * s.z, Hv) - (Hv - H) / 2;
      if (y < -30 || y > H + 30) continue;
      const tw = still ? 1 : 0.65 + 0.35 * Math.sin(t * s.sp + s.ph); g.globalAlpha = Math.min(1, s.a * tw * (0.7 + s.z * 0.9));
      if (streak > 3 && s.z > 0.4) { g.strokeStyle = `rgba(${s.c},1)`; g.lineWidth = s.r * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - Math.sign(vel) * streak * s.z); g.stroke(); }
      if (s.r > 1.6) g.drawImage(glow, x - s.r * 4, y - s.r * 4, s.r * 8, s.r * 8);
      else { g.fillStyle = `rgb(${s.c})`; g.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r); }
    }
    g.globalAlpha = 1;
  }
  function loop(now) {
    raf = 0; if (document.hidden || mq.matches) return;
    if (document.body.classList.contains("rp-open")) { tmo = setTimeout(() => { tmo = 0; kick(); }, 600); return; }
    const scrolling = now - scrolledAt < 1300 || Math.abs(tsy - sy) > 0.5, gap = scrolling ? 14 : 50;
    if (now - last >= gap) { const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; draw(dt); }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !tmo && !document.hidden && !mq.matches) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; }
  function start() {
    document.body.prepend(cv); size();
    addEventListener("scroll", () => { tsy = document.scrollingElement ? document.scrollingElement.scrollTop : scrollY; scrolledAt = performance.now(); kick(); }, { passive: true });
    let rz = 0; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(size, 150); }); addEventListener("orientationchange", () => setTimeout(size, 300));
    addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { tmx = e.clientX / W - 0.5; tmy = e.clientY / H - 0.5; kick(); } }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else kick(); });
    mq.addEventListener && mq.addEventListener("change", () => { stop(); draw(0); kick(); });
    kick();
  }
  window.YoGalaxy = { stop, kick };
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);
})();
