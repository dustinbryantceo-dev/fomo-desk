// app.js - Pump Pilot, the desk on the iPhone (STEP 10, restyled 2026-11-15), hosting plan B (DECISIONS #26).
// Reads encrypted files from the public repo with desk-crypto.js, polls every 15 s (no SSE).
// FOMO links are only ever the strings links.py put into the data; this file never builds one.
(() => {
  const BASE = "https://raw.githubusercontent.com/dustinbryantceo-dev/fomo-desk/data";
  const POLL_S = 15, STALE_S = 60;
  const BOT_ORDER = ["scanner", "analyst", "brain", "executor", "risk"];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fomoLink = (u) => (typeof u === "string" && /^https:\/\/fomo\.family\//.test(u) ? u : null); // check only, never build
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- formatting (never a made-up number: null -> "–") ----------
  const money = (v, d = 2) => (v == null || isNaN(v) ? "–" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signedMoney = (v) => (v == null ? "–" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v, d = 2) => (v == null || isNaN(v) ? "–" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%");
  const compact = (v) => (v == null ? "–" : "$" + (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)));
  const priceFmt = (p) => { if (p == null) return "–"; if (p >= 1) return "$" + p.toFixed(4); const z = Math.max(0, -Math.floor(Math.log10(p)) - 1); return "$" + p.toFixed(Math.min(12, z + 4)); };
  const hm = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–");
  const hms = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–");
  const age = (ts) => { if (!ts) return "–"; const m = Math.max(0, (Date.now() / 1000 - ts) / 60); return m < 60 ? Math.round(m) + "m old" : m < 1440 ? Math.round(m / 60) + "h old" : Math.round(m / 1440) + "d old"; };
  const sym = (s, mint) => esc(s || (mint ? mint.slice(0, 4) + "…" : "?"));

  // ---------- data ----------
  const S = { dp: null, desk: null, ix: null, state: null, lastOk: 0, lastIxT: 0, err: null, files: {}, ver: {}, screenUrl: null, screenVer: null,
              tab: "home", stack: [], range: "LIVE", retryAt: 0, firstTry: true, loadingFile: {} };
  try { const c = JSON.parse(localStorage.getItem("desk.last") || "null"); if (c && c.state) { S.state = c.state; S.lastIxT = c.t; S.cached = true; } } catch {}

  async function getFile(name) {
    const v = S.ix && S.ix.files[name];
    if (!v) return null;
    if (S.ver[name] === v && S.files[name] !== undefined) return S.files[name];
    const w = await S.desk.get(name); S.files[name] = w.data; S.ver[name] = v; return w.data;
  }
  async function poll() {
    try {
      const ix = await S.desk.latest();
      S.ix = ix; S.state = ix.state; S.lastIxT = ix.t; S.lastOk = Date.now(); S.err = null;
      try { localStorage.setItem("desk.last", JSON.stringify({ t: ix.t, state: ix.state })); } catch {}
      if (Date.now() / 1000 - ix.t > STALE_S) S.err = "stale";
      await Promise.allSettled(["chart/" + S.range, "activity/0", "coins"].map(getFile));
      try { fxDiff(ix.state, S.files["activity/0"]); } catch {}
      if (ix.files.screen && ix.files.screen !== S.screenVer) loadScreen(ix.files.screen);
    } catch (e) { S.err = e.status === 404 || /no index/.test(e.message) ? "nodata" : "offline"; }
    S.firstTry = false; S.retryAt = Date.now() + POLL_S * 1000;
    render(true);
  }
  // Live screen: double buffered, the shown <img> only swaps after the new one decoded
  async function loadScreen(v) {
    try {
      const blob = await S.desk.screen(); const url = URL.createObjectURL(blob);
      const img = new Image(); img.src = url; await img.decode();
      const old = S.screenUrl; S.screenUrl = url; S.screenVer = v; paintScreen(); liveLabel(); if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
    } catch {}
  }
  function paintScreen() {
    const f = $("#liveframe"); if (!f || !S.screenUrl) return;
    const imgs = f.querySelectorAll("img"); const shown = [...imgs].find((i) => i.classList.contains("show")), back = [...imgs].find((i) => i !== shown);
    if (shown && shown.src === S.screenUrl) return;
    back.onload = () => { back.classList.add("show"); if (shown) shown.classList.remove("show"); };
    back.src = S.screenUrl;
    const nf = $(".nof", f); if (nf) nf.remove();
  }

  // ---------- odometer (digits roll 600 ms ease-out, 30 ms stagger; reduced motion: swap) ----------
  function odo(el, text) {
    const prev = el.dataset.v || "";
    if (prev === text) return; el.dataset.v = text;
    if (!prev || reduce() || prev.length !== text.length) {
      el.innerHTML = [...text].map((c) => /\d/.test(c) ? `<span class="ch"><span class="col" style="transform:translateY(-${c}em)">${[..."0123456789"].map((d) => `<span>${d}</span>`).join("")}</span></span>` : `<span class="ch">${esc(c)}</span>`).join("");
      return;
    }
    const cols = el.querySelectorAll(".ch"); let k = 0;
    [...text].forEach((c, i) => { const col = cols[i] && cols[i].querySelector(".col"); if (col && /\d/.test(c) && c !== prev[i]) { col.style.transitionDelay = (k++ * 30) + "ms"; col.style.transform = `translateY(-${c}em)`; } else if (!col && c !== prev[i]) cols[i].textContent = c; });
  }

  // ---------- router ----------
  function go(tab) { S.tab = tab; S.stack = []; document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); render(); scrollTo(0, 0); }
  function push(view) { S.stack.push(view); history.pushState({ d: S.stack.length }, ""); render(); scrollTo(0, 0); }
  addEventListener("popstate", () => { if (S.stack.length) { S.stack.pop(); render(); } });
  document.querySelectorAll("#tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

  // ---------- shared pieces ----------
  const ICON = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  };
  const backBar = (label) => `<div class="navbar"><button class="back" data-act="back">${ICON.back}${esc(label)}</button></div>`;
  const fomoA = (u, label = "Open on FOMO") => (fomoLink(u) ? `<a class="fomo" href="${esc(fomoLink(u))}" target="_blank" rel="noopener noreferrer">${label}</a>` : "");
  const paperPill = () => (S.state && S.state.mode === "PAPER" ? '<span class="pill paper">PAPER</span>' : "");
  const roNote = (what) => `<div class="ro">${esc(what)} · via Telegram (STEP 11)</div>`;
  const sk = (h, w = "100%", r = 12, mt = 10) => `<div class="sk pulse" style="height:${h}px;width:${w};border-radius:${r}px;margin-top:${mt}px"></div>`;
  const bots = () => Object.fromEntries(((S.state && S.state.bots) || []).map((b) => [b.name, b]));
  const color = (n) => (bots()[n] || {}).color || "#8e8e93";
  function offlineRow() {
    const el = $("#offline"); const showErr = S.err && S.err !== "nodata" ? true : S.err === "nodata" && S.state;
    if (!showErr || !S.dp) { el.hidden = true; return; }
    const n = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000));
    el.hidden = false; el.textContent = `Desk offline · retrying in ${n}s · last update ${S.lastIxT ? hm(S.lastIxT) : "never"}`;
  }
  setInterval(() => { offlineRow(); liveLabel(); }, 1000);

  // ---------- views ----------
  function viewGate(kind) {
    if (kind === "nolink") return `<div class="gate"><div class="ico">${ICON.shield}</div><h1>Open your desk link</h1>
      <p>This ${DeskCrypto.isStandalone() ? "home-screen app" : "browser"} has no desk link yet. Open the private link from Grok Bot in Safari, then tap Share → Add to Home Screen on that page: the icon keeps the link.</p>
      <p class="ter">Added the icon before this fix? Delete it and add it again from the link.</p></div>`;
    return `<div class="gate"><div class="ico">${ICON.search}</div><h1>No data at this link</h1>
      <p>Nothing is published for this link right now. If the desk just started, give it 15 seconds.</p>
      <p>If it stays empty, the link is wrong or old: open the link from Grok Bot again.</p>
      <p class="ter">Checking again in <span id="gaten">${Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000))}</span>s</p></div>`;
  }
  function viewLoading() {
    return `<div class="navbar">${sk(34, "34px", 17, 0)}<div style="flex:1"></div>${sk(24, "90px", 8, 0)}</div>
      ${sk(66, "70%", 14, 12)}${sk(20, "40%", 8)}${sk(200, "100%", 12, 16)}${sk(44, "100%", 10)}
      <div class="sk pulse" style="aspect-ratio:16/9;border-radius:22px;margin-top:16px"></div>
      ${sk(24, "40%", 8, 26)}<div style="display:flex;gap:10px">${sk(170, "76%", 16)}${sk(170, "24%", 16)}</div>`;
  }

  // ---------- Pump Pilot: home ----------
  const LOGO = '<svg viewBox="0 0 32 32" class="pplogo" aria-hidden="true"><defs><linearGradient id="ppg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#00f5a0"/><stop offset="1" stop-color="#00c2ff"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="#0b1411" stroke="url(#ppg)" stroke-width="1.5"/><g transform="rotate(45 16 16)"><path d="M13.6 21.6h4.8L16 26.6z" fill="#00c2ff" opacity=".9"/><path d="M12.2 17.2L8.8 21v1.6l3.4-1.2zM19.8 17.2l3.4 3.8v1.6l-3.4-1.2z" fill="url(#ppg)"/><path d="M16 5.4c3 2.4 4.1 6 4.1 9.8v6.4h-8.2v-6.4c0-3.8 1.1-7.4 4.1-9.8z" fill="url(#ppg)"/><circle cx="16" cy="13.4" r="1.9" fill="#0b1411" stroke="#d9fff3" stroke-width=".6"/></g></svg>';
  const modeBadge = () => { const m = S.state && S.state.mode; return m === "LIVE" ? '<span class="mbadge live"><i></i>LIVE</span>' : m === "PAPER" ? '<span class="mbadge paper">PAPER</span>' : ""; };
  const LIGHT = { running: ["ok", "OK"], paused: ["paused", "Paused"], stale: ["stale", "Stale"], off: ["off", "Off"] };
  function botStrip() {
    return `<div class="botstrip">${BOT_ORDER.map((n) => { const b = bots()[n] || { name: n, title: n, status: "off" };
      const [cls, lab] = LIGHT[b.status] || LIGHT.off;
      const sub = b.status === "stale" && b.age_s != null ? Math.round(b.age_s / 60) + "m" : lab;
      return `<button class="bchip ${cls}" data-act="tab" data-tab="bots" title="${esc(b.title || n)} · ${esc(b.status || "off")}"><i class="light"></i><span class="bn">${esc(b.title || n[0].toUpperCase() + n.slice(1))}</span><span class="bs">${esc(sub)}</span></button>`; }).join("")}</div>`;
  }
  const isTP = (r) => r.kind === "sold" && /take ?profit|\btp\b/i.test((r.subtitle || "") + " " + (r.reason || ""));
  const tradeTag = (r) => r.kind === "bought" ? '<span class="tag buy">BUY</span>' : r.kind === "stopped" ? '<span class="tag stop">STOP</span>'
    : isTP(r) ? '<span class="tag tp">TAKE PROFIT</span>' : /trail/i.test(r.subtitle || "") ? '<span class="tag sell">TRAIL</span>' : '<span class="tag sell">SELL</span>';
  function tradeRow(r) {
    const k = r.kind, cls = k === "bought" ? "buy" : k === "stopped" ? "stop" : isTP(r) ? "tp" : "sell";
    const val = String(r.value || ""), neg = /^-/.test(val);
    return `<div class="trow ${cls}" data-act="coin" data-mint="${esc(r.mint)}" data-aid="${esc(r.id)}">
      <div class="tsym">${sym((r.title || "").split(" ").slice(1).join(" ") || null, r.mint)}</div>
      <div class="tmid">${tradeTag(r)}<span class="tsub">${esc((r.subtitle || "").replace(/^Executor · \d\d:\d\d$/, "Executor"))}</span></div>
      <div class="tval ${k === "bought" ? "" : neg ? "down" : "up"}">${esc(val.split(" · ")[0])}<small>${hm(r.ts)}</small></div></div>`;
  }
  function feedRow(r) {
    const k = r.kind, cls = k === "bought" ? "buy" : k === "stopped" ? "stop" : k === "sold" ? (isTP(r) ? "tp" : "sell") : "skip";
    return `<div class="frow ${cls}" data-act="${k === "rejected" ? "audit" : "coin"}" data-mint="${esc(r.mint)}"><i></i><span class="ft trunc"><b>${esc(r.title)}</b> <span class="mut">${esc(r.subtitle || "")}</span></span><span class="fv">${esc(k === "rejected" ? "skip" : String(r.value || "").split(" · ")[0])}</span><span class="fts">${hm(r.ts)}</span></div>`;
  }
  function posCard(p) {
    const pnl = p.value_usd != null && p.size_usd != null ? p.value_usd - p.size_usd : null, upp = (p.change_pct || 0) >= 0;
    const tags = (p.tp_done ? '<span class="tag tp">TP HIT</span>' : "") + (p.trail_active ? '<span class="tag sell">TRAILING</span>' : "");
    return `<div class="prow ${upp ? "gain" : "loss"}" data-act="coin" data-mint="${esc(p.mint)}">
      <div class="pic">${sym(p.symbol, p.mint).slice(0, 1)}</div>
      <div class="ptx"><div class="psym">${sym(p.symbol, p.mint)} ${tags}</div><div class="psub">${money(p.size_usd)} in · stop ${priceFmt(p.stop_price)}${p.opened_at ? " · " + hm(p.opened_at) : ""}</div></div>
      <div class="ppl"><div class="pval">${money(p.value_usd)}</div><div class="${upp ? "up" : "down"} pchg">${pnl == null ? "–" : signedMoney(pnl)} · ${pct(p.change_pct, 1)}</div></div></div>`;
  }
  function frameNote(scr) {
    return scr.trade_live ? '<span class="fn live"><i></i>Updating every 15s · trade live</span>' : `<span class="fn">Updating every ${scr.published_every_s || 60}s</span>`;
  }

  function viewHome() {
    const st = S.state, a = (S.files["activity/0"] || { rows: [] }).rows, chart = S.files["chart/" + S.range];
    const up = (st.today_pct || 0) >= 0, unseen = a.length && a[0].ts > +(localStorage.getItem("desk.seen") || 0);
    const lastO = st.last_order, scr = st.screen || {};
    const trades = a.filter((r) => r.kind === "bought" || r.kind === "sold" || r.kind === "stopped");
    const delta = st.balance != null && st.night_start_balance != null ? st.balance - st.night_start_balance : null;
    const pos = st.positions || [], posPnl = pos.reduce((s, p) => s + (p.value_usd != null && p.size_usd != null ? p.value_usd - p.size_usd : 0), 0);
    const running = (st.bots || []).filter((b) => b.status === "running").length;
    return `
      <header class="pphead">
        <div class="brand">${LOGO}<div><div class="bname">Pump <span>Pilot</span></div><div class="btag">FOMO desk · ${running}/5 bots online</div></div></div>
        <div class="navsp"></div>${modeBadge()}
        <button class="iconbtn" data-act="search" aria-label="Search">${ICON.search}</button>
        <button class="iconbtn" data-act="tab" data-tab="activity" aria-label="Activity">${ICON.bell}${unseen ? '<i class="dot"></i>' : ""}</button>
      </header>
      <div id="searchbox"></div>
      <div class="home">
        <section class="hero glass" id="hero">
          <div class="hlab">Total balance <span class="ter">· ${esc(st.balance_source || "")}</span></div>
          <div class="balance"><span id="bal" class="tw"></span></div>
          <div class="hrow">
            ${st.today_pct != null ? `<span class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${delta != null ? signedMoney(delta) + " · " : ""}${pct(st.today_pct)}</span><span class="mut">vs night start</span>` : '<span class="mut">No night start yet</span>'}
            ${st.multiplier != null ? `<span class="pill mult">${st.multiplier.toFixed(2)}×</span>` : ""}
          </div>
          <div class="hstats">
            <div><span>Cash</span><b>${money(st.cash)}</b></div>
            <div><span>Positions</span><b>${pos.length ? money(pos.reduce((s, p) => s + (p.value_usd || 0), 0)) : "$0.00"}</b></div>
            <div><span>Open P&amp;L</span><b class="${posPnl >= 0 ? "up" : "down"}">${pos.length ? signedMoney(posPnl) : "–"}</b></div>
          </div>
          <div class="chartbox"><canvas id="bchart"></canvas>${!chart || (chart.points || []).length < 2 ? `<div class="chartnote">${chart ? "Waiting for the first trade" : ""}</div>` : ""}</div>
          <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map((r) => `<button data-act="range" data-r="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>
        </section>
        <section class="a-bots">${botStrip()}</section>
        <section class="a-pos">
          <h2 class="sec">Open positions <span class="count">· ${pos.length}</span></h2>
          ${S.demo ? `<div class="plist">${demoRow()}</div>` : ""}
          ${pos.length ? `<div class="plist">${pos.map(posCard).join("")}</div>` : S.demo ? "" : '<div class="empty glass"><b>No open positions</b>Risk is watching for the next entry.</div>'}
        </section>
        <section class="a-frame">
          <h2 class="sec">FOMO screen ${frameNote(scr)}</h2>
          <div class="live glass">
            <div class="frame" id="liveframe" data-act="full">
              <img alt=""><img alt="">
              ${S.screenUrl ? "" : '<div class="nof">No frame yet</div>'}
              ${scr.paused ? '<div class="paused"><div>Paused · private<br><span class="ter" style="font-size:13px">a login or withdraw form is open, no frames</span></div></div>' : ""}
              <div class="tl" id="livetl"></div>
              <div class="tr" id="livetr"></div>
            </div>
            <div class="last">${lastO ? lastOrderLine(lastO) : '<span class="mut">No orders yet</span>'}</div>
          </div>
        </section>
        <section class="a-trades">
          <h2 class="sec">Recent trades<button class="more" data-act="tab" data-tab="activity">See all</button></h2>
          ${trades.length ? `<div class="tlist glass">${trades.slice(0, 8).map(tradeRow).join("")}</div>` : '<div class="empty glass"><b>Waiting for the first trade</b>Scanner and Analyst are working; trades show up here.</div>'}
        </section>
        <section class="a-feed">
          <h2 class="sec">Live feed <span class="count">· buys, sells, skips</span></h2>
          ${a.length ? `<div class="feed glass">${a.slice(0, 12).map(feedRow).join("")}</div>` : '<div class="empty glass">Nothing yet tonight</div>'}
        </section>
      </div>`;
  }

  // ---------- Pump Pilot: balance tween (ease-out 900 ms; reduced motion = set) ----------
  function tween(el, to) {
    if (to == null || isNaN(to)) { el.textContent = "–"; el.dataset.n = ""; return; }
    const from = el.dataset.n === undefined || el.dataset.n === "" ? null : +el.dataset.n;
    el.dataset.n = String(to);
    if (from == null || reduce() || Math.abs(from - to) < 0.005) { el.textContent = money(to); return; }
    el.classList.remove("tick-up", "tick-down"); void el.offsetWidth; el.classList.add(to > from ? "tick-up" : "tick-down");
    const t0 = performance.now(), D = 900; cancelAnimationFrame(el._raf);
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(step); };
    el._raf = requestAnimationFrame(step);
  }

  // ---------- Pump Pilot: trade effects, from diffing activity rows + positions between polls ----------
  // buy -> green rocket launch + green glow; take-profit (or tp_done 0->1) -> rocket detonates into a firework + gold/green flash; stop -> red rocket stalls, tumbles, crashes + red flash + shake; sell -> blue rocket landing
  const FX = { seen: null, pos: null, queue: [] };
  function fxDiff(state, act) {
    const rows = (act && act.rows) || [], pos = Object.fromEntries(((state && state.positions) || []).map((p) => [p.mint, p]));
    if (!act) return;                                    // activity not loaded yet: diff on the next poll
    if (FX.seen === null) { FX.seen = new Set(rows.map((r) => r.id)); FX.pos = pos; return; }   // first load: remember, no effects
    const out = [], hit = new Set();
    for (const r of rows.slice().reverse()) {
      if (FX.seen.has(r.id)) continue; FX.seen.add(r.id);
      const kind = r.kind === "bought" ? "buy" : r.kind === "stopped" ? "stop" : r.kind === "sold" ? (isTP(r) ? "tp" : "sell") : null;
      if (kind) { out.push({ kind, mint: r.mint, aid: r.id }); hit.add(kind + r.mint); }
    }
    for (const [m, p] of Object.entries(pos)) {
      const o = FX.pos[m];
      if (!o && !hit.has("buy" + m)) out.push({ kind: "buy", mint: m });
      else if (o && !o.tp_done && p.tp_done && !hit.has("tp" + m)) out.push({ kind: "tp", mint: m });
    }
    FX.pos = pos; FX.queue.push(...out);
  }
  function fxPlay() {
    if (!FX.queue.length) return;
    if (S.tab !== "home" || S.stack.length) { FX.queue.length = 0; return; }   // only play on Home, never replay old ones later
    const q = FX.queue.splice(0).slice(-3); const calm = reduce();
    q.forEach((e, i) => setTimeout(() => {
      const targets = [...document.querySelectorAll(`.prow[data-mint="${CSS.escape(e.mint || "")}"]`), ...document.querySelectorAll(`.trow[data-aid="${CSS.escape(String(e.aid ?? "-"))}"]`)];
      const hero = $("#hero"); const all = targets.length ? targets : hero ? [hero] : [];
      if (e.kind !== "buy" && hero && !all.includes(hero)) all.push(hero);
      all.forEach((el) => { el.classList.remove("fx-buy", "fx-tp", "fx-stop", "fx-sell"); void el.offsetWidth; el.classList.add("fx-" + e.kind); setTimeout(() => el.classList.remove("fx-" + e.kind), 2400); });
      banner(e);
      const vis = all.find((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      if (!calm) {
        const row = targets.find((el) => el === vis) || vis || hero;
        const shake = () => { const v = $("#view"); if (v) { v.classList.remove("pp-shake"); void v.offsetWidth; v.classList.add("pp-shake"); setTimeout(() => v.classList.remove("pp-shake"), 600); } };
        arcade(e.kind, e.kind === "tp" ? (hero || row) : row, e.kind === "stop" ? shake : null);
      }
    }, i * 700));
  }
  function banner(e) {
    const t = { buy: "Bought", tp: "Take profit", stop: "Stopped out", sell: "Sold" }[e.kind];
    const p = (S.state.positions || []).find((x) => x.mint === e.mint);
    const r = ((S.files["activity/0"] || {}).rows || []).find((x) => x.id === e.aid || (e.aid == null && x.mint === e.mint));
    const s = (p && p.symbol) || (r && (r.title || "").split(" ").slice(1).join(" ")) || (e.mint || "").slice(0, 4);
    const el = document.createElement("div"); el.className = "ppban " + e.kind;
    el.innerHTML = `<b>${esc(t)}</b> ${esc(s)}${r && r.value ? ` <span>${esc(String(r.value).split(" · ")[0])}</span>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3200);
  }
  // ---------- Pump Pilot rocket (hand-written SVG, accent colour is a parameter; master copy = web/rocket.svg) ----------
  const ppShade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""); };
  function rocketSVG(acc, parts = "all") {
    const L = ppShade(acc, 0.45), D = ppShade(acc, -0.45), DD = ppShade(acc, -0.7), id = "r" + acc.slice(1) + parts;
    const body = parts !== "flame", flame = parts !== "body";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 220" width="100" height="220">
<defs>
<linearGradient id="${id}m" x1="0" x2="1"><stop offset="0" stop-color="#4a525f"/><stop offset=".18" stop-color="#9aa4b3"/><stop offset=".38" stop-color="#ffffff"/><stop offset=".55" stop-color="#d5dce6"/><stop offset=".8" stop-color="#7d8796"/><stop offset="1" stop-color="#3a414c"/></linearGradient>
<linearGradient id="${id}a" x1="0" x2="1"><stop offset="0" stop-color="${DD}"/><stop offset=".3" stop-color="${acc}"/><stop offset=".42" stop-color="${L}"/><stop offset=".62" stop-color="${acc}"/><stop offset="1" stop-color="${DD}"/></linearGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L}"/><stop offset=".55" stop-color="${acc}"/><stop offset="1" stop-color="${D}"/></linearGradient>
<linearGradient id="${id}n" x1="0" x2="1"><stop offset="0" stop-color="#1b1f26"/><stop offset=".4" stop-color="#6c7482"/><stop offset=".6" stop-color="#3b414b"/><stop offset="1" stop-color="#121418"/></linearGradient>
<radialGradient id="${id}g" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="${L}"/><stop offset=".45" stop-color="${D}"/><stop offset="1" stop-color="#05080c"/></radialGradient>
<linearGradient id="${id}x" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffd447"/><stop offset=".6" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#fff1a8"/><stop offset="1" stop-color="#ffd447" stop-opacity="0"/></linearGradient>
</defs>
${flame ? `<g><path d="M31 164 C 27 186, 40 204, 50 219 C 60 204, 73 186, 69 164 Z" fill="url(#${id}x)" opacity=".95"/>
<path d="M39 164 C 37 180, 45 192, 50 203 C 55 192, 63 180, 61 164 Z" fill="url(#${id}y)"/>
<ellipse cx="50" cy="166" rx="15" ry="3.5" fill="#fff7d0" opacity=".9"/></g>` : ""}
${body ? `<g>
<path d="M30 104 C 14 116, 7 136, 6 162 C 13 156, 21 151, 30 148 Z" fill="url(#${id}f)" stroke="${DD}" stroke-width="1"/>
<path d="M70 104 C 86 116, 93 136, 94 162 C 87 156, 79 151, 70 148 Z" fill="url(#${id}f)" stroke="${DD}" stroke-width="1"/>
<path d="M36 148 L64 148 L70 166 L30 166 Z" fill="url(#${id}n)" stroke="#0b0d10" stroke-width=".8"/>
<path d="M31 166 L69 166 L68 162 L32 162 Z" fill="#ff9a3c" opacity=".55"/>
<path d="M50 3 C 71 27, 76 66, 74 110 L 71 149 L 29 149 L 26 110 C 24 66, 29 27, 50 3 Z" fill="url(#${id}m)" stroke="#2a3038" stroke-width="1"/>
<path d="M50 3 C 64 19, 70 35, 72 50 L 28 50 C 30 35, 36 19, 50 3 Z" fill="url(#${id}a)"/>
<path d="M28 50 L72 50" stroke="#1e232a" stroke-width="1.6"/><path d="M28.4 52 L71.6 52" stroke="#ffffff" stroke-opacity=".35" stroke-width=".8"/>
<rect x="26" y="116" width="48" height="9" fill="url(#${id}a)"/><path d="M26 116 H74 M26 125 H74" stroke="#1e232a" stroke-width="1"/>
<path d="M27 136 H73" stroke="#1e232a" stroke-opacity=".6" stroke-width=".8"/>
<circle cx="50" cy="80" r="13" fill="url(#${id}m)" stroke="#262b33" stroke-width="1.2"/>
<circle cx="50" cy="80" r="9.2" fill="url(#${id}g)" stroke="#0b0e12" stroke-width="1"/>
<ellipse cx="46.5" cy="76.5" rx="3.6" ry="2.2" fill="#fff" opacity=".75" transform="rotate(-30 46.5 76.5)"/>
${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${(50 + 11.2 * Math.cos((a * Math.PI) / 180)).toFixed(2)}" cy="${(80 + 11.2 * Math.sin((a * Math.PI) / 180)).toFixed(2)}" r=".9" fill="#2a3038"/>`).join("")}
<path d="M44 22 C 36 40, 33 72, 34 140" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M48 128 L52 128 L53.5 158 L46.5 158 Z" fill="url(#${id}f)" stroke="${DD}" stroke-width=".8"/>
</g>` : ""}
</svg>`;
  }
  // ---------- Pump Pilot arcade effects: one canvas overlay per effect, rAF, removed after ~2 s (fire-and-forget) ----------
  // The rocket is the SVG above, pre-rendered once per colour into an offscreen bitmap (cached), so a frame is one drawImage.
  // buy = green launch; tp = green launch + green/gold firework + shockwave; stop = red stall, tumble, crash + shake; sell = blue landing + puff
  const RKT = {}, RC = { buy: "#22e584", tp: "#22e584", stop: "#ff4d6d", sell: "#4da3ff" };
  function rocketSprite(acc) {
    const o = RKT[acc]; if (o) return o.ready ? o : null;
    const n = (RKT[acc] = { ready: false });
    const mk = (parts) => new Promise((res) => { const im = new Image();
      im.onload = () => { const c = document.createElement("canvas"); c.width = 200; c.height = 440; c.getContext("2d").drawImage(im, 0, 0, 200, 440); res(c); };
      im.onerror = () => res(null); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(rocketSVG(acc, parts)); });
    Promise.all([mk("body"), mk("flame")]).then(([b, f]) => { if (b && f) Object.assign(n, { body: b, flame: f, ready: true }); else delete RKT[acc]; });
    return null;
  }
  setTimeout(() => { if (!reduce()) Object.values(RC).forEach(rocketSprite); }, 1200);   // warm the 3 bitmaps after the first paint
  let arcadeLive = 0;
  function arcade(kind, anchor, onImpact) {
    if (arcadeLive >= 3 || document.hidden) return;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const cv = document.createElement("canvas"); cv.className = "arcade"; cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv); arcadeLive++;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const spr = rocketSprite(RC[kind]), SZ = W < 600 ? 34 : 42, RH = SZ * 2.2;
    const r = anchor ? anchor.getBoundingClientRect() : { left: W / 2 - 50, top: H / 2, width: 100, height: 40 };
    const clampX = (x) => Math.min(W - 40, Math.max(40, x)), clampY = (y) => Math.min(H - 30, Math.max(30, y));
    const ax = clampX(r.left + r.width * (kind === "tp" ? 0.5 : 0.82)), ay = clampY(r.top + r.height / 2);
    const P = [], rings = [], rnd = (a, b) => a + Math.random() * (b - a), D = 2000;
    let flash = null;
    const add = (o) => P.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 1, life: 1, age: 0, s: 3, c: "#fff", glow: 0, grow: 0 }, o));
    const burst = (x, y, n, sp, cols, life = 1.1, grav = 170) => { for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(sp * 0.3, sp);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, drag: 0.962, life: rnd(life * 0.55, life), s: rnd(1.6, 3.4), c: cols[i % cols.length], glow: 10, trail: true }); } };
    const puff = (x, y, n, col, sp = 90, big = 1) => { for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(10, sp);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 10, drag: 0.94, life: rnd(0.6, 1.1), s: rnd(5, 10) * big, grow: 26 * big, c: col, smoke: true }); } };
    // rocket state: a = angle (0 = nose up), fl = flame scale (0 = off)
    const R = { x: ax, y: ay, a: 0, vx: 0, vy: 0, fl: 1, on: true, alpha: 1 };
    if (kind === "buy") { R.y = clampY(ay + 6); R.vy = -70; }
    if (kind === "tp") { R.y0 = Math.min(H - 20, r.top + r.height - 30); R.y = R.y0; R.yA = Math.max(70, r.top + 50); }
    if (kind === "stop") { R.y0 = ay; }
    if (kind === "sell") { R.y = -RH; R.land = clampY(r.top - 4) - RH * 0.3; }
    const exhaust = () => ({ x: R.x - Math.sin(R.a) * RH * 0.32, y: R.y + Math.cos(R.a) * RH * 0.32 });
    function drawRocket() {
      if (!spr || !R.on) return;
      g.save(); g.globalAlpha = R.alpha; g.translate(R.x, R.y); g.rotate(R.a);
      const top = -RH * (100 / 220);
      if (R.fl > 0.02) { const ny = top + RH * (164 / 220);
        const gl = g.createRadialGradient(0, ny + 8, 0, 0, ny + 8, SZ * 1.1 * R.fl); gl.addColorStop(0, "rgba(255,200,80,.55)"); gl.addColorStop(1, "rgba(255,120,0,0)");
        g.fillStyle = gl; g.beginPath(); g.arc(0, ny + 8, SZ * 1.1 * R.fl, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(0, ny); g.scale(rnd(0.86, 1.08), R.fl * rnd(0.82, 1.22)); g.drawImage(spr.flame, -SZ / 2, -RH * (164 / 220), SZ, RH); g.restore(); }
      g.drawImage(spr.body, -SZ / 2, top, SZ, RH);
      g.restore();
    }
    const t0 = performance.now(); let last = t0;
    const kill = () => { if (!cv.isConnected) return; cv.remove(); arcadeLive--; };
    const hard = setTimeout(kill, D + 600);       // even if rAF is paused (tab hidden)
    const frame = (now) => {
      if (!cv.isConnected) return;
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      // ---- choreography ----
      if (kind === "buy" && R.on) { R.vy -= 1000 * dt; R.y += R.vy * dt; R.a = Math.sin(t * 11) * 0.035; R.fl = rnd(0.85, 1.15); if (R.y < -RH) R.on = false; }
      if (kind === "tp" && R.on) { const k = Math.min(1, t / 0.6); R.y = R.y0 + (R.yA - R.y0) * k * k; R.a = Math.sin(t * 13) * 0.03; R.fl = rnd(0.9, 1.25);
        if (k >= 1) { R.on = false; flash = { t, c: "255,232,150", a: 0.38, d: 0.35 };
          burst(R.x, R.y, 130, 540, ["#22e584", "#ffd447", "#ffb800", "#8dffc4", "#fff3b0"], 1.3);
          for (let i = 0; i < 10; i++) { const a = rnd(0, Math.PI * 2), v = rnd(80, 260); add({ x: R.x, y: R.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.95, g: 40, life: rnd(0.8, 1.2), s: rnd(5, 9), c: i % 2 ? "#ffffff" : "#ffd447", glow: 12, star: true }); }
          rings.push({ x: R.x, y: R.y, t0: t, c: "255,212,71", R: 180 }, { x: R.x, y: R.y, t0: t + 0.1, c: "34,229,132", R: 130 });
          const bx = R.x, by = R.y;
          setTimeout(() => { if (!cv.isConnected) return; const x = bx + rnd(-120, 120), y = by + rnd(-30, 90), tt = (performance.now() - t0) / 1000; burst(x, y, 55, 300, ["#22e584", "#ffd447"], 0.9); rings.push({ x, y, t0: tt, c: "34,229,132", R: 70 }); }, 240);
          setTimeout(() => { if (!cv.isConnected) return; const x = bx + rnd(-120, 120), y = by + rnd(-30, 90), tt = (performance.now() - t0) / 1000; burst(x, y, 55, 300, ["#ffd447", "#fff3b0"], 0.9); rings.push({ x, y, t0: tt, c: "255,212,71", R: 70 }); }, 430); } }
      if (kind === "stop" && R.on) {
        if (t < 0.5) { R.y = R.y0 - 46 * Math.sin((t / 0.5) * Math.PI / 2); R.a = Math.sin(t * 30) * 0.06 * (t / 0.5); R.fl = Math.random() < 0.3 ? 0 : rnd(0.2, 0.7); }   // stall: sputtering engine
        else { if (!R.tumble) { R.tumble = 1; R.vy = -40; R.vx = R.x > W / 2 ? -70 : 70; R.spin = R.vx > 0 ? 7 : -7; R.fl = 0; puff(R.x, R.y + 10, 4, "90,90,100", 40); }
          R.vy += 1050 * dt; R.y += R.vy * dt; R.x += R.vx * dt; R.a += R.spin * dt; R.fl = 0;
          const ground = Math.min(H - 30, R.y0 + 300);
          if (R.y > ground || t > 1.35) { R.on = false; flash = { t, c: "255,40,70", a: 0.22, d: 0.3 };
            burst(R.x, R.y, 70, 380, ["#ff4d6d", "#ff8a3a", "#ffd0d0", "#ff2244"], 0.9, 260); puff(R.x, R.y, 12, "60,58,66", 120, 1.4);
            rings.push({ x: R.x, y: R.y, t0: t, c: "255,77,109", R: 90 }); if (onImpact) onImpact(); } } }
      if (kind === "sell" && R.on) { const k = Math.min(1, t / 1.05), e = 1 - Math.pow(1 - k, 3); R.y = -RH + (R.land + RH) * e; R.a = Math.sin(t * 7) * 0.03 * (1 - k);
        R.fl = k < 1 ? rnd(0.55, 0.95) * (0.6 + 0.4 * (1 - e)) : Math.max(0, R.fl - dt * 6);
        if (k >= 1 && !R.down) { R.down = t; const ex = exhaust(); puff(ex.x, ex.y, 12, "190,225,255", 110, 0.8); burst(ex.x, ex.y, 22, 170, ["#4da3ff", "#cfe6ff"], 0.6, 120); rings.push({ x: ex.x, y: ex.y, t0: t, c: "77,163,255", R: 60, flat: 1 }); }
        if (R.down && t > 1.45) R.alpha = Math.max(0, 1 - (t - 1.45) / 0.4); }
      // ---- exhaust particles ----
      if (R.on && R.fl > 0.05) { const ex = exhaust(); const n = kind === "stop" ? 1 : 2;
        for (let i = 0; i < n; i++) {
          if (kind !== "sell" && (kind !== "tp" || i === 0)) add({ x: ex.x + rnd(-3, 3), y: ex.y + rnd(-2, 2), vx: rnd(-22, 22) - Math.sin(R.a) * 60, vy: rnd(30, 70) * Math.cos(R.a), drag: 0.95, life: rnd(0.45, kind === "tp" ? 0.6 : 0.85), s: rnd(3.5, 7), grow: 18, c: "190,198,214", smoke: true });
          add({ x: ex.x, y: ex.y, vx: rnd(-70, 70), vy: rnd(60, 180) * (kind === "sell" ? 0.5 : 1), g: 220, life: rnd(0.2, kind === "sell" ? 0.3 : 0.5), s: rnd(1.1, 2.2), c: i ? "#ffd447" : RC[kind], glow: 8 }); } }
      if (kind === "stop" && R.on && R.tumble) { add({ x: R.x + rnd(-4, 4), y: R.y + rnd(-4, 4), vx: rnd(-20, 20), vy: rnd(-30, 0), drag: 0.95, life: rnd(0.6, 1), s: rnd(5, 9), grow: 24, c: "55,52,60", smoke: true });
        add({ x: R.x, y: R.y, vx: rnd(-150, 150), vy: rnd(-170, 30), g: 420, life: rnd(0.3, 0.6), s: rnd(1.3, 2.4), c: Math.random() < 0.5 ? "#ff4d6d" : "#ffb03a", glow: 8 }); }
      if (R.on && (R.st = (R.st || 0) + dt) > 0.11) { R.st = 0; const a = rnd(0, Math.PI * 2), d = rnd(SZ * 0.8, SZ * 1.7);
        add({ x: R.x + Math.cos(a) * d, y: R.y + Math.sin(a) * d * 1.2, vx: rnd(-8, 8), vy: kind === "buy" || kind === "tp" ? rnd(20, 50) : rnd(-10, 10), life: rnd(0.45, 0.75), s: rnd(3, 6), c: kind === "stop" ? "#ffb3c0" : kind === "sell" ? "#d6ecff" : Math.random() < 0.6 ? "#ffffff" : "#fff1a8", glow: 8, star: true }); }
      // ---- draw: smoke under, rocket, sparks/rings over ----
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.age += dt; if (p.age > p.life) { P.splice(i, 1); continue; }
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.ox = p.x; p.oy = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        if (!p.smoke) continue; const k = 1 - p.age / p.life;
        g.fillStyle = `rgba(${p.c},${0.3 * k})`; g.beginPath(); g.arc(p.x, p.y, p.s + p.grow * (1 - k), 0, Math.PI * 2); g.fill(); }
      drawRocket();
      for (const p of P) { if (p.smoke) continue; const k = 1 - p.age / p.life;
        g.globalAlpha = k; g.shadowColor = p.c; g.shadowBlur = p.glow; g.strokeStyle = g.fillStyle = p.c;
        if (p.star) { const z = p.s * Math.sin(Math.PI * (1 - k)), w = z * 0.28; g.globalAlpha = Math.min(1, 1.6 * Math.sin(Math.PI * (1 - k)));
          g.beginPath(); g.moveTo(p.x, p.y - z); g.lineTo(p.x + w, p.y - w); g.lineTo(p.x + z, p.y); g.lineTo(p.x + w, p.y + w); g.lineTo(p.x, p.y + z); g.lineTo(p.x - w, p.y + w); g.lineTo(p.x - z, p.y); g.lineTo(p.x - w, p.y - w); g.closePath(); g.fill(); }
        else if (p.trail) { g.lineWidth = p.s; g.lineCap = "round"; g.beginPath(); g.moveTo(p.ox - p.vx * 0.03, p.oy - p.vy * 0.03); g.lineTo(p.x, p.y); g.stroke(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); } }
      g.globalAlpha = 1; g.shadowBlur = 0;
      for (const rg of rings) { const k = (t - rg.t0) / 0.7; if (k < 0 || k > 1) continue; const rr = rg.R * (1 - Math.pow(1 - k, 3));
        g.strokeStyle = `rgba(${rg.c},${1 - k})`; g.lineWidth = 6 * (1 - k) + 1; g.beginPath();
        if (rg.flat) g.ellipse(rg.x, rg.y, rr, rr * 0.28, 0, 0, Math.PI * 2); else g.arc(rg.x, rg.y, rr, 0, Math.PI * 2); g.stroke(); }
      if (flash && t - flash.t < flash.d) { g.fillStyle = `rgba(${flash.c},${flash.a * (1 - (t - flash.t) / flash.d)})`; g.fillRect(0, 0, W, H); }
      if (t < D / 1000) requestAnimationFrame(frame); else { clearTimeout(hard); kill(); }
    };
    requestAnimationFrame(frame);
  }



  function lastOrderLine(o) {
    const verb = o.side === "buy" ? "Bought" : "Sold";
    const ok = o.status === "done", v = ok ? "verified" : esc(o.status);
    const c = (x, l) => `<span class="ck ${x == null ? "" : x ? "ok" : "no"}" title="${l}">${x == null ? "·" : x ? "✓" : "✕"}</span>`;
    return `<span class="trunc">${verb} ${sym(o.symbol, o.mint)} · ${money(o.fill_usd ?? o.usd)} · ${v}</span><span class="checks">${c(o.screen_ok, "screen")}${c(o.api_ok, "api")}${c(o.chain_ok, "chain")}</span>`;
  }
  function liveLabel() {
    const tl = $("#livetl"), tr = $("#livetr"); if (!tl || !S.state) return;
    const scr = S.state.screen || {}, ft = scr.frame_ts, fresh = ft && Date.now() / 1000 - ft < 5;
    tl.innerHTML = scr.paused ? '<span class="gdot"></span>Paused · private' : !ft || !S.screenUrl ? '<span class="gdot"></span>No frame yet' : fresh ? '<span class="rdot"></span>Live · Bot\'s computer' : `<span class="gdot"></span>Last frame ${hms(ft)}`;
    const ln = S.state.lane || {}, holder = scr.lane || ln.bot, text = scr.status && scr.status !== "Idle" ? scr.status : ln.text || "Idle";
    tr.innerHTML = holder && text !== "Idle" ? `<span style="color:${color(holder)}">${esc(text)}</span>` : '<span class="mut">Idle</span>';
  }
  function botCard(b, full) {
    const st = `<span class="sdot ${esc(b.status || "off")}"></span>`;
    let body = "";
    if (b.name === "scanner") {
      body = `<div class="big">${b.pools ?? 0} pools</div>` + (b.feed || []).slice(0, full ? 8 : 3).map((f) => f.verdict === "kill"
        ? `<div class="line"><span class="killed trunc">${sym(f.symbol, f.mint)}</span><span class="trunc">${esc(f.reason || "")}</span></div>`
        : `<div class="line"><span class="trunc">${sym(f.symbol, f.mint)}</span><span class="r" style="color:#ffd60a">→ Analyst</span></div>`).join("") || '<div class="line">No pools yet tonight</div>';
    } else if (b.name === "analyst") {
      const l = b.last; const layers = (l && l.layers) || [];
      body = `<div class="big">${b.taken_apart ?? 0} taken apart</div>` + (l ? `<div style="display:flex;align-items:center;gap:12px"><div style="flex:1;min-width:0">
        <div class="line"><span class="trunc">${sym(l.symbol, l.mint)}</span>${l.social_pts != null ? `<span class="r">Social +${esc(l.social_pts)}</span>` : ""}</div>
        <div class="strips">${Array.from({ length: 8 }, (_, i) => { const x = layers[i]; return `<i class="${x && x.pass === 1 ? "ok" : x && x.pass === 0 ? "no" : ""}"></i>`; }).join("")}</div></div>
        <div style="width:56px">${Charts.ring(l.score, b.pass_score).replace('class="ring"', 'class="ring" style="width:56px;height:56px"')}</div></div>` : '<div class="line">Nothing audited yet</div>');
    } else if (b.name === "brain") {
      const s = b.last_size;
      body = `<div class="big">Sizing</div>${s ? `<div class="line">${money(s.usd)} · ${s.pct_of_cash != null ? Math.round(s.pct_of_cash) : "–"}% of cash <span class="r">${sym(s.symbol, s.mint)}</span></div>` : '<div class="line">No size yet</div>'}
        <div class="line">${esc(b.rule)}</div><div class="line">${esc(b.rule_below)}</div>`;
    } else if (b.name === "executor") {
      const o = b.last_order;
      const barTxt = !o ? `Waiting for a dip -${b.dip_pct ?? 15}%` : o.status === "clicking" ? `Clicking ${o.side === "buy" ? "Buy" : "Sell"}...` : o.status === "done" ? `✓ ${o.side === "buy" ? "Bought" : "Sold"} · verified` : `${esc(o.side)} ${esc(o.status)}`;
      body = `<div class="big">${b.trades ?? 0} trades</div><div class="line">${barTxt}</div><div class="bar"><b style="width:${o && o.status === "done" ? 100 : o ? 55 : 8}%"></b></div>`;
    } else if (b.name === "risk") {
      body = `<div class="big">${b.guarding ? "Guarding" : "Nothing open"}</div><div class="line"><span class="pill mono red">stop -${b.stop_pct ?? 25}%</span><span class="pill mono green">trail ${b.trail_pct ?? 40}%</span></div>
        <div class="line">${b.guarding ? b.guarding + " open position" + (b.guarding > 1 ? "s" : "") : "Watching for positions"}</div>`;
    }
    return `<div class="card bot" ${full ? "" : `data-act="tab" data-tab="bots"`}><div class="head">${st}<span style="color:${esc(b.color || "#fff")}">${esc(b.title || b.name)}</span><span class="ter" style="margin-left:auto;font-weight:400;font-size:13px">${esc(b.status || "off")}</span></div>${body}</div>`;
  }
  function actRow(r) {
    const k = r.kind, col = k === "bought" ? "#00f5a0" : k === "sold" ? (isTP(r) ? "#ffc940" : "#00c2ff") : k === "stopped" ? "#ff4d6d" : "#8e8e93";
    const rv = k === "rejected" ? `<span class="mut">Skipped</span>` : esc(r.value || "");
    const act = k === "rejected" ? "audit" : "coin";
    return `<div class="row" data-act="${act}" data-mint="${esc(r.mint)}"><div class="ic" style="color:${col}">${esc((r.title || "?").split(" ").pop().slice(0, 1))}</div>
      <div class="tx"><div class="t1">${esc(r.title)}</div><div class="t2">${esc(r.subtitle || "")} · ${hm(r.ts)}</div></div>
      <div class="rv">${rv}<small>${fomoA(r.link)}</small></div></div>`;
  }
  function posRow(p) {
    return `<div class="row" data-act="coin" data-mint="${esc(p.mint)}"><div class="ic">${sym(p.symbol, p.mint).slice(0, 1)}</div>
      <div class="tx"><div class="t1">${sym(p.symbol, p.mint)}</div><div class="t2">${money(p.size_usd)} in · stop ${priceFmt(p.stop_price)}</div></div>
      <div class="rv">${money(p.value_usd)}<small class="${(p.change_pct || 0) >= 0 ? "up" : "down"}">${pct(p.change_pct)}</small></div></div>`;
  }

  function viewBots() {
    return `<h1 class="title">Bots</h1>${BOT_ORDER.map((n) => {
      const b = bots()[n] || { name: n, title: n }, dec = S.files["bots/" + n];
      const locked = n === "risk" && b.locked;
      const rows = dec ? dec.rows : null;
      return `<div class="card" style="margin-bottom:12px">${botCard(b, true).replace(/^<div class="card bot" >/, '<div class="bot">')}
        <div class="row" style="padding:10px 0;min-height:52px"><div class="tx"><div class="t1">${locked ? "Locked · position open" : ({ running: "Running", stale: "Stale · last beat " + (b.age_s != null ? Math.round(b.age_s / 60) + "m ago" : "–"), paused: "Paused", off: "Off" }[b.status] || "Off")}</div><div class="t2">${locked ? "Risk can't be paused with a position open" : "Pause · via Telegram (STEP 11)"}</div></div>
          <span class="switch ${b.status === "running" || b.status === "stale" ? "on" : ""}" role="switch" aria-checked="${b.status === "running" || b.status === "stale"}" aria-disabled="true"></span></div>
        <div class="grp" style="margin:6px 0">Last 20 decisions</div>
        ${rows == null ? sk(44) : rows.length ? `<div class="list plain" style="background:var(--c2)">${rows.slice(0, 20).map((r) => `<div class="row" style="min-height:48px" data-act="${n === "analyst" || n === "scanner" ? "audit" : "coin"}" data-mint="${esc(r.mint)}">
          <div class="tx"><div class="t1" style="font-size:15px">${sym(r.symbol, r.mint)} <span class="${/kill|reject/.test(r.decision) ? "down" : "mut"}" style="font-size:13px">${esc(r.decision)}</span></div><div class="t2">${esc(r.reason || "")} · ${hm(r.ts)}</div></div>
          <div class="rv">${fomoA(r.link)}</div></div>`).join("")}</div>` : '<div class="empty" style="background:var(--c2);padding:16px">No decisions yet tonight</div>'}
        <button class="loadmore" data-act="settings" data-grp="${n}">Settings</button></div>`;
    }).join("")}`;
  }

  function viewActivity() {
    const pages = []; for (let i = 0; i < 10 && S.files["activity/" + i]; i++) pages.push(S.files["activity/" + i]);
    const rows = pages.flatMap((p) => p.rows), more = pages.length && pages[pages.length - 1].next_before;
    if (!S.files["activity/0"]) return `<h1 class="title">Activity</h1>${sk(60)}${sk(60)}${sk(60)}`;
    localStorage.setItem("desk.seen", String(rows[0] ? rows[0].ts : Date.now() / 1000));
    return `<h1 class="title">Activity</h1>${rows.length ? `<div class="list">${rows.map(actRow).join("")}</div>${more ? `<button class="loadmore" data-act="more">Load more</button>` : ""}` : '<div class="empty"><b>Nothing yet tonight</b>Bought, sold, stopped and rejected coins show up here.</div>'}`;
  }

  function viewCoin(mint) {
    const c = S.files["coin/" + mint];
    if (c === undefined) return backBar("Back") + sk(34, "60%") + sk(20, "40%", 8) + sk(48, "50%", 12, 16) + sk(220) + `<div class="stats">${sk(52, "auto", 14, 0).repeat(3)}</div>`;
    if (c === null) return backBar("Back") + `<div class="empty"><b>Not published</b>The desk only publishes coins it looked at tonight.</div>`;
    const p = c.position, since = p && p.entry_price && c.price ? 100 * (c.price / p.entry_price - 1) : null;
    return `${backBar("Back")}
      <div class="coinhead"><div class="nm">${esc(c.name || c.symbol)}</div>${paperPill()}</div>
      <div class="sub">${sym(c.symbol, mint)} · ${esc(c.chain)} · ${age(c.created_at)} <span class="shield">${ICON.shield}${esc(c.shield)}</span></div>
      <div class="price">${priceFmt(c.price)}</div>
      ${since != null ? `<div class="today"><span class="${since >= 0 ? "up" : "down"}">${since >= 0 ? "▲" : "▼"} ${Math.abs(since).toFixed(2)}% since entry</span></div>` : `<div class="today mut" style="font-size:15px">Price ${c.price_ts ? "at " + hm(c.price_ts) : "–"}</div>`}
      <div class="chartbox" style="height:220px;margin-top:10px"><canvas id="cchart"></canvas>${(c.candles || []).length ? "" : '<div class="chartnote">No price data yet</div>'}</div>
      <div class="stats"><div><span>Market cap</span><b>${compact(c.market_cap_usd)}</b></div><div><span>Liquidity</span><b>${compact(c.liquidity_usd)}</b></div><div><span>Holders</span><b>${c.holders != null ? c.holders.toLocaleString() : "–"}</b></div></div>
      ${p ? `<div class="card poscard"><div class="tx" style="flex:1"><div class="t1">Your position · ${money(p.size_usd)} in · Executor</div><div class="t2 mut" style="font-size:13px;margin-top:3px">now ${money(p.value_usd)} · stop ${priceFmt(c.exit_line)}</div></div></div>` : `<div class="card poscard"><span class="mut">No open position</span></div>`}
      <div class="btns">${fomoLink(c.link) ? `<a class="btn primary" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : ""}
        <button class="btn ${p ? "" : "dis"}" data-act="sell" data-mint="${esc(mint)}" ${p ? "" : "disabled"}>Sell now</button></div>
      <button class="loadmore" data-act="audit" data-mint="${esc(mint)}">Audit</button>`;
  }

  function viewAudit(mint) {
    const a = S.files["audit/" + mint];
    if (a === undefined) return backBar("Back") + sk(34, "60%") + Array.from({ length: 8 }, () => sk(56, "100%", 14, 8)).join("");
    if (a === null) return backBar("Back") + `<div class="empty"><b>No audit for this coin</b>Scanner cut it before Analyst took it apart.</div>${S.files["coin/" + mint] ? `<button class="loadmore" data-act="coin" data-mint="${esc(mint)}">Open coin</button>` : ""}`;
    const s = a.score, ls = a.layers || [];
    const passed = ls.filter((l) => l.pass === 1).length;
    return `${backBar("Back")}
      <div class="coinhead"><div class="nm">${esc(a.name || a.symbol)}</div>${paperPill()}</div>
      <div class="sub">${sym(a.symbol, mint)} · Solana <span class="shield">${ICON.shield}${passed}/8</span> ${fomoA(a.link)}</div>
      <div class="score">${Charts.ring(s && s.score, 70)}<div><div class="t1" style="font-size:17px;font-weight:600">${s ? (s.pass ? "Passed" : "Rejected") : "Not scored"}</div><div class="mut" style="font-size:14px;margin-top:4px">${esc((s && s.reason) || (s ? "" : "a red layer stops it before the score"))}</div></div></div>
      <div class="discs">${ls.map((l, i) => `<div class="disc"><span class="beam" style="animation-delay:${i * 0.35}s"></span>
        <span class="d" data-st="${l.pass === 1 ? "ok" : l.pass === 0 ? "no" : "na"}" style="transition-delay:${i * 0.35 + 0.3}s">${l.layer}</span>
        <span class="nm">${esc(l.name)}</span><span class="val ${l.pass === 0 ? "down" : l.pass === 1 ? "" : "ter"}">${esc(l.value_text)}</span></div>`).join("")}</div>
      <div class="social">${esc(a.social_line || "Social: off")}</div>`;
  }

  function viewAccount() {
    const ac = S.files.account, se = S.files.settings, st = S.state;
    if (!ac) return `<h1 class="title">Account</h1>${sk(36)}${sk(60)}${sk(60)}${sk(200)}`;
    const groups = se ? se.groups : {};
    const setRow = (r) => {
      const v = r.type === "bool" ? r.value : r.value, num = r.type === "int" || r.type === "float";
      const k = r.key.split(".").slice(1).join(".");
      if (!num) return `<div class="set"><div class="top"><span class="k">${esc(k)}</span><span class="mut">${esc(r.key === "desk.withdraw_address" ? (v ? "set" : "not set") : r.key === "desk.rpc_url" ? (String(v).includes("helius") ? "Helius" : "public RPC") : v)}</span></div></div>`;
      return `<div class="set"><div class="top"><span class="k">${esc(k)}</span><input type="number" value="${esc(v)}" disabled></div>
        <input type="range" min="${esc(r.min)}" max="${esc(r.max)}" step="${r.type === "int" ? 1 : "any"}" value="${esc(v)}" disabled></div>`;
    };
    return `<h1 class="title">Account</h1>
      <div class="seg"><span class="${ac.mode === "PAPER" ? "on" : ""}">PAPER</span><span class="${ac.mode === "LIVE" ? "on" : ""}">LIVE</span></div>
      ${roNote("Switch with 'paper' / 'live' (LIVE needs you to type LIVE)")}
      <div class="grp">Cash</div><div class="list plain"><div class="row"><div class="tx"><div class="t1">${money(ac.cash)}</div><div class="t2">${ac.mode === "PAPER" ? `PAPER start cash ${money(ac.paper_start_cash)}` : "from FOMO /balances"}</div></div></div></div>
      <div class="grp">FOMO</div><div class="list plain">
        ${fomoLink(ac.profile_url) ? `<a class="row" href="${esc(ac.profile_url)}" target="_blank" rel="noopener noreferrer"><div class="tx"><div class="t1">Your FOMO profile</div><div class="t2">@${esc(ac.fomo_handle)}</div></div><span class="ter">›</span></a>` : ""}
        ${fomoLink(ac.invite_url) ? `<button class="row" data-act="invite" style="width:100%;text-align:left"><div class="tx"><div class="t1">Invite a friend</div><div class="t2">Share your FOMO invite link</div></div><span class="ter">›</span></button>` : ""}
      </div>
      <div class="grp">Effects</div><div class="list plain"><button class="row" data-act="fxdemo" style="width:100%;text-align:left"><div class="tx"><div class="t1">Replay effects</div><div class="t2">Preview buy, take profit, stop and trail on Home · no trade</div></div><span class="ter">›</span></button></div>
      ${copyPicks(ac.copy_picks)}
      <div class="grp">Pushes</div><div class="list plain">
        <div class="row"><div class="tx"><div class="t1">Telegram</div><div class="t2">${ac.pushes && ac.pushes.telegram ? "connected" : "not connected yet (STEP 11)"}</div></div></div>
        <div class="row"><div class="tx"><div class="t1">Web push</div><div class="t2">Telegram only (plan B hosting)</div></div></div>
        <div class="row"><div class="tx"><div class="t1 mut">Send test push</div><div class="t2">via Telegram (STEP 11)</div></div></div>
        <div class="row"><div class="tx"><div class="t1">Watch in Grok Bot</div><div class="t2">Open the Grok Bot app to watch the bot's computer live</div></div></div>
      </div>
      <div class="grp" style="margin-top:28px">Settings · read-only here, change via Telegram (STEP 11), e.g. "set stop to -20%"</div>
      ${["scanner", "analyst", "social", "brain", "executor", "risk", "desk", "browser"].filter((g) => groups[g]).map((g) => `<div class="grp" id="set-${g}">${esc(g[0].toUpperCase() + g.slice(1))}</div><div class="list plain">${groups[g].map(setRow).join("")}</div>`).join("")}
      <div class="ter" style="font-size:12px;text-align:center;margin:20px 0">Last update ${hm(S.lastIxT)} · ${esc(st ? st.mode : "")} · hosting plan B</div>`;
  }

  function copyPicks(cp) {
    const k = (v) => (v == null ? "–" : (v < 0 ? "-$" : "+$") + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (Math.abs(v) / 1e3).toFixed(1) + "k" : Math.abs(v).toFixed(0)));
    const ago = (ts) => { if (!ts) return "–"; const m = (Date.now() / 1000 - ts) / 60; return m < 60 ? `${m.toFixed(0)}m ago` : m < 2880 ? `${(m / 60).toFixed(0)}h ago` : `${(m / 1440).toFixed(0)}d ago`; };
    const head = `<div class="grp">Copy picks · ${cp && cp.every !== "off" ? `every ${esc(cp.every)} at ${esc(cp.time)}` : "off"}</div>`;
    if (!cp || !cp.lists || !cp.lists.length) return head + `<div class="list plain"><div class="row"><div class="tx"><div class="t1">No list yet</div><div class="t2">off / every 24h / 12h / 6h + time · via Telegram</div></div></div></div>`;
    const cur = cp.lists[0];
    const card = (r) => `<div class="cp">
        <div class="cp-top"><span class="cp-h">#${esc(r.rank)} ${esc(r.handle)}</span>${fomoLink(r.profile_link) ? `<a class="cp-btn" href="${esc(r.profile_link)}" target="_blank" rel="noopener noreferrer">Profile</a>` : ""}</div>
        <div class="cp-n"><span class="up">7d ${esc(k(r.pnl_7d))}</span><span class="up">30d ${esc(k(r.pnl_30d))}</span><span class="mut">${esc(r.trades)} trades</span><span class="mut">last trade ${esc(ago(r.last_trade_ts))}</span></div>
        ${r.last_buy_mint ? (fomoLink(r.coin_link) ? `<a class="cp-buy" href="${esc(r.coin_link)}" target="_blank" rel="noopener noreferrer">` : `<div class="cp-buy">`) + `<span>Last buy · ${esc(r.last_buy_symbol || r.last_buy_mint.slice(0, 6))}</span><span class="mut">${r.last_buy_mcap ? money(r.last_buy_mcap, 0) : "mcap n/a"}${r.last_buy_chain !== "solana" ? " · " + esc(r.last_buy_chain) : ""} ›</span>` + (fomoLink(r.coin_link) ? "</a>" : "</div>") : ""}
        <div class="cp-why mut">${esc(r.why)}</div>
        <div class="cp-sw"><span>Copy on desk</span><span class="sw ${r.copy_on ? "on" : ""}" aria-disabled="true"><i></i></span></div>
      </div>`;
    const hist = cp.lists.map((l) => `<div class="row"><div class="tx"><div class="t1">${esc(l.list_id)}</div><div class="t2">${l.rows.map((r) => esc(r.handle)).join(" · ")}</div></div></div>`).join("");
    return head + `<div class="ter" style="font-size:12px;margin:0 0 8px">${esc(cur.list_id)} · newest on top</div>${cur.rows.map(card).join("")}
      ${roNote(`Copy on desk: 'copy on <handle>' (max ${esc(cp.max_on_copy)}, PAPER now)`)}
      <div class="grp">Last 7 lists</div><div class="list plain">${hist}</div>`;
  }

  // ---------- render ----------
  let lastHtmlKey = "";
  function render(fromPoll) {
    offlineRow();
    const view = $("#view"), top = S.stack[S.stack.length - 1];
    if (!S.dp) { view.innerHTML = viewGate("nolink"); return; }
    if (!S.state) { view.innerHTML = S.firstTry ? viewLoading() : viewGate("nodata"); return; }
    const key = top ? top.kind + top.mint : S.tab;
    if (fromPoll && document.activeElement && document.activeElement.tagName === "INPUT") return; // don't wipe the search field
    const y = scrollY;
    let html = "";
    if (top && top.kind === "coin") { ensure("coin/" + top.mint); html = viewCoin(top.mint); }
    else if (top && top.kind === "audit") { ensure("audit/" + top.mint); html = viewAudit(top.mint); }
    else if (S.tab === "home") html = viewHome();
    else if (S.tab === "bots") { BOT_ORDER.forEach((n) => ensure("bots/" + n)); html = viewBots(); }
    else if (S.tab === "activity") html = viewActivity();
    else if (S.tab === "account") { ensure("account"); ensure("settings"); html = viewAccount(); }
    const oldBal = $("#bal");     // keep the odometer node across renders so changed digits roll
    view.innerHTML = html;
    const newBal = $("#bal"); if (oldBal && newBal && oldBal.dataset.n) newBal.replaceWith(oldBal);
    if (key === lastHtmlKey && fromPoll) scrollTo(0, y); lastHtmlKey = key;
    after();
  }
  function ensure(name) {
    if (!S.ix) { if (S.files[name] === undefined && !S.cached) S.files[name] = undefined; return; }
    const v = S.ix.files[name];
    if (!v) { S.files[name] = null; return; }
    if (S.ver[name] === v || S.loadingFile[name]) return;
    S.loadingFile[name] = true;
    getFile(name).then(() => { S.loadingFile[name] = false; render(); }, () => { S.loadingFile[name] = false; });
  }
  let prevChart = null;
  function after() {
    const bal = $("#bal");
    if (bal && S.state) tween(bal, S.state.balance);
    const bc = $("#bchart"); if (bc) { const ch = S.files["chart/" + S.range]; Charts.line(bc, ch, prevChart); prevChart = ch; }
    const top = S.stack[S.stack.length - 1];
    const cc = $("#cchart"); if (cc && top) { const c = S.files["coin/" + top.mint]; if (c) Charts.candles(cc, c.candles, c.exit_line, c.position && c.position.entry_price); }
    document.querySelectorAll(".disc .d").forEach((d) => requestAnimationFrame(() => d.classList.add(d.dataset.st)));
    if (reduce()) document.querySelectorAll(".disc .d").forEach((d) => { d.style.transitionDelay = "0s"; d.classList.add(d.dataset.st); });
    paintScreen(); liveLabel(); fxPlay();
  }

  // ---------- actions ----------
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]"); if (!t || e.target.closest("a")) return;
    const act = t.dataset.act;
    if (act === "tab") go(t.dataset.tab);
    else if (act === "back") history.back();
    else if (act === "range") { S.range = t.dataset.r; await getFile("chart/" + S.range).catch(() => {}); render(); }
    else if (act === "coin" && t.dataset.mint) push({ kind: "coin", mint: t.dataset.mint });
    else if (act === "audit" && t.dataset.mint) push({ kind: "audit", mint: t.dataset.mint });
    else if (act === "settings") { go("account"); setTimeout(() => { const g = document.getElementById("set-" + t.dataset.grp); if (g) g.scrollIntoView(); }, 300); }
    else if (act === "more") { for (let i = 0; i < 10; i++) if (!S.files["activity/" + i]) { await getFile("activity/" + i).catch(() => {}); break; } render(); }
    else if (act === "search") openSearch();
    else if (act === "full") openFull();
    else if (act === "sell") openSell(t.dataset.mint);
    else if (act === "invite") invite();
    else if (act === "closesheet") $("#sheet").hidden = true;
    else if (act === "fxdemo") fxDemo();
  });
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1800); }
  async function invite() {
    const u = fomoLink(S.files.account && S.files.account.invite_url); if (!u) return;
    if (navigator.share) { try { await navigator.share({ title: "FOMO", url: u }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(u); toast("Link copied"); } catch { toast(u); }
  }
  function openSearch() {
    const box = $("#searchbox"); if (!box) return;
    box.innerHTML = `<div class="search">${ICON.search}<input id="q" placeholder="Name, symbol or mint" autocomplete="off" autocapitalize="off" spellcheck="false"></div><div id="qres"></div>`;
    const q = $("#q"); q.focus();
    q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase(), rows = ((S.files.coins || {}).rows || []);
      const hit = s ? rows.filter((r) => (r.mint || "").toLowerCase() === s || (r.symbol || "").toLowerCase().includes(s) || (r.name || "").toLowerCase().includes(s)).slice(0, 8) : [];
      $("#qres").innerHTML = !s ? "" : hit.length ? `<div class="list" style="margin-bottom:12px">${hit.map((r) => `<div class="row" data-act="coin" data-mint="${esc(r.mint)}"><div class="ic">${sym(r.symbol, r.mint).slice(0, 1)}</div><div class="tx"><div class="t1">${esc(r.name || r.symbol)}</div><div class="t2">${sym(r.symbol, r.mint)} · ${esc(r.mint.slice(0, 6))}…</div></div><div class="rv">${fomoA(r.link)}</div></div>`).join("")}</div>`
        : `<div class="empty" style="margin-bottom:12px">No coin the desk saw tonight matches "${esc(q.value)}"</div>`;
    });
  }
  function openSell(mint) {
    const c = S.files["coin/" + mint] || {}, s = sym(c.symbol, mint), sh = $("#sheet");
    sh.innerHTML = `<div class="in"><div class="grab"></div><div style="font:600 20px var(--disp);margin-bottom:12px">Sell ${s}</div>
      <div class="btns" style="margin-top:0">${[25, 50, 100].map((p) => `<button class="btn dis" disabled>${p}%</button>`).join("")}</div>
      <button class="btn red dis" style="width:100%;margin-top:10px" disabled>Confirm sell</button>
      <div class="ro" style="font-size:13px;margin-top:10px">Plan B has no server to POST to. Send "sell ${s} 50" in Telegram (STEP 11); Executor clicks it and verifies.</div>
      <button class="btn" style="width:100%;margin-top:12px" data-act="closesheet">Close</button></div>`;
    sh.hidden = false; sh.onclick = (e) => { if (e.target === sh) sh.hidden = true; };
  }
  function openFull() {
    if (!S.screenUrl) return;
    const f = $("#full"), link = fomoLink(S.state && S.state.screen && S.state.screen.link);
    f.innerHTML = `<div class="bar2"><button class="back" id="fclose">${ICON.back}Done</button><div style="flex:1"></div>${link ? `<a class="fomo" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : ""}</div><img src="${S.screenUrl}" alt="">`;
    f.hidden = false; const img = $("img", f);
    let scale = 1, tx = 0, ty = 0, pts = new Map(), d0 = 0, s0 = 1, last = null;
    const apply = () => (img.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`);
    f.onpointerdown = (e) => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); s0 = scale; } last = e; };
    f.onpointermove = (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; scale = Math.min(5, Math.max(1, s0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / d0)); }
      else if (scale > 1 && last) { tx += e.clientX - last.clientX; ty += e.clientY - last.clientY; }
      last = e; apply(); };
    f.onpointerup = f.onpointercancel = (e) => { pts.delete(e.pointerId); if (scale === 1) { tx = ty = 0; apply(); } };
    $("#fclose").onclick = () => { f.hidden = true; f.innerHTML = ""; };
  }

  // ---------- Add to Home Screen hint (Safari only, link still in the URL so the icon keeps it) ----------
  function showA2hs() {
    if (document.getElementById("a2hs")) return;
    const d = document.createElement("div"); d.id = "a2hs";
    d.innerHTML = `<span>Now tap <b>Share</b> → <b>Add to Home Screen</b>. The icon keeps your private desk link.</span><button aria-label="Close">✕</button>`;
    d.querySelector("button").onclick = () => { d.remove(); localStorage.setItem("desk.a2hs.off", "1"); };
    document.body.appendChild(d);
  }

  // ---------- effects preview (#fx=demo or Account > Replay effects): local only, no data written, no calls to the desk ----------
  // Plays buy -> take profit -> stop -> trail on Home, 2.5 s apart, over one clearly fake sample row that only exists in the DOM.
  const fxFlag = () => /[#&]fx=demo\b/.test(location.hash);
  function stripFxFlag() {     // drop only fx=demo from the hash; a #d= link stays exactly as it was
    if (!fxFlag()) return;
    const h = location.hash.slice(1).split("&").filter((x) => x && x !== "fx=demo").join("&");
    history.replaceState(history.state, "", location.pathname + location.search + (h ? "#" + h : ""));
  }
  const DEMO = { buy: ["Buy", "rocket launch"], tp: ["Take profit", "firework"], stop: ["Stop loss", "crash"], sell: ["Trail sell", "landing"] };
  const demoRow = () => `<div class="prow gain demo" id="demorow"><div class="pic">★</div>
      <div class="ptx"><div class="psym">SAMPLE <span class="tag demo">PREVIEW</span></div><div class="psub">Not a real position · no trade</div></div>
      <div class="ppl"><div class="pval">$0.00</div><div class="pchg mut">effects demo</div></div></div>`;
  async function fxDemo() {
    if (S.demo) return;
    if (!S.state) { toast("Open your desk link first, then replay"); return; }
    S.demo = true; go("home");
    const calm = reduce();
    if (!calm) { Object.values(RC).forEach(rocketSprite); for (let i = 0; i < 15 && Object.values(RC).some((c) => !rocketSprite(c)); i++) await new Promise((r) => setTimeout(r, 100)); }
    const row0 = $("#demorow"); if (row0) row0.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    ["buy", "tp", "stop", "sell"].forEach((k, i) => setTimeout(() => {
      if (S.tab !== "home" || S.stack.length) return;            // left Home: skip the rest quietly
      const row = $("#demorow"), hero = $("#hero");
      const els = k === "tp" ? [row, hero] : k === "stop" ? [row, hero] : [row];
      els.filter(Boolean).forEach((el) => { el.classList.remove("fx-buy", "fx-tp", "fx-stop", "fx-sell"); void el.offsetWidth; el.classList.add("fx-" + k); setTimeout(() => el.classList.remove("fx-" + k), 2300); });
      demoBanner("PREVIEW · no trade", calm ? DEMO[k][0] + " · reduced motion is on, outline only" : DEMO[k].join(" · "), k);
      if (!calm) {
        const shake = () => { const v = $("#view"); if (v) { v.classList.remove("pp-shake"); void v.offsetWidth; v.classList.add("pp-shake"); setTimeout(() => v.classList.remove("pp-shake"), 600); } };
        arcade(k, k === "tp" ? hero || row : row || hero, k === "stop" ? shake : null);
      }
    }, 300 + i * 2500));
    setTimeout(() => { S.demo = false; render(); }, 300 + 4 * 2500 + 300);
  }
  function demoBanner(t, sub, kind) {
    const el = document.createElement("div"); el.className = "ppban demo " + kind;
    el.innerHTML = `<b>${esc(t)}</b> <span>${esc(sub)}</span>`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), 2100); setTimeout(() => el.remove(), 2700);
  }
  addEventListener("hashchange", () => { if (fxFlag()) { stripFxFlag(); if (S.state) fxDemo(); } });

  // ---------- start ----------
  async function start() {
    const wantDemo = fxFlag(); stripFxFlag();
    S.dp = DeskCrypto.dataPath(); // takes #d= into localStorage; strips it only in the home-screen app (iOS storage is separate)
    S.a2hs = !DeskCrypto.isStandalone() && DeskCrypto.linkInUrl() && localStorage.getItem("desk.a2hs.off") !== "1";
    if (S.a2hs) showA2hs();
    if (window.__DESK_FIXTURE) { fixture(window.__DESK_FIXTURE); if (wantDemo) setTimeout(fxDemo, 800); return; }
    if (!S.dp) { render(); if (wantDemo) setTimeout(() => toast("Open your desk link first, then replay"), 500); return; }
    S.desk = await DeskCrypto.open(S.dp, BASE);
    render(); await poll();
    if (wantDemo) setTimeout(fxDemo, 600);
    setInterval(poll, POLL_S * 1000);
    setInterval(() => { const g = $("#gaten"); if (g) g.textContent = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000)); }, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  }
  // test hook for screenshots only (Playwright sets window.__DESK_FIXTURE); never set in the real app
  function fixture(fx) {
    S.dp = S.dp || "fixture"; S.ix = { files: {}, t: fx.t || Date.now() / 1000 }; S.state = fx.state; S.lastIxT = S.ix.t; S.err = fx.err || null; S.retryAt = Date.now() + POLL_S * 1000; S.firstTry = false;
    for (const [k, v] of Object.entries(fx.files || {})) { S.files[k] = v; S.ver[k] = "fx"; S.ix.files[k] = "fx"; }
    if (fx.screen) { S.screenUrl = fx.screen; }
    fxDiff(S.state, S.files["activity/0"]);
    render();
    window.__ppFixtureStep = (nx) => { S.state = nx.state; for (const [k, v] of Object.entries(nx.files || {})) S.files[k] = v; fxDiff(S.state, S.files["activity/0"]); render(true); };
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  addEventListener("resize", () => after());
  start();
})();
