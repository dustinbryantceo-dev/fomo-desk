// desk-crypto.js - plan B reader (DECISIONS #26). Everything is derived in the browser from
// DATA_PATH, which only ever arrives in the URL fragment (#d=...) and then lives in localStorage.
//   dir   hex(SHA-256('dir:'+DP))[:32]
//   index hex(SHA-256('slot:'+DP+':'+slot))[:32].json, slot = floor(t/15) -> state + {name: version}
//   file  hex(SHA-256('file:'+DP+':'+name+':'+version))[:32].json
//   key   HKDF-SHA256(DP, salt 'fomo-desk/v1', info 'aes-256-gcm'); AES-GCM, AAD = name
const DeskCrypto = (() => {
  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function open(dp, base, interval = 15) {
    const ikm = await crypto.subtle.importKey("raw", enc.encode(dp), "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("fomo-desk/v1"), info: enc.encode("aes-256-gcm") },
      ikm, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const dir = `${base}/d/${(await sha("dir:" + dp)).slice(0, 32)}/`;
    let skew = 0, index = null;
    async function fetchOpen(url, name) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { const e = new Error(`${name}: HTTP ${r.status}`); e.status = r.status; throw e; }
      const body = await r.json();
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(body.iv), additionalData: enc.encode(name) }, key, b64(body.ct));
    }
    // newest index: never ask for a slot before it can exist (raw caches a 404 ~60 s), step back on 404
    async function latest() {
      let s = Math.floor((Date.now() / 1000 + skew - 6) / interval);
      for (let i = 0; i < 6; i++, s--) {
        try {
          const ix = JSON.parse(new TextDecoder().decode(await fetchOpen(dir + (await sha(`slot:${dp}:${s}`)).slice(0, 32) + ".json", "index")));
          index = ix; return ix;
        } catch (e) { if (e.status !== 404) throw e; }
      }
      throw new Error("no index in the last 6 slots");
    }
    async function file(name) {
      if (!index) await latest();
      const v = index.files[name]; if (!v) { const e = new Error(`${name}: not published`); e.status = 404; throw e; }
      return fetchOpen(dir + (await sha(`file:${dp}:${name}:${v}`)).slice(0, 32) + ".json", name);
    }
    return {
      latest,
      get: async (name) => JSON.parse(new TextDecoder().decode(await file(name))),
      screen: async () => new Blob([await file("screen")], { type: "image/jpeg" }),
    };
  }
  // iOS: a home-screen app has its own storage, separate from Safari. In Safari (not standalone) the #d= link stays in
  // the URL so "Add to Home Screen" saves it; the standalone app reads it once, keeps it in its own storage, strips it.
  function isStandalone() {
    return navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  function dataPath() {
    const m = location.hash.match(/[#&]d=([A-Za-z0-9_-]{32,})/);
    if (m) {
      localStorage.setItem("desk.d", m[1]);
      if (isStandalone()) history.replaceState(null, "", location.pathname);
    }
    return localStorage.getItem("desk.d");
  }
  function linkInUrl() { return /[#&]d=[A-Za-z0-9_-]{32,}/.test(location.hash); }
  return { open, dataPath, isStandalone, linkInUrl };
})();
if (typeof module !== "undefined") module.exports = DeskCrypto;
