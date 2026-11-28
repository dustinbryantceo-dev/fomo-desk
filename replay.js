// replay.js - Yobel Replay, SIMPLE (MEM-28, Dustin 15:36: "take off the replay animations; simple and easy is good").
// A static chart: the price line with BUY / TP / TRAIL / STOP / EXIT / MOONBAG markers, a short list of what happened (CET) and the P&L.
// Optional scrubber (drag to read any moment). No playback, no easing, no animated labels, no effects. Local only: nothing written, nothing sent.
// Data = what the desk already publishes: replay/index + replay/<id> (price line + steps), chart/1D|1W|ALL (balance).
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
  const KC = { buy: "#f7c967", tp: "#f7cc6e", trail: "#e0bd82", stop: "#ff4d6d", manual: "#ddb775", exit: "#ddb775", moonbag_on: "#e2c38c", moonbag: "#e2c38c", breakeven: "#ffd60a" };
  const KL = { buy: "BUY", tp: "TP", trail: "TRAIL", stop: "STOP", manual: "EXIT", exit: "EXIT", moonbag_on: "MOON", breakeven: "BE" };
  const SRC = { migration: "migration feed", near_grad: "near-graduation feed", x_trend: "X trend", jup_recent: "Jupiter feed", launchlab: "LaunchLab", smart_money: "smart-money wallets", helius_pool: "new-pool stream" };
  const SELL = new Set(["tp", "trail", "stop", "manual", "exit", "moonbag"]);
  const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

  function init(bridge) { B = bridge; }
  const isOpen = () => !!root;

  // ---------- data ----------
  async function index() { try { await B.getFile("replay/index"); } catch {} const ix = B.S.files["replay/index"]; return (ix && ix.trades) || []; }
  async function loadTrade(id) { try { await B.getFile("replay/" + id); } catch {} return B.S.files["replay/" + id] || null; }
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
    D._hi = Math.max(...px.map((p) => p[1]), D.entry); D._lo = Math.min(...px.map((p) => p[1]), D.entry);
    return D;
  }
  // position at time t, derived from the steps (stateless: the scrubber can go anywhere)
  function stateAt(D, t) {
    const price = priceAt(D._px, t); let rem = D.tokens, realized = 0;
    for (const s of D._steps) if (s.ts <= t && SELL.has(s.kind) && s.tokens) { rem -= s.tokens; realized += s.pnl_usd || 0; }
    rem = Math.max(0, rem); const entered = t >= D.t_open, closed = !!D.t_close && t >= D.t_close;
    const cost = D.size * (D.tokens ? rem / D.tokens : 0), unreal = entered && !closed ? rem * price - cost : 0;
    return { price, total: entered ? (closed && D.pnl_usd != null ? D.pnl_usd : realized + unreal) : 0, entered, closed, chg: entered ? 100 * (price / D.entry - 1) : null };
  }
  const mcap = (D, p) => (D.supply && p != null ? p * D.supply : null);

  // ---------- shell ----------
  function mount() {
    if (root) return;
    root = document.createElement("div"); root.id = "rpv"; root.className = "rpv"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Replay");
    document.body.appendChild(root); document.body.classList.add("rp-open");
    history.pushState({ d: B.S.stack.length, rp: 1 }, "");
    root.addEventListener("click", onClick); root.addEventListener("input", onInput);
  }
  function close(fromPop) {
    if (!root) return; root.remove(); root = null; document.body.classList.remove("rp-open"); R = null;
    if (!fromPop && history.state && history.state.rp) history.back();
  }
  addEventListener("popstate", () => { if (root) close(true); });
  addEventListener("resize", () => { if (root && R && R.draw) R.draw(); });
  const bar = (title, sub, back) => `<div class="rpbar">${back ? `<button class="rpbk" data-rp="${back}" aria-label="Back">‹ Back</button>` : `<span class="rpbk ph"></span>`}<div class="rpt"><b>${esc(title)}</b>${sub ? `<span>${sub}</span>` : ""}</div><button class="rpx" data-rp="close" aria-label="Close replay">✕</button></div>`;
  const loading = (t) => `<div class="rpscroll"><div class="rpload"><i></i>${t}</div></div>`;

  // ---------- picker ----------
  async function open(opts = {}) {
    if (!B.S.state) return;
    mount(); R = { view: "pick" };
    root.innerHTML = bar("Replay", "") + loading("Loading replay data…");
    const trades = await index(); if (!root) return;
    R.all = trades;      // every published trade (never narrowed)
    if (opts.mint) { const t = trades.find((x) => x.mint === opts.mint); if (t) return openTrade(t.id); }
    if (opts.id) return openTrade(opts.id);
    pick();
  }
  // a trade belongs to a window if it closed inside it (realized P&L) or is still open (it opened inside the window)
  const inWindow = (t, t0, t1) => (t.t_close ? t.t_close >= t0 && t.t_close <= t1 : t.t_open >= t0 && t.t_open <= t1);
  function nightStart() {
    const f = B.S.files, c = f["chart/LIVE"] || f["chart/" + B.S.range] || f["chart/1D"] || Object.values(f).find((v) => v && typeof v === "object" && v.night_start) || {};
    return c.night_start || 0;
  }
  function windows(trades) {
    const now = Date.now() / 1000; let ns = nightStart(); if (!ns || ns > now || now - ns > 90000) ns = now - 12 * 3600;
    const mk = (id, title, sub, t0) => { const ts = trades.filter((t) => inWindow(t, t0, now)), done = ts.filter((t) => t.t_close);
      return { id, title, sub, t0, t1: now, n: ts.length, net: done.reduce((a, t) => a + (t.pnl_usd || 0), 0), wins: done.filter((t) => (t.pnl_usd || 0) > 0).length, loss: done.filter((t) => (t.pnl_usd || 0) < 0).length, done: done.length }; };
    return [mk("night", "Last night", `since ${hhmm(ns)} ${zone(ns)}`, ns), mk("24h", "Last 24 hours", "last 24 h", now - 86400), mk("3d", "Last 3 days", "last 72 h", now - 3 * 86400)];
  }
  function pick() {
    R.view = "pick"; R.draw = null; const trades = R.all;
    if (!trades.length) { root.innerHTML = bar("Replay", "") + `<div class="rpscroll"><div class="rpempty2"><b>Nothing to replay yet</b>Replays appear here as soon as the desk has published its first trades. If the desk just restarted, give it a minute.</div></div>`; return; }
    const ws = windows(trades);
    root.innerHTML = bar("Replay", "look back at a window or a trade") + `<div class="rpscroll">
      <h3 class="rph">A window</h3>
      <div class="rpwins">${ws.map((w) => `<button class="rpwin glass" data-rp="win" data-w="${w.id}" ${w.n ? "" : "disabled"}><div class="wt">${esc(w.title)}<small>${esc(w.sub)}</small></div>
        <div class="wn">${w.n ? `${w.n} trade${w.n > 1 ? "s" : ""} · ${w.done ? `<b class="${w.net >= 0 ? "up" : "down"}">${signed(w.net)}</b> · ${w.wins} won · ${w.loss} lost` : "in progress"}` : "no trades"}</div><span class="wgo">›</span></button>`).join("")}</div>
      <h3 class="rph">A trade</h3>
      <div class="rptl glass">${trades.map((t) => { const open = !t.t_close, up = (t.pnl_usd || 0) >= 0;
        return `<button class="rptr" data-rp="trade" data-id="${t.id}"><div class="ic">${esc((t.symbol || "?").slice(0, 1))}</div><div class="tx"><div class="t1">${esc(t.symbol || t.mint.slice(0, 4))}${t.starship ? ' <span class="tag ss">✦</span>' : ""}${open ? ' <span class="tag live">OPEN</span>' : ""}</div>
          <div class="t2">${stamp(t.t_open)} ${zone(t.t_open)} · ${open ? "holding" : dur(t.t_close - t.t_open)} · ${money(t.size, 0)} in${t.reason ? " · " + esc(t.reason) : ""}</div></div>
          <div class="rv">${open ? "" : `<b class="${up ? "up" : "down"}">${signed(t.pnl_usd)}</b><small class="${up ? "up" : "down"}">${pct(t.pnl_pct, 0)}</small>`}</div><span class="wgo">›</span></button>`; }).join("")}</div></div>`;
  }

  // ---------- one trade ----------
  async function openTrade(id, from) {
    R = Object.assign(R || {}, { view: "trade", from: from || null, draw: null });
    root.innerHTML = bar("Trade", "", "back") + loading("Loading the trade…");
    const D = await loadTrade(id); if (!root || R.view !== "trade") return;
    if (!D) { root.innerHTML = bar("Trade", "", "back") + `<div class="rpscroll"><div class="rpempty2"><b>This trade isn't published</b>It is too old or the desk hasn't published it yet.</div></div>`; return; }
    prep(D); R.D = D; R.t0 = D.w0; R.t1 = D.w1; R.pos = D.w1;
    const events = D._steps.filter((s) => KL[s.kind] || s.kind === "moonbag" || s.kind === "result");
    root.innerHTML = bar(D.symbol || "Trade", `${stamp(D.t_open)} ${zone(D.t_open)}${D.t_close ? "" : " · still open"}${D.starship ? " · ✦" : ""}`, "back") + `<div class="rpscroll" id="rpscroll">
      ${tradeSummary(D)}
      <div class="rps-chart"><canvas id="rpc" aria-label="Price chart"></canvas></div>
      <div class="rps-read" id="rpRead"></div>
      <input class="rps-scrub" id="rpScrub" type="range" min="0" max="1000" value="1000" aria-label="Look at any moment">
      <div class="rps-key"><i class="ky buy"></i>Buy <i class="ky tp"></i>Take profit / trail <i class="ky stop"></i>Stop <i class="ky moon"></i>Moonbag <i class="ky ex"></i>Exit</div>
      <h3 class="rph">What happened</h3>
      <div class="rps-ev">${events.map((s) => evRow(D, s)).join("")}</div>
      <button class="rpmore" data-rp="steps">What the bots checked before buying · ${D._steps.filter((s) => !(KL[s.kind] || s.kind === "moonbag" || s.kind === "result")).length} steps <span>▾</span></button>
      <div class="rpsteps" id="rpsteps" hidden>${D._steps.map((s, i) => stepHtml(D, s, i)).filter((_, i) => !(KL[D._steps[i].kind] || D._steps[i].kind === "moonbag" || D._steps[i].kind === "result") || D._steps[i].kind === "buy").join("")}</div>
      <div class="sbtn" style="padding:12px 2px 40px"><button class="btn" data-rp="coin" data-m="${esc(D.mint)}">Open coin</button></div></div>`;
    R.draw = () => { drawTrade(D); read(); }; R.draw();
  }
  function evRow(D, s) {
    const p = s.kind === "buy" ? D.entry : s.price, mc = D.supply && p != null ? ` · mcap ${compact(p * D.supply)}` : ""; let at = p != null ? ` · ${priceFmt(p)}${mc}` : "";
    const col = KC[s.kind] || "#8e8e93"; let title = "", right = "";
    if (s.kind === "buy") { title = `Bought ${money(D.size, 0)}`; }
    else if (s.kind === "tp") { title = `Take profit${s.pct != null ? " · sold " + Math.round(s.pct) + "%" : ""}`; }
    else if (s.kind === "trail") { title = `Trailing stop${s.pct != null ? " · sold " + Math.round(s.pct) + "%" : ""}`; }
    else if (s.kind === "stop") { title = "Stop hit"; }
    else if (s.kind === "manual") { title = "Sold by you"; }
    else if (s.kind === "exit") { title = `Exit${s.reason ? " · " + esc(s.reason) : ""}`; }
    else if (s.kind === "moonbag_on") { title = "Moonbag kept"; }
    else if (s.kind === "moonbag") { title = "Moonbag sold"; }
    else if (s.kind === "breakeven") { title = "Stop moved to break-even"; }
    else if (s.kind === "result") { title = `Closed · held ${dur(D.t_close - D.t_open)}`; right = D.pnl_usd != null ? `<b class="${D.pnl_usd >= 0 ? "up" : "down"}">${signed(D.pnl_usd)}</b>` : ""; at = ""; }
    if (SELL.has(s.kind) && s.pnl_usd != null) right = `<b class="${s.pnl_usd >= 0 ? "up" : "down"}">${signed(s.pnl_usd)}</b>`;
    return `<div class="rps-row" style="--c:${col}"><i class="dot"></i><span class="tm">${clock(s.ts)}</span><span class="tx"><b>${title}</b><small>${at.replace(/^ · /, "")}</small></span><span class="rv">${right}</span></div>`;
  }
  function read() {
    const D = R.D, el = $("#rpRead"); if (!D || !el) return; const S = stateAt(D, R.pos), m = mcap(D, S.price);
    el.innerHTML = `<span>${clock(R.pos)} ${zone(R.pos)}</span><span>${m != null ? compact(m) + " mcap" : priceFmt(S.price)}</span>${S.entered ? `<b class="${S.total >= 0 ? "up" : "down"}">${signed(S.total)}</b>` : "<span>before entry</span>"}`;
  }
  function setup(c, h) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = c.clientWidth; if (!w) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + "px"; }
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return { g, w, h };
  }
  function drawTrade(D) {
    const c = $("#rpc"); if (!c) return; const k = setup(c, innerHeight < 700 ? 200 : 250); if (!k) return; const { g, w, h } = k;
    const ml = 6, mr = 50, mt = 18, mb = 20, pw = w - ml - mr, ph = h - mt - mb;
    const padv = (D._hi - D._lo) * 0.14 || D._hi * 0.1, lo = Math.max(D._lo - padv, 0), hi = D._hi + padv;
    const X = (t) => ml + pw * ((t - R.t0) / (R.t1 - R.t0)), Y = (p) => mt + ph * (1 - (p - lo) / (hi - lo));
    g.font = "600 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 3; i++) { const p = lo + (hi - lo) * i / 3, y = Y(p); g.strokeStyle = "rgba(214,168,90,.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke();
      g.fillStyle = "rgba(238,229,210,.45)"; g.textAlign = "left"; g.fillText(D.supply ? compact(p * D.supply) : priceFmt(p).replace(/0+$/, ""), ml + pw + 6, y); }
    const x0 = X(D.t_open), x1 = X(D.t_close || R.t1); g.fillStyle = "rgba(247,204,110,.06)"; g.fillRect(x0, mt, Math.max(2, x1 - x0), ph);      // the time we held it
    const ey = Y(D.entry); g.setLineDash([4, 4]); g.strokeStyle = "rgba(218,177,107,.6)"; g.beginPath(); g.moveTo(ml, ey); g.lineTo(ml + pw, ey); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(218,177,107,.9)"; g.textAlign = "left"; g.fillText("ENTRY", ml + 2, ey - 8);
    const pts = D._px.map((p) => [X(p[0]), Y(p[1])]), path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    g.lineJoin = "round"; g.lineCap = "round";
    const band = (y0, y1, col, fill) => { g.save(); g.beginPath(); g.rect(ml, y0, pw, y1 - y0); g.clip(); path(); g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); g.lineTo(pts[pts.length - 1][0], mt + ph); g.lineTo(pts[0][0], mt + ph); g.closePath();
      const gr = g.createLinearGradient(0, mt, 0, mt + ph); gr.addColorStop(0, fill); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill(); g.restore(); };
    band(0, ey, "#f7cb6b", "rgba(247,203,107,.2)"); band(ey, h, "#ff4d6d", "rgba(255,77,109,.14)");
    const lanes = [];     // close markers stack their tags instead of overlapping
    D._marks.forEach((m) => { const x = X(m.ts), y = Y(m.price), col = KC[m.kind]; g.strokeStyle = col; g.globalAlpha = .3; g.lineWidth = 1; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, mt + ph); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = "#0b0906"; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 4.8, 0, 7); g.fill();
      const lab = KL[m.kind], tw = g.measureText(lab).width + 10, lx = Math.min(Math.max(x - tw / 2, ml), ml + pw - tw);
      let ln = 0; while (lanes[ln] != null && lanes[ln] > lx - 3) ln++; lanes[ln] = lx + tw; const ly = mt + 2 + ln * 15;
      g.fillStyle = col; rr(g, lx, ly, tw, 13, 3); g.fill(); g.fillStyle = "#1a1204"; g.textAlign = "center"; g.fillText(lab, lx + tw / 2, ly + 7); });
    if (R.pos < R.t1 - 0.5) { const cx = X(R.pos), cy = Y(priceAt(D._px, R.pos)); g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1.2; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(cx, mt - 4); g.lineTo(cx, mt + ph); g.stroke(); g.setLineDash([]); g.fillStyle = "#ffffff"; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); }
    g.fillStyle = "rgba(238,229,210,.42)"; for (let i = 0; i <= 3; i++) { const t = R.t0 + (R.t1 - R.t0) * i / 3; g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center"; g.fillText(hhmm(t), ml + pw * i / 3, h - 7); }
  }
  function onInput(e) { if (e.target.id !== "rpScrub" || !R || !R.draw) return; R.pos = R.t0 + (R.t1 - R.t0) * (+e.target.value / 1000); R.draw(); }

  // ---------- one window: the balance line, trades as dots ----------
  async function openWindow(wid, from) {
    const w = windows(R.all).find((x) => x.id === wid); if (!w) return;
    R.view = "winload"; root.innerHTML = bar(w.title, "", "back") + loading("Loading the balance line…");
    await Promise.allSettled([B.getFile(w.t1 - w.t0 <= 86400 ? "chart/1D" : "chart/1W"), B.getFile("chart/ALL")]);
    if (!root || R.view !== "winload") return;      // the user went back meanwhile
    const trades = R.all.filter((t) => inWindow(t, w.t0, w.t1)).sort((a, b) => a.t_open - b.t_open);
    const span = w.t1 - w.t0, ch = B.S.files[span <= 86400 ? "chart/1D" : "chart/1W"] || {}, inWin = (c) => ((c && c.points) || []).filter((p) => p[0] >= w.t0 - 600);
    let pts = inWin(ch); if (pts.length < 2) pts = inWin(B.S.files["chart/ALL"]);
    R = Object.assign(R, { view: "window", W: w, trades, from: from || null, draw: null });
    if (pts.length < 2) { root.innerHTML = bar(w.title, "", "back") + `<div class="rpscroll"><div class="rpempty2"><b>No balance history here yet</b>The balance line for this window isn't published yet.</div></div>`; return; }
    R.pts = pts; R.start = pts[0][1]; R.t0 = Math.max(w.t0, pts[0][0]); R.t1 = pts[pts.length - 1][0]; R.pos = R.t1;
    root.innerHTML = bar(w.title, `${stamp(R.t0)} → ${hhmm(R.t1)} ${zone(R.t1)}`, "back") + `<div class="rpscroll" id="rpscroll">
      ${windowSummary()}
      <div class="rps-chart"><canvas id="rpc" aria-label="Balance chart"></canvas></div>
      <div class="rps-read" id="rpRead"></div>
      <input class="rps-scrub" id="rpScrub" type="range" min="0" max="1000" value="1000" aria-label="Look at any moment">
      <h3 class="rph">Trades in this window · ${trades.length}</h3>
      <div class="rps-wl">${trades.slice().reverse().map(winCardHtml).join("")}</div><div class="rppad"></div></div>`;
    R.draw = () => { drawWindow(); readWin(); }; R.draw();
  }
  function readWin() {
    const el = $("#rpRead"); if (!el) return; const bal = priceAt(R.pts, R.pos), net = bal - R.start;
    el.innerHTML = `<span>${clock(R.pos)} ${zone(R.pos)}</span><span>${money(bal)}</span><b class="${net >= 0 ? "up" : "down"}">${signed(net)}</b>`;
  }
  function drawWindow() {
    const c = $("#rpc"); if (!c) return; const k = setup(c, innerHeight < 700 ? 200 : 250); if (!k) return; const { g, w, h } = k;
    const ml = 6, mr = 52, mt = 14, mb = 20, pw = w - ml - mr, ph = h - mt - mb;
    const vals = R.pts.map((p) => p[1]); let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.12 || hi * 0.02; lo -= pad; hi += pad;
    const X = (t) => ml + pw * ((t - R.t0) / (R.t1 - R.t0)), Y = (v) => mt + ph * (1 - (v - lo) / (hi - lo));
    g.font = "600 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); g.strokeStyle = "rgba(214,168,90,.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(ml, y); g.lineTo(ml + pw, y); g.stroke(); g.fillStyle = "rgba(238,229,210,.45)"; g.textAlign = "left"; g.fillText(money(v, 0), ml + pw + 6, y); }
    const sy = Y(R.start); g.setLineDash([4, 4]); g.strokeStyle = "rgba(218,177,107,.55)"; g.beginPath(); g.moveTo(ml, sy); g.lineTo(ml + pw, sy); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(218,177,107,.9)"; g.textAlign = "left"; g.fillText("START", ml + 2, sy - 8);
    const pts = R.pts.map((p) => [X(p[0]), Y(p[1])]), path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    g.lineJoin = "round"; const band = (y0, y1, col, fill) => { g.save(); g.beginPath(); g.rect(ml, y0, pw, y1 - y0); g.clip(); path(); g.strokeStyle = col; g.lineWidth = 2.2; g.stroke(); g.lineTo(pts[pts.length - 1][0], mt + ph); g.lineTo(pts[0][0], mt + ph); g.closePath();
      const gr = g.createLinearGradient(0, mt, 0, mt + ph); gr.addColorStop(0, fill); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill(); g.restore(); };
    band(0, sy, "#f7cb6b", "rgba(247,203,107,.2)"); band(sy, h, "#ff4d6d", "rgba(255,77,109,.14)");
    for (const t of R.trades) { if (!t.t_close) continue; const x = X(Math.min(Math.max(t.t_close, R.t0), R.t1)), y = Y(priceAt(R.pts, t.t_close)), win = (t.pnl_usd || 0) >= 0;
      g.fillStyle = "#0b0906"; g.beginPath(); g.arc(x, y, 5.2, 0, 7); g.fill(); g.fillStyle = win ? "#f7cb6b" : "#ff4d6d"; g.beginPath(); g.arc(x, y, 3.8, 0, 7); g.fill(); }
    if (R.pos < R.t1 - 0.5) { const cx = X(R.pos); g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1.2; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(cx, mt - 4); g.lineTo(cx, mt + ph); g.stroke(); g.setLineDash([]); g.fillStyle = "#ffffff"; g.beginPath(); g.arc(cx, Y(priceAt(R.pts, R.pos)), 4, 0, 7); g.fill(); }
    g.fillStyle = "rgba(238,229,210,.42)"; for (let i = 0; i <= 3; i++) { const t = R.t0 + (R.t1 - R.t0) * i / 3; g.textAlign = i === 0 ? "left" : i === 3 ? "right" : "center"; g.fillText(hhmm(t), ml + pw * i / 3, h - 7); }
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
    <div class="stt">Bought ${money(t.size, 0)}</div><div class="det"><span class="res">${t.t_close ? `<b class="${(t.pnl_usd || 0) >= 0 ? "up" : "down"}">${signed(t.pnl_usd)} (${pct(t.pnl_pct, 0)})</b> · ${esc(t.reason || "")} · ${dur(t.t_close - t.t_open)}` : "still holding"}</span></div></div><span class="wgo">›</span></button>`;

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
      </div>`;
  }
  function windowSummary() {
    const ts = R.trades.filter((t) => t.t_close), net = ts.reduce((a, t) => a + (t.pnl_usd || 0), 0), w = ts.filter((t) => (t.pnl_usd || 0) > 0);
    const best = ts.slice().sort((a, b) => (b.pnl_usd || 0) - (a.pnl_usd || 0))[0], worst = ts.slice().sort((a, b) => (a.pnl_usd || 0) - (b.pnl_usd || 0))[0];
    const bal = R.pts[R.pts.length - 1][1], up = net >= 0, row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    return `<div class="rpsumc ${up ? "win" : "loss"}"><div class="sh1">${esc(R.W.title)}</div><div class="sbig ${up ? "up" : "down"}">${signed(net)}<small>${ts.length} closed trades</small></div>
      <div class="sgrid">${row("Win rate", ts.length ? Math.round(100 * w.length / ts.length) + "% (" + w.length + "/" + ts.length + ")" : "–")}${row("Balance", money(R.start, 0) + " → " + money(bal, 0))}${best ? row("Best", esc(best.symbol) + " " + signed(best.pnl_usd)) : ""}${worst ? row("Worst", esc(worst.symbol) + " " + signed(worst.pnl_usd)) : ""}</div>
      </div>`;
  }

  // ---------- events ----------
  function onClick(e) {
    const t = e.target.closest("[data-rp]"); if (!t) return; const a = t.dataset.rp;
    if (a === "close") close();
    else if (a === "back") { if (R.view === "trade" && R.from === "window") openWindow(R.W.id); else pick(); }
    else if (a === "trade") { const from = R.view === "window" ? "window" : null; openTrade(+t.dataset.id, from); }
    else if (a === "win") openWindow(t.dataset.w);
    else if (a === "steps") { const box = $("#rpsteps"), more = $("#rpMore") || t; if (!box) return; box.hidden = !box.hidden; t.classList.toggle("open", !box.hidden); }
    else if (a === "coin") { const m = t.dataset.m; close(); B.openCoin(m); }
  }
  return { init, open, close, isOpen };
})();
