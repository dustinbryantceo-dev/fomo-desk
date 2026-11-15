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
  const MARK = { bought: "#0a84ff", sold: "#00d35a", stopped: "#ff453a" };

  // Home balance chart: green line, gradient under it, dashed start line, marks above the line (rows, never overlap)
  function line(cv, data, prev) {
    const pts = (data && data.points) || [], start = data && data.start_value;
    const draw = (shift) => {
      const { g, w, h } = setup(cv);
      if (pts.length < 2) return;
      const top = 44, bot = 12, padX = 16;
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
      let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
      if (start != null) { lo = Math.min(lo, start); hi = Math.max(hi, start); }
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const X = (t) => padX + (w - 2 * padX) * (t1 === t0 ? 1 : (t - t0) / (t1 - t0)) + shift;
      const Y = (v) => top + (h - top - bot) * (1 - (v - lo) / (hi - lo));
      if (start != null) {
        g.save(); g.setLineDash([4, 5]); g.strokeStyle = "rgba(235,235,245,0.3)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, Y(start)); g.lineTo(w, Y(start)); g.stroke(); g.restore();
      }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      const path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(X(p[0]), Y(p[1])) : path.moveTo(X(p[0]), Y(p[1]))));
      const area = new Path2D(path); area.lineTo(X(t1), h); area.lineTo(X(t0), h); area.closePath();
      const gr = g.createLinearGradient(0, top, 0, h); const yl = Math.min(...pts.map((p) => Y(p[1]))); const gr2 = g.createLinearGradient(0, yl, 0, Math.min(h, yl + 120)); gr2.addColorStop(0, "rgba(0,211,90,0.22)"); gr2.addColorStop(1, "rgba(0,211,90,0)"); const grUse = gr2;
      g.fillStyle = grUse; g.fill(area);
      g.strokeStyle = "#00d35a"; g.lineWidth = 2; g.lineJoin = "round"; g.stroke(path);
      const lp = pts[pts.length - 1]; g.fillStyle = "#00d35a"; g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 3.5, 0, 7); g.fill();
      // marks: chips above the line; a later mark moves up a row when it would overlap
      g.font = "600 11px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle";
      const rows = [];
      for (const m of (data.marks || [])) {
        if (m.ts < t0 || m.ts > t1) continue;
        const txt = String(m.text || m.kind), tw = g.measureText(txt).width + 12, x = Math.min(Math.max(X(m.ts) - tw / 2, 2), w - tw - 2);
        let vi = pts.findIndex((p) => p[0] >= m.ts); if (vi < 0) vi = pts.length - 1;
        let row = 0; while ((rows[row] || []).some(([a, b]) => x < b + 4 && x + tw > a - 4)) row++;
        (rows[row] = rows[row] || []).push([x, x + tw]);
        const y = Math.max(10, Math.min(Y(pts[vi][1]) - 16, top - 4) - row * 20);
        g.fillStyle = MARK[m.kind] || "#8e8e93"; g.beginPath(); g.roundRect(x, y - 8, tw, 16, 8); g.fill();
        g.fillStyle = m.kind === "sold" ? "#000" : "#fff"; g.fillText(txt, x + 6, y + 0.5);
        g.strokeStyle = g.fillStyle = MARK[m.kind] || "#8e8e93"; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(m.ts), y + 8); g.lineTo(X(m.ts), Y(pts[vi][1])); g.stroke(); g.globalAlpha = 1;
      }
    };
    // a new point slides in over 250 ms
    const grew = prev && prev.points && pts.length && prev.points.length && pts[pts.length - 1][0] > prev.points[prev.points.length - 1][0];
    if (!grew || reduce()) return draw(0);
    const t = performance.now(), dist = 14;
    const step = (now) => { const k = Math.min(1, (now - t) / 250), e = 1 - Math.pow(1 - k, 3); draw(dist * (1 - e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
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
      const x = i * cw + cw / 2, upc = c[4] >= c[1], col = upc ? "#00d35a" : "#ff453a";
      g.strokeStyle = g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
      const y1 = Y(Math.max(c[1], c[4])), y2 = Y(Math.min(c[1], c[4]));
      g.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
    });
    const dashed = (v, col, label) => {
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); g.restore();
      g.font = "600 11px -apple-system, system-ui, sans-serif"; g.fillStyle = col; g.textAlign = "right"; g.fillText(label, w - 4, Y(v) - 5); g.textAlign = "left";
    };
    if (entry) dashed(entry, "rgba(235,235,245,0.3)", "entry");
    if (exitLine) dashed(exitLine, "#ff9f0a", "exit");
    g.fillStyle = "rgba(235,235,245,0.3)"; g.font = "11px -apple-system, system-ui, sans-serif";
    const tf = (s) => new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    g.fillText(tf(data[0][0]), 2, h - 4); g.textAlign = "right"; g.fillText(tf(data[data.length - 1][0]), w - right, h - 4); g.textAlign = "left";
  }

  // score ring 0-100, green from the pass score
  function ring(score, pass) {
    const v = score == null ? 0 : Math.max(0, Math.min(100, score)), r = 36, c = 2 * Math.PI * r;
    const col = score == null ? "#48484a" : v >= (pass || 70) ? "#00d35a" : "#ff453a";
    return `<svg class="ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" stroke="#2c2c2e" stroke-width="7" fill="none"/>
      <circle cx="42" cy="42" r="${r}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 42 42)"/>
      <text x="42" y="48" text-anchor="middle" fill="#fff" font-size="22" font-weight="600" font-family="-apple-system,system-ui" style="font-variant-numeric:tabular-nums">${score == null ? "–" : Math.round(v)}</text></svg>`;
  }
  return { line, candles, ring };
})();
