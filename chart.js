// chart.js - hand-drawn <canvas> charts (STEP 10). devicePixelRatio aware, no library.
const Charts = (() => {
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  const MARK = { bought: "#dab26d", sold: "#f7c761", stopped: "#ff453a" };

  // Home balance chart: green line, gradient under it, dashed start line, marks above the line (rows, never overlap)
  // opts (replay only): { upto: ts, t0, t1, events: [{ts, kind}] } draws the line up to `upto` with a playhead; the scale stays the full range
  const EVC = { buy: "#f7c967", tp: "#f7cc6e", stop: "#ff4d6d", sell: "#ddb775" };
  function line(cv, data, prev, opts) {
    const all = (data && data.points) || [], start = data && data.start_value;
    const draw = (shift) => {
      const { g, w, h } = setup(cv);
      if (all.length < 2) { if (opts) timeline(g, w, h, opts); return; }
      let pts = all;
      if (opts) { const i = all.findIndex((p) => p[0] > opts.upto); if (i === 0) pts = [all[0]];
        else if (i > 0) { const a = all[i - 1], b = all[i], k = (opts.upto - a[0]) / (b[0] - a[0] || 1); pts = all.slice(0, i).concat([[opts.upto, a[1] + (b[1] - a[1]) * k]]); } }
      const top = 44, bot = 12, padL = 8, padR = 52;
      const t0 = all[0][0], t1 = all[all.length - 1][0];
      let lo = Math.min(...all.map((p) => p[1])), hi = Math.max(...all.map((p) => p[1]));
      if (start != null) { lo = Math.min(lo, start); hi = Math.max(hi, start); }
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const X = (t) => padL + (w - padL - padR) * (t1 === t0 ? 1 : (t - t0) / (t1 - t0)) + shift;
      const Y = (v) => top + (h - top - bot) * (1 - (v - lo) / (hi - lo));
      const dp = hi - lo < 10 ? 2 : 0, fmtV = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
      g.save(); g.font = "600 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle"; g.textAlign = "left";
      for (let i = 0; i < 4; i++) { const v = lo + (hi - lo) * (i + 0.5) / 4, y = Y(v); g.strokeStyle = "rgba(226,194,139,.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR + 4, y); g.stroke(); g.fillStyle = "rgba(226,195,141,.42)"; g.fillText(fmtV(v), w - padR + 8, y); }
      g.restore();
      if (start != null) {
        g.save(); g.setLineDash([4, 5]); g.strokeStyle = "rgba(249,244,235,0.3)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, Y(start)); g.lineTo(w, Y(start)); g.stroke(); g.restore();
      }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      const path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(X(p[0]), Y(p[1])) : path.moveTo(X(p[0]), Y(p[1]))));
      const area = new Path2D(path); area.lineTo(X(pts[pts.length - 1][0]), h); area.lineTo(X(pts[0][0]), h); area.closePath();
      const gr = g.createLinearGradient(0, top, 0, h); const yl = Math.min(...pts.map((p) => Y(p[1]))); const gr2 = g.createLinearGradient(0, yl, 0, Math.min(h, yl + 120)); gr2.addColorStop(0, "rgba(247,199,97,0.22)"); gr2.addColorStop(1, "rgba(247,199,97,0)"); const grUse = gr2;
      g.fillStyle = grUse; g.fill(area);
      g.strokeStyle = "#f7c761"; g.lineWidth = 2; g.lineJoin = "round"; g.stroke(path);
      const lp = pts[pts.length - 1]; g.fillStyle = "#f7c761"; g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 3.5, 0, 7); g.fill();
      { const up = start == null || lp[1] >= start, txt = fmtV(lp[1]); g.save(); g.font = "700 10px ui-monospace,SFMono-Regular,Menlo,monospace"; g.textBaseline = "middle"; const tw = Math.min(padR - 2, g.measureText(txt).width + 8), ty = Math.min(h - 10, Math.max(top - 6, Y(lp[1])));
        g.fillStyle = up ? "#ff9752" : "#ff5c7a"; g.beginPath(); g.roundRect ? g.roundRect(w - padR + 3, ty - 8, tw, 16, 3) : g.rect(w - padR + 3, ty - 8, tw, 16); g.fill(); g.fillStyle = "#1a1204"; g.fillText(txt, w - padR + 7, ty + 0.5); g.restore(); }
      if (opts) {        // replay: playhead + a dot for every trade already played
        const px = X(opts.upto); g.save(); g.strokeStyle = "rgba(226,195,140,.75)"; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(px, 30); g.lineTo(px, h); g.stroke(); g.restore();
        g.fillStyle = "#e2c38c"; g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 5, 0, 7); g.fill();
        for (const e of opts.events || []) { if (e.ts > opts.upto || e.ts < t0 || e.ts > t1) continue; let vi = all.findIndex((p) => p[0] >= e.ts); if (vi < 0) vi = all.length - 1;
          g.fillStyle = EVC[e.kind] || "#8e8e93"; g.strokeStyle = "#0b0906"; g.lineWidth = 2; g.beginPath(); g.arc(X(e.ts), Y(all[vi][1]), 4.5, 0, 7); g.fill(); g.stroke(); }
      }
      // marks: chips above the line; a later mark moves up a row when it would overlap
      g.font = "600 11px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle";
      const rows = [];
      for (const m of (data.marks || [])) {
        if (m.ts < t0 || m.ts > t1 || (opts && m.ts > opts.upto)) continue;
        const txt = String(m.text || m.kind), tw = g.measureText(txt).width + 12, x = Math.min(Math.max(X(m.ts) - tw / 2, 2), w - tw - 2);
        let vi = all.findIndex((p) => p[0] >= m.ts); if (vi < 0) vi = all.length - 1;
        let row = 0; while ((rows[row] || []).some(([a, b]) => x < b + 4 && x + tw > a - 4)) row++;
        (rows[row] = rows[row] || []).push([x, x + tw]);
        const y = Math.max(10, Math.min(Y(all[vi][1]) - 16, top - 4) - row * 20);
        g.fillStyle = MARK[m.kind] || "#8e8e93"; g.beginPath(); g.roundRect(x, y - 8, tw, 16, 8); g.fill();
        g.fillStyle = m.kind === "sold" ? "#000000" : "#ffffff"; g.fillText(txt, x + 6, y + 0.5);
        g.strokeStyle = g.fillStyle = MARK[m.kind] || "#8e8e93"; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(m.ts), y + 8); g.lineTo(X(m.ts), Y(all[vi][1])); g.stroke(); g.globalAlpha = 1;
      }
    };
    // a new point slides in over 250 ms
    if (opts) return draw(0);
    const grew = prev && prev.points && all.length && prev.points.length && all[all.length - 1][0] > prev.points[prev.points.length - 1][0];
    if (!grew || reduce()) return draw(0);
    const t = performance.now(), dist = 14;
    const step = (now) => { const k = Math.min(1, (now - t) / 250), e = 1 - Math.pow(1 - k, 3); draw(dist * (1 - e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // replay with no balance line in the range: a plain time axis with the trades on it (no made-up values)
  function timeline(g, w, h, o) {
    const pad = 22, y = h * 0.6, X = (t) => pad + (w - 2 * pad) * (o.t1 === o.t0 ? 1 : (t - o.t0) / (o.t1 - o.t0));
    g.strokeStyle = "rgba(238,229,210,.18)"; g.lineWidth = 2; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke();
    g.strokeStyle = "rgba(226,195,140,.9)"; g.beginPath(); g.moveTo(pad, y); g.lineTo(X(Math.min(o.upto, o.t1)), y); g.stroke();
    for (const e of o.events || []) { if (e.ts > o.upto) continue; g.fillStyle = EVC[e.kind] || "#8e8e93"; g.beginPath(); g.arc(X(e.ts), y, 5, 0, 7); g.fill(); }
    const px = X(Math.min(o.upto, o.t1)); g.fillStyle = "#e2c38c"; g.beginPath(); g.arc(px, y, 6, 0, 7); g.fill();
  }

  // Coin screen: 1-minute candles from db.prices + orange dashed exit line
  function candles(cv, cs, exitLine, entry) {
    const { g, w, h } = setup(cv);
    if (!cs || !cs.length) return;
    const n = Math.min(cs.length, 90), data = cs.slice(-n), top = 10, bot = 18, right = 8;
    let lo = Math.min(...data.map((c) => c[3])), hi = Math.max(...data.map((c) => c[2]));
    for (const v of [exitLine, entry]) if (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi - lo <= 0) { hi *= 1.01; lo *= 0.99; if (hi === lo) { hi = 1; lo = 0; } }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = (v) => top + (h - top - bot) * (1 - (v - lo) / (hi - lo));
    const cw = (w - right) / Math.max(n, 20), bw = Math.max(2, cw * 0.62);
    data.forEach((c, i) => {
      const x = i * cw + cw / 2, upc = c[4] >= c[1], col = upc ? "#f7c761" : "#ff453a";
      g.strokeStyle = g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
      const y1 = Y(Math.max(c[1], c[4])), y2 = Y(Math.min(c[1], c[4]));
      g.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
    });
    const dashed = (v, col, label) => {
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); g.restore();
      g.font = "600 11px -apple-system, system-ui, sans-serif"; g.fillStyle = col; g.textAlign = "right"; g.fillText(label, w - 4, Y(v) - 5); g.textAlign = "left";
    };
    if (entry) dashed(entry, "rgba(249,244,235,0.3)", "entry");
    if (exitLine) dashed(exitLine, "#ff6c0a", "exit");
    g.fillStyle = "rgba(249,244,235,0.3)"; g.font = "11px -apple-system, system-ui, sans-serif";
    const tf = (s) => new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    g.fillText(tf(data[0][0]), 2, h - 4); g.textAlign = "right"; g.fillText(tf(data[data.length - 1][0]), w - right, h - 4); g.textAlign = "left";
  }

  // score ring 0-100, green from the pass score
  function ring(score, pass) {
    const v = score == null ? 0 : Math.max(0, Math.min(100, score)), r = 36, c = 2 * Math.PI * r;
    const col = score == null ? "#48484a" : v >= (pass || 70) ? "#f7c761" : "#ff453a";
    return `<svg class="ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" stroke="#2c2c2e" stroke-width="7" fill="none"/>
      <circle cx="42" cy="42" r="${r}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 42 42)"/>
      <text x="42" y="48" text-anchor="middle" fill="#ffffff" font-size="22" font-weight="600" font-family="-apple-system,system-ui" style="font-variant-numeric:tabular-nums">${score == null ? "–" : Math.round(v)}</text></svg>`;
  }
  return { line, candles, ring };
})();
