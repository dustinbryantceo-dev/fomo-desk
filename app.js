// app.js - the desk on the iPhone (STEP 10), hosting plan B (DECISIONS #26).
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
      const old = S.screenUrl; S.screenUrl = url; S.screenVer = v; paintScreen(); if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
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
      <p>This phone has no desk link yet. Open the private link from Grok Bot once; it is saved on this phone and removed from the address bar.</p>
      <p class="ter">Then Share → Add to Home Screen for full screen.</p></div>`;
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

  function viewHome() {
    const st = S.state, a = (S.files["activity/0"] || { rows: [] }).rows, chart = S.files["chart/" + S.range];
    const up = (st.today_pct || 0) >= 0, unseen = a.length && a[0].ts > +(localStorage.getItem("desk.seen") || 0);
    const lastO = st.last_order;
    const scr = st.screen || {};
    return `
      <div class="navbar">
        <button class="avatar" data-act="tab" data-tab="account" aria-label="Account">D</button>
        <button class="navtitle" data-act="tab" data-tab="bots">Grok Bot <span class="chev">›</span></button>
        <div class="navsp"></div>
        <button class="iconbtn" data-act="search" aria-label="Search">${ICON.search}</button>
        <button class="iconbtn" data-act="tab" data-tab="activity" aria-label="Activity">${ICON.bell}${unseen ? '<i class="dot"></i>' : ""}</button>
      </div>
      <div id="searchbox"></div>
      <div class="balrow"><div class="balance"><span class="odo" id="bal"></span></div>${paperPill()}</div>
      <div class="today"><span class="${up ? "up" : "down"}">${pct(st.today_pct)}</span><span class="mut">today</span>
        ${st.multiplier != null ? `<span class="pill mult">${st.multiplier.toFixed(2)}×</span>` : ""}</div>
      <div class="chartbox"><canvas id="bchart"></canvas>${!chart || (chart.points || []).length < 2 ? `<div class="chartnote">${chart ? "Waiting for the first trade" : ""}</div>` : ""}</div>
      <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map((r) => `<button data-act="range" data-r="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>
      <div class="live">
        <div class="frame" id="liveframe" data-act="full">
          <img alt=""><img alt="">
          ${S.screenUrl ? "" : '<div class="nof">No frame yet</div>'}
          ${scr.paused ? '<div class="paused">Paused · private<br><span class="ter" style="font-size:13px">a login or withdraw form is open</span></div>' : ""}
          <div class="tl" id="livetl"></div>
          <div class="tr" id="livetr"></div>
        </div>
        <div class="last">${lastO ? lastOrderLine(lastO) : '<span class="mut">No orders yet</span>'}</div>
        <div class="livenote">Plan B: a new frame every ${scr.published_every_s || 60}s</div>
      </div>
      <h2 class="sec">Bots <span class="count">· ${st.bots.filter((b) => b.status === "running").length} running</span><button class="more" data-act="tab" data-tab="bots">See all</button></h2>
      <div class="carousel">${BOT_ORDER.map((n) => botCard(bots()[n] || { name: n, title: n })).join("")}</div>
      <h2 class="sec">Activity<button class="more" data-act="tab" data-tab="activity">See all</button></h2>
      ${a.length ? `<div class="list">${a.slice(0, 5).map(actRow).join("")}</div>` : st.positions.length ? `<div class="empty">Nothing yet tonight</div>` : `<div class="empty"><b>Waiting for the first trade</b>Scanner and Analyst are working; trades show up here.</div>`}
      ${st.positions.length ? `<h2 class="sec">Open positions</h2><div class="list">${st.positions.map(posRow).join("")}</div>` : ""}`;
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
    tl.innerHTML = !ft ? '<span class="gdot"></span>No frame yet' : fresh ? '<span class="rdot"></span>Live · Bot\'s computer' : `<span class="gdot"></span>Last frame ${hms(ft)}`;
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
    const k = r.kind, col = k === "bought" ? "#0a84ff" : k === "sold" ? "#00d35a" : k === "stopped" ? "#ff453a" : "#8e8e93";
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
        <div class="row" style="padding:10px 0;min-height:52px"><div class="tx"><div class="t1">${locked ? "Locked · position open" : "Running"}</div><div class="t2">${locked ? "Risk can't be paused with a position open" : "Pause · via Telegram (STEP 11)"}</div></div>
          <span class="switch ${b.status === "running" || b.status === "stale" ? "on" : ""}" aria-disabled="true"></span></div>
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
      <div class="grp">Copy picks</div><div class="list plain"><div class="row"><div class="tx"><div class="t1">Off</div><div class="t2">off / every 24h / 12h / 6h + time · via Telegram (STEP 11)</div></div></div></div>
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
    const balEl = $("#bal"), keepBal = balEl && balEl.dataset.v;
    view.innerHTML = html;
    if (key === lastHtmlKey && fromPoll) scrollTo(0, y); lastHtmlKey = key;
    after(keepBal);
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
  function after(keepBal) {
    const bal = $("#bal");
    if (bal && S.state) { if (keepBal) bal.dataset.v = keepBal, bal.innerHTML = ""; odo(bal, money(S.state.balance)); }
    const bc = $("#bchart"); if (bc) { const ch = S.files["chart/" + S.range]; Charts.line(bc, ch, prevChart); prevChart = ch; }
    const top = S.stack[S.stack.length - 1];
    const cc = $("#cchart"); if (cc && top) { const c = S.files["coin/" + top.mint]; if (c) Charts.candles(cc, c.candles, c.exit_line, c.position && c.position.entry_price); }
    document.querySelectorAll(".disc .d").forEach((d) => requestAnimationFrame(() => d.classList.add(d.dataset.st)));
    if (reduce()) document.querySelectorAll(".disc .d").forEach((d) => { d.style.transitionDelay = "0s"; d.classList.add(d.dataset.st); });
    paintScreen(); liveLabel();
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

  // ---------- start ----------
  async function start() {
    S.dp = DeskCrypto.dataPath(); // takes #d= once into localStorage and strips it from the URL bar
    if (window.__DESK_FIXTURE) return fixture(window.__DESK_FIXTURE);
    if (!S.dp) { render(); return; }
    S.desk = await DeskCrypto.open(S.dp, BASE);
    render(); await poll();
    setInterval(poll, POLL_S * 1000);
    setInterval(() => { const g = $("#gaten"); if (g) g.textContent = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000)); }, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  }
  // test hook for screenshots only (Playwright sets window.__DESK_FIXTURE); never set in the real app
  function fixture(fx) {
    S.dp = S.dp || "fixture"; S.ix = { files: {}, t: fx.t || Date.now() / 1000 }; S.state = fx.state; S.lastIxT = S.ix.t; S.err = fx.err || null; S.retryAt = Date.now() + POLL_S * 1000; S.firstTry = false;
    for (const [k, v] of Object.entries(fx.files || {})) { S.files[k] = v; S.ver[k] = "fx"; S.ix.files[k] = "fx"; }
    if (fx.screen) { S.screenUrl = fx.screen; }
    render();
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  addEventListener("resize", () => after());
  start();
})();
