// yobel.js - the Yobel theme layer (MEM-24): time-aware sky, tap ripples, pull-to-refresh, tab swipe, number count-ups,
// the shofar celebration burst (+ optional synth horn, OFF by default). Light: one canvas per burst, rAF only while it runs,
// nothing here touches data or trading. Everything respects prefers-reduced-motion.
const Yobel = (() => {
  "use strict";
  let B = {};                                                    // bridge from app.js: { refresh, go, tab, canSwipe, tabs }
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GOLD = ["#fff0c2", "#f5c76b", "#e2b649", "#ffd98a", "#ffffff"], VIOLET = ["#e2c38d", "#dbb470", "#eadfc8", "#d6a859", "#ffffff"], ROSE = ["#ff5c7a", "#ff8aa0", "#ffd0d8", "#dbb470"];
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.3 7.2 7.2 2.3-7.2 2.3L12 20.5l-2.3-7.2-7.2-2.3 7.2-2.3z" fill="currentColor"/><path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" opacity=".7"/></svg>';

  // ---------- sky: night purple; 05:00-08:00 Berlin the hero and the page warm to sunrise ----------
  const hourFmt = (() => { try { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return null; } })();
  function berlinHour() {
    if (!hourFmt) return new Date().getHours() + new Date().getMinutes() / 60;
    const p = hourFmt.formatToParts(new Date()); const h = +p.find((x) => x.type === "hour").value % 24, m = +p.find((x) => x.type === "minute").value;
    return h + m / 60;
  }
  // 0 until 04:30, ramps to 1 at 06:30, back to 0 at 08:30: the sky is clearly warm inside 05:00-08:00
  function dawnAmount(h = berlinHour()) { return h <= 4.5 || h >= 8.5 ? 0 : h < 6.5 ? (h - 4.5) / 2 : (8.5 - h) / 2; }
  let lastDawn = -1;
  function sky() {
    const d = dawnAmount(), q = Math.round(d * 50) / 50;
    if (q === lastDawn) return; lastDawn = q;
    const r = document.documentElement; r.style.setProperty("--dawn", q.toFixed(2)); r.dataset.sky = q > 0.25 ? "dawn" : "night";
  }
  const tagline = () => (dawnAmount() > 0.25 ? "sunrise on the money" : "late night grind");

  // ---------- count-ups: "$1,234.56" / "+$3.20 · +4.1%" glide to the new value instead of jumping ----------
  const NUM = /(-?\d[\d,]*\.?\d*)/g;
  function countText(el, text) {
    const old = el.textContent; cancelAnimationFrame(el._yo);
    if (reduce() || document.hidden || !old || old === text) { el.textContent = text; return; }
    const a = old.split(NUM), b = text.split(NUM);
    if (a.length !== b.length || a.length < 3 || a.some((s, i) => i % 2 === 0 && s !== b[i])) { el.textContent = text; return; }
    const from = [], to = [], dec = [];
    for (let i = 1; i < a.length; i += 2) { from.push(parseFloat(a[i].replace(/,/g, ""))); to.push(parseFloat(b[i].replace(/,/g, ""))); dec.push((b[i].split(".")[1] || "").length); }
    if (from.some(isNaN) || to.some(isNaN)) { el.textContent = text; return; }
    const t0 = performance.now(), D = 420, fmt = (v, d, tpl) => { const s = Math.abs(v).toFixed(d); const [i, f] = s.split("."); const withC = tpl.includes(",") ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : i; return (v < 0 ? "-" : "") + withC + (f ? "." + f : ""); };
    const step = (t) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); let out = a[0];
      for (let i = 0; i < to.length; i++) out += fmt(from[i] + (to[i] - from[i]) * e, dec[i], b[1 + i * 2]) + b[2 + i * 2];
      el.textContent = k < 1 ? out : text; if (k < 1) el._yo = requestAnimationFrame(step);
    };
    el._yo = requestAnimationFrame(step);
  }

  // ---------- tap ripple (one tiny element, removed when its animation ends) ----------
  const RIP = ".prow,.trow,.frow,.row,.btn,.guidecard,.sshome,.bchip,.xrow,.hstats div,.stats div,.wchip,.rpwc,.rptr";
  function ripple(e) {
    if (reduce() || e.button > 0) return; const el = e.target.closest && e.target.closest(RIP); if (!el || el.matches(".hstats div,.stats div")) return;
    const r = el.getBoundingClientRect(), s = document.createElement("i"); s.className = "yo-rip";
    s.style.left = e.clientX - r.left + "px"; s.style.top = e.clientY - r.top + "px"; el.appendChild(s);
    s.addEventListener("animationend", () => s.remove(), { once: true }); setTimeout(() => s.remove(), 900);
  }

  // ---------- pull to refresh: drag down from the top, release past the mark ----------
  let ptr = null;
  function ptrUI() {
    if (ptr) return ptr; ptr = document.createElement("div"); ptr.className = "yo-ptr"; ptr.setAttribute("aria-hidden", "true");
    ptr.innerHTML = STAR + "<span>Pull to refresh</span>"; document.body.appendChild(ptr); return ptr;
  }
  const blocked = (t) => !!(t.closest && t.closest("#rpv,#sheet:not([hidden]),#full:not([hidden]),.sheet,.full,textarea,input,canvas,.plist,.carousel,.gbar,iframe"));
  function initGestures() {
    let sx = 0, sy = 0, st = 0, mode = null, pull = 0, busy = false;
    document.addEventListener("pointerdown", ripple, { passive: true });
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { mode = null; return; }
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); mode = "?"; pull = 0;
      if (blocked(e.target) || document.body.classList.contains("rp-open")) mode = "x";
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!mode || mode === "x") return; const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (mode === "?") {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) mode = dy > 0 && (document.scrollingElement.scrollTop <= 0) && !busy ? "ptr" : "x";
        else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) mode = sx > 24 && sx < innerWidth - 12 ? "swipe" : "x";
        else return;
      }
      if (mode === "ptr") {
        pull = Math.max(0, Math.min(90, dy * 0.5)); const u = ptrUI(); u.style.transition = "none";
        u.style.opacity = Math.min(1, pull / 40); u.style.transform = `translate(-50%,${pull - 70}px)`; u.querySelector("svg").style.transform = `rotate(${pull * 4}deg)`;
        u.querySelector("span").textContent = pull >= 56 ? "Release to refresh" : "Pull to refresh";
      }
    }, { passive: true });
    const end = async (e) => {
      const m = mode; mode = null; if (m === "ptr") {
        const u = ptrUI(); u.style.transition = "transform .25s var(--ease),opacity .25s";
        if (pull >= 56 && B.refresh && !busy) {
          busy = true; u.classList.add("spin"); u.querySelector("span").textContent = "Refreshing…"; u.style.opacity = 1; u.style.transform = "translate(-50%,10px)";
          try { await Promise.race([B.refresh(), new Promise((r) => setTimeout(r, 6000))]); } catch {}
          u.querySelector("span").textContent = "Updated"; await new Promise((r) => setTimeout(r, 450)); u.classList.remove("spin"); busy = false;
        }
        u.style.opacity = 0; u.style.transform = "translate(-50%,-70px)"; return;
      }
      if (m === "swipe" && B.go && B.canSwipe && B.canSwipe() && e.changedTouches && e.changedTouches[0]) {
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, tabs = B.tabs || [];
        if (Math.abs(dx) > 70 && Math.abs(dy) < 60 && Date.now() - st < 700) {
          const i = tabs.indexOf(B.tab()), n = i + (dx < 0 ? 1 : -1); if (i >= 0 && n >= 0 && n < tabs.length) {
            B.go(tabs[n]); const v = document.getElementById("view"); if (v && !reduce()) { v.classList.remove("yo-in-l", "yo-in-r"); void v.offsetWidth; v.classList.add(dx < 0 ? "yo-in-l" : "yo-in-r"); setTimeout(() => v.classList.remove("yo-in-l", "yo-in-r"), 400); }
          }
        }
      }
    };
    document.addEventListener("touchend", end, { passive: true }); document.addEventListener("touchcancel", () => { mode = null; if (ptr) { ptr.style.opacity = 0; } }, { passive: true });
  }

  // ---------- the shofar: a synthesized horn (two detuned saws through a sweeping low-pass). OFF by default. ----------
  const soundOn = () => localStorage.getItem("desk.yobel.sound") === "1";
  function setSound(on) { localStorage.setItem("desk.yobel.sound", on ? "1" : "0"); if (on) shofar(true); }
  let AC = null;
  function audio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; } catch { return null; } }
  function shofar(force) {
    if (!force && !soundOn()) return; const ac = audio(); if (!ac) return; const t = ac.currentTime;
    const out = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
    lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.45); lp.frequency.exponentialRampToValueAtTime(700, t + 1.3);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.09, t + 0.12); out.gain.setValueAtTime(0.09, t + 0.8); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    lp.connect(out); out.connect(ac.destination);
    [0, 6].forEach((det) => { const o = ac.createOscillator(); o.type = "sawtooth"; o.detune.value = det;
      o.frequency.setValueAtTime(196, t); o.frequency.exponentialRampToValueAtTime(293.7, t + 0.35); o.frequency.exponentialRampToValueAtTime(261.6, t + 1.3);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 3; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(lp); o.start(t); lfo.start(t); o.stop(t + 1.55); lfo.stop(t + 1.55); });
  }
  const unlock = () => { if (soundOn()) audio(); };

  // ---------- the burst: gold shofar celebration on a win; violet pulse on a buy/exit; rose on a loss ----------
  let live = 0;
  function burst(kind, anchor, onImpact) {
    if (reduce() || document.hidden || live >= 2) return; live++;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1), cv = document.createElement("canvas");
    cv.className = "yo-canvas"; cv.width = W * dpr; cv.height = H * dpr; document.body.appendChild(cv);
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const r = anchor ? anchor.getBoundingClientRect() : { left: W / 2 - 50, top: H / 2, width: 100, height: 40 };
    const x0 = Math.min(W - 30, Math.max(30, r.left + r.width * (kind === "tp" ? 0.5 : 0.82))), y0 = Math.min(H - 30, Math.max(40, r.top + r.height / 2));
    const win = kind === "tp", cols = win ? GOLD : kind === "stop" ? ROSE : VIOLET, ring = win ? "245,199,107" : kind === "stop" ? "255,92,122" : "167,139,250";
    const rnd = (a, b) => a + Math.random() * (b - a), P = [], N = win ? 84 : kind === "stop" ? 28 : 34, D = win ? 1.9 : 1.2;
    for (let i = 0; i < N; i++) {
      const a = win ? rnd(-Math.PI * 0.95, -Math.PI * 0.05) : rnd(0, Math.PI * 2), v = rnd(win ? 140 : 60, win ? 520 : 240);
      P.push({ x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: win ? 520 : kind === "stop" ? 260 : -40, s: rnd(1.6, win ? 4.2 : 3), c: cols[i % cols.length], life: rnd(D * 0.45, D), star: win && i % 5 === 0 });
    }
    // sound waves of the horn: three arcs spreading out of the card
    const rings = win ? [0, 0.14, 0.28] : [0];
    const t0 = performance.now(); if (onImpact) setTimeout(onImpact, 0);
    const hard = setTimeout(done, (D + 0.4) * 1000);
    function done() { clearTimeout(hard); if (cv.isConnected) { cv.remove(); live = Math.max(0, live - 1); } }
    let last = t0;
    (function frame(now) {
      if (!cv.isConnected) return; const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      if (win && t < 0.9) { const k = 1 - t / 0.9, gr = g.createRadialGradient(x0, y0, 0, x0, y0, 220); gr.addColorStop(0, `rgba(255,240,194,${0.28 * k})`); gr.addColorStop(1, "rgba(245,199,107,0)"); g.fillStyle = gr; g.fillRect(x0 - 230, y0 - 230, 460, 460); }
      rings.forEach((d) => { const k = (t - d) / 0.9; if (k < 0 || k > 1) return; g.strokeStyle = `rgba(${ring},${0.85 * (1 - k)})`; g.lineWidth = 5 * (1 - k) + 1; g.beginPath(); g.arc(x0, y0, 14 + 150 * (1 - Math.pow(1 - k, 3)), win ? Math.PI * 1.1 : 0, win ? Math.PI * 1.9 : Math.PI * 2); g.stroke(); });
      for (const p of P) {
        p.vy += p.g * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; const age = t / p.life; if (age >= 1) continue;
        g.globalAlpha = 1 - age; g.fillStyle = g.shadowColor = p.c; g.shadowBlur = 8;
        if (p.star) { const z = p.s * 2.2 * Math.sin(Math.PI * Math.min(1, age + 0.1)), w = z * 0.3; g.beginPath(); g.moveTo(p.x, p.y - z); g.lineTo(p.x + w, p.y - w); g.lineTo(p.x + z, p.y); g.lineTo(p.x + w, p.y + w); g.lineTo(p.x, p.y + z); g.lineTo(p.x - w, p.y + w); g.lineTo(p.x - z, p.y); g.lineTo(p.x - w, p.y - w); g.closePath(); g.fill(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); }
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
      if (t < D) requestAnimationFrame(frame); else done();
    })(t0);
    if (win) shofar();
  }


  // ---------- full screen (Fullscreen API where it exists; iPhone Safari has none, so we explain instead) ----------
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsApi = () => { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); };
  const standalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
  // ---------- Telegram Mini App (Bot API 8.0+): real full screen, no swipe-to-close, black chrome, safe-area insets ----------
  let TG = null;
  const tgVer = (v) => { try { return !!(TG && TG.isVersionAtLeast && TG.isVersionAtLeast(v)); } catch { return false; } };
  const tgFsOk = () => tgVer("8.0") && typeof TG.requestFullscreen === "function";
  function tgInsets() {
    const w = TG, r = document.documentElement.style, s = w.safeAreaInset || {}, c = w.contentSafeAreaInset || {};
    const sum = (k) => Math.max(0, (s[k] || 0) + (c[k] || 0));
    // the app already pads every screen with --st/--sb/--sl/--sr (iOS env()); inside Telegram's webview env() is 0, so feed it Telegram's numbers
    r.setProperty("--st", sum("top") + "px"); r.setProperty("--sb", sum("bottom") + "px");
    r.setProperty("--sl", sum("left") + "px"); r.setProperty("--sr", sum("right") + "px");
  }
  function tgSync() {
    if (!TG) return; try { tgInsets(); } catch {}
    document.documentElement.classList.toggle("tg-fs", !!TG.isFullscreen);
  }
  function tgSetup(w) {
    TG = w; document.documentElement.classList.add("tg");
    try { w.expand(); } catch {}
    const black = "#000000";
    try { w.setHeaderColor(black); } catch {}
    try { w.setBackgroundColor(black); } catch {}
    if (tgVer("7.10")) { try { w.setBottomBarColor(black); } catch {} }
    if (tgVer("7.7")) { try { w.disableVerticalSwipes(); } catch {} }      // scrolling the app must never close it
    if (tgVer("8.0")) {
      ["fullscreenChanged", "fullscreenFailed", "safeAreaChanged", "contentSafeAreaChanged", "viewportChanged"].forEach((e) => { try { w.onEvent(e, tgSync); } catch {} });
      try { w.requestFullscreen(); } catch {}                              // on open; harmless if the client refuses (fullscreenFailed)
    }
    tgSync();
  }
  const fsShow = () => tgFsOk() || fsApi() || !standalone();            // an installed iPhone app is already full screen: no button
  function fullscreen() {
    if (tgFsOk()) { try { if (TG.isFullscreen) { TG.exitFullscreen(); return "exit"; } TG.requestFullscreen(); return "enter"; } catch { return "unsupported"; } }
    const d = document, el = d.documentElement;
    if (fsEl()) { try { (d.exitFullscreen || d.webkitExitFullscreen).call(d); } catch {} return "exit"; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return "unsupported";
    try { const r = req.call(el); if (r && r.catch) r.catch(() => {}); } catch { return "unsupported"; }
    return "enter";
  }
  function fsSync() { document.documentElement.classList.toggle("yo-fs", !!fsEl()); }
  // ---------- scroll reveal: sections below the fold fade up once as they come into view (IntersectionObserver: touch + mouse + keyboard scroll alike) ----------
  function reveal() {
    const v = document.getElementById("view"); if (!v || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("yo-rv-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    let q = 0;
    const scan = () => { q = 0; if (reduce()) return;
      v.querySelectorAll(".home > section, .trrow, .list > .row").forEach((el) => {
        if (el.dataset.rv) return; el.dataset.rv = "1";
        if (el.getBoundingClientRect().top < innerHeight * 0.96) return;       // already on screen (or above): never hide
        el.classList.add("yo-rv"); io.observe(el);
      }); };
    new MutationObserver(() => { if (!q) q = requestAnimationFrame(scan); }).observe(v, { childList: true, subtree: true });
    scan();
  }
  // ---------- keyboard (desktop): ← / → switch tab, F toggles full screen ----------
  function keys() {
    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName) || document.getElementById("rpv")) return;
      if (e.key === "f" || e.key === "F") { if (fsShow()) { fullscreen(); } return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && B.go && B.canSwipe && B.canSwipe()) {
        const tabs = B.tabs || [], i = tabs.indexOf(B.tab()), n = i + (e.key === "ArrowRight" ? 1 : -1); if (i >= 0 && n >= 0 && n < tabs.length) B.go(tabs[n]);
      }
    });
  }
  function init(bridge) {
    B = bridge || {}; sky(); setInterval(sky, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) sky(); });
    initGestures(); document.addEventListener("pointerdown", unlock, { once: false, passive: true });
    reveal(); keys(); ['fullscreenchange', 'webkitfullscreenchange'].forEach((n) => document.addEventListener(n, fsSync));
  }
  return { init, tgSetup, fullscreen, fsShow, burst, shofar, soundOn, setSound, countText, tagline, sky, dawnAmount, STAR };
})();
if (typeof window !== "undefined") window.Yobel = Yobel;
