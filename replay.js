// replay.js - Yobel Replay (MEM-22). A full-screen player for one trade or one time window.
// Data = what the desk already publishes (encrypted payload): replay/index + replay/<id> (db.prices line, bot steps), chart/1D|1W (balance), nothing else.
// Local only: no writes, nothing sent to the desk, no network calls of its own. All times are shown in CET/CEST (Europe/Berlin).
const Replay = (() => {
  "use strict";
  let B = null, R = null, root = null;
  const TZ = "Europe/Berlin", $ = (s, el = root) => el && el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v, d = 2) => (v == null || isNaN(v) ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signed = (v) => (v == null || isNaN(v) ? "–" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v, d = 1) => (v == null || isNaN(v) ? "–" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%");
  const priceFmt = (p) => { if (p == null || isNaN(p)) return "–"; if (p >= 1) return "$" + p.toFixed(4); const z = Math.max(0, -Math.floor(Math.log10(p)) - 1); return "$" + p.toFixed(Math.min(12, z + 4)); };
  const compact = (v) => (v == null || isNaN(v) ? "–" : "$" + (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)));
  const num = (v) => (v == null ? "–" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0));
  const fT = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const fH = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const fD = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
  const fZ = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, timeZoneName: "short" });
  const zone = (ts) => { const p = fZ.formatToParts(new Date(ts * 1000)).find((x) => x.type === "timeZoneName"); return p ? p.value : "CET"; };
  const clock = (ts) => fT.format(new Date(ts * 1000)), hhmm = (ts) => fH.format(new Date(ts * 1000));
  const stamp = (ts) => fD.format(new Date(ts * 1000)) + " " + hhmm(ts);
  const dur = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
  const BOT = { scanner: "#e0bd82", analyst: "#dab16b", brain: "#ff802b", executor: "#f7cb6b", risk: "#ff4d6d", desk: "#8e8e93" };
  const botColor = (n) => { const b = ((B.S.state && B.S.state.bots) || []).find((x) => x.name === n); return (b && b.color) || BOT[n] || "#8e8e93"; };
  const botName = (n) => ({ scanner: "Scanner", analyst: "Analyst", brain: "Brain", executor: "Executor", risk: "Risk", desk: "Desk" }[n] || n);
  const KC = { buy: "#f7c967", tp: "#f7cc6e", trail: "#e0bd82", stop: "#ff4d6d", manual: "#ddb775", exit: "#ddb775", moonbag_on: "#e2c38c", breakeven: "#ffd60a" };
  const KL = { buy: "BUY", tp: "TP", trail: "TRAIL", stop: "STOP", manual: "EXIT", exit: "EXIT", moonbag_on: "MOON", breakeven: "BE" };
  const SRC = { migration: "migration feed", near_grad: "near-graduation feed", x_trend: "X trend", jup_recent: "Jupiter feed", launchlab: "LaunchLab", smart_money: "smart-money wallets", helius_pool: "new-pool stream" };
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const SELL = new Set(["tp", "trail", "stop", "manual", "exit", "moonbag"]);

  function init(bridge) { B = bridge; }
  const isOpen = () => !!root;

  // ---------- data ----------
  async function index() {
    try { await B.getFile("replay/index"); } catch {}
    const ix = B.S.files["replay/index"]; return (ix && ix.trades) || [];
  }
  async function loadTrade(id) {
    try { await B.getFile("replay/" + id); } catch {}
    return B.S.files["replay/" + id] || null;
  }
  function priceAt(px, t) {
    if (!px.length) return null; if (t <= px[0][0]) return px[0][1]; const n = px.length; if (t >= px[n - 1][0]) return px[n - 1][1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (px[m][0] <= t) lo = m; else hi = m; }
    const a = px[lo], b = px[hi]; return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0] || 1));
  }
  function prep(D) {
    let px = (D.px || []).filter((p) => p[1] > 0);
    if (px.length < 2) { px = [[D.t_open, D.entry]]; if (D.exit && D.t_close) px.push([D.t_close, D.exit]); else px.push([D.t_open + 60, D.entry]); D.synthetic = true; }
    D._px = px; D.w0 = Math.min(D.w0 || px[0][0], px[0][0]); D.w1 = Math.max(D.w1 || 0, px[px.length - 1][0], D.t_close || 0);
    if (D.w1 - D.w0 < 30) D.w1 = D.w0 + 30;
    D._steps = (D.steps || []).slice().sort((a, b) => a.ts - b.ts);
    if (D.t_close) D._steps.push({ ts: D.t_close, bot: "desk", kind: "result" });
    D._marks = D._steps.filter((s) => KL[s.kind]).map((s) => ({ ts: s.ts, kind: s.kind, price: s.kind === "buy" ? D.entry : s.price || priceAt(px, s.ts) }));
    D._hi = Math.max(...px.map((p) => p[1]), D.entry), D._lo = Math.min(...px.map((p) => p[1]), D.entry);
    return D;
  }
  // everything about the position at time t, derived from the steps (stateless: scrubbing back and forth just works)
  function stateAt(D, t) {
    const price = priceAt(D._px, t); let rem = D.tokens, realized = 0, sold = 0;
    for (const s of D._steps) if (s.ts <= t && SELL.has(s.kind) && s.tokens) { rem -= s.tokens; realized += s.pnl_usd || 0; sold++; }
    rem = Math.max(0, rem); const entered = t >= D.t_open, closed = !!D.t_close && t >= D.t_close;
    const cost = D.size * (D.tokens ? rem / D.tokens : 0), unreal = entered && !closed ? rem * price - cost : 0;
    let peak = D.entry; if (entered) for (const p of D._px) { if (p[0] > t) break; if (p[0] >= D.t_open && p[1] > peak) peak = p[1]; }
    return { price, rem, realized, total: entered ? (closed && D.pnl_usd != null ? D.pnl_usd : realized + unreal) : 0, entered, closed, peak, chg: entered ? 100 * (price / D.entry - 1) : null };
  }
  const mcap = (D, p) => (D.supply && p != null ? p * D.supply : null);

  // ---------- shell ----------
  function mount() {
    if (root) return;
    root = document.createElement("div"); root.id = "rpv"; root.className = "rpv"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Replay");
    document.body.appendChild(root); document.body.classList.add("rp-open");
    history.pushState({ d: B.S.stack.length, rp: 1 }, "");
    root.addEventListener("click", onClick);
  }
  function close(fromPop) {
    if (!root) return; stop(); root.remove(); root = null; document.body.classList.remove("rp-open"); R = null;
    if (!fromPop && history.state && history.state.rp) history.back();
  }
  addEventListener("popstate", () => { if (root) close(true); });
  function stop() { if (R && R.raf) cancelAnimationFrame(R.raf); if (R) { R.raf = 0; R.playing = false; } }

  // ---------- picker ----------
  async function open(opts = {}) {
    if (!B.S.state) return;
    mount(); R = { view: "pick", playing: false };
    root.innerHTML = bar("Replay", "") + `<div class="rpscroll"><div class="rpload"><i></i>Loading replay data…</div></div>`;
    const trades = await index(); if (!root) return;
    R.trades = trades;
    if (opts.mint) { const t = trades.find((x) => x.mint === opts.mint); if (t) return openTrade(t.id); }
    if (opts.id) return openTrade(opts.id);
    pick();
  }
  const bar = (title, sub, back) => `<div class="rpbar">${back ? `<button class="rpbk" data-rp="${back}" aria-label="Back">‹ Back</button>` : `<span class="rpbk ph"></span>`}<div class="rpt"><b>${esc(title)}</b>${sub ? `<span>${sub}</span>` : ""}</div><button class="rpx" data-rp="close" aria-label="Close replay">✕</button></div>`;
  function windows(trades) {
    const now = Date.now() / 1000, ch = B.S.files["chart/LIVE"] || B.S.files["chart/1D"] || {};
    let ns = ch.night_start; if (!ns || now - ns > 86400 || now - ns < 600) ns = now - 12 * 3600;
    const mk = (id, title, sub, t0) => { const ts = trades.filter((t) => t.t_open >= t0 && t.t_open <= now), done = ts.filter((t) => t.t_close);
      return { id, title, sub, t0, t1: now, n: ts.length, net: done.reduce((a, t) => a + (t.pnl_usd || 0), 0), wins: done.filter((t) => (t.pnl_usd || 0) > 0).length, done: done.length }; };
    return [mk("night", "Last night", `since ${hhmm(ns)} ${zone(ns)}`, ns), mk("24h", "Last 24 hours", "rolling", now - 86400), mk("3d", "Last 3 days", "rolling", now - 3 * 86400)];
  }
  function pick() {
    R.view = "pick"; stop(); const trades = R.trades;
    if (!trades.length) { root.innerHTML = bar("Replay", "") + `<div class="rpscroll"><div class="rpempty2"><b>Nothing to replay yet</b>Replays appear here as soon as the desk has published its first trades. If the desk just restarted, give it a minute.</div></div>`; return; }
    const ws = windows(trades);
    root.innerHTML = bar("Replay", "watch the desk trade again") + `<div class="rpscroll">
      <h3 class="rph">Replay a window</h3>
      <div class="rpwins">${ws.map((w) => `<button class="rpwin glass" data-rp="win" data-w="${w.id}" ${w.n ? "" : "disabled"}><div class="wt">${esc(w.title)}<small>${esc(w.sub)}</small></div>
        <div class="wn">${w.n ? `${w.n} trade${w.n > 1 ? "s" : ""} · ${w.done ? `<b class="${w.net >= 0 ? "up" : "down"}">${signed(w.net)}</b> · ${w.wins}/${w.done} won` : "in progress"}` : "no trades"}</div><span class="wgo">▶</span></button>`).join("")}</div>
      <h3 class="rph">Replay a trade</h3>
      <div class="rptl glass">${trades.map((t) => { const open = !t.t_close, up = (t.pnl_usd || 0) >= 0;
        return `<button class="rptr" data-rp="trade" data-id="${t.id}"><div class="ic">${esc((t.symbol || "?").slice(0, 1))}</div><div class="tx"><div class="t1">${esc(t.symbol || t.mint.slice(0, 4))}${t.starship ? ' <span class="tag ss">✦</span>' : ""}${open ? ' <span class="tag live">OPEN</span>' : ""}</div>
          <div class="t2">${stamp(t.t_open)} ${zone(t.t_open)} · ${open ? "holding" : dur(t.t_close - t.t_open)} · ${money(t.size, 0)} in${t.reason ? " · " + esc(t.reason) : ""}</div></div>
          <div class="rv">${open ? "" : `<b class="${up ? "up" : "down"}">${signed(t.pnl_usd)}</b><small class="${up ? "up" : "down"}">${pct(t.pnl_pct, 0)}</small>`}</div><span class="wgo">▶</span></button>`; }).join("")}</div></div>`;
  }

  // ---------- player (trade + window share the shell) ----------
  async function openTrade(id, from) {
    R = Object.assign(R || {}, { view: "trade", playing: false }); R.from = from || null;
    root.innerHTML = bar("Replay", "", "back") + `<div class="rpscroll"><div class="rpload"><i></i>Loading the trade…</div></div>`;
    const D = await loadTrade(id); if (!root || R.view !== "trade") return;
    if (!D) { root.innerHTML = bar("Replay", "", "back") + `<div class="rpscroll"><div class="rpempty2"><b>This trade isn't published</b>It is too old or the desk hasn't published it yet.</div></div>`; return; }
    prep(D); R.D = D; R.sumOn = false; R.t0 = D.w0; R.t1 = D.w1; R.pos = D.w0;
    R.marks = D._marks.map((m) => m.ts); R.stepTs = D._steps.map((s) => s.ts);
    const span = R.t1 - R.t0; R.v0 = Math.max(1, span / 30); R.ev = tradeEvents(D);
    const ttl = `${esc(D.symbol || D.mint.slice(0, 4))}${D.starship ? " ✦" : ""}`;
    root.innerHTML = bar(D.symbol || "Trade", `${stamp(D.t_open)} ${zone(D.t_open)}${D.t_close ? "" : " · open"}`, "back") + `<div class="rpscroll" id="rpscroll">
      <div class="rpstick">
        <div class="rpread"><div class="rr1"><div class="rpx1" id="rPrice">–</div><div class="rpx2"><span id="rMcap">–</span><span class="mut"> market cap</span></div></div>
          <div class="rr2"><div class="rpl" id="rPnl">–</div><div class="rpx2" id="rState">–</div></div></div>
        ${chartHtml()}${controlsHtml()}
      </div>
      <div id="rpsum"></div>
      <button class="rpmore" id="rpMore" data-rp="steps">What the bots did · ${D._steps.length} steps <span>▾</span></button>
      <div class="rpsteps" id="rpsteps" hidden>${D._steps.map((s, i) => stepHtml(D, s, i)).join("")}</div>
      <div class="rppad"></div></div>`;
    wire(); R.lastStep = -2; play(true);
  }
  function openWindow(wid, from) {
    const w = windows(R.trades).find((x) => x.id === wid); if (!w) return;
    const trades = R.trades.filter((t) => t.t_open >= w.t0 && t.t_open <= w.t1).sort((a, b) => a.t_open - b.t_open);
    const span = w.t1 - w.t0, ch = B.S.files[span <= 86400 ? "chart/1D" : "chart/1W"] || B.S.files["chart/ALL"] || {};
    let pts = ((ch.points) || []).filter((p) => p[0] >= w.t0 - 600);
    R = Object.assign(R, { view: "window", W: w, trades, playing: false }); R.from = from || null;
    if (pts.length < 2) { root.innerHTML = bar(w.title, "", "back") + `<div class="rpscroll"><div class="rpempty2"><b>No balance history here yet</b>The balance line for this window isn't published yet.</div></div>`; return; }
    const start = pts[0][1]; R.pts = pts; R.sumOn = false; R.start = start; R.t0 = Math.max(w.t0, pts[0][0]); R.t1 = pts[pts.length - 1][0]; R.pos = R.t0;
    R.marks = trades.flatMap((t) => [t.t_open, t.t_close].filter(Boolean)).sort((a, b) => a - b); R.stepTs = trades.map((t) => t.t_open);
    R.v0 = Math.max(1, (R.t1 - R.t0) / 30); R.ev = windowEvents(trades);
    root.innerHTML = bar(w.title, `${stamp(R.t0)} → ${hhmm(R.t1)} ${zone(R.t1)}`, "back") + `<div class="rpscroll" id="rpscroll">
      <div class="rpstick">
        <div class="rpread"><div class="rr1"><div class="rpx1" id="rPrice">–</div><div class="rpx2"><span class="mut">balance</span></div></div>
          <div class="rr2"><div class="rpl" id="rPnl">–</div><div class="rpx2" id="rState">–</div></div></div>
        ${chartHtml()}${controlsHtml()}
      </div>
      <div id="rpsum"></div>
      <button class="rpmore" id="rpMore" data-rp="steps">Trades in this window · ${trades.length} <span>▾</span></button>
      <div class="rpsteps" id="rpsteps" hidden>${trades.map((t, i) => winCardHtml(t, i)).join("")}</div><div class="rppad"></div></div>`;
    wire(); R.lastStep = -2; play(true);
  }
  const chartHtml = () => `<div class="rpchart"><canvas id="rpc" aria-label="Price chart"></canvas></div>
    <div class="rpscrub"><input id="rpr" type="range" min="0" max="1000" value="0" aria-label="Timeline"><div class="rpticks" id="rpticks"></div></div>
    <div class="rptimes"><span id="rT0"></span><b id="rNow"></b><span id="rT1"></span></div>`;
  const controlsHtml = () => `<div class="rpctl3"><button class="cb big" data-rp="toggle" id="rpPlay" aria-label="Play or pause">▶</button><div class="rplab" id="rpLab" data-rp="steps" role="button" aria-live="polite"></div></div>`;

  function wire() {
    const r = $("#rpr"), c = $("#rpc"), sc = $("#rpscroll"); R.sc = sc;
    const span = R.t1 - R.t0; $("#rT0").textContent = clock(R.t0).slice(0, 5); $("#rT1").textContent = clock(R.t1).slice(0, 5);
    $("#rpticks").innerHTML = R.marks.map((t) => `<i style="left:${100 * (t - R.t0) / span}%"></i>`).join("");
    let was = false;
    r.addEventListener("pointerdown", () => { was = R.playing; R.playing = false; syncPlay(); });
    r.addEventListener("input", () => { R.pos = R.t0 + (r.value / 1000) * span; frame(true); });
    const up = () => { if (was) play(); was = false; }; r.addEventListener("pointerup", up); r.addEventListener("pointercancel", up); r.addEventListener("change", up);
    const px = (e) => { const b = c.getBoundingClientRect(), x = (e.clientX - b.left - R.ml) / (b.width - R.ml - R.mr); return R.t0 + Math.min(1, Math.max(0, x)) * span; };
    c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); was = R.playing; R.playing = false; R.drag = true; R.pos = px(e); syncPlay(); frame(true); });
    c.addEventListener("pointermove", (e) => { if (R.drag) { R.pos = px(e); frame(true); } });
    const cu = () => { if (R.drag) { R.drag = false; if (was) play(); was = false; } }; c.addEventListener("pointerup", cu); c.addEventListener("pointercancel", cu);
    ["touchstart", "wheel", "pointerdown"].forEach((ev) => sc.addEventListener(ev, () => { R.userAt = Date.now(); }, { passive: true }));
    new ResizeObserver(() => frame(true)).observe(c);
    frame(true);
  }
  function syncPlay() { const b = $("#rpPlay"); if (b) { const end = R.pos >= R.t1 - 0.01; b.textContent = end && !R.playing ? "↻" : R.playing ? "❚❚" : "▶"; } }
  function play(fresh) {
    if (!R) return; if (R.pos >= R.t1 - 0.01) { R.pos = R.t0; R.lastStep = -2; }
    R.playing = true; R.last = 0; syncPlay(); if (R.raf) return;
    const step = (now) => {
      R.raf = 0; if (!R || !root) return;
      if (R.playing) {
        const dt = R.last ? Math.min(0.1, (now - R.last) / 1000) : 0; R.last = now;
        R.pos = Math.min(R.t1, R.pos + dt * R.v0 * speedAt(R.pos).f);
        if (R.pos >= R.t1) { R.playing = false; syncPlay(); }
      }
      frame(false);
      if (R.playing) R.raf = requestAnimationFrame(step);
    };
    R.raf = requestAnimationFrame(step);
  }
  // ---------- events + auto slow motion: ease into ~0.1x before every buy / sell / TP / stop / moonbag, hold on the marker, ease back ----------
  const sgn0 = (v) => (v == null || isNaN(v) ? "" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: Math.abs(v) >= 100 ? 0 : 2, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }));
  function tradeEvents(D) {
    const ev = [];
    D._steps.forEach((s, si) => {
      const base = KL[s.kind] || (s.kind === "moonbag" ? "MOONBAG" : null); if (!base || s.kind === "breakeven") return;
      const label = s.kind === "buy" ? `BUY ${money(D.size, 0)} @ ${D.supply ? compact(D.entry * D.supply) + " mcap" : priceFmt(D.entry)}` : s.kind === "moonbag_on" ? "MOONBAG ON" : `${base} ${sgn0(s.pnl_usd)}`.trim();
      ev.push({ ts: s.ts, kind: s.kind === "moonbag" ? "moonbag_on" : s.kind, label, si });
    });
    return ev.sort((a, b) => a.ts - b.ts);
  }
  function windowEvents(ts) {
    const ev = []; ts.forEach((t, si) => { const sy = t.symbol || t.mint.slice(0, 4);
      ev.push({ ts: t.t_open, kind: "buy", label: `BUY ${sy} ${money(t.size, 0)}`, si });
      if (t.t_close) ev.push({ ts: t.t_close, kind: (t.pnl_usd || 0) >= 0 ? "tp" : "stop", label: `${sy} ${sgn0(t.pnl_usd)}`, si }); });
    return ev.sort((a, b) => a.ts - b.ts);
  }
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  function speedAt(t) {
    let d = Infinity, ev = null; for (const e of R.ev || []) { const x = Math.abs(t - e.ts); if (x < d) { d = x; ev = e; } }
    const H = R.v0 * 0.12, L = R.v0 * 2.6;                                           // hold radius (~2.4 s at 0.1x) and ease radius (~2.6 s at normal speed)
    return { f: !ev || d >= L ? 1 : d <= H ? 0.1 : 0.1 + 0.9 * smooth((d - H) / (L - H)), d, ev, H, L };
  }
  function updLabel() {
    const el = $("#rpLab"); if (!el) return; const s = speedAt(R.pos);
    const k = s.ev && s.d < s.L && s.f < 0.97 ? (s.d <= s.H * 1.4 ? "hit" : "pre") + "|" + s.ev.label + "|" + s.ev.kind : "";
    if (el.dataset.k === k) return; el.dataset.k = k; R.curEv = k ? s.ev : null;
    if (!k) { el.textContent = ""; el.className = "rplab"; return; }
    el.textContent = s.ev.label; el.className = "rplab " + k.split("|")[0]; el.style.setProperty("--c", KC[s.ev.kind] || "#e2c28b");
  }
  const jump = (dir) => { const ts = R.marks.filter((t) => t >= R.t0 && t <= R.t1); let t = dir > 0 ? ts.find((x) => x > R.pos + 0.5) : [...ts].reverse().find((x) => x < R.pos - 0.5); if (t == null) t = dir > 0 ? R.t1 : R.t0; R.pos = t; frame(true); };

  // ---------- per-frame ----------
  function frame(force) {
    if (!R || !root || (R.view !== "trade" && R.view !== "window")) return;
    const span = R.t1 - R.t0, r = $("#rpr"); if (!r) return;
    if (!R.drag || force) r.value = String(Math.round(1000 * (R.pos - R.t0) / span));
    r.style.setProperty("--p", (100 * (R.pos - R.t0) / span) + "%");
    $("#rNow").textContent = clock(R.pos) + " " + zone(R.pos);
    if (R.view === "trade") tradeFrame(); else windowFrame();
    syncPlay(); updLabel();
  }
  function setT(id, t, cls) { const e = $(id); if (!e) return; if (e.textContent !== t) e.textContent = t; if (cls != null && e.dataset.c !== cls) { e.dataset.c = cls; e.className = e.className.replace(/\b(up|down)\b/g, "").trim() + " " + cls; } }
  function tradeFrame() {
    const D = R.D, S = stateAt(D, R.pos), up = (S.total || 0) >= 0;
    setT("#rPrice", priceFmt(S.price)); setT("#rMcap", D.supply ? compact(mcap(D, S.price)) : "–");
    setT("#rPnl", S.entered ? signed(S.total) + (S.chg != null && !S.closed ? "  " + pct(S.chg, 0) : "") : "–", S.entered ? (up ? "up" : "down") : "");
    setT("#rState", !S.entered ? "waiting for the entry" : S.closed ? "closed · " + (D.reason || "exit") : S.rem < D.tokens * 0.999 ? `holding ${Math.round(100 * S.rem / D.tokens)}% · profit locked in` : "holding", "");
    drawTrade(D, S);
    const idx = D._steps.reduce((a, s, i) => (s.ts <= R.pos ? i : a), -1);
    if (idx !== R.lastStep) { R.lastStep = idx; D._steps.forEach((s, i) => { const el = $(`.rpstep[data-i="${i}"]`); if (el) { el.classList.toggle("reached", i <= idx); el.classList.toggle("now", i === idx); } }); followStep(idx); }
    const done = R.pos >= R.t1 - 0.01 || (D.t_close && R.pos >= D.t_close);
    if (done !== R.sumOn) { R.sumOn = done; $("#rpsum").innerHTML = done ? tradeSummary(D) : ""; if (done) showSum(); }
  }
  function showSum() { const el = $("#rpsum"), st = $(".rpstick"); if (el && R.sc && Date.now() - (R.userAt || 0) > 3500) R.sc.scrollTo({ top: Math.max(0, el.offsetTop - (st ? st.offsetHeight : 0) - 6), behavior: reduce() ? "auto" : "smooth" }); }
  function followStep(idx) {
    const bx = $("#rpsteps"); if (!bx || bx.hidden) return;
    if (idx < 0 || !R.playing || Date.now() - (R.userAt || 0) < 3500) return;
    const el = $(`.rpstep[data-i="${idx}"]`), st = $(".rpstick"); if (!el || !R.sc) return;
    R.sc.scrollTo({ top: Math.max(0, el.offsetTop - (st ? st.offsetHeight : 0) - 6), behavior: reduce() ? "auto" : "smooth" });
  }
  function windowFrame() {
    const ts = R.trades, W = R.W; let bal = priceAt(R.pts, R.pos);
    const closed = ts.filter((t) => t.t_close && t.t_close <= R.pos), open = ts.filter((t) => t.t_open <= R.pos && !(t.t_close && t.t_close <= R.pos));
    const net = bal - R.start, up = net >= 0;
    setT("#rPrice", money(bal)); setT("#rPnl", signed(net), up ? "up" : "down");
    setT("#rState", `${closed.length} of ${ts.length} trades done${open.length ? " · " + open.length + " open" : ""}`, "");
    drawWindow(bal);
    const idx = ts.reduce((a, t, i) => (t.t_open <= R.pos ? i : a), -1);
    ts.forEach((t, i) => { const el = $(`.rpwc[data-i="${i}"]`); if (!el) return; const c = !!(t.t_close && t.t_close <= R.pos), o = t.t_open <= R.pos;
      const key = (o ? 1 : 0) + (c ? 2 : 0) + (i === idx ? 4 : 0); if (el.dataset.k !== String(key)) { el.dataset.k = String(key); el.classList.toggle("reached", o); el.classList.toggle("closed", c); el.classList.toggle("now", i === idx); } });
    if (idx !== R.lastStep) { R.lastStep = idx; if (idx >= 0 && R.playing && !($("#rpsteps") || {}).hidden && Date.now() - (R.userAt || 0) > 3500) { const el = $(`.rpwc[data-i="${idx}"]`), st = $(".rpstick"); if (el) R.sc.scrollTo({ top: Math.max(0, el.offsetTop - st.offsetHeight - 6), behavior: reduce() ? "auto" : "smooth" }); } }
    const done = R.pos >= R.t1 - 0.01; if (done !== R.sumOn) { R.sumOn = done; $("#rpsum").innerHTML = done ? windowSummary() : ""; if (done) showSum(); }
  }

  // ---------- canvas ----------
  function setup(c, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = c.clientWidth; if (!w) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + "px"; }
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return { g, w, h };
  }

  function drawTrade(D, S) {
    const c = $("#rpc"); if (!c) return; const k = setup(c, innerHeight < 700 ? 170 : 214); if (!k) return; const { g, w, h } = k;
    const ml = 6, mr = 50, mt = 14, mb = 20; R.ml = ml; R.mr = mr; const pw = w - ml - mr, ph = h - mt - mb;
    const lo0 = D._lo, hi0 = D._hi, padv = (hi0 - lo0) * 0.12 || hi0 * 0.1, lo = Math.max(lo0 - padv, 0), hi = hi0 + padv;
    const X = (t) => ml + pw * ((t - R.t0) / (R.t1 - R.t0)), Y = (p) => mt + ph * (1 - (p - lo) / (hi - lo));
    g.font = "600 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 3; i++) { const p = lo + (hi - lo) * i / 3, y = Y(p); g.strokeStyle = "rgba(214,168,90,.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke();
      g.fillStyle = "rgba(238,229,210,.42)"; g.textAlign = "left"; g.fillText(D.supply ? compact(p * D.supply) : priceFmt(p).replace(/0+$/, ""), ml + pw + 6, y); }
    const x0 = X(D.t_open), x1 = X(D.t_close || R.t1);                        // holding band
    g.fillStyle = "rgba(247,204,110,.06)"; g.fillRect(x0, mt, Math.max(2, x1 - x0), ph);
    const ey = Y(D.entry); g.setLineDash([4, 4]); g.strokeStyle = "rgba(218,177,107,.55)"; g.beginPath(); g.moveTo(ml, ey); g.lineTo(ml + pw, ey); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(218,177,107,.9)"; g.textAlign = "left"; g.fillText("ENTRY", ml + 2, ey - 8);
    const px = D._px; g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = "rgba(238,229,210,.22)"; g.lineWidth = 1.5; g.beginPath(); px.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();   // the whole line, faint
    const cur = [], past = px.filter((p) => p[0] <= R.pos); past.forEach((p) => cur.push([X(p[0]), Y(p[1])])); cur.push([X(R.pos), Y(S.price)]);
    const path = () => { g.beginPath(); cur.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    const band = (y0, y1, col, fill) => { g.save(); g.beginPath(); g.rect(ml, y0, pw, y1 - y0); g.clip(); path(); g.strokeStyle = col; g.lineWidth = 2.4; g.stroke();
      g.lineTo(cur[cur.length - 1][0], mt + ph); g.lineTo(cur[0][0], mt + ph); g.closePath(); const gr = g.createLinearGradient(0, mt, 0, mt + ph); gr.addColorStop(0, fill); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill(); g.restore(); };
    band(0, ey, "#f7cb6b", "rgba(247,203,107,.22)"); band(ey, h, "#ff4d6d", "rgba(255,77,109,.16)");
    const lanes = [];                                                          // label lanes: close markers stack their tags instead of overlapping
    D._marks.filter((m) => m.ts <= R.pos).forEach((m) => { const x = X(m.ts), y = Y(m.price), col = KC[m.kind]; g.strokeStyle = col; g.globalAlpha = .35; g.lineWidth = 1; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, mt + ph); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = "#0b0906"; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 4.8, 0, 7); g.fill();
      const lab = KL[m.kind], tw = g.measureText(lab).width + 10, lx = Math.min(Math.max(x - tw / 2, ml), ml + pw - tw);
      let ln = 0; while (lanes[ln] != null && lanes[ln] > lx - 3) ln++; lanes[ln] = lx + tw;
      const up = y > mt + ph / 2, ly = Math.min(Math.max(up ? y - 18 - ln * 18 : y + 18 + ln * 18, mt + 8), mt + ph - 8);
      g.fillStyle = "rgba(11,9,6,.9)"; rr(g, lx, ly - 8, tw, 16, 8); g.fill(); g.strokeStyle = col; g.lineWidth = 1; g.stroke(); g.fillStyle = col; g.textAlign = "center"; g.fillText(lab, lx + tw / 2, ly + .5); });
    const hx = X(R.pos), hy = Y(S.price); g.strokeStyle = "rgba(226,195,140,.8)"; g.lineWidth = 1.4; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(hx, mt - 2); g.lineTo(hx, mt + ph); g.stroke(); g.setLineDash([]);
    g.shadowColor = "#e2c38c"; g.shadowBlur = 10; g.fillStyle = "#ffffff"; g.beginPath(); g.arc(hx, hy, 4.2, 0, 7); g.fill(); g.shadowBlur = 0;
    { const txt = D.supply ? compact(S.price * D.supply) : priceFmt(S.price), tw = Math.min(mr - 1, g.measureText(txt).width + 8), ty = hy; g.fillStyle = S.price >= D.entry ? "#ff9752" : "#ff5c7a"; rr(g, ml + pw + 1, ty - 8, tw, 16, 3); g.fill(); g.fillStyle = "#1a1204"; g.textAlign = "left"; g.fillText(txt, ml + pw + 5, ty + .5); }
    g.fillStyle = "rgba(238,229,210,.40)"; g.textAlign = "center"; for (let i = 0; i <= 3; i++) { const t = R.t0 + (R.t1 - R.t0) * i / 3; g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center"; g.fillText(hhmm(t), ml + pw * i / 3 + (i === 0 ? 0 : i === 3 ? 0 : 0), h - 7); }
    if (D.synthetic) { g.fillStyle = "rgba(255,128,43,.9)"; g.textAlign = "center"; g.fillText("no price history was saved for this trade", ml + pw / 2, mt + ph / 2); }
  }
  function drawWindow(bal) {
    const c = $("#rpc"); if (!c) return; const k = setup(c, innerHeight < 700 ? 170 : 214); if (!k) return; const { g, w, h } = k;
    const ml = 6, mr = 52, mt = 14, mb = 20; R.ml = ml; R.mr = mr; const pw = w - ml - mr, ph = h - mt - mb;
    const vals = R.pts.map((p) => p[1]); let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || hi * 0.02; lo -= pad; hi += pad;
    const X = (t) => ml + pw * ((t - R.t0) / (R.t1 - R.t0)), Y = (v) => mt + ph * (1 - (v - lo) / (hi - lo));
    g.font = "600 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); g.strokeStyle = "rgba(214,168,90,.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke(); g.fillStyle = "rgba(238,229,210,.42)"; g.textAlign = "left"; g.fillText(money(v, 0), ml + pw + 6, y); }
    const sy = Y(R.start); g.setLineDash([4, 4]); g.strokeStyle = "rgba(218,177,107,.5)"; g.beginPath(); g.moveTo(ml, sy); g.lineTo(ml + pw, sy); g.stroke(); g.setLineDash([]);
    g.lineJoin = "round"; g.strokeStyle = "rgba(238,229,210,.22)"; g.lineWidth = 1.5; g.beginPath(); R.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();
    const cur = R.pts.filter((p) => p[0] <= R.pos).map((p) => [X(p[0]), Y(p[1])]); cur.push([X(R.pos), Y(bal)]);
    const path = () => { g.beginPath(); cur.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    const band = (y0, y1, col, fill) => { g.save(); g.beginPath(); g.rect(ml, y0, pw, y1 - y0); g.clip(); path(); g.strokeStyle = col; g.lineWidth = 2.4; g.stroke(); g.lineTo(cur[cur.length - 1][0], mt + ph); g.lineTo(cur[0][0], mt + ph); g.closePath();
      const gr = g.createLinearGradient(0, mt, 0, mt + ph); gr.addColorStop(0, fill); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill(); g.restore(); };
    band(0, sy, "#f7cb6b", "rgba(247,203,107,.22)"); band(sy, h, "#ff4d6d", "rgba(255,77,109,.16)");
    for (const t of R.trades) { if (t.t_open > R.pos) continue; const x = X(t.t_open), y = Y(priceAt(R.pts, t.t_open)); g.fillStyle = "rgba(218,177,107,.8)"; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
      if (t.t_close && t.t_close <= R.pos) { const x2 = X(t.t_close), y2 = Y(priceAt(R.pts, t.t_close)), win = (t.pnl_usd || 0) >= 0; g.fillStyle = "#0b0906"; g.beginPath(); g.arc(x2, y2, 5.4, 0, 7); g.fill(); g.fillStyle = win ? "#f7cb6b" : "#ff4d6d"; g.beginPath(); g.arc(x2, y2, 4, 0, 7); g.fill(); } }
    const hx = X(R.pos); g.strokeStyle = "rgba(226,195,140,.8)"; g.lineWidth = 1.4; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(hx, mt - 2); g.lineTo(hx, mt + ph); g.stroke(); g.setLineDash([]);
    g.shadowColor = "#e2c38c"; g.shadowBlur = 10; g.fillStyle = "#ffffff"; g.beginPath(); g.arc(hx, Y(bal), 4.2, 0, 7); g.fill(); g.shadowBlur = 0;
    { const txt = money(bal, 0), tw = Math.min(mr - 1, g.measureText(txt).width + 8), ty = Y(bal); g.fillStyle = bal >= R.start ? "#ff9752" : "#ff5c7a"; rr(g, ml + pw + 1, ty - 8, tw, 16, 3); g.fill(); g.fillStyle = "#1a1204"; g.textAlign = "left"; g.fillText(txt, ml + pw + 5, ty + .5); }
    g.fillStyle = "rgba(238,229,210,.40)"; for (let i = 0; i <= 3; i++) { const t = R.t0 + (R.t1 - R.t0) * i / 3; g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center"; g.fillText(hhmm(t), ml + pw * i / 3, h - 7); }
  }

  // ---------- steps ----------
  const layerDot = (p) => `<i class="ld ${p == null ? "na" : p ? "ok" : "no"}"></i>`;
  function stepHtml(D, s, i) {
    const col = s.bot === "desk" ? "#8e8e93" : botColor(s.bot), p = (v) => (v == null ? null : priceFmt(v)), mc = (v) => (D.supply && v != null ? " · mcap " + compact(v * D.supply) : "");
    let title = "", det = "";
    if (s.bot === "scanner") { title = "Saw it" + (s.src ? ` · ${esc(SRC[s.src] || s.src)}` : ""); det = [s.liq != null ? "liquidity " + compact(s.liq) : null, s.top10 != null ? "top 10 hold " + s.top10.toFixed(0) + "%" : null, s.age_min != null ? "pool " + s.age_min.toFixed(1) + " min old" : null, s.holders != null ? s.holders + " holders" : null, s.h1 != null ? "1h " + pct(s.h1, 0) : null].filter(Boolean).join(" · ");
      det = (s.pass ? "Passed the first filter. " : `Killed: ${esc(s.reason || "filter")}. `) + det; }
    else if (s.bot === "analyst") { title = s.pass ? `Passed · score ${s.score}/100` : `Rejected${s.reason ? " · " + esc(s.reason) : ""}`;
      const parts = [["alive", s.alive], ["organic", s.organic], ["flush", s.flush]].filter((x) => x[1] != null).map((x) => `${x[0]} ${(+x[1]).toFixed(2)}`);
      det = `<div class="lay">${(s.layers || []).map((l) => `<span class="lc">${layerDot(l.pass)}<b>${esc(l.name)}</b> ${esc(l.value || "")}</span>`).join("")}</div><div class="sub2">${[parts.join(" · "), s.social != null ? "social +" + s.social : null, s.insiders != null ? "insiders " + (+s.insiders).toFixed(1) + "%" : null, s.bundled != null ? s.bundled + " bundled" : null].filter(Boolean).join(" · ")}</div>`; }
    else if (s.bot === "brain") { title = `Sized the bet · ${money(s.usd, 0)}`; det = [s.pct_of_cash != null ? s.pct_of_cash + "% of cash" : null, s.cap === "ticket" ? "capped by the max ticket" : s.cap === "pool" ? "capped by pool depth" : null, s.score != null ? "score " + s.score : null].filter(Boolean).join(" · "); }
    else if (s.bot === "executor" && s.kind === "buy") { title = `Bought · ${money(s.fill, 2)}`; const ck = s.checks && s.checks.some((x) => x != null) ? ` · checks ${["screen", "api", "chain"].map((n, j) => n + (s.checks[j] == null ? " –" : s.checks[j] ? " ✓" : " ✗")).join(", ")}` : "";
      det = `at ${p(s.price)}${mc(s.price)}${s.tokens ? " · " + num(s.tokens) + " tokens" : ""}${s.fee != null ? " · fee " + money(s.fee) : ""}${ck}`; }
    else if (s.kind === "breakeven") { title = "Moved the stop to break-even"; det = "The stop now sits at the entry price plus fees, so a pullback can't turn this into a loss."; }
    else if (s.kind === "moonbag_on") { title = "Kept a moonbag"; det = `${s.tokens ? num(s.tokens) + " tokens" : "A slice"} stay in with a wider trail while the rest is sold.`; }
    else if (SELL.has(s.kind)) { const lab = { tp: "Take profit", trail: "Trailing stop", stop: "Stop hit", manual: "You sold", exit: "Exit", moonbag: "Moonbag sold" }[s.kind];
      title = `${lab}${s.pct != null ? " · sold " + Math.round(s.pct) + "%" : ""}`; det = [s.price != null ? "at " + p(s.price) + mc(s.price).replace(" · ", " · ") : null, s.pnl_usd != null ? `<b class="${s.pnl_usd >= 0 ? "up" : "down"}">${signed(s.pnl_usd)}${s.pnl_pct != null ? " (" + pct(s.pnl_pct, 0) + ")" : ""}</b>` : null, s.kind === "exit" && s.reason ? esc(s.reason) : null].filter(Boolean).join(" · "); }
    else if (s.kind === "result") { title = `Closed · ${D.pnl_usd != null ? signed(D.pnl_usd) : ""}${D.pnl_pct != null ? " (" + pct(D.pnl_pct, 0) + ")" : ""}`; det = `Held ${dur(D.t_close - D.t_open)}${D.reason ? " · exit: " + esc(D.reason) : ""}`; }
    return `<div class="rpstep" data-i="${i}" data-t="${s.ts}" style="--c:${col}"><i class="dot"></i><div class="sb"><div class="sh"><span class="bn">${esc(botName(s.bot))}</span><span class="st">${clock(s.ts)}</span></div><div class="stt">${title}</div><div class="det">${det}</div></div></div>`;
  }
  const winCardHtml = (t, i) => `<button class="rpwc" data-i="${i}" data-rp="trade" data-id="${t.id}"><div class="sb"><div class="sh"><span class="bn">${esc(t.symbol || t.mint.slice(0, 4))}${t.starship ? " ✦" : ""}</span><span class="st">${hhmm(t.t_open)}${t.t_close ? " → " + hhmm(t.t_close) : ""}</span></div>
    <div class="stt">Bought ${money(t.size, 0)}</div><div class="det"><span class="res">${t.t_close ? `<b class="${(t.pnl_usd || 0) >= 0 ? "up" : "down"}">${signed(t.pnl_usd)} (${pct(t.pnl_pct, 0)})</b> · ${esc(t.reason || "")} · ${dur(t.t_close - t.t_open)}` : "still holding"}</span></div></div><span class="wgo">▶</span></button>`;

  // ---------- summaries ----------
  function tradeSummary(D) {
    const px = D._px, inT = px.filter((p) => p[0] >= D.t_open && (!D.t_close || p[0] <= D.t_close)), pk = inT.length ? Math.max(...inT.map((p) => p[1]), D.entry) : D.entry;
    const open = !D.t_close, last = px[px.length - 1][1], after = D.t_close ? px.filter((p) => p[0] > D.t_close) : [];
    const S = stateAt(D, open ? R.t1 : D.t_close), tot = open ? S.total : D.pnl_usd != null ? D.pnl_usd : S.total, up = tot >= 0;
    const pctv = open ? S.chg : D.pnl_pct, ex = D.exit || last;
    const fees = D.steps.reduce((a, s) => a + (s.fee || 0), 0);
    const mm = (v) => (D.supply ? " · " + compact(v * D.supply) : "");
    const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    return `<div class="rpsumc ${up ? "win" : "loss"}"><div class="sh1">${open ? "So far" : "Result"}</div><div class="sbig ${up ? "up" : "down"}">${signed(tot)}<small>${pct(pctv, 1)}</small></div>
      <div class="sgrid">${row("Entry", priceFmt(D.entry) + mm(D.entry))}${row(open ? "Now" : "Exit", priceFmt(ex) + mm(ex))}${row("Peak", `${priceFmt(pk)}${mm(pk)} <i class="up">${pct(100 * (pk / D.entry - 1), 0)}</i>`)}
      ${row("Held", open ? dur(R.t1 - D.t_open) + " so far" : dur(D.t_close - D.t_open))}${row("Size", money(D.size, 2))}${row("Fees", fees ? money(fees, 2) : "–")}${D.reason ? row("Exit", esc(D.reason)) : ""}
      ${after.length ? row("10 min later", pct(100 * (after[after.length - 1][1] / ex - 1), 0) + " vs exit") : ""}</div>
      <div class="sbtn"><button class="btn" data-rp="again">↻ Replay again</button><button class="btn" data-rp="coin" data-m="${esc(D.mint)}">Open coin</button></div></div>`;
  }
  function windowSummary() {
    const ts = R.trades.filter((t) => t.t_close), net = ts.reduce((a, t) => a + (t.pnl_usd || 0), 0), w = ts.filter((t) => (t.pnl_usd || 0) > 0);
    const best = ts.slice().sort((a, b) => (b.pnl_usd || 0) - (a.pnl_usd || 0))[0], worst = ts.slice().sort((a, b) => (a.pnl_usd || 0) - (b.pnl_usd || 0))[0];
    const bal = R.pts[R.pts.length - 1][1], up = net >= 0, row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    return `<div class="rpsumc ${up ? "win" : "loss"}"><div class="sh1">${esc(R.W.title)}</div><div class="sbig ${up ? "up" : "down"}">${signed(net)}<small>${ts.length} closed trades</small></div>
      <div class="sgrid">${row("Win rate", ts.length ? Math.round(100 * w.length / ts.length) + "% (" + w.length + "/" + ts.length + ")" : "–")}${row("Balance", money(R.start, 0) + " → " + money(bal, 0))}${best ? row("Best", esc(best.symbol) + " " + signed(best.pnl_usd)) : ""}${worst ? row("Worst", esc(worst.symbol) + " " + signed(worst.pnl_usd)) : ""}</div>
      <div class="sbtn"><button class="btn" data-rp="again">↻ Replay again</button><button class="btn" data-rp="back">All replays</button></div></div>`;
  }

  // ---------- events ----------
  function onClick(e) {
    const t = e.target.closest("[data-rp]"); const st = e.target.closest(".rpstep");
    if (!t && st && R && R.view === "trade") { R.pos = Math.min(R.t1, +st.dataset.t); R.playing = false; frame(true); return; }
    if (!t) return; const a = t.dataset.rp;
    if (a === "close") close();
    else if (a === "back") { if (R.view === "trade" && R.from === "window") { stop(); R.view = "window"; openWindow(R.W.id); } else { stop(); R.sumOn = false; pick(); } }
    else if (a === "trade") { const from = R.view === "window" ? "window" : null; stop(); R.sumOn = false; openTrade(+t.dataset.id, from); }
    else if (a === "win") { R.sumOn = false; openWindow(t.dataset.w); }
    else if (a === "toggle") { if (R.playing) { R.playing = false; syncPlay(); } else play(); }
    else if (a === "prev") { R.playing = false; jump(-1); }
    else if (a === "next") { R.playing = false; jump(1); }
    else if (a === "again") { R.pos = R.t0; R.lastStep = -2; R.sumOn = false; $("#rpsum").innerHTML = ""; R.sc.scrollTo({ top: 0 }); play(); }
    else if (a === "steps") {
      const box = $("#rpsteps"), more = $("#rpMore"); if (!box) return; const lab = t.id === "rpLab";
      if (lab && !R.curEv) return; box.hidden = lab ? false : !box.hidden; if (more) more.classList.toggle("open", !box.hidden);
      if (lab && R.curEv) { const el = $(`${R.view === "trade" ? ".rpstep" : ".rpwc"}[data-i="${R.curEv.si}"]`), st = $(".rpstick");
        if (el && R.sc) { R.playing = false; syncPlay(); R.sc.scrollTo({ top: Math.max(0, el.offsetTop - (st ? st.offsetHeight : 0) - 6), behavior: "smooth" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); } }
    }
    else if (a === "speed") { R.speed = +t.dataset.s; root.querySelectorAll(".spd2 button").forEach((b) => b.classList.toggle("on", +b.dataset.s === R.speed)); }
    else if (a === "coin") { const m = t.dataset.m; close(); B.openCoin(m); }
  }
  return { init, open, close, isOpen };
})();
