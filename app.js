// app.js - Pump Pilot, the desk on the iPhone (STEP 10, restyled 2026-11-15), hosting plan B (DECISIONS #26).
// Reads encrypted files from the public repo with desk-crypto.js, polls every 15 s (no SSE).
// FOMO links are only ever the strings links.py put into the data; this file never builds one.
(() => {
  const BASE = "https://raw.githubusercontent.com/dustinbryantceo-dev/fomo-desk/data";
  const POLL_S = 15, STALE_S = 60;
  const BOT_ORDER = ["scanner", "analyst", "brain", "executor", "risk"];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fomoLink = (u) => (!S.viewer && typeof u === "string" && /^https:\/\/fomo\.family\//.test(u) ? u : null); // check only, never build
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
    if ((S.tab === "account" || S.tab === "home") && !S.stack.length && ctlAuth()) await ctlPoll();
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
  function go(tab) { if (tab === "account" && tab !== S.tab) ctlPoll().then(() => { if (S.tab === "account") render(true); });
    const moved = tab !== S.tab || S.stack.length; S.tab = tab; S.stack = []; document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); render(); scrollTo(0, 0); if (moved) slideIn(); }
  function slideIn() { const v = $("#view"); if (!v || reduce()) return; v.classList.remove("vin"); void v.offsetWidth; v.classList.add("vin"); clearTimeout(slideIn.t); slideIn.t = setTimeout(() => v.classList.remove("vin"), 320); }
  function push(view) { S.stack.push(view); history.pushState({ d: S.stack.length }, ""); render(); scrollTo(0, 0); slideIn(); }
  addEventListener("popstate", () => { if (S.stack.length) { S.stack.pop(); render(); } });
  document.querySelectorAll("#tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

  // ---------- shared pieces ----------
  const ICON = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
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
    el.hidden = false; el.textContent = `Desk on standby · checking again in ${n}s · last update ${S.lastIxT ? hm(S.lastIxT) : "never"}`;
  }
  // maintenance strip: deskctl writes data/.maint.json, the desk publishes it in state.maint
  function maintRow() {
    let el = $("#maint");
    if (!el) { el = document.createElement("div"); el.id = "maint"; el.className = "maint"; el.hidden = true; el.setAttribute("role", "status"); document.body.appendChild(el);
      el.onclick = () => { if (el.dataset.k !== "updating") { S.maintSeen = el.dataset.ts; el.hidden = true; } }; }
    const m = S.state && S.state.maint;
    if (!m || (m.state !== "updating" && S.maintSeen === String(m.ts))) { el.hidden = true; return; }
    const left = m.eta_ts ? Math.ceil((m.eta_ts * 1000 - Date.now()) / 60000) : null;
    const txt = m.state === "updating" ? `🛠️ Updating… ${m.what || "Pump Pilot"} · ${left == null ? "back soon" : left > 0 ? `back in ~${left} min` : "almost done"}`
      : m.state === "done" ? `Updated ✓${m.version ? " · " + m.version : ""}` : "⚠️ Update not confirmed · the desk is being checked";
    el.className = "maint " + m.state; el.dataset.k = m.state; el.dataset.ts = String(m.ts);
    if (el.textContent !== txt) el.textContent = txt; el.hidden = false;
  }
  function badgeTick() { const b = $("#mbadge"); if (b) { const h = modeBadge(); if (b.dataset.h !== h) { b.innerHTML = h; b.dataset.h = h; } } }
  setInterval(() => { offlineRow(); liveLabel(); badgeTick(); maintRow(); }, 1000);

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
  const LOGO = '<img src="rocket-logo.png" class="pplogo" alt="">';
  // desk up = fresh data from the last poll; otherwise the badge says STANDBY (never "offline")
  const deskUp = () => !!S.state && !S.err;
  const modeBadge = () => { const m = S.state && S.state.mode; if (S.state && !deskUp()) return '<span class="mbadge standby"><i></i>STANDBY</span>'; return m === "LIVE" ? '<span class="mbadge live"><i></i>LIVE</span>' : m === "PAPER" ? '<span class="mbadge paper">PAPER</span>' : ""; };
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
    const tags = (p.starship ? '<span class="tag ss">🚀 STARSHIP</span>' : "") + (p.tp_done ? '<span class="tag tp">TP HIT</span>' : "") + (p.trail_active ? '<span class="tag sell">TRAILING</span>' : "");
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
        <div class="navsp"></div>${S.viewer ? '<span class="vbadge">👀 VIEW ONLY</span>' : ""}<span id="mbadge">${modeBadge()}</span>
        ${canCtl() ? `<button class="iconbtn ${pausedNow().size ? "paused" : ""}" data-act="bots" aria-label="Pause or resume bots">${pausedNow().size ? ICON.play : ICON.pause}${pausedNow().size ? '<i class="dot amber"></i>' : ""}</button>` : ""}
        <button class="iconbtn" data-act="search" aria-label="Search">${ICON.search}</button>
        <button class="iconbtn" data-act="tab" data-tab="activity" aria-label="Activity">${ICON.bell}${unseen ? '<i class="dot"></i>' : ""}</button>
      </header>
      <div id="searchbox"></div>
      <div class="home">
        <section class="hero glass${S.rp ? " replaying" : ""}" id="hero">
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
          <div class="chartbox"><canvas id="bchart"></canvas>${!S.rp && (!chart || (chart.points || []).length < 2) ? `<div class="chartnote">${chart ? "Waiting for the first trade" : ""}</div>` : ""}
            ${S.rp ? `<span class="rpbadge"><i></i>REPLAY <small>${esc(S.rp.range)} · ${S.rp.speed}x</small></span>` : `<button class="rpbtn" data-act="replay" aria-label="Replay this range">▶ Play</button>`}
            ${!S.rp && S.rpMsg > Date.now() ? '<div class="rpempty">Nothing to replay in this range</div>' : ""}</div>
          ${S.rp ? rpControls() : `<div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map((r) => `<button data-act="range" data-r="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>`}
        </section>
        <section class="a-bots">${botStrip()}</section>
        <section class="a-pos">
          ${canCtl() ? ssHomeCard() : ""}
          <h2 class="sec">Open positions <span class="count">· ${pos.length}</span></h2>
          ${S.demo ? `<div class="plist">${demoRow()}</div>` : ""}
          ${pos.length ? `<div class="plist">${pos.map(posCard).join("")}</div>` : S.demo ? "" : '<div class="empty glass"><b>No open positions</b>Risk is watching for the next entry.</div>'}
        </section>
        <section class="a-frame"${S.viewer ? " hidden" : ""}>
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
        <section class="a-guide"><button class="guidecard glass" data-act="guide"><img src="icons/icon-192.png" alt=""><span class="gt"><b>How Pump Pilot works</b><span>The 5 bots, PAPER vs LIVE, stops and take profit, in one guide</span></span><span class="go">›</span></button></section>
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
  // buy -> rocket launch + blue glow; take-profit (or tp_done 0->1) -> rocket detonates into a teal firework + teal edge glow; stop -> rocket stalls, tumbles, crashes + red sparks/edge glow + shake; sell -> rocket landing + blue puff
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
    const t = { buy: "Bought", tp: "Take profit", stop: "Stopped out", sell: "Exit" }[e.kind];
    const p = (S.state.positions || []).find((x) => x.mint === e.mint);
    const r = ((S.files["activity/0"] || {}).rows || []).find((x) => x.id === e.aid || (e.aid == null && x.mint === e.mint));
    const s = (p && p.symbol) || (r && (r.title || "").split(" ").slice(1).join(" ")) || (e.mint || "").slice(0, 4);
    const el = document.createElement("div"); el.className = "ppban " + e.kind;
    el.innerHTML = `<b>${esc(t)}</b> ${esc(s)}${r && r.value ? ` <span>${esc(String(r.value).split(" · ")[0])}</span>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3200);
  }
  // ---------- Pump Pilot arcade effects: one canvas overlay per effect, rAF, removed after ~2 s (fire-and-forget) ----------
  // The rocket is the SVG above, pre-rendered once per colour into an offscreen bitmap (cached), so a frame is one drawImage.
  // buy = GREEN rocket launch; tp = original teal rocket + teal firework; stop = red rocket stalls, tumbles, red fire explosion + shake;
  // sell = any other exit (plain or trailing) = BLUE rocket landing. Teal edge glow on TP, no gold anywhere.
  // Tinted rockets are pre-rendered PNGs (only the saturated tip/fins/flame recoloured, silver body untouched): no CSS/canvas filters.
  const RKT = {}, RC = { buy: "#00e676", tp: "#19e6c1", stop: "#ff4d6d", sell: "#2f7bff" }, RC2 = { buy: "#69f0ae", tp: "#00f5a0", stop: "#ff8a8a", sell: "#00c2ff" };
  const RIMG = { buy: "rocket-green.png", tp: "rocket-real.png", stop: "rocket-red.png", sell: "rocket-blue.png" };
  const RGLOW = { buy: "105,240,174", tp: "120,220,255", stop: "255,120,120", sell: "90,150,255" };
  function rocketSprite(kind = "tp") {
    const f = RIMG[kind] || RIMG.tp, o = RKT[f]; if (o) return o.ready ? o : null;
    const n = (RKT[f] = { ready: false }); const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = 384; c.height = 384; c.getContext("2d").drawImage(im, 0, 0, 384, 384); Object.assign(n, { bmp: c, ready: true }); };
    im.onerror = () => { delete RKT[f]; }; im.src = f;
    return null;
  }
  const warmRockets = () => Object.keys(RIMG).map(rocketSprite).every(Boolean);
  setTimeout(() => { if (!reduce()) warmRockets(); }, 1200);   // warm the bitmap after the first paint
  let arcadeLive = 0;
  function arcade(kind, anchor, onImpact) {
    if (arcadeLive >= 3 || document.hidden) return;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const cv = document.createElement("canvas"); cv.className = "arcade"; cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv); arcadeLive++;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const spr = rocketSprite(kind), IMG = W < 600 ? 120 : 150, SZ = IMG * 0.32, RH = IMG * 0.8;   // IMG = drawn image size; the rocket is ~a third of it wide
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
    const exhaust = () => ({ x: R.x - Math.sin(R.a) * IMG * 0.27, y: R.y + Math.cos(R.a) * IMG * 0.27 });
    const TILT = -0.5, PX = 0.547, PY = 0.41;   // the photo points ~29 deg right of up; pivot = body centre in the image
    function drawRocket() {
      if (!spr || !R.on) return;
      g.save(); g.globalAlpha = R.alpha; g.translate(R.x, R.y); g.rotate(R.a);
      if (R.fl > 0.02) { const ny = IMG * 0.27, rr = SZ * 1.3 * R.fl * rnd(0.85, 1.15);   // engine glow flicker at the nozzle
        const gl = g.createRadialGradient(0, ny, 0, 0, ny, rr); gl.addColorStop(0, `rgba(${RGLOW[kind]},.6)`); gl.addColorStop(1, `rgba(${RGLOW[kind]},0)`);
        g.fillStyle = gl; g.beginPath(); g.arc(0, ny, rr, 0, Math.PI * 2); g.fill(); }
      g.rotate(TILT); g.drawImage(spr.bmp, -IMG * PX, -IMG * PY, IMG, IMG);
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
        if (k >= 1) { R.on = false; flash = { t, c: "25,230,193", a: 0.55, d: 0.6 };
          burst(R.x, R.y, 130, 540, ["#19e6c1", "#00f5a0", "#7dffe3", "#ffffff", "#00c2ff"], 1.3);
          for (let i = 0; i < 10; i++) { const a = rnd(0, Math.PI * 2), v = rnd(80, 260); add({ x: R.x, y: R.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.95, g: 40, life: rnd(0.8, 1.2), s: rnd(5, 9), c: i % 2 ? "#ffffff" : "#7dffe3", glow: 12, star: true }); }
          rings.push({ x: R.x, y: R.y, t0: t, c: "25,230,193", R: 180 }, { x: R.x, y: R.y, t0: t + 0.1, c: "0,245,160", R: 130 });
          const bx = R.x, by = R.y;
          setTimeout(() => { if (!cv.isConnected) return; const x = bx + rnd(-120, 120), y = by + rnd(-30, 90), tt = (performance.now() - t0) / 1000; burst(x, y, 55, 300, ["#00f5a0", "#19e6c1"], 0.9); rings.push({ x, y, t0: tt, c: "0,245,160", R: 70 }); }, 240);
          setTimeout(() => { if (!cv.isConnected) return; const x = bx + rnd(-120, 120), y = by + rnd(-30, 90), tt = (performance.now() - t0) / 1000; burst(x, y, 55, 300, ["#19e6c1", "#ffffff"], 0.9); rings.push({ x, y, t0: tt, c: "25,230,193", R: 70 }); }, 430); } }
      if (kind === "stop" && R.on) {
        if (t < 0.5) { R.y = R.y0 - 46 * Math.sin((t / 0.5) * Math.PI / 2); R.a = Math.sin(t * 30) * 0.06 * (t / 0.5); R.fl = Math.random() < 0.3 ? 0 : rnd(0.2, 0.7); }   // stall: sputtering engine
        else { if (!R.tumble) { R.tumble = 1; R.vy = -40; R.vx = R.x > W / 2 ? -70 : 70; R.spin = R.vx > 0 ? 7 : -7; R.fl = 0; puff(R.x, R.y + 10, 4, "90,90,100", 40); }
          R.vy += 1050 * dt; R.y += R.vy * dt; R.x += R.vx * dt; R.a += R.spin * dt; R.fl = 0;
          const ground = Math.min(H - 30, R.y0 + 300);
          if (R.y > ground || t > 1.35) { R.on = false; flash = { t, c: "255,40,70", a: 0.4, d: 0.45 };
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
          add({ x: ex.x, y: ex.y, vx: rnd(-70, 70), vy: rnd(60, 180) * (kind === "sell" ? 0.5 : 1), g: 220, life: rnd(0.2, kind === "sell" ? 0.3 : 0.5), s: rnd(1.1, 2.2), c: i ? RC2[kind] : RC[kind], glow: 8 }); } }
      if (kind === "stop" && R.on && R.tumble) { add({ x: R.x + rnd(-4, 4), y: R.y + rnd(-4, 4), vx: rnd(-20, 20), vy: rnd(-30, 0), drag: 0.95, life: rnd(0.6, 1), s: rnd(5, 9), grow: 24, c: "55,52,60", smoke: true });
        add({ x: R.x, y: R.y, vx: rnd(-150, 150), vy: rnd(-170, 30), g: 420, life: rnd(0.3, 0.6), s: rnd(1.3, 2.4), c: Math.random() < 0.5 ? "#ff4d6d" : "#ffb03a", glow: 8 }); }
      if (R.on && (R.st = (R.st || 0) + dt) > 0.11) { R.st = 0; const a = rnd(0, Math.PI * 2), d = rnd(SZ * 0.8, SZ * 1.7);
        add({ x: R.x + Math.cos(a) * d, y: R.y + Math.sin(a) * d * 1.2, vx: rnd(-8, 8), vy: kind === "buy" || kind === "tp" ? rnd(20, 50) : rnd(-10, 10), life: rnd(0.45, 0.75), s: rnd(3, 6), c: Math.random() < 0.6 ? "#ffffff" : { stop: "#ffb3c0", tp: "#7dffe3", buy: "#b9f6ca", sell: "#9fdcff" }[kind], glow: 8, star: true }); }
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
      if (flash && t - flash.t < flash.d) { const k = 1 - (t - flash.t) / flash.d, m = Math.max(W, H);   // soft edge glow, centre stays clear
        const eg = g.createRadialGradient(W / 2, H / 2, m * 0.32, W / 2, H / 2, m * 0.75); eg.addColorStop(0, `rgba(${flash.c},0)`); eg.addColorStop(1, `rgba(${flash.c},${flash.a * k})`);
        g.fillStyle = eg; g.fillRect(0, 0, W, H); }
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
    const k = r.kind, col = k === "bought" ? "#00f5a0" : k === "sold" ? (isTP(r) ? "#19e6c1" : "#00c2ff") : k === "stopped" ? "#ff4d6d" : "#8e8e93";
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

  // ---------- Skips (skips.py): why coins were looked at but not bought ----------
  function skipCounts(rows, n) {
    if (!rows || !rows.length) return '<div class="t2" style="padding:6px 0">No skips</div>';
    const max = Math.max(...rows.map((r) => r.coins)) || 1;
    return rows.slice(0, n).map((r) => `<div class="row" style="min-height:40px;padding:6px 0"><div class="tx"><div class="t1" style="font-size:15px">${esc(r.label)}${r.rug ? ' <span class="tag">🛡️ rug safety</span>' : ""}</div>
      <div style="height:6px;border-radius:3px;background:var(--c3,#333);margin-top:4px"><div style="height:6px;border-radius:3px;width:${Math.round((100 * r.coins) / max)}%;background:var(--accent,#7aa2ff)"></div></div></div><div class="rv">${r.coins}</div></div>`).join("");
  }
  function skipCard() {
    const s = S.files["skips"];
    if (s === undefined) return sk(120);
    if (!s) return "";
    return `<div class="card" style="margin-bottom:12px" data-act="skips"><div class="grp" style="margin:0 0 4px">🔎 Skips · last hour ${s.mode === "starship" ? "· 🚀 Starship rules" : ""}</div>${skipCounts(s.last_hour, 4)}
      <div class="row" style="min-height:40px"><div class="tx"><div class="t2">Tonight: ${s.tonight.reduce((a, r) => a + r.coins, 0)} skips · ${s.recent.length} recent coins</div></div><span class="ter">›</span></div></div>`;
  }
  function viewSkips() {
    const s = S.files["skips"];
    if (!s) return `<h1 class="title">Skips</h1>${s === undefined ? sk(200) : '<div class="empty"><b>No skip log yet</b>Every coin the bots look at but do not buy shows up here.</div>'}`;
    return `<h1 class="title">Skips</h1><div class="card" style="margin-bottom:12px"><div class="grp" style="margin:0 0 4px">Last hour</div>${skipCounts(s.last_hour, 8)}</div>
      <div class="card" style="margin-bottom:12px"><div class="grp" style="margin:0 0 4px">Tonight (since ${hm(s.night_start)})</div>${skipCounts(s.tonight, 12)}</div>
      <div class="grp">Recent skipped coins</div>${s.recent.length ? `<div class="list">${s.recent.map((r) => `<div class="row" data-act="skip" data-mint="${esc(r.mint)}"><div class="tx"><div class="t1">${sym(r.symbol, r.mint)} <span class="mut" style="font-size:13px">${esc(r.bot)}${r.mode === "starship" ? " · 🚀" : ""}</span></div>
        <div class="t2">${esc(r.reasons.map((x) => x.text).slice(0, 2).join(" · "))} · ${hm(r.ts)}</div></div><span class="ter">›</span></div>`).join("")}</div>` : '<div class="empty">No coins skipped in the last 24 h</div>'}
      <div class="t2" style="padding:12px 4px">Kept ${s.keep_days} days · 🛡️ = rug-safety filter (kept strict)</div>`;
  }
  function viewSkip(mint) {
    const s = S.files["skips"], r = s && s.recent.find((x) => x.mint === mint);
    if (!r) return `<h1 class="title">Skip</h1><div class="empty">Not in the recent skip log</div>`;
    return `<h1 class="title">${sym(r.symbol, r.mint)}</h1><div class="card"><div class="grp" style="margin:0 0 4px">Skipped ${hm(r.ts)} by ${esc(r.bot)}${r.mode === "starship" ? " · 🚀 Starship rules" : ""}</div>
      ${r.reasons.map((x) => `<div class="row" style="min-height:44px"><div class="tx"><div class="t1" style="font-size:15px">✗ ${esc(x.label)}${x.rug ? ' <span class="tag">🛡️</span>' : ""}</div><div class="t2">${esc(x.text)}</div></div>
        <div class="rv">${x.value != null && x.threshold != null ? `${esc(fmtSkip(x.value, x.filter))} <span class="mut">${esc(x.op || "")} ${esc(fmtSkip(x.threshold, x.filter))}</span>` : ""}</div></div>`).join("")}</div>
      <div class="t2" style="padding:12px 4px;word-break:break-all">${esc(r.mint)}</div>${S.files["coin/" + mint] !== undefined || (S.ix && S.ix.files["coin/" + mint]) ? `<button class="loadmore" data-act="coin" data-mint="${esc(mint)}">Open coin</button>` : ""}`;
  }
  function fmtSkip(v, f) {
    if (f === "liquidity") return "$" + Math.round(v).toLocaleString();
    if (["top10", "h1_spike", "holders_growth", "dev_wallet", "lp_locked", "insiders", "liquidity_pulled"].includes(f)) return Math.round(v) + "%";
    if (f === "pool_age") return v.toFixed(1) + " min";
    return String(Math.round(v * 100) / 100);
  }
  function viewBots() {
    return `<h1 class="title">Bots</h1>${skipCard()}${BOT_ORDER.map((n) => {
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

  // skipped coins in the Activity feed (skips.py): one compact row per coin (newest 30, last 24 h), from the "skips" file,
  // never from the activity pages, so trades stay on top and publish size stays small. Filter: All | Trades | Skips.
  function skipActRow(r) {
    const x = r.reasons[0] || {}, more = r.reasons.length > 1 ? ` +${r.reasons.length - 1}` : "";
    return `<div class="row" style="min-height:44px" data-act="skip" data-mint="${esc(r.mint)}"><div class="ic" style="color:#8e8e93;opacity:.7">·</div>
      <div class="tx"><div class="t1" style="font-size:15px">${sym(r.symbol, r.mint)} <span class="mut" style="font-size:13px">${esc(x.label || "")}${r.mode === "starship" ? " · 🚀" : ""}</span></div>
      <div class="t2">${esc(x.text || "")}${more} · ${hm(r.ts)}</div></div><div class="rv"><span class="mut">Skipped</span></div></div>`;
  }
  function viewActivity() {
    const pages = []; for (let i = 0; i < 10 && S.files["activity/" + i]; i++) pages.push(S.files["activity/" + i]);
    const rows = pages.flatMap((p) => p.rows), more = pages.length && pages[pages.length - 1].next_before;
    if (!S.files["activity/0"]) return `<h1 class="title">Activity</h1>${sk(60)}${sk(60)}${sk(60)}`;
    localStorage.setItem("desk.seen", String(rows[0] ? rows[0].ts : Date.now() / 1000));
    const f = localStorage.getItem("desk.actf") || "all", sks = (S.files["skips"] && S.files["skips"].recent) || [];
    const open = localStorage.getItem("desk.skopen") === "1";
    const chip = (k, l) => `<button class="loadmore" style="display:inline-block;width:auto;margin:0 6px 10px 0;padding:6px 14px;${f === k ? "font-weight:700;outline:2px solid currentColor" : "opacity:.7"}" data-act="actf" data-f="${k}">${l}</button>`;
    const chips = `<div>${chip("all", "All")}${chip("trades", "Trades")}${chip("skips", "Skips" + (sks.length ? " " + sks.length : ""))}</div>`;
    const trades = rows.length ? `<div class="list">${rows.map(actRow).join("")}</div>${more ? `<button class="loadmore" data-act="more">Load more</button>` : ""}`
      : '<div class="empty"><b>No trades yet tonight</b>Bought, sold, stopped and Analyst-rejected coins show up here.</div>';
    const skl = (n) => sks.length ? `<div class="list">${sks.slice(0, n).map(skipActRow).join("")}</div>` : '<div class="empty">No coins skipped in the last 24 h</div>';
    let body;
    if (f === "trades") body = trades;
    else if (f === "skips") body = skl(sks.length);
    else body = `${trades}<div class="grp" style="margin-top:14px" data-act="skopen">🔎 Skipped coins ${sks.length ? "· " + sks.length : ""} <span class="ter">${open ? "▾" : "▸"}</span></div>${open ? skl(sks.length) : sks.length ? skl(3) + (sks.length > 3 ? `<button class="loadmore" data-act="skopen">Show all ${sks.length}</button>` : "") : skl(0)}`;
    return `<h1 class="title">Activity</h1>${chips}${body}`;
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
      <div class="btns">${fomoLink(c.link) ? `<a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : ""}
        ${p && !S.viewer ? `<button class="btn red" data-act="sell" data-mint="${esc(mint)}" data-sym="${esc(c.symbol || "")}">Sell…</button>`
            : canCtl() && String(c.chain || "solana").toLowerCase() === "solana" ? `<button class="btn primary" data-act="buy" data-mint="${esc(mint)}" data-sym="${esc(c.symbol || "")}">Buy…</button>` : ""}</div>
      <div class="btns" style="margin-top:8px"><button class="btn" data-act="audit" data-mint="${esc(mint)}">Audit</button>${canCtl() ? `<button class="btn" data-act="why" data-mint="${esc(mint)}">Why? (Analyst)</button>` : ""}</div>
      <div id="whybox"></div>`;
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

  // ---- VIEWER mode Account: read only. No mode switch, no controls, no settings, no Dustin notification prefs; only this
  // phone's own trade alerts (buy / sell / take profit / stop / Starship), which go away when the link is revoked.
  function viewViewerAccount() {
    const st = S.state || {}, v = S.vw || {};
    const pushRow = pushEnv() !== "ok" ? `<div class="row"><div class="tx"><div class="t1">Trade alerts</div><div class="t2">${pushEnv() === "a2hs" ? "On iPhone: Share → Add to Home Screen, open it from the icon, then turn alerts on here." : "This browser can't show push notifications."}</div></div></div>`
      : `<div class="row"><div class="tx"><div class="t1">Trade alerts on this phone</div><div class="t2">${v.sub ? "On: buys, sells, take profits, stops" : "Off · buys, sells, take profits and stops only"}</div></div>
          <button class="sw ${v.sub ? "on" : ""}" data-act="vpush" aria-pressed="${!!v.sub}" aria-label="Trade alerts"><i></i></button></div>`;
    return `<h1 class="title">Account</h1>
      <div class="vonly glass"><div class="t1">👀 VIEW ONLY</div><div class="t2">You're watching Pump Pilot with a read-only link: balance, charts, replay, positions, history and bot activity. No controls, no settings, nothing here can trade.</div></div>
      <div class="grp">Desk</div><div class="list plain">
        <div class="row"><div class="tx"><div class="t1">Mode</div><div class="t2">${esc(st.mode || "–")}${st.mode === "LIVE" ? " · real money" : ""}</div></div></div>
        <div class="row"><div class="tx"><div class="t1">Cash</div><div class="t2">${money(st.cash)}</div></div></div></div>
      <div class="grp">Notifications</div><div class="list plain">${pushRow}</div><div class="ro p2msg" id="vmsg"></div>
      <div class="grp">Guide</div><div class="list plain"><button class="row" data-act="guide" style="width:100%;text-align:left"><div class="tx"><div class="t1">How Pump Pilot works</div><div class="t2">The bots, PAPER vs LIVE, stops, take profit</div></div><span class="ter">›</span></button></div>
      <div class="ter" style="font-size:12px;text-align:center;margin:20px 0">Last update ${hm(S.lastIxT)} · view only</div>`;
  }
  async function vFetch(path, body) {
    const tok = await DeskCrypto.viewerApiToken(S.vk || "");
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch(API + path, { method: "POST", mode: "cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ac.signal,
        headers: { Authorization: "Viewer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      let j = {}; try { j = await r.json(); } catch {} return { status: r.status, j };
    } catch { return { status: 0, j: {} }; } finally { clearTimeout(tm); }
  }
  async function viewerHello() {
    const r = await vFetch("/api/viewer/hello", {}); S.vw = Object.assign(S.vw || {}, { key: r.j.vapid_public_key, revoked: r.status === 401 });
    try { const sub = await localSub(); S.vw.sub = !!(sub && localStorage.getItem("desk.vsub") === sub.endpoint); } catch {}
    if (S.tab === "account") render(true);
  }
  async function viewerPush() {
    const vm = (t) => { const m = $("#vmsg"); if (m) m.textContent = t; };
    if (!S.vw || !S.vw.key) { await viewerHello(); if (!S.vw.key) return vm(S.vw.revoked ? "This viewer link was turned off." : "Can't reach the desk right now."); }
    if (S.vw.sub) {
      const sub = await localSub(); const ep = sub && sub.endpoint; if (sub) { try { await sub.unsubscribe(); } catch {} }
      if (ep) await vFetch("/api/viewer/unsubscribe", { endpoint: ep }); localStorage.removeItem("desk.vsub"); S.vw.sub = false; render(true); return vm("Trade alerts are off on this phone.");
    }
    let perm; try { perm = PF() ? await PF().requestPermission() : await Notification.requestPermission(); } catch { perm = "default"; }
    if (perm !== "granted") return vm("Not allowed. Tap again and choose Allow.");
    let sub; try { const reg = await swReg(); sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(S.vw.key) })); }
    catch (e) { return vm("This phone couldn't turn alerts on (" + (e.name || "error") + ")."); }
    const j = sub.toJSON ? sub.toJSON() : sub, r = await vFetch("/api/viewer/subscribe", { subscription: j });
    if (r.status !== 200) return vm(r.status === 401 ? "This viewer link was turned off." : (r.j.message || "The desk said no."));
    localStorage.setItem("desk.vsub", j.endpoint); S.vw.sub = true; haptic("success"); render(true); vm("Trade alerts are on: buys, sells, take profits, stops.");
  }
  function viewAccount() {
    if (S.viewer) return viewViewerAccount();
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
    const md = curMode();
    return `<h1 class="title">Account</h1>
      <div class="modeseg" role="radiogroup" aria-label="Trading mode">
        <button role="radio" aria-checked="${md === "PAPER"}" class="${md === "PAPER" ? "on paper" : ""}" data-act="mode" data-m="PAPER">🧪 PAPER</button>
        <button role="radio" aria-checked="${md === "LIVE"}" class="${md === "LIVE" ? "on live" : ""}" data-act="mode" data-m="LIVE">🟢 LIVE</button></div>
      <div class="ro">Mode from the desk: <b>${esc(md)}</b>. ${md === "LIVE" ? "Real money." : "No real money."}</div>
      ${ctlRow()}
      <div class="grp">Cash</div><div class="list plain"><div class="row"><div class="tx"><div class="t1">${money(ac.cash)}</div><div class="t2">${ac.mode === "PAPER" ? `PAPER start cash ${money(ac.paper_start_cash)}` : "from FOMO /balances"}</div></div></div></div>
      <div class="grp">FOMO</div><div class="list plain">
        ${fomoLink(ac.profile_url) ? `<a class="row" href="${esc(ac.profile_url)}" target="_blank" rel="noopener noreferrer"><div class="tx"><div class="t1">Your FOMO profile</div><div class="t2">@${esc(ac.fomo_handle)}</div></div><span class="ter">›</span></a>` : ""}
        ${fomoLink(ac.invite_url) ? `<button class="row" data-act="invite" style="width:100%;text-align:left"><div class="tx"><div class="t1">Invite a friend</div><div class="t2">Share your FOMO invite link</div></div><span class="ter">›</span></button>` : ""}
      </div>
      ${canCtl() ? `<div class="grp">Control</div><div class="list plain">
        <button class="row" data-act="settingsv" style="width:100%;text-align:left"><div class="tx"><div class="t1">Settings</div><div class="t2">Stop, take profit, trail, sizes… same as /set, with confirm</div></div><span class="ter">›</span></button>
        <div class="row"><div class="tx"><div class="t1">👀 Viewer link</div><div class="t2">${viewerLine()}</div></div></div>
        <button class="row ssrow" data-act="starship" style="width:100%;text-align:left"><span class="ssico">🚀</span><div class="tx"><div class="t1">Starship Mode</div><div class="t2">${ssAccountLine()}</div></div><span class="ter">›</span></button>
        <button class="row" data-act="window" style="width:100%;text-align:left"><div class="tx"><div class="t1">Trading window &amp; buy timer</div><div class="t2">${winAccountLine()}</div></div><span class="ter">›</span></button>
        <button class="row" data-act="bots" style="width:100%;text-align:left"><div class="tx"><div class="t1">Pause / resume bots</div><div class="t2">${pausedNow().size ? "Paused: " + esc([...pausedNow()].join(", ")) : "All running"}</div></div><span class="ter">›</span></button>
        <button class="row" data-act="social" style="width:100%;text-align:left"><div class="tx"><div class="t1">Social</div><div class="t2">Invite · copy traders on/off · withdraw</div></div><span class="ter">›</span></button>
        <button class="row" data-act="report" style="width:100%;text-align:left"><div class="tx"><div class="t1">Morning report</div><div class="t2">Last night's Page</div></div><span class="ter">›</span></button>
      </div>` : ""}
      ${S.tg ? `<div class="grp">Home Screen</div>${tgHomeRow()}` : ""}
      <div class="grp">Guide</div><div class="list plain"><button class="row" data-act="guide" style="width:100%;text-align:left"><div class="tx"><div class="t1">How Pump Pilot works</div><div class="t2">The operator's guide: bots, PAPER vs LIVE, stops, take profit</div></div><span class="ter">›</span></button></div>
      <div class="grp">Effects</div><div class="list plain"><button class="row" data-act="fxdemo" style="width:100%;text-align:left"><div class="tx"><div class="t1">Replay effects</div><div class="t2">Preview buy, take profit, stop loss and exit on Home · no trade</div></div><span class="ter">›</span></button></div>
      ${copyPicks(ac.copy_picks)}
      <div class="grp">Notifications</div><div class="list plain">
        ${canCtl() ? `<button class="row" data-act="notif" style="width:100%;text-align:left"><div class="tx"><div class="t1">Notifications</div><div class="t2">Push to this phone · which events · quiet hours · Telegram alerts</div></div><span class="ter">›</span></button>`
          : `<div class="row"><div class="tx"><div class="t1">Notifications</div><div class="t2">Open your Pump Pilot link with the control token to set up push</div></div></div>`}
        <div class="row"><div class="tx"><div class="t1">Telegram</div><div class="t2">${ac.pushes && ac.pushes.telegram ? "connected" : "not connected"}</div></div></div>
        <div class="row"><div class="tx"><div class="t1">Watch in Grok Bot</div><div class="t2">Open the Grok Bot app to watch the bot's computer live</div></div></div>
      </div>
      ${canCtl() ? "" : `<div class="grp" style="margin-top:28px">Settings · read-only without the control token; Telegram: "set stop to -20%"</div>
      ${["scanner", "analyst", "social", "brain", "executor", "risk", "desk", "browser"].filter((g) => groups[g]).map((g) => `<div class="grp" id="set-${g}">${esc(g[0].toUpperCase() + g.slice(1))}</div><div class="list plain">${groups[g].map(setRow).join("")}</div>`).join("")}`}
      <div class="ter" style="font-size:12px;text-align:center;margin:20px 0">Last update ${hm(S.lastIxT)} · ${esc(st ? st.mode : "")}${S.tg ? " · in Telegram" : ""}</div>`;
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
        ${canCtl() && r.last_buy_mint && r.last_buy_chain === "solana" ? `<button class="btn sm" style="margin-top:8px" data-act="buy" data-mint="${esc(r.last_buy_mint)}" data-sym="${esc(r.last_buy_symbol || "")}">Buy ${esc(r.last_buy_symbol || "it")}…</button>` : ""}
        <div class="cp-sw"><span>Copy on desk</span>${canCtl() ? `<button class="sw ${(copyIsOn(r.handle) ?? r.copy_on) ? "on" : ""} live" data-act="copysw" data-h="${esc(r.handle)}" aria-pressed="${!!(copyIsOn(r.handle) ?? r.copy_on)}" aria-label="Copy ${esc(r.handle)}"><i></i></button>` : `<span class="sw ${r.copy_on ? "on" : ""}" aria-disabled="true"><i></i></span>`}</div>
      </div>`;
    const hist = cp.lists.map((l) => `<div class="row"><div class="tx"><div class="t1">${esc(l.list_id)}</div><div class="t2">${l.rows.map((r) => esc(r.handle)).join(" · ")}</div></div></div>`).join("");
    return head + `<div class="ter" style="font-size:12px;margin:0 0 8px">${esc(cur.list_id)} · newest on top</div>${cur.rows.map(card).join("")}
      ${canCtl() ? `<div class="ro">Switch = /copy in Telegram: you confirm first, Telegram confirms after. <button class="linkbtn" data-act="social">What a switch does ›</button></div>` : roNote(`Copy on desk: 'copy on <handle>' (max ${esc(cp.max_on_copy)})`)}
      <div class="grp">Last 7 lists</div><div class="list plain">${hist}</div>`;
  }

  // ---------- render ----------
  let lastHtmlKey = "";
  function render(fromPoll) {
    offlineRow();
    const view = $("#view"), top = S.stack[S.stack.length - 1];
    if (!S.dp) { view.innerHTML = viewGate("nolink"); return; }
    if (!S.state) { view.innerHTML = S.firstTry ? viewLoading() : viewGate("nodata"); return; }
    const key = top ? top.kind + (top.mint || "") : S.tab;
    if (fromPoll && document.activeElement && document.activeElement.tagName === "INPUT") return; // don't wipe the search field
    const y = scrollY;
    let html = "";
    if (top && top.kind === "coin") { ensure("coin/" + top.mint); html = viewCoin(top.mint); }
    else if (top && top.kind === "audit") { ensure("audit/" + top.mint); html = viewAudit(top.mint); }
    else if (top && top.kind === "settings") html = viewSettings();
    else if (top && top.kind === "social") { ensure("account"); html = viewSocial(); }
    else if (top && top.kind === "notif") html = viewNotif();
    else if (top && top.kind === "window") html = viewWindow();
    else if (top && top.kind === "starship") html = viewStarship();
    else if (top && top.kind === "skips") { ensure("skips"); html = viewSkips(); }
    else if (top && top.kind === "skip") { ensure("skips"); html = viewSkip(top.mint); }
    else if (S.tab === "home") html = viewHome();
    else if (S.tab === "bots") { BOT_ORDER.forEach((n) => ensure("bots/" + n)); ensure("skips"); html = viewBots(); }
    else if (S.tab === "activity") { ensure("skips"); html = viewActivity(); }
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
    const bc = $("#bchart"); if (bc) { if (S.rp) rpDraw(); else { const ch = S.files["chart/" + S.range]; Charts.line(bc, ch, prevChart); prevChart = ch; } }
    const top = S.stack[S.stack.length - 1];
    const cc = $("#cchart"); if (cc && top) { const c = S.files["coin/" + top.mint]; if (c) Charts.candles(cc, c.candles, c.exit_line, c.position && c.position.entry_price); }
    document.querySelectorAll(".disc .d").forEach((d) => requestAnimationFrame(() => d.classList.add(d.dataset.st)));
    if (reduce()) document.querySelectorAll(".disc .d").forEach((d) => { d.style.transitionDelay = "0s"; d.classList.add(d.dataset.st); });
    paintScreen(); liveLabel(); fxPlay(); tgBack();
  }

  const VIEWER_BLOCK = new Set(["pushon", "pushoff", "pushtest", "evsw", "quietsw", "maintloud", "quietsave", "tgsw", "notif", "mode", "bots", "window", "starship", "settingsv", "setkey", "social",
    "copysw", "buy", "sell", "why", "report", "sstoggle", "ssfor", "sscap", "wtimer", "wtoggle", "wsave", "wcancel", "wstopat", "invite", "pausebot", "confirm"]);
  // ---------- actions ----------
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]"); if (!t || e.target.closest("a")) return;
    const act = t.dataset.act;
    if (S.viewer && VIEWER_BLOCK.has(act)) return;      // viewer mode: no control ever starts from a tap (belt and braces)
    if (act === "tab") go(t.dataset.tab);
    else if (act === "back") history.back();
    else if (act === "range") { S.range = t.dataset.r; await getFile("chart/" + S.range).catch(() => {}); render(); }
    else if (act === "coin" && t.dataset.mint) push({ kind: "coin", mint: t.dataset.mint });
    else if (act === "skips") push({ kind: "skips" });
    else if (act === "actf") { localStorage.setItem("desk.actf", t.dataset.f); render(); }
    else if (act === "skopen") { localStorage.setItem("desk.skopen", localStorage.getItem("desk.skopen") === "1" ? "0" : "1"); render(); }
    else if (act === "skip" && t.dataset.mint) push({ kind: "skip", mint: t.dataset.mint });
    else if (act === "audit" && t.dataset.mint) push({ kind: "audit", mint: t.dataset.mint });
    else if (act === "settings") { go("account"); setTimeout(() => { const g = document.getElementById("set-" + t.dataset.grp); if (g) g.scrollIntoView(); }, 300); }
    else if (act === "more") { for (let i = 0; i < 10; i++) if (!S.files["activity/" + i]) { await getFile("activity/" + i).catch(() => {}); break; } render(); }
    else if (act === "search") openSearch();
    else if (act === "full") openFull();
    else if (act === "sell" && S.viewer) return;
    else if (act === "sell") { if (canCtl()) openTrade("sell", t.dataset.mint, t.dataset.sym); else openSell(t.dataset.mint); }
    else if (act === "buy") openTrade("buy", t.dataset.mint, t.dataset.sym);
    else if (act === "why") loadWhy(t.dataset.mint);
    else if (act === "bots") openBots();
    else if (act === "window") { push({ kind: "window" }); loadWindow(); }
    else if (act === "wtimer") winTimer(t.dataset.k, t.dataset.m === "c" ? "c" : +t.dataset.m);
    else if (act === "wstopat") { const v = ($("#wstop") || {}).value; if (v) winUntil("allow", v); else toast("Pick a time"); }
    else if (act === "wcancel") winCancel();
    else if (act === "wtoggle") winToggle();
    else if (act === "wsave") winSave();
    else if (act === "starship") { push({ kind: "starship" }); loadStarship(); loadSettings(true); }
    else if (act === "sstoggle") ssToggle();
    else if (act === "sscap") ssCap();
    else if (act === "ssfor") ssLaunch(t.dataset.h === "c" ? "c" : t.dataset.h === "0" ? null : +t.dataset.h);
    else if (act === "report") openReport();
    else if (act === "settingsv") { push({ kind: "settings" }); loadSettings(true); }
    else if (act === "setkey") openSet(t.dataset.k);
    else if (act === "social") { push({ kind: "social" }); loadSocial(true); }
    else if (act === "copysw") copySwitch(t.dataset.h);
    else if (act === "notif") { push({ kind: "notif" }); loadNotif(true); }
    else if (act === "vpush" && S.viewer) viewerPush();
    else if (act === "pushon") pushEnable();
    else if (act === "pushoff") pushDisable();
    else if (act === "pushtest") pushTest();
    else if (act === "evsw") prefSwitch({ events: { [t.dataset.e]: !(S.nf && S.nf.prefs && S.nf.prefs.events[t.dataset.e]) } });
    else if (act === "quietsw") prefSwitch({ quiet: { on: !(S.nf && S.nf.prefs && S.nf.prefs.quiet.on) } });
    else if (act === "quietsave") { const a = $("#qstart"), b = $("#qend"); if (a && b) prefSwitch({ quiet: { start: a.value, end: b.value } }, "Quiet hours saved"); }
    else if (act === "tgsw") tgSwitch();
    else if (act === "maintloud") prefSwitch({ maint_loud: !(S.nf && S.nf.prefs && S.nf.prefs.maint_loud) });
    else if (act === "p2invite") { const l = S.social && S.social.invite && S.social.invite[0]; if (l) { if (navigator.share) { try { await navigator.share({ title: "FOMO", url: l.url }); } catch {} } else { try { await navigator.clipboard.writeText(l.url); toast("Link copied"); } catch { toast(l.url); } } } }
    else if (act === "invite") invite();
    else if (act === "closesheet") closeSheet();
    else if (act === "fxdemo") fxDemo();
    else if (act === "mode") openMode(t.dataset.m);
    else if (act === "replay") rpStart();
    else if (act === "rpplay") rpToggle();
    else if (act === "rpexit") rpExit();
    else if (act === "rpspeed") { if (S.rp) { S.rp.speed = +t.dataset.s; render(); } }
    else if (act === "guide") openGuide();
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
  // ---------- PAPER / LIVE switch sheet ----------
  // Control endpoint on the desk (Caddy :443 -> 127.0.0.1). Phase 1 only: GET /api/status, POST /api/mode.
  // The token comes from the &t= link (DeskCrypto.appToken), lives only in this device's storage, goes only in the
  // Authorization header to API, and is never shown, logged or put in a URL.
  const API = "https://178-104-3-124.sslip.io";
  S.ctl = { st: "idle", s: null, at: 0 };
  // auth: the &t= token on this device, else (inside Telegram) the Mini App's signed initData, checked by the desk
  function ctlAuth() { const t = DeskCrypto.appToken(); if (t) return "Bearer " + t; const d = S.tg && S.tg.initData; return d ? "tma " + d : null; }
  async function ctlFetch(path, body, ms) {
    const auth = ctlAuth(); if (!auth) { const e = new Error("notoken"); e.code = "notoken"; throw e; }
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms || 12000);
    try {
      const r = await fetch(API + path, { method: body ? "POST" : "GET", mode: "cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ac.signal,
        headers: Object.assign({ Authorization: auth }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
      let j = {}; try { j = await r.json(); } catch {}
      return { status: r.status, j };
    } finally { clearTimeout(tm); }
  }
  async function ctlPoll() {
    if (!ctlAuth()) { S.ctl.st = "notoken"; return; }
    try {
      const { status, j } = await ctlFetch("/api/status");
      S.ctl.st = status === 200 ? (j.desk_up ? "ok" : "deskdown") : status === 401 ? "badtoken" : status === 429 ? "locked" : "down";
      if (status === 200) { S.ctl.s = j; S.ctl.at = Date.now(); }
    } catch { S.ctl.st = "down"; }
  }
  function ctlRow() {
    const c = S.ctl, s = c.s;
    const map = { ok: ["ok", "Connected to desk", s ? `Checked ${hm(c.at / 1000)} · ${s.live_unlocked ? "LIVE unlocked on the server" : "LIVE locked on the server"}` : ""],
      deskdown: ["warn", "Desk unreachable", "The control service answered, but the desk itself isn't running"],
      down: ["bad", "Desk unreachable", "No answer from the desk. Check the connection and try again"],
      badtoken: ["bad", "Desk refused this device", "The control token on this phone is wrong or old. Open the new link"],
      locked: ["bad", "Desk unreachable", "Too many tries: the desk is ignoring this device for a few minutes"],
      notoken: ["mut", "No control token on this device", "Open your Pump Pilot link with the control token to switch mode from here"],
      idle: ["mut", "Checking the desk…", ""] }[c.st] || ["mut", "Checking the desk…", ""];
    let extra = "";
    if (s && c.st === "ok") {
      if (s.switch_pending) extra = `Switching to ${esc(s.switch_pending)}: ${s.open_positions || s.in_flight ? `${s.open_positions} open ${s.running_mode} position${s.open_positions === 1 ? "" : "s"} still managed; the desk restarts into ${esc(s.switch_pending)} when ${s.open_positions === 1 ? "it closes" : "they close"}` : "the desk is restarting now"}`;
      else if (s.hold_until && s.hold_until * 1000 > Date.now()) extra = `LIVE hold: first live buy in ${Math.ceil(s.hold_until - Date.now() / 1000)} s`;
    }
    return `<div class="list plain ctl" id="ctlrow"><div class="row"><span class="cdot ${map[0]}"></span><div class="tx"><div class="t1">${map[1]}</div><div class="t2">${esc(map[2])}</div>${extra ? `<div class="t2 pend">${extra}</div>` : ""}</div></div></div>`;
  }
  async function MODE_SEND(to, confirm) {
    const { status, j } = await ctlFetch("/api/mode", to === "LIVE" ? { mode: to, confirm } : { mode: to });
    return { status, ok: status === 200 && j.ok, mode: j.mode, changed: j.changed, locked: status === 409, error: j.error };
  }

  // ---------- phase 2: every Telegram command has an app twin (the desk runs the SAME Telegram handler) ----------
  // Changes go: preview (the handler's own Yes/No question comes back as a proposal) -> confirm sheet -> /api/confirm with an
  // idempotency key, so a double tap can't order twice. Nothing here decides anything: the desk's checks answer.
  const BOTS5 = ["scanner", "analyst", "brain", "executor", "risk"];
  const canCtl = () => !S.viewer && !!ctlAuth();       // a VIEWER link never controls anything (the server refuses it too)
  function idem() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  async function api(path, body, ms) {
    try { return await ctlFetch(path, body, ms); } catch (e) { return { status: 0, j: { ok: false, error: e.code === "notoken" ? "notoken" : "network" } }; }
  }
  const apiText = (j) => ((j && j.messages) || []).map((m) => m.text).join("\n");
  function apiErr(r) {
    const j = r.j || {};
    if (r.status === 0) return j.error === "notoken" ? "No control token on this device" : "Network error: the desk didn't answer. Nothing changed.";
    if (r.status === 401) return "The desk refused this device. Nothing changed.";
    if (r.status === 429) return "Too many tries: wait a minute. Nothing changed.";
    if (r.status === 503) return j.message || "The desk isn't running right now.";
    if (r.status === 504) return j.message || "The desk is busy. Nothing was done.";
    if (r.status === 409 && j.error === "expired") return "That confirm expired. Start again.";
    return j.message || "Not done. Nothing changed.";
  }
  const nl2br = (t) => esc(t).replace(/\n/g, "<br>");
  function sheet(html) {
    const sh = $("#sheet"); sh.innerHTML = `<div class="in"><div class="grab"></div>${html}<button class="btn" style="width:100%;margin-top:12px" data-act="closesheet">Close</button></div>`;
    sh.hidden = false; sh.onclick = (e) => { if (e.target === sh) closeSheet(); }; return sh;
  }
  function closeSheet() { const sh = $("#sheet"); sh.hidden = true; if (sh.onclose) { const f = sh.onclose; sh.onclose = null; f(); } }
  const setMsg = (t, k) => { const m = $("#p2msg"); if (m) { m.innerHTML = nl2br(t); m.dataset.k = k || ""; } };
  const modeRow = (m) => `<div><span>Mode</span><b class="${m === "LIVE" ? "down" : ""}">${m === "LIVE" ? "🟢 LIVE · real money" : "🧪 PAPER · no real money"}</b></div>`;
  function haptic(k) { try { S.tg && S.tg.HapticFeedback && S.tg.HapticFeedback.notificationOccurred(k); } catch {} }

  // confirm step shared by buy / sell / set / copy: one idempotency key per sheet, the button locks on the first tap
  function confirmStep(pid, label, cls, onDone) {
    const key = idem(), go = $("#p2go"); if (!go) return;
    go.textContent = label; go.className = `btn ${cls}`; go.disabled = false;
    go.onclick = async () => {
      if (go.disabled) return; go.disabled = true; go.classList.add("dis"); go.textContent = "Sending…"; setMsg("Sending to the desk…", "busy");
      const r = await api("/api/confirm", { pid, idem: key }, 30000);
      if (r.status === 200 && r.j.ok) { go.textContent = "Done ✓"; setMsg(apiText(r.j) || "Done.", "ok"); haptic("success"); onDone && onDone(r.j, true); }
      else { go.textContent = "Not done"; setMsg(apiErr(r), "err"); haptic("error"); onDone && onDone(r.j, false); }
    };
  }

  // ---- Buy / Sell (picks, coins, open positions). Brain sizes the buy; Executor keeps its RE-CHECK + amount read-back.
  async function openTrade(kind, mint, label) {
    const name = label || (mint || "").slice(0, 6);
    if (kind === "sell") {
      sheet(`<div class="p2t">Sell ${esc(name)}</div><div class="ro">How much of the position?</div>
        <div class="btns" style="margin-top:10px"><button class="btn" data-p2pct="50">Half</button><button class="btn" data-p2pct="100">All</button></div>
        <div class="ro p2msg" id="p2msg"></div>`);
      document.querySelectorAll("[data-p2pct]").forEach((b) => b.onclick = () => tradePreview("sell", mint, name, +b.dataset.p2pct));
      return;
    }
    tradePreview("buy", mint, name);
  }
  async function tradePreview(kind, mint, name, pct) {
    sheet(`<div class="p2t">${kind === "buy" ? "Buy" : "Sell"} ${esc(name)}</div><div class="mrows" id="p2rows">${sk(36)}${sk(36)}</div>
      <div class="ro p2msg" id="p2msg" data-k="busy">${kind === "buy" ? "Analyst is auditing it (8 layers), then Brain sizes it…" : "Checking the position…"}</div>
      <button class="btn dis" id="p2go" style="width:100%;margin-top:12px" disabled>${kind === "buy" ? "Buy" : "Sell"}</button>`);
    const r = await api(kind === "buy" ? "/api/buy" : "/api/sell", kind === "buy" ? { coin: mint } : { coin: mint, pct }, kind === "buy" ? 110000 : 30000);
    const rows = $("#p2rows"); if (!rows) return;
    const p = r.status === 200 && r.j.proposal;
    if (!p) { rows.innerHTML = ""; setMsg(r.status === 200 ? apiText(r.j) || "The desk said no." : apiErr(r), "err"); $("#p2go").textContent = "Not possible"; return; }
    rows.innerHTML = kind === "buy"
      ? `<div><span>Coin</span><b>${esc(p.symbol)} · ${esc(p.mint.slice(0, 4))}…${esc(p.mint.slice(-4))}</b></div>
         <div><span>Size (Brain)</span><b>${money(p.size_usd)}${p.pct_of_cash != null ? ` · ${Math.round(p.pct_of_cash)}% of cash` : ""}</b></div>
         <div><span>Analyst score</span><b>${p.score != null ? esc(p.score) : "–"}</b></div>${modeRow(p.mode)}`
      : `<div><span>Coin</span><b>${esc(p.symbol)}</b></div><div><span>Sell</span><b>${p.pct === 100 ? "All" : "Half"} (${esc(p.pct)}%)${p.size_usd != null ? ` of ${money(p.size_usd)} in` : ""}</b></div>${modeRow(p.mode)}`;
    setMsg(kind === "buy" ? `Executor re-checks price and liquidity, types ${money(p.size_usd)} and reads the amount back to the cent before it clicks; any mismatch aborts.` : "Executor sells on FOMO and verifies the fill.", "");
    confirmStep(p.pid, kind === "buy" ? `Confirm buy ${money(p.size_usd)}` : `Confirm sell ${p.pct === 100 ? "all" : "half"}`, p.mode === "LIVE" ? "red" : "primary");
  }

  // ---- Why (Analyst reasons) on a coin
  async function loadWhy(mint) {
    const box = $("#whybox"); if (!box) return; box.innerHTML = sk(60);
    const r = await api("/api/why", { coin: mint });
    box.innerHTML = `<div class="card p2why">${r.status === 200 ? nl2br(apiText(r.j)) : esc(apiErr(r))}</div>`;
  }

  // ---- Pause / Resume (header control)
  function pausedNow() {
    if (S.ctl.s && S.ctl.st === "ok" && Array.isArray(S.ctl.s.paused)) return new Set(S.ctl.s.paused);
    return new Set(((S.state && S.state.bots) || []).filter((b) => b.status === "paused").map((b) => b.name.toLowerCase()));
  }
  async function openBots() {
    await ctlPoll(); const pz = pausedNow(); let armed = null;
    const draw = () => {
      const p2 = pausedNow();
      $("#p2bots").innerHTML = BOTS5.map((b) => { const on = p2.has(b), arm = armed === b;
        return `<div class="row"><div class="tx"><div class="t1">${b[0].toUpperCase() + b.slice(1)}</div><div class="t2">${on ? "⏸ paused" : "running"}</div></div>
          <button class="btn sm ${arm ? (on ? "primary" : "red") : ""}" data-p2bot="${b}">${arm ? (on ? "Confirm resume" : "Confirm pause") : on ? "Resume" : "Pause"}</button></div>`; }).join("");
      document.querySelectorAll("[data-p2bot]").forEach((x) => x.onclick = async () => {
        const b = x.dataset.p2bot;
        if (armed !== b) { armed = b; draw(); return; }
        armed = null; x.disabled = true; x.textContent = "…";
        const r = await api("/api/pause", { bot: b, on: !pausedNow().has(b), idem: idem() });
        if (r.status === 200) { if (S.ctl.s) S.ctl.s.paused = r.j.paused; setMsg(apiText(r.j), r.j.changed ? "ok" : "err"); haptic(r.j.changed ? "success" : "warning"); }
        else setMsg(apiErr(r), "err");
        draw(); render(true);
      });
    };
    sheet(`<div class="p2t">Bots</div><div class="ro">Pause or resume a bot. Tap twice: the second tap confirms. Telegram confirms too.</div>
      <div class="list plain p2list" id="p2bots"></div><div class="ro p2msg" id="p2msg">${pz.size ? `Paused now: ${[...pz].join(", ")}` : "All bots running."}</div>`);
    draw();
  }

  // ---- Trading window (/time)
  async function openReport() {
    sheet(`<div class="p2t">Morning report</div><div class="ro p2msg" id="p2msg" data-k="busy">Asking the desk…</div><div id="p2links"></div>`);
    const r = await api("/api/report"); if (r.status !== 200) return setMsg(apiErr(r), "err");
    setMsg(apiText(r.j), ""); const u = ((r.j.messages || [])[0] || {}).text || ""; const m = u.match(/https:\/\/\S+/);
    if (m) $("#p2links").innerHTML = `<a class="btn primary" style="margin-top:12px" href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">Open the morning Page</a>`;
  }

  // ---- Trading window + buy timers (2026-11-15). Same Telegram handlers: /window, /window 22:00-06:30, /time on|off,
  // /pausebuys 2h, /allowbuys 2h, /stopbuys 23:30, /canceltimer. Timers touch NEW buys only; the desk keeps the end time in
  // its db, so a timer survives restarts and ends by itself. Every change: a confirm sheet here, then the desk, then Telegram.
  const romeHM = (ts) => new Date(ts * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const fmtLeft = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
  const durTxt = (m) => (m % 60 ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`) : `${m / 60}h`);
  const srvNow = () => Date.now() / 1000 - ((S.win && S.win._skew) || 0);
  async function loadWindow() {
    const r = await api("/api/window"); S.winErr = r.status === 200 ? null : apiErr(r);
    if (r.status === 200 && r.j.window) { S.win = r.j.window; S.win._skew = Date.now() / 1000 - (S.win.server_ts || Date.now() / 1000); }
    if (S.stack.length && S.stack[S.stack.length - 1].kind === "window") render(true);
  }
  function winAccountLine() {
    const s = S.ctl.s || {}, t = s.buy_timer, w = s.window || {};
    const base = s.window_enabled === false ? "OFF · buys 24/7" : `ON · ${esc(w.start || "")}–${esc(w.end || "")} Rome`;
    if (!t) return base + " · no timer";
    if (t.kind === "stopped") return base + " · ⏹ buys stopped by timer";
    return base + ` · ⏱️ ${t.kind === "pause" ? "paused" : "buys"} until ${romeHM(t.until_ts)}`;
  }
  function viewWindow() {
    const w = S.win, head = backBar("Account") + `<h1 class="title">Trading window</h1>`;
    if (!w) return head + (S.winErr ? `<div class="empty"><b>Can't reach the desk</b>${esc(S.winErr)}</div>` : sk(84) + sk(150) + sk(120));
    const t = w.timer, blk = w.buy_block;
    const why = blk ? esc(blk) : !w.enabled ? "Window is off: buys 24/7" : t && t.kind === "allow" && !w.in_hours ? "Allow timer: open outside the window" : `Inside the window ${esc(w.start)}–${esc(w.end)}`;
    const stat = `<div class="wstat ${blk ? "stop" : "go"}"><span class="wdot"></span><div class="tx"><div class="t1">${blk ? "No new buys now" : "New buys allowed now"}</div><div class="t2">${why}</div></div><span class="wnow">${esc(w.now_rome || "")}<small>Rome</small></span></div>`;
    const chip = (k, m, lab) => `<button class="wchip" data-act="wtimer" data-k="${k}" data-m="${m}">${esc(lab)}</button>`;
    const timer = t ? `<div class="wtimer ${esc(t.kind)}">
          <div class="wk">${t.kind === "pause" ? "⏸ New buys paused" : t.kind === "allow" ? "▶️ Buys allowed, then stop" : "⏹ New buys stopped"}</div>
          ${t.until_ts ? `<div class="wcd" data-cd="${t.until_ts}">${fmtLeft(t.until_ts - srvNow())}</div>
          <div class="t2">until <b>${romeHM(t.until_ts)}</b> Rome time · then ${t.kind === "pause" ? "buys are allowed again" : "new buys stop until you tap Resume buys"}</div>`
            : `<div class="t2">since ${romeHM(t.started_ts)} Rome time · no end time</div>`}
          <button class="btn ${t.kind === "stopped" ? "primary" : ""}" data-act="wcancel" style="width:100%;margin-top:12px">${t.kind === "stopped" ? "▶️ Resume buys" : "Cancel timer"}</button></div>`
      : `<div class="list plain wpick">
          <div class="row col"><div class="t1">Pause new buys for</div><div class="wchips">${chip("pause", 30, "30m")}${chip("pause", 60, "1h")}${chip("pause", 120, "2h")}${chip("pause", 240, "4h")}${chip("pause", 480, "8h")}${chip("pause", "c", "Custom")}</div>
            <div class="t2">Then back to normal by itself.</div></div>
          <div class="row col"><div class="t1">Allow buys only for the next</div><div class="wchips">${chip("allow", 60, "1h")}${chip("allow", 120, "2h")}${chip("allow", 240, "4h")}${chip("allow", 480, "8h")}${chip("allow", "c", "Custom")}</div>
            <div class="t2">Opens buys even outside the window; when it ends, new buys stop until you tap Resume.</div></div>
          <div class="row qrow"><label>Stop buys at <input type="time" id="wstop" value=""></label><button class="btn sm" data-act="wstopat">Set</button></div></div>`;
    return head + stat + `<div class="grp">Buy timer</div>${timer}
      <div class="grp">Window</div><div class="list plain wwin">
        <div class="row"><div class="tx"><div class="t1">Trading window</div><div class="t2">${w.enabled ? `ON · new buys only ${esc(w.start)}–${esc(w.end)} · sell-all at ${esc(w.end)}` : `OFF · buys 24/7 · saved hours ${esc(w.start)}–${esc(w.end)}`}</div></div>
          <button class="sw ${w.enabled ? "on" : ""}" data-act="wtoggle" aria-pressed="${!!w.enabled}" aria-label="Trading window"><i></i></button></div>
        <div class="row qrow"><label>From <input type="time" id="wa" value="${esc(w.start)}"></label><label>to <input type="time" id="wb" value="${esc(w.end)}"></label><button class="btn sm" data-act="wsave">Save</button></div></div>
      <div class="p2note">Hours are <b>Rome time</b> (the server runs UTC; summer/winter time is handled). ${w.enabled ? `With the window ON the desk <b>sells every open position at ${esc(w.end)}</b>.` : "Saving hours doesn't turn the window on."}</div>
      <div class="ro" style="margin-top:14px">Sells, stops and take profits always run; timers and the window only stop <b>new</b> buys. A risk stop (night loss, FOMO logged out) always wins.<br>Telegram: /window · /window hours 22-06 · /pausebuys 2h · /buysfor 3h · /stopbuys 23:30 · /canceltimer</div>`;
  }
  function winTick() {
    document.querySelectorAll("[data-cd]").forEach((el) => {
      const left = +el.dataset.cd - srvNow(); const tx = fmtLeft(left); if (el.textContent !== tx) el.textContent = tx;
      if (left <= 0 && !S.winEndAsk) { S.winEndAsk = true; setTimeout(() => { S.winEndAsk = false; loadWindow(); ctlPoll(); }, 6500); }
    });
  }
  setInterval(winTick, 1000);
  function winDone(j) { if (j && j.window) { S.win = j.window; S.win._skew = Date.now() / 1000 - (S.win.server_ts || Date.now() / 1000); } ctlPoll().then(() => render(true)); render(true); }
  // one confirm sheet for every act (timer start / cancel / window on-off): the 2nd tap sends, one idempotency key per sheet
  function winAct(title, lines, label, cls, path, body) {
    sheet(`<div class="p2t">${esc(title)}</div><div class="mrows">${lines.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
      <div class="ro p2msg" id="p2msg"></div><button class="btn ${cls}" id="p2go" style="width:100%;margin-top:12px">${esc(label)}</button>`);
    const go = $("#p2go"), key = idem();
    go.onclick = async () => {
      if (go.disabled) return; go.disabled = true; go.classList.add("dis"); go.textContent = "Sending…"; setMsg("Sending to the desk…", "busy");
      const r = await api(path, Object.assign({}, body, { idem: key }), 20000);
      if (r.status === 200 && r.j.ok) { go.textContent = "Done ✓"; setMsg(apiText(r.j) || "Done.", "ok"); haptic("success"); winDone(r.j); }
      else { go.textContent = "Not done"; setMsg(apiErr(r), "err"); haptic("error"); }
    };
  }
  function winTimer(kind, m) {
    if (m === "c") {
      sheet(`<div class="p2t">${kind === "pause" ? "Pause new buys" : "Allow buys only for"}…</div><div class="ro">Minutes (5 to 1440), or a Rome time like 01:30.</div>
        <input id="p2val" class="livein p2in" type="text" inputmode="text" placeholder="90 or 01:30" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="ro p2msg" id="p2msg"></div><button class="btn primary" id="p2go" style="width:100%;margin-top:12px">Review</button>`);
      $("#p2go").onclick = () => { const v = $("#p2val").value.trim();
        if (/^\d{1,4}$/.test(v) && +v >= 5 && +v <= 1440) return winTimer(kind, +v);
        const c = v.replace(".", ":").match(/^([01]?\d|2[0-3]):([0-5]\d)$/); if (c) return winUntil(kind, `${c[1].padStart(2, "0")}:${c[2]}`);
        setMsg("Type minutes (5–1440) or a time like 01:30", "err"); };
      return;
    }
    const end = srvNow() + m * 60;
    winAct(kind === "pause" ? `Pause new buys for ${durTxt(m)}?` : `Allow buys for the next ${durTxt(m)}?`,
      [["Until", `${romeHM(end)} Rome time`], ["Then", kind === "pause" ? "buys allowed again" : "new buys stop until you tap Resume"], ["Sells / stops", "keep running"], ["Mode", curMode() === "LIVE" ? "🟢 LIVE" : "🧪 PAPER"]],
      kind === "pause" ? `Confirm: pause buys until ${romeHM(end)}` : `Confirm: buys until ${romeHM(end)}`, kind === "pause" ? "red" : "primary", "/api/buytimer", { kind, minutes: m });
  }
  function winUntil(kind, hhmm) {
    winAct(kind === "pause" ? `Pause new buys until ${hhmm}?` : `Stop buys at ${hhmm}?`,
      [["Until", `${hhmm} Rome time (next time it's ${hhmm})`], ["Then", kind === "pause" ? "buys allowed again" : "new buys stop until you tap Resume"], ["Sells / stops", "keep running"]],
      kind === "pause" ? `Confirm: pause buys until ${hhmm}` : `Confirm: stop buys at ${hhmm}`, kind === "pause" ? "red" : "primary", "/api/buytimer", { kind, until: hhmm });
  }
  function winCancel() {
    const t = S.win && S.win.timer; if (!t) return;
    winAct(t.kind === "stopped" ? "Resume new buys?" : "Cancel the buy timer?", [["Timer", t.kind === "pause" ? `paused until ${romeHM(t.until_ts)}` : t.kind === "allow" ? `buys until ${romeHM(t.until_ts)}` : "buys stopped"], ["After", "normal rules (window / 24-7)"]],
      t.kind === "stopped" ? "Confirm: resume buys" : "Confirm: cancel timer", "primary", "/api/buytimer", { kind: "cancel" });
  }
  function winToggle() {
    const w = S.win; if (!w) return; const on = !w.enabled;
    winAct(on ? "Turn the trading window ON?" : "Turn the trading window OFF?",
      on ? [["New buys", `only ${w.start}–${w.end} Rome time`], ["At " + w.end, "the desk sells every open position"], ["Right now", w.in_hours ? "inside the hours: buys go on" : "outside the hours: new buys stop now, no sell-off now"]]
         : [["New buys", "24/7"], ["Sell-off", `none at ${w.end}`], ["Saved hours", `${w.start}–${w.end} (kept)`]],
      on ? "Confirm: window ON" : "Confirm: buys 24/7", "red", "/api/time_set", { on });
  }
  async function winSave() {
    const a = ($("#wa") || {}).value, b = ($("#wb") || {}).value; if (!a || !b) return toast("Pick both times");
    sheet(`<div class="p2t">Window hours</div><div class="ro p2msg" id="p2msg" data-k="busy">Asking the desk…</div><button class="btn dis" id="p2go" style="width:100%;margin-top:12px" disabled>…</button>`);
    const r = await api("/api/window_hours", { start: a, end: b }); const p = r.status === 200 && r.j.proposal;
    if (!p) { const g = $("#p2go"); if (g) { g.textContent = "Not changed"; } return setMsg(r.status === 200 ? apiText(r.j) : apiErr(r), "err"); }
    setMsg(apiText(r.j), ""); confirmStep(p.pid, `Confirm: ${p.new} Rome time`, "red", (j, ok) => { if (ok) winDone(j); });
  }

  // ---- 🚀 STARSHIP MODE (2026-11-15). Same Telegram handler: /starship on | off | for 2h. Ships OFF; only Dustin turns it
  // on, through the confirm sheet (LIVE = a real-money warning). Settings edit through the normal /set confirm (openSet).
  async function loadStarship() {
    const r = await api("/api/starship"); S.ssErr = r.status === 200 ? null : apiErr(r);
    if (r.status === 200 && r.j.starship) ssSet(r.j.starship);
    if (S.stack.length && S.stack[S.stack.length - 1].kind === "starship") render(true);
  }
  function ssSet(x) { S.ss = x; S.ss._skew = Date.now() / 1000 - (x.server_ts || Date.now() / 1000); }
  const ssNow = () => Date.now() / 1000 - ((S.ss && S.ss._skew) || 0);
  function ssState() { const c = (S.ctl.s || {}).starship; return S.ss ? { enabled: S.ss.enabled, until_ts: S.ss.until_ts } : c || null; }
  function viewerLine() {
    const v = (S.ctl.s || {}).viewer; if (!v) return "Read-only link to forward · Telegram: /viewer";
    if (!v.active) return "OFF · send /viewer in Telegram to make a read-only link";
    return `ON since ${romeHM(v.created_ts)} Rome · ${v.first_open_ts ? "opened " + romeHM(v.first_open_ts) : "not opened yet"} · ${v.devices || 0} alert device${v.devices === 1 ? "" : "s"} · /viewer revoke`;
  }
  function ssAccountLine() {
    const x = ssState(); if (!x) return "Riskier sniper mode · OFF by default";
    return x.enabled ? `ON${x.until_ts ? " · until " + romeHM(x.until_ts) + " Rome" : " · no timer"} · half size, tight stop` : "OFF · riskier sniper mode for more trades";
  }
  function ssHomeCard() {
    const x = ssState();
    if (!x) { if (!S.ssAsked && ctlAuth()) { S.ssAsked = true; ctlPoll().then(() => { if (S.tab === "home") render(true); }); } return ""; }
    if (!x.enabled) return `<button class="sshome off" data-act="starship"><span class="ssico">🚀</span><div class="tx"><div class="t1">Starship Mode <span class="sspill">OFF</span></div><div class="t2">Riskier sniper mode · tap to see it</div></div><span class="ter">›</span></button>`;
    return `<button class="sshome on" data-act="starship"><span class="ssico lift">🚀</span><div class="tx"><div class="t1">Starship Mode <span class="sspill on">ON</span></div><div class="t2">${x.until_ts ? `Lands in <b data-sscd="${x.until_ts}">${fmtLeft(x.until_ts - ssNow())}</b> · ${romeHM(x.until_ts)} Rome` : "No timer · until you land it"}${curMode() === "LIVE" ? " · LIVE real money" : ""}</div></div><span class="ter">›</span></button>`;
  }
  function ssPnl(st) {
    const wr = (a) => a.win_rate == null ? "–" : Math.round(a.win_rate) + "%", cell = (a) => `<b class="${a.net_usd > 0 ? "up" : a.net_usd < 0 ? "down" : ""}">${signedMoney(a.net_usd)}</b>`;
    const row = (lab, a, b) => `<tr><th>${lab}</th><td>${a}</td><td>${b}</td></tr>`, s = st.starship, n = st.normal;
    return `<div class="sspnl glass"><table><thead><tr><th></th><th>🚀 Starship</th><th>Normal</th></tr></thead><tbody>
      ${row("Trades today", s.today.trades, n.today.trades)}${row("Win rate today", wr(s.today), wr(n.today))}${row("Net P&amp;L today", cell(s.today), cell(n.today))}
      ${row("Trades all-time", s.all.trades, n.all.trades)}${row("Win rate all-time", wr(s.all), wr(n.all))}${row("Net P&amp;L all-time", cell(s.all), cell(n.all))}
      </tbody></table><div class="t2">${st.open} Starship position${st.open === 1 ? "" : "s"} open · ${esc(st.mode)} · today = Rome calendar day · win rate on closed trades</div></div>`;
  }
  function viewStarship() {
    const x = S.ss, head = backBar("Account") + `<h1 class="title">🚀 Starship Mode</h1>`;
    if (!x) return head + (S.ssErr ? `<div class="empty"><b>Can't reach the desk</b>${esc(S.ssErr)}</div>` : sk(150) + sk(120) + sk(200));
    const p = x.params, nm = x.normal, live = curMode() === "LIVE";
    const hero = `<div class="sshero ${x.enabled ? "on" : ""}">
        <div class="ssstars"></div><div class="ssrocket ${x.enabled ? "lift" : ""}">🚀</div>
        <div class="sshead"><div class="t1">${x.enabled ? "Starship is flying" : "Starship is on the pad"}</div>
          <div class="t2">${x.enabled ? (x.until_ts ? `Lands at ${romeHM(x.until_ts)} Rome time` : "No timer: until you land it or the daily loss cap") : "OFF · the desk trades normally"}</div></div>
        <button class="sw ${x.enabled ? "on" : ""} live" data-act="sstoggle" aria-pressed="${!!x.enabled}" aria-label="Starship Mode"><i></i></button>
        ${x.enabled && x.until_ts ? `<div class="sscd" data-sscd="${x.until_ts}">${fmtLeft(x.until_ts - ssNow())}</div>` : ""}
        ${x.enabled && x.buy_block ? `<div class="ssblk">No new buys right now: ${esc(x.buy_block)}. Starship waits too.</div>` : ""}
        <div class="ssbar"><span>Today ${signedMoney(x.day_pnl)}</span><span>loss cap −$${esc(p.day_loss_usd)}</span></div>
        <div class="ssmeter"><i style="width:${Math.min(100, Math.max(0, -x.day_pnl / p.day_loss_usd * 100))}%"></i></div></div>`;
    const chip = (h, lab) => `<button class="wchip" data-act="ssfor" data-h="${h}">${esc(lab)}</button>`;
    const launch = x.enabled ? `<div class="list plain wpick"><div class="row col"><div class="t1">Change the timer</div><div class="wchips">${chip(1, "1h")}${chip(2, "2h")}${chip(4, "4h")}${chip(8, "8h")}${chip(0, "No timer")}${chip("c", "Custom")}</div><div class="t2">Then Starship turns off by itself (survives desk restarts).</div></div></div>`
      : `<div class="list plain wpick"><div class="row col"><div class="t1">Launch for</div><div class="wchips">${chip(1, "1h")}${chip(2, "2h")}${chip(4, "4h")}${chip(8, "8h")}${chip(0, "No timer")}${chip("c", "Custom")}</div><div class="t2">Then it turns off by itself. You confirm first${live ? "; LIVE = real money" : ""}.</div></div></div>`;
    const prow = (k, lab, fmt, nfmt) => `<button class="row" data-act="setkey" data-k="starship.${k}" style="width:100%;text-align:left"><div class="tx"><div class="t1">${lab}</div><div class="t2">${nfmt != null ? "normal " + esc(nfmt) : "starship." + k}</div></div><span class="sv">${esc(fmt)}</span><span class="ter">›</span></button>`;
    const params = `<div class="grp">Exits &amp; size <span class="ter">· tap to change (confirm)</span></div><div class="list plain">
        ${prow("size_pct", "Size", `${p.size_pct}% of normal`, "100%")}${prow("stop_pct", "Stop loss", `−${p.stop_pct}%`, `−${nm["risk.stop_pct"]}%`)}
        ${prow("tp_x", "Take profit at", `${p.tp_x}×`, `${nm["executor.tp_x"]}×`)}${prow("tp_sell_pct", "Take profit sells", `${p.tp_sell_pct}%`, `${nm["executor.tp_sell_pct"]}%`)}
        ${prow("trail_pct", "Trail", `${p.trail_pct}%`, `${nm["executor.trail_pct"]}%`)}${prow("timeout_h", "Dead-money timeout", `${p.timeout_h}h`, `${nm["risk.timeout_h"]}h`)}</div>
      <div class="grp">Caps</div><div class="list plain">${prow("max_open", "Max open Starship positions", String(p.max_open))}
        <div class="row qrow sscap"><label>Daily loss cap $ <input id="sscap" type="number" inputmode="decimal" min="1" max="500" step="1" value="${esc(p.day_loss_usd)}"></label><button class="btn sm" data-act="sscap">Save</button></div></div>
      <div class="p2note">At a realized Starship loss of <b>$${esc(p.day_loss_usd)}</b> in one Rome day, Starship turns itself off and tells you. $1–$500, you confirm every change (change log). Telegram: /starship cap 10</div>
      <div class="grp">Earlier entries</div><div class="list plain">
        ${prow("min_score", "Analyst score cutoff", String(p.min_score), String(nm["analyst.min_score"]))}${prow("min_pool_age_min", "Youngest pool", `${p.min_pool_age_min} min`, `${nm["scanner.min_pool_age_min"]} min`)}
        ${prow("min_liquidity_usd", "Min liquidity", `$${Number(p.min_liquidity_usd).toLocaleString("en-US")}`, `$${Number(nm["scanner.min_liquidity_usd"]).toLocaleString("en-US")}`)}
        ${prow("max_h1_change_pct", "Max 1h spike", `+${p.max_h1_change_pct}%`, `+${nm["scanner.max_h1_change_pct"]}%`)}
        ${prow("dip_pct", "Dip wait", `−${p.dip_pct}% / ${p.dip_wait_min} min`, `−${nm["executor.dip_pct"]}% / ${nm["executor.dip_wait_min"]} min`)}</div>`;
    return head + hero + `<div class="grp">${x.enabled ? "Timer" : "Launch"}</div>${launch}<div class="grp">Starship vs normal</div>${ssPnl(x.stats)}${params}
      <div class="ro" style="margin-top:14px">While ON, every auto buy (Scanner → Analyst → Brain → Executor) is a Starship trade. Manual and copy buys never are. The trading window, buy timers, risk stops and the Executor's re-check + amount read-back all still apply. Open Starship positions keep their tight exits after it lands.<br>Telegram: /starship · /starship on | off · /starship for 2h · /starship settings</div>`;
  }
  setInterval(() => document.querySelectorAll("[data-sscd]").forEach((el) => {
    const left = +el.dataset.sscd - ssNow(), tx = fmtLeft(left); if (el.textContent !== tx) el.textContent = tx;
    if (left <= 0 && !S.ssEndAsk) { S.ssEndAsk = true; setTimeout(() => { S.ssEndAsk = false; loadStarship(); ctlPoll().then(() => render(true)); }, 7000); }
  }), 1000);
  // Daily loss cap: the same /set path as every setting (preview -> confirm sheet -> change_log), $1–$500
  async function ssCap() {
    const v = +(($("#sscap") || {}).value || "").replace(",", ".");
    if (!(v >= 1 && v <= 500)) return toast("Daily loss cap: $1 to $500");
    sheet(`<div class="p2t">🚀 Daily Starship loss cap → $${esc(v)}</div><div class="ro">Starship turns itself off at this realized loss per Rome day.</div>
      <div class="ro p2msg" id="p2msg" data-k="busy">Asking the desk…</div><button class="btn dis" id="p2go" style="width:100%;margin-top:12px" disabled>…</button>`);
    const r = await api("/api/set", { key: "starship.day_loss_usd", value: v }); const p = r.status === 200 && r.j.proposal;
    if (!p) { const g = $("#p2go"); if (g) g.textContent = "Not changed"; return setMsg(r.status === 200 ? apiText(r.j) : apiErr(r), "err"); }
    setMsg(apiText(r.j), ""); confirmStep(p.pid, `Confirm: loss cap $${v}`, "red", (j, ok) => { if (ok) { loadStarship(); loadSettings(true); } });
  }
  function ssToggle() { const x = S.ss || ssState(); if (!x) return; if (x.enabled) return ssAsk(false, null); ssLaunch(null); }
  function ssLaunch(h) {
    if (h === "c") {
      sheet(`<div class="p2t">🚀 Starship for…</div><div class="ro">Hours, 0.25 to 24 (e.g. 1.5).</div>
        <input id="p2val" class="livein p2in" type="text" inputmode="decimal" placeholder="1.5" autocomplete="off" spellcheck="false">
        <div class="ro p2msg" id="p2msg"></div><button class="btn primary" id="p2go" style="width:100%;margin-top:12px">Review</button>`);
      $("#p2go").onclick = () => { const v = +($("#p2val").value || "").replace(",", "."); if (v >= 0.25 && v <= 24) return ssAsk(true, v); setMsg("Type hours from 0.25 to 24", "err"); };
      return;
    }
    ssAsk(true, h);
  }
  async function ssAsk(on, hours) {
    if (!canCtl()) return toast("No control token on this device");
    const live = curMode() === "LIVE";
    sheet(`<div class="p2t">${on ? "🚀 Launch Starship Mode" + (hours ? ` for ${hours}h` : "") + "?" : "Land Starship Mode (OFF)?"}</div>
      ${on && live ? `<div class="p2note live sswarn"><b>⚠️ LIVE · REAL MONEY.</b> Starship buys earlier, riskier coins, more often, with a tight stop: expect more small losses. Half size by default, max ${esc((S.ss && S.ss.params.max_open) || 2)} open, auto-off at the daily loss cap.</div>` : ""}
      <div class="mrows" id="p2rows">${sk(36)}</div><div class="ro p2msg" id="p2msg" data-k="busy">Asking the desk…</div>
      <button class="btn dis" id="p2go" style="width:100%;margin-top:12px" disabled>…</button>`);
    const r = await api("/api/starship_set", on ? (hours ? { on: true, hours } : { on: true }) : { on: false });
    const rows = $("#p2rows"); if (!rows) return; const p = r.status === 200 && r.j.proposal;
    if (!p) { rows.innerHTML = ""; const g = $("#p2go"); if (g) g.textContent = "Not changed"; return setMsg(r.status === 200 ? apiText(r.j) : apiErr(r), "err"); }
    const q = p.params || {};
    rows.innerHTML = on ? `<div><span>Until</span><b>${p.until_ts ? romeHM(p.until_ts) + " Rome time, then OFF" : "you land it (or the loss cap)"}</b></div>
        <div><span>Size</span><b>${esc(q.size_pct)}% of normal</b></div><div><span>Exits</span><b>stop −${esc(q.stop_pct)}% · TP ${esc(q.tp_x)}×</b></div>
        <div><span>Caps</span><b>max ${esc(q.max_open)} open · −$${esc(q.day_loss_usd)}/day</b></div>${modeRow(p.mode)}`
      : `<div><span>New buys</span><b>normal rules again</b></div><div><span>Open Starship</span><b>keep their tight exits</b></div>${modeRow(p.mode)}`;
    setMsg(apiText(r.j), "");
    confirmStep(p.pid, on ? (p.live ? "Confirm: Starship ON · real money" : "Confirm: Starship ON") : "Confirm: Starship OFF", on ? "red" : "primary", (j, ok) => {
      if (ok && j.starship) ssSet(j.starship); ctlPoll().then(() => render(true)); render(true); });
  }

  // ---- Settings (/set): same keys, limits and validation as Telegram (the desk checks; the form only helps)
  async function loadSettings(force) {
    if (S.setList && !force) return; S.setList = S.setList || null; S.setErr = null;
    const r = await api("/api/settings"); if (r.status === 200) S.setList = r.j.settings; else S.setErr = apiErr(r);
    if (S.stack.length && S.stack[S.stack.length - 1].kind === "settings") render(true);
  }
  const showVal = (x) => x.masked ? (x.value ? "set" : "not set") : x.type === "bool" ? (x.value ? "on" : "off") : Array.isArray(x.value) ? x.value.join(", ") : String(x.value);
  function viewSettings() {
    if (!S.setList) return backBar("Account") + `<h1 class="title">Settings</h1>` + (S.setErr ? `<div class="empty"><b>Can't load settings</b>${esc(S.setErr)}</div>` : sk(60) + sk(60) + sk(60));
    const groups = {}; S.setList.forEach((x) => (groups[x.group] = groups[x.group] || []).push(x));
    const order = ["risk", "brain", "executor", "analyst", "scanner", "starship", "social", "desk", "copy_picks", "browser"];
    return backBar("Account") + `<h1 class="title">Settings</h1><div class="ro">Same settings and limits as /set in Telegram. Every change asks you to confirm, lands in the change log and Telegram confirms it.</div>
      ${order.filter((g) => groups[g]).map((g) => `<div class="grp">${esc(g.replace("_", " "))}</div><div class="list plain">${groups[g].map((x) => `<button class="row" data-act="setkey" data-k="${esc(x.key)}" style="width:100%;text-align:left"><div class="tx"><div class="t1">${esc(x.alias || x.key.split(".")[1].replace(/_/g, " "))}</div><div class="t2">${esc(x.key)}${x.range ? " · " + esc(x.range) : ""}</div></div><span class="sv">${esc(showVal(x))}</span><span class="ter">›</span></button>`).join("")}</div>`).join("")}`;
  }
  function openSet(key) {
    const x = (S.setList || []).find((s) => s.key === key); if (!x) return;
    const num = x.type === "int" || x.type === "float";
    const input = x.type === "bool" ? `<div class="btns"><button class="btn ${x.value ? "primary" : ""}" data-p2b="true">On</button><button class="btn ${!x.value ? "primary" : ""}" data-p2b="false">Off</button></div><input type="hidden" id="p2val" value="${x.value ? "true" : "false"}">`
      : `<input id="p2val" class="livein p2in" ${num ? `inputmode="decimal" type="text"` : `type="text"`} value="${x.masked ? "" : esc(showVal(x))}" placeholder="${x.type === "time" ? "HH:MM" : ""}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    sheet(`<div class="p2t">${esc(x.alias || x.key)}</div><div class="ro">${esc(x.key)} · now <b>${esc(showVal(x))}</b>${x.range ? " · " + esc(x.range) : ""}</div>${input}
      <div class="ro p2msg" id="p2msg"></div><button class="btn primary" id="p2go" style="width:100%;margin-top:12px">Review change</button>`);
    document.querySelectorAll("[data-p2b]").forEach((b) => b.onclick = () => { $("#p2val").value = b.dataset.p2b; document.querySelectorAll("[data-p2b]").forEach((y) => y.classList.toggle("primary", y === b)); });
    const go = $("#p2go");
    go.onclick = async () => {
      const v = $("#p2val").value.trim(); if (!v) return setMsg("Type a value", "err");
      go.disabled = true; go.textContent = "Checking…";
      const r = await api("/api/set", { key, value: v });
      const p = r.status === 200 && r.j.proposal;
      if (!p) { go.disabled = false; go.textContent = "Review change"; return setMsg(r.status === 200 ? apiText(r.j) : apiErr(r), "err"); }
      setMsg(apiText(r.j), ""); const inp = $("#p2val"); if (inp) inp.disabled = true;
      confirmStep(p.pid, "Confirm change", "red", (j, ok) => { if (ok) { loadSettings(true); if (S.ss) loadStarship(); } });
    };
  }

  // ---- Social: invite (links.py SIGNUP_URL from the desk), copy traders on/off (copy_on, same as /copy), withdraw note
  async function loadSocial(force) {
    if (S.social && !force) return;
    const [inv, cl] = await Promise.all([api("/api/invite"), api("/api/copy_list")]);
    S.social = { invite: inv.status === 200 ? ((inv.j.messages || [])[0] || {}).links || [] : null, copy: cl.status === 200 ? cl.j : null, err: cl.status === 200 ? null : apiErr(cl) };
    render(true);
  }
  function copyFacts() { return S.social && S.social.copy; }
  function copyIsOn(h) { const f = copyFacts(); if (S.copyOpt && h in S.copyOpt) return S.copyOpt[h]; if (f && f.on_handles) return f.on_handles.includes(h); return null; }
  function copyNote(f) {
    if (!f) return "";
    if (!f.copy_runs) return `<div class="p2note warn">Copy on desk isn't running in this desk process: switching a trader on is refused until it runs.</div>`;
    return `<div class="p2note ${f.running_mode === "LIVE" ? "live" : ""}"><b>Switching a trader ON starts copy trades now</b> (${f.running_mode === "LIVE" ? "LIVE · real money" : "PAPER"}): their new buys go through the 8 layers, ${esc(f.size_pct)}% size, ${esc(f.stop_pct)}% own stop, max ${esc(f.max_on)} traders.
      ${f.lists_every === "off" ? "Copy picks lists are OFF (copy_picks.every = off): that only stops new picks lists; it doesn't stop copying the traders you switch on." : `New picks lists: every ${esc(f.lists_every)}.`}</div>`;
  }
  function viewSocial() {
    const so = S.social, cp = S.files.account && S.files.account.copy_picks, f = copyFacts();
    const traders = cp && cp.lists && cp.lists[0] ? cp.lists[0].rows : [];
    const inv = so && so.invite && so.invite[0];
    return backBar("Account") + `<h1 class="title">Social</h1>
      <div class="grp">Invite</div><div class="list plain"><div class="row"><div class="tx"><div class="t1">Invite a friend to FOMO</div><div class="t2">${inv ? esc(inv.url.replace(/^https:\/\//, "")) : so ? "–" : "loading…"}</div></div>${inv ? `<button class="btn sm primary" data-act="p2invite">Share</button>` : ""}</div></div>
      <div class="grp">Copy on desk</div>${so ? (f ? copyNote(f) : `<div class="p2note warn">${esc(so.err || "")}</div>`) : sk(70)}
      <div class="list plain">${traders.length ? traders.map((r) => { const on = copyIsOn(r.handle) ?? r.copy_on;
        return `<div class="row"><div class="tx"><div class="t1">${esc(r.handle)}</div><div class="t2">#${esc(r.rank)} on today's list${f && f.on_handles.includes(r.handle) ? " · copying" : ""}</div></div><button class="sw ${on ? "on" : ""} live" data-act="copysw" data-h="${esc(r.handle)}" aria-pressed="${!!on}" aria-label="Copy ${esc(r.handle)}"><i></i></button></div>`; }).join("")
        : `<div class="row"><div class="tx"><div class="t1">No copy picks list yet</div><div class="t2">Traders show up here when a list exists</div></div></div>`}</div>
      ${f && f.on_handles.length ? `<div class="ro">Copying now: ${f.on_handles.map(esc).join(", ")}</div>` : ""}
      <div class="grp">Withdraw</div><div class="list plain"><div class="row"><div class="tx"><div class="t1">Withdraw in FOMO yourself</div><div class="t2">The desk never withdraws. Open FOMO and withdraw there.</div></div></div></div>`;
  }
  // optimistic switch: flips at once, rolls back on cancel, refusal or error; the desk's copy_on table is the truth
  async function copySwitch(h) {
    if (!canCtl()) return toast("No control token on this device");
    if (!S.social) await loadSocial();
    const was = !!(copyIsOn(h) ?? false), want = !was;
    S.copyOpt = Object.assign(S.copyOpt || {}, { [h]: want }); render(true);
    const rollback = (msg) => { delete S.copyOpt[h]; render(true); if (msg) toast(msg); };
    const f = copyFacts();
    const sh = sheet(`<div class="p2t">Copy ${esc(h)}: ${want ? "ON" : "OFF"}</div>${want ? copyNote(f) : ""}<div class="ro p2msg" id="p2msg" data-k="busy">Asking the desk…</div>
      <button class="btn dis" id="p2go" style="width:100%;margin-top:12px" disabled>…</button>`);
    let settled = false; sh.onclose = () => { if (!settled) rollback(); };
    const r = await api("/api/copy", { handle: h, on: want });
    const p = r.status === 200 && r.j.proposal;
    if (!p) { settled = true; rollback(); const g = $("#p2go"); if (g) g.textContent = "Not switched"; return setMsg(r.status === 200 ? apiText(r.j) : apiErr(r), "err"); }
    setMsg(apiText(r.j), "");
    confirmStep(p.pid, want ? (p.mode === "LIVE" ? "Confirm: copy with real money" : "Confirm copy ON") : "Confirm copy OFF", want && p.mode === "LIVE" ? "red" : "primary", (j, ok) => {
      settled = true;
      if (ok && j.applied) { S.social.copy = Object.assign(S.social.copy || {}, j); delete S.copyOpt[h]; render(true); }
      else rollback(ok ? "The desk didn't switch it (see the message)" : "Not switched");
    });
  }
  function setv(key) { const g = (S.files.settings || {}).groups || {}; for (const rows of Object.values(g)) for (const r of rows) if (r.key === key) return r.value; return null; }
  function curMode() { return (S.ctl.s && S.ctl.st === "ok" && S.ctl.s.mode) || (S.files.account && S.files.account.mode) || (S.state && S.state.mode); }
  function openMode(to) {
    const cur = curMode(); if (!to || to === cur) return;
    if (!ctlAuth()) { S.ctl.st = "notoken"; render(); toast("No control token on this device"); return; }
    const cs = S.ctl.st === "ok" ? S.ctl.s : null;
    const sh = $("#sheet"), live = to === "LIVE";
    const pb = (cs && cs.per_buy) || {}, lc = (cs && cs.loss_cap) || {};
    const rp = pb.risk_pct ?? setv("brain.risk_per_trade_pct"), mn = pb.min_usd ?? setv("brain.min_ticket_usd"), mx = pb.max_usd ?? setv("brain.max_ticket_usd"), nl = lc.night_loss_stop_pct ?? setv("risk.night_loss_stop_pct"), sp = lc.stop_pct ?? setv("risk.stop_pct");
    const nsb = S.state && S.state.night_start_balance;
    sh.innerHTML = `<div class="in"><div class="grab"></div><div style="font:700 20px var(--disp);margin-bottom:6px">${live ? "🟢 Switch to LIVE" : "🧪 Switch to PAPER"}</div>
      ${live ? `<div class="mrows">
          <div><span>Per buy</span><b>${rp != null ? esc(rp) + "% of cash" : "–"}${mn != null && mx != null ? ` · ${money(+mn)}–${money(+mx)}` : ""}</b></div>
          <div><span>Stop per trade</span><b>${sp != null ? "-" + esc(sp) + "%" : "–"}</b></div>
          <div><span>Nightly loss cap</span><b>${nl != null ? "buys stop at -" + esc(nl) + "%" : "–"}${nl != null && nsb ? ` (≈ ${money(nsb * (1 - nl / 100))})` : ""}</b></div>
          <div><span>First live buy</span><b>60 s after the switch</b></div></div>
        <div class="ro" style="margin:10px 0 6px">LIVE trades real money. The desk refuses unless you unlocked LIVE on the server yourself.</div>
        <input id="livein" class="livein" placeholder="Type LIVE" autocomplete="off" autocapitalize="characters" spellcheck="false">`
      : `<div class="ro" style="margin:4px 0 6px">Instant. Open positions keep being managed (stops, take profit, trail) until they close; new buys are paper.</div>`}
      <button class="btn ${live ? "red" : "primary"} dis" id="modego" style="width:100%;margin-top:12px" disabled>${live ? "Switch to LIVE" : "Switch to PAPER"}</button>
      <div class="ro modemsg" id="modemsg" style="margin-top:10px">${cs ? "" : "The desk hasn't answered yet: you can still try, the desk checks everything itself."}</div>
      <button class="btn" style="width:100%;margin-top:12px" data-act="closesheet">Close</button></div>`;
    sh.hidden = false; sh.onclick = (e) => { if (e.target === sh) sh.hidden = true; };
    const go = $("#modego"), inp = $("#livein");
    const ready = () => !live || (inp && inp.value === "LIVE");
    const upd = () => { const ok = ready(); go.disabled = !ok; go.classList.toggle("dis", !ok); };
    if (inp) inp.addEventListener("input", upd); upd();
    const msg = (t, k) => { const m = $("#modemsg"); m.textContent = t; m.dataset.k = k || ""; };
    go.onclick = async () => { if (!ready()) return; go.disabled = true; go.classList.add("dis"); go.textContent = "Switching…"; msg("Switching…", "busy");
      let r = null;
      try { r = await MODE_SEND(to, live ? inp.value : undefined); } catch { r = null; }
      if (r && r.ok) {
        await ctlPoll(); const s = S.ctl.s || {};
        go.textContent = "Done ✓";
        msg(live ? `Switched to LIVE. ${s.switch_pending ? "The desk restarts into LIVE as soon as nothing is in flight; " : ""}first live buy 60 s after the switch. Telegram confirms.`
          : `Switched to PAPER. No new live buys from now; ${s.open_positions ? `${s.open_positions} open LIVE position${s.open_positions === 1 ? " is" : "s are"} still managed until closed` : "the desk restarts into PAPER in a moment"}. Telegram confirms.`, "ok");
        render(); return;
      }
      go.textContent = live ? "Switch to LIVE" : "Switch to PAPER";
      msg(!r ? "Network error: the desk didn't answer. Nothing changed; try again." : r.locked ? "Live is locked on the server" : r.status === 401 ? "The desk refused this device's token. Nothing changed." : r.status === 429 ? "Too many tries: wait a few minutes. Nothing changed." : r.error === "confirm_required" ? "Type LIVE to confirm" : "Not switched. Nothing changed.", "err");
      upd(); };
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

  // ---------- balance replay: plays the trades of the selected range on the chart with their rocket effects ----------
  // Local only: reads activity pages that are already published (no writes, nothing sent to the desk), runs on rAF, the 15 s poll is untouched.
  const RP_WIN = { LIVE: 3600, "1H": 3600, "4H": 4 * 3600, "1D": 86400, "1W": 7 * 86400 }, RP_1X = 24;   // whole range in 24 s at 1x
  const SPEEDS = [0.5, 1, 2, 4, 8];
  const rowKind = (r) => r.kind === "bought" ? "buy" : r.kind === "stopped" ? "stop" : r.kind === "sold" ? (isTP(r) ? "tp" : "sell") : null;
  const rpWhen = (ts, span) => new Date(ts * 1000).toLocaleString([], span > 86400 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function rpControls() {
    const r = S.rp, n = r.events.filter((e) => e.fired).length;
    return `<div class="rpctl"><button class="rb" data-act="rpplay" id="rpPlay">${r.done ? "↻ Again" : r.playing ? "❚❚ Pause" : "▶ Play"}</button><button class="rb exit" data-act="rpexit">■ Exit</button>
      <div class="spd" role="group" aria-label="Speed">${SPEEDS.map((x) => `<button data-act="rpspeed" data-s="${x}" class="${x === r.speed ? "on" : ""}">${x}x</button>`).join("")}</div></div>
      <div class="rpinfo"><span id="rpTime">${esc(rpWhen(r.pos, r.t1 - r.t0))}</span><span id="rpCount"><b>${n}</b> of ${r.events.length} trades · not live</span></div>`;
  }
  async function rpStart() {
    if (S.rp || !S.state) return;
    const range = S.range, chart = S.files["chart/" + range], pts = (chart && chart.points) || [], now = Date.now() / 1000;
    let t0 = pts.length >= 2 ? pts[0][0] : range === "ALL" ? null : now - RP_WIN[range], t1 = pts.length >= 2 ? pts[pts.length - 1][0] : now;
    for (let i = 0; i < 10; i++) {                       // published activity pages, newest first; stop once we are older than the range
      if (!S.files["activity/" + i]) { if (!S.ix || !S.ix.files["activity/" + i]) break; try { await getFile("activity/" + i); } catch { break; } }
      const rows = (S.files["activity/" + i] || {}).rows || []; if (!rows.length || (t0 != null && rows[rows.length - 1].ts < t0)) break;
    }
    const rows = []; for (let i = 0; i < 10 && S.files["activity/" + i]; i++) rows.push(...(S.files["activity/" + i].rows || []));
    let ev = rows.map((r) => ({ r, kind: rowKind(r) })).filter((x) => x.kind && x.r.ts);
    if (t0 == null) t0 = ev.length ? Math.min(...ev.map((x) => x.r.ts)) - 60 : now - 86400;
    ev = ev.filter((x) => x.r.ts >= t0 && x.r.ts <= t1).sort((a, b) => a.r.ts - b.r.ts)
      .map(({ r, kind }) => ({ ts: r.ts, kind, mint: r.mint, id: r.id, sym: (r.title || "").split(" ").slice(1).join(" ") || (r.mint || "").slice(0, 4), value: String(r.value || "").split(" · ")[0] }));
    if (!ev.length || t1 - t0 < 1) { S.rpMsg = Date.now() + 2600; render(); setTimeout(() => { if (!S.rp) render(); }, 2700); return; }
    S.rp = { range, chart, t0, t1, events: ev, pos: t0, speed: 1, playing: true, done: false, last: 0 };
    render(); rpLoop();
  }
  function rpLoop() {
    const r = S.rp; if (!r || r.raf) return;
    const step = (now) => {
      r.raf = 0; if (S.rp !== r) return;
      if (S.tab !== "home" || S.stack.length) { rpExit(); return; }
      if (r.playing) {
        const dt = r.last ? Math.min(0.1, (now - r.last) / 1000) : 0; r.last = now;
        r.pos = Math.min(r.t1, r.pos + dt * (r.t1 - r.t0) / RP_1X * r.speed);
        let n = 0; for (const e of r.events) if (!e.fired && e.ts <= r.pos) { e.fired = true; if (n++ < 2) rpFire(e); }   // at 8x skip the pile-up, never queue
        if (r.pos >= r.t1) { r.playing = false; r.done = true; render(); return; }
      }
      rpDraw();
      const tEl = $("#rpTime"); if (tEl) tEl.textContent = rpWhen(r.pos, r.t1 - r.t0);
      const cEl = $("#rpCount b"); if (cEl) cEl.textContent = r.events.filter((e) => e.fired).length;
      if (r.playing) r.raf = requestAnimationFrame(step);
    };
    r.last = 0; r.raf = requestAnimationFrame(step);
  }
  function rpDraw() { const r = S.rp, bc = $("#bchart"); if (r && bc) Charts.line(bc, r.chart, null, { upto: r.pos, t0: r.t0, t1: r.t1, events: r.events }); }
  function rpToggle() {
    const r = S.rp; if (!r) return;
    if (r.done) { r.events.forEach((e) => (e.fired = false)); r.pos = r.t0; r.done = false; r.playing = true; }
    else r.playing = !r.playing;
    render(); if (r.playing) rpLoop();
  }
  function rpExit() { const r = S.rp; if (!r) return; if (r.raf) cancelAnimationFrame(r.raf); S.rp = null; render(); }
  function rpFire(e) {
    const bc = $("#bchart"), hero = $("#hero"); if (!bc) return;
    const cr = bc.getBoundingClientRect(), pts = (S.rp.chart && S.rp.chart.points) || [], pad = pts.length >= 2 ? 16 : 22;
    const x = cr.left + pad + (cr.width - 2 * pad) * ((e.ts - S.rp.t0) / (S.rp.t1 - S.rp.t0 || 1)), y = cr.top + cr.height * 0.55;
    const anchor = { getBoundingClientRect: () => e.kind === "tp" ? { left: x - 50, top: y - 100, width: 100, height: 130 } : { left: x, top: y - 10, width: 0, height: 20 } };
    if (hero) { hero.classList.remove("fx-buy", "fx-tp", "fx-stop", "fx-sell"); void hero.offsetWidth; hero.classList.add("fx-" + e.kind); setTimeout(() => hero.classList.remove("fx-" + e.kind), 1600); }
    const lab = { buy: "Bought", tp: "Take profit", stop: "Stopped out", sell: "Exit" }[e.kind];
    const el = document.createElement("div"); el.className = "ppban replay " + e.kind;
    el.innerHTML = `<em>REPLAY</em><b>${esc(lab)}</b> ${esc(e.sym)}${e.value ? ` <span>${esc(e.value)}</span>` : ""}`;
    document.querySelectorAll(".ppban.replay").forEach((b) => b.remove());
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), 1500); setTimeout(() => el.remove(), 2100);
    if (!reduce()) { const shake = () => { const v = $("#view"); if (v) { v.classList.remove("pp-shake"); void v.offsetWidth; v.classList.add("pp-shake"); setTimeout(() => v.classList.remove("pp-shake"), 600); } };
      arcade(e.kind, anchor, e.kind === "stop" ? shake : null); }
  }

  // ---------- guide: guide.html from the same site in a full-screen view (Close returns to the app) ----------
  function openGuide() {
    if ($("#guidev")) return;
    const d = document.createElement("div"); d.id = "guidev"; d.className = "guidev";
    d.innerHTML = `<div class="gbar"><button data-gclose>✕ Close</button><b>How Pump Pilot works</b><a href="guide.html" target="_blank" rel="noopener">Open ↗</a></div><iframe src="guide.html" title="Pump Pilot guide"></iframe>`;
    d.querySelector("[data-gclose]").onclick = () => { d.remove(); if (history.state && history.state.guide) history.back(); };
    document.body.appendChild(d); history.pushState({ d: S.stack.length, guide: 1 }, "");
  }
  addEventListener("popstate", () => { const g = $("#guidev"); if (g) g.remove(); });

  // ---------- effects preview (#fx=demo or Account > Replay effects): local only, no data written, no calls to the desk ----------
  // Plays buy -> take profit -> stop -> trail on Home, 2.5 s apart, over one clearly fake sample row that only exists in the DOM.
  const fxFlag = () => /[#&]fx=demo\b/.test(location.hash);
  function stripFxFlag() {     // drop only fx=demo from the hash; a #d= link stays exactly as it was
    if (!fxFlag()) return;
    const h = location.hash.slice(1).split("&").filter((x) => x && x !== "fx=demo").join("&");
    history.replaceState(history.state, "", location.pathname + location.search + (h ? "#" + h : ""));
  }
  const DEMO = { buy: ["Buy", "green rocket launch"], tp: ["Take profit", "firework"], stop: ["Stop loss", "crash"], sell: ["Exit", "blue rocket landing"] };
  const demoRow = () => `<div class="prow gain demo" id="demorow"><div class="pic">★</div>
      <div class="ptx"><div class="psym">SAMPLE <span class="tag demo">PREVIEW</span></div><div class="psub">Not a real position · no trade</div></div>
      <div class="ppl"><div class="pval">$0.00</div><div class="pchg mut">effects demo</div></div></div>`;
  async function fxDemo() {
    if (S.demo) return;
    if (!S.state) { toast("Open your desk link first, then replay"); return; }
    S.demo = true; go("home");
    const calm = reduce();
    if (!calm) { for (let i = 0; i < 20 && !warmRockets(); i++) await new Promise((r) => setTimeout(r, 100)); }
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

  // ---------- Notifications (web push) ----------
  // The desk's outbox sends each event to this phone (web push) and, while the switch is on, to Telegram.
  // iPhone: push only works in the home-screen app (iOS 16.4+), and the permission prompt needs a tap.
  const EVLAB = { buy: ["Buy filled", "A bot or you bought"], exit: ["Sell / exit", "Trail, time or manual exit"], tp: ["Take profit", "First take profit hit"], stop: ["Stop loss", "Stopped out"],
    report: ["Night report", "Night over, morning report"], desk_down: ["Desk down / STANDBY", "No heartbeat for 2 min, and back up"], risk_pause: ["Risk pause", "Buys stopped by a risk rule"],
    lockout: ["Wrong-token lockout", "Someone tried bad control tokens"], alert: ["Other desk alerts", "FOMO code screen, Chrome, safety box"], control: ["Your app actions", "Mode, buy/sell sent, settings, pause"],
    maintenance: ["Maintenance / updates", "Update starting, and updated ✓ when it's back"], timer: ["Buy timer", "Timer started, cancelled, and when it ends"],
    window: ["Trading window", "Window turned on / off, hours changed"],
    starship: ["🚀 Starship Mode", "On / off, timer end, loss-cap auto-off"], starship_trade: ["🚀 Starship trades", "Each Starship buy, take profit and exit"],
    viewer: ["👀 Viewer link", "Created, revoked, first opened"],
    skips: ["🔎 Skip summary", "Top skip reasons, every 3 h (only if coins were skipped)"],
    health: ["🩺 Morning health check", "09:35, only if something is wrong (not LIVE, bot paused, no coins to Brain, memory)"] };
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const PF = () => window.__PUSH_FAKE || null;          // screenshot tests only (Playwright); never set in the real app
  function pushEnv() {
    if (S.tg || inTelegram()) return "telegram";
    if (PF()) return PF().env || "ok";
    if (isIOS() && !DeskCrypto.isStandalone()) return "iostab";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return "ok";
  }
  const permission = () => (PF() ? PF().permission : "Notification" in window ? Notification.permission : "default");
  async function swReg() { if (PF()) return PF().reg; return navigator.serviceWorker.ready; }
  async function localSub() { try { const r = await Promise.race([swReg(), new Promise((_, no) => setTimeout(() => no(new Error("sw")), 4000))]); return await r.pushManager.getSubscription(); } catch { return null; } }
  async function loadNotif(force) {
    if (S.nf && !force) return;
    const [r, sub] = await Promise.all([api("/api/push/prefs"), pushEnv() === "ok" ? localSub() : Promise.resolve(null)]);
    S.nf = Object.assign(S.nf || {}, { at: Date.now(), err: r.status === 200 ? null : apiErr(r), sub: !!sub });
    if (r.status === 200) Object.assign(S.nf, { prefs: r.j.prefs, devices: r.j.devices, key: r.j.vapid_public_key, loud: r.j.loud || [] });
    render(true);
  }
  // Telegram 8.0+: addToHomeScreen() makes a Telegram shortcut (opens the Mini App; no iPhone notifications from it)
  // 2026-11-15 (Dustin): no Telegram shortcut any more (it only reopened Telegram). Point to /install = the real Safari app.
  const tgHomeRow = () => S.tg ? `<div class="list plain" id="tghome"><div class="row"><div class="tx"><div class="t1">Get the real app: send /install</div><div class="t2">In this chat send /install, then press and hold the link → Open in Safari → Share → Add to Home Screen. That app gets iPhone notifications.</div></div></div></div>` : "";
  function envNote(env) {
    const N = {
      telegram: ["Telegram's in-app browser can't show notifications", "Open Pump Pilot from its icon on your Home Screen, then Account → Notifications → Enable. No icon yet? Send /install in the Telegram chat. Your settings below still work from here."],
      iostab: ["Notifications need the home-screen app", "On iPhone, Safari tabs can't get push. In Safari tap Share → Add to Home Screen, then open Pump Pilot from that icon and come back here. (Already added? Open it from the icon, not from Safari.)"],
      unsupported: ["This browser can't do web push", "On iPhone you need iOS 16.4 or newer and the home-screen app. Telegram alerts keep working meanwhile."],
      denied: ["Notifications are blocked for Pump Pilot", "iPhone: Settings → Notifications → Pump Pilot → Allow Notifications, then come back and tap Enable."] }[env];
    return N ? `<div class="p2note warn"><b>${esc(N[0])}</b><br>${esc(N[1])}</div>` : "";
  }
  function viewNotif() {
    const n = S.nf, p = n && n.prefs, env = pushEnv(), sw = (on, act, data, lab) => `<button class="sw ${on ? "on" : ""}" data-act="${act}" ${data || ""} aria-pressed="${!!on}" aria-label="${esc(lab)}"><i></i></button>`;
    const here = n && n.sub && permission() === "granted";
    const dev = n && n.devices != null ? `${n.devices} device${n.devices === 1 ? "" : "s"} with push on` : "";
    const top = env !== "ok" ? envNote(env)
      : !n ? sk(60)
      : !n.key ? `<div class="p2note warn">The desk has no push key yet. Telegram alerts keep working.</div>`
      : `<div class="list plain"><div class="row"><span class="cdot ${here ? "ok" : "mut"}"></span><div class="tx"><div class="t1">${here ? "Push is on for this phone" : "Push is off on this phone"}</div><div class="t2">${esc(dev)}</div></div>
          ${here ? `<button class="btn sm" data-act="pushoff">Turn off</button>` : `<button class="btn sm primary" data-act="pushon" id="pushon">Enable</button>`}</div></div>
         ${here ? `<div class="btns" style="margin-top:8px"><button class="btn" style="width:100%" data-act="pushtest" id="pushtest">Send test</button></div>` : `<div class="ro">Tap Enable, then Allow. iPhone asks only once.</div>`}`;
    const ev = p ? Object.keys(EVLAB).map((k) => `<div class="row"><div class="tx"><div class="t1">${esc(EVLAB[k][0])}${(n.loud || []).includes(k) ? ' <span class="tag loud">rings in quiet hours</span>' : ""}</div><div class="t2">${esc(EVLAB[k][1])}</div></div>${sw(p.events[k], "evsw", `data-e="${k}"`, EVLAB[k][0])}</div>`).join("") : "";
    return backBar("Account") + `<div class="nf"><h1 class="title">Notifications</h1>
      ${n && n.err ? `<div class="p2note warn">${esc(n.err)}</div>` : ""}
      <div class="grp">This phone</div>${top}${env === "telegram" ? tgHomeRow() : ""}
      <div class="p2msg ro" id="nfmsg"></div>
      ${p ? `<div class="grp">Events</div><div class="list plain">${ev}</div>
      <div class="grp">Quiet hours</div><div class="list plain">
        <div class="row"><div class="tx"><div class="t1">Quiet hours</div><div class="t2">${p.quiet.on ? `On · ${esc(p.quiet.start)}–${esc(p.quiet.end)} (Italy time) · only desk down, lockout and alerts ring` : "Off"}</div></div>${sw(p.quiet.on, "quietsw", "", "Quiet hours")}</div>
        <div class="row"><div class="tx"><div class="t1">Updates ring in quiet hours</div><div class="t2">${p.maint_loud ? "On: maintenance notices ring even in quiet hours" : "Off: maintenance notices stay silent in quiet hours"}</div></div>${sw(p.maint_loud, "maintloud", "", "Updates ring in quiet hours")}</div>
        <div class="row qrow"><label>From <input type="time" id="qstart" value="${esc(p.quiet.start)}"></label><label>to <input type="time" id="qend" value="${esc(p.quiet.end)}"></label><button class="btn sm" data-act="quietsave">Save</button></div></div>
      <div class="grp">Telegram</div><div class="list plain">
        <div class="row"><div class="tx"><div class="t1">Telegram alerts</div><div class="t2">${p.telegram ? "On: Telegram gets the desk's messages as before" : "Off: only this app is notified. Telegram commands still work."}</div></div>${sw(p.telegram, "tgsw", "", "Telegram alerts")}</div></div>
      <div class="ro">Push and Telegram both come from the desk's outbox. Changes here never touch trading.</div>` : ""}</div>`;
  }
  const nfMsg = (t) => { const m = $("#nfmsg"); if (m) m.innerHTML = nl2br(t || ""); };
  const b64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  async function pushEnable() {
    if (pushEnv() !== "ok" || !S.nf || !S.nf.key) return render(true);
    const btn = $("#pushon"); if (btn) btn.disabled = true;
    // the permission prompt first, straight from the tap (iOS refuses it later in the promise chain)
    let perm;
    try { perm = PF() ? await PF().requestPermission() : await Notification.requestPermission(); } catch { perm = "default"; }
    if (perm !== "granted") { render(true); return nfMsg(perm === "denied" ? "Blocked. iPhone: Settings → Notifications → Pump Pilot → Allow." : "Not allowed. Tap Enable again and choose Allow."); }
    nfMsg("Turning on push…");
    let sub;
    try {
      const reg = await swReg();
      sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(S.nf.key) }));
    } catch (e) { if (btn) btn.disabled = false; return nfMsg("This phone couldn't turn push on (" + esc(e.name || "error") + "). Close Pump Pilot fully, reopen it from the icon and try again."); }
    const r = await api("/api/push/subscribe", { subscription: sub.toJSON ? sub.toJSON() : sub });
    if (r.status !== 200) { if (btn) btn.disabled = false; return nfMsg(apiErr(r)); }
    S.nf.sub = true; S.nf.devices = r.j.devices; haptic("success"); render(true); nfMsg("Push is on. Tap Send test to check.");
  }
  async function pushDisable() {
    const sub = await localSub(); let ep = sub && sub.endpoint;
    if (sub) { try { await sub.unsubscribe(); } catch {} }
    if (ep) { const r = await api("/api/push/unsubscribe", { endpoint: ep }); if (r.status !== 200) nfMsg(apiErr(r)); }
    S.nf.sub = false; render(true); await loadNotif(true); nfMsg("Push is off on this phone.");
  }
  async function pushTest() {
    const b = $("#pushtest"); if (b) { b.disabled = true; b.textContent = "Sending…"; }
    const r = await api("/api/push/test", {});
    if (b) { b.disabled = false; b.textContent = "Send test"; }
    if (r.status === 200) nfMsg(r.j.sent ? `Sent to ${r.j.sent} device${r.j.sent === 1 ? "" : "s"}. It should show in a few seconds, even with the app open.${r.j.removed ? ` (${r.j.removed} old device removed)` : ""}` : "The desk couldn't reach this phone's push service. Turn push off and Enable again.");
    else if (r.status === 429) nfMsg("One test every 10 seconds.");
    else nfMsg(apiErr(r));
  }
  // optimistic: flip now, roll back if the desk says no
  async function prefSwitch(upd, okMsg) {
    if (!S.nf || !S.nf.prefs) return;
    const was = JSON.parse(JSON.stringify(S.nf.prefs));
    if (upd.events) Object.assign(S.nf.prefs.events, upd.events);
    if (upd.quiet) Object.assign(S.nf.prefs.quiet, upd.quiet);
    if ("telegram" in upd) S.nf.prefs.telegram = upd.telegram;
    if ("maint_loud" in upd) S.nf.prefs.maint_loud = upd.maint_loud;
    render(true);
    const r = await api("/api/push/prefs", upd);
    if (r.status === 200 && r.j.prefs) { S.nf.prefs = r.j.prefs; render(true); if (okMsg) toast(okMsg); }
    else { S.nf.prefs = was; render(true); toast(r.status === 400 ? "Not saved: check the times (HH:MM)" : apiErr(r)); }
  }
  function tgSwitch() {
    const on = !!(S.nf && S.nf.prefs && S.nf.prefs.telegram);
    if (!on) return prefSwitch({ telegram: true }, "Telegram alerts on");
    const sh = sheet(`<div class="p2t">Turn Telegram alerts off?</div><div class="ro">Telegram stops getting desk messages (fills, alerts, reports). This app's notifications become the only channel, so check Send test works first. Telegram commands and the Pump Pilot button keep working. Telegram gets one last message saying it's off.</div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" id="tgoff">Turn off</button></div>`);
    $("#tgoff").onclick = () => { closeSheet(); prefSwitch({ telegram: false }, "Telegram alerts off"); };
    return sh;
  }
  // a tapped notification opens the right tab: ?tab= on a cold start, a message from the service worker when the app is open
  const TABS = ["home", "bots", "activity", "account"];
  function tabFromUrl() {
    const q = new URLSearchParams(location.search), t = q.get("tab"); if (!t) return;
    if (q.get("a2hs")) { S.wantA2hs = true; q.delete("a2hs"); }
    q.delete("tab"); history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    if (TABS.includes(t)) S.wantTab = t;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { const t = e.data && e.data.tab; if (e.data && e.data.type === "pp-open" && TABS.includes(t)) { if (S.state) go(t); else S.wantTab = t; } });
  function applyWantTab() {
    if (S.wantTab && S.state) { const t = S.wantTab; S.wantTab = null; if (t !== S.tab) go(t); }
    if (S.wantA2hs) { S.wantA2hs = false; setTimeout(() => { const r = $("#tghome"); if (r) { r.scrollIntoView({ block: "center" }); r.classList.add("hl"); } }, 400); }
  }

  // ---------- start ----------
  // ---------- Telegram Mini App: telegram-web-app.js only when we are inside Telegram ----------
  const inTelegram = () => /[#&?]tgWebApp(Data|Version|Platform)=/.test(location.hash + "&" + location.search) || !!window.TelegramWebviewProxy || !!window.__TG_TEST;
  function loadTelegram() {
    return new Promise((ok) => {
      if (window.Telegram && window.Telegram.WebApp) return ok(window.Telegram.WebApp);
      const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js"; s.async = true;
      const t = setTimeout(() => ok(null), 6000);
      s.onload = () => { clearTimeout(t); ok((window.Telegram && window.Telegram.WebApp) || null); }; s.onerror = () => { clearTimeout(t); ok(null); };
      document.head.appendChild(s);
    });
  }
  async function setupTelegram() {
    if (!inTelegram()) return;
    const w = await loadTelegram(); if (!w || !w.initData) return;
    S.tg = w; document.documentElement.classList.add("tg");
    try { w.ready(); w.expand(); w.setHeaderColor("#07090f"); w.setBackgroundColor("#04090b"); if (w.setBottomBarColor) w.setBottomBarColor("#04090b"); } catch {}
    const tp = w.themeParams || {}; if (tp.link_color) document.documentElement.style.setProperty("--tg-link", tp.link_color);   // light touch: links only, our dark-teal stays
    try { w.BackButton.onClick(() => history.back()); } catch {}
    if (!DeskCrypto.dataPath()) {      // the webview has no #d= link: the desk hands the data key to a validated initData session (memory only)
      const r = await api("/api/datakey"); if (r.status === 200 && r.j.d) S.tgDp = r.j.d;
    }
  }
  function tgBack() { try { if (S.tg) S.stack.length ? S.tg.BackButton.show() : S.tg.BackButton.hide(); } catch {} }
  async function start() {
    const wantDemo = fxFlag(); stripFxFlag(); tabFromUrl();
    await setupTelegram();
    S.dp = DeskCrypto.dataPath() || S.tgDp; // takes #d= into localStorage; strips it only in the home-screen app (iOS storage is separate)
    const vk = DeskCrypto.viewerKey();      // VIEWER link: viewer key + no control token -> read-only viewer mode
    if (vk && !DeskCrypto.appToken() && !S.tg) { S.viewer = true; S.vk = vk; S.dp = vk; document.documentElement.classList.add("viewer"); }
    if (window.__VIEWER_TEST) { S.viewer = true; document.documentElement.classList.add("viewer"); }
    S.a2hs = !DeskCrypto.isStandalone() && DeskCrypto.linkInUrl() && localStorage.getItem("desk.a2hs.off") !== "1";
    if (S.a2hs) showA2hs();
    if (window.__DESK_FIXTURE) { fixture(window.__DESK_FIXTURE); applyWantTab(); if (wantDemo) setTimeout(fxDemo, 800); return; }
    if (!S.dp) { render(); if (wantDemo) setTimeout(() => toast("Open your desk link first, then replay"), 500); return; }
    S.desk = await DeskCrypto.open(S.dp, BASE);
    render(); await poll(); applyWantTab();
    if (S.viewer) viewerHello();
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
