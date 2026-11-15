// desk-crypto.js - plan B reader (DECISIONS #26). Everything is derived in the browser from
// DATA_PATH, which only ever arrives in the URL fragment (#d=...) and then lives in localStorage.
// dir = hex(SHA-256('dir:'+DP))[:32], file = hex(SHA-256('file:'+DP+':'+name))[:32]+'.json',
// key = HKDF-SHA256(DP, salt 'fomo-desk/v1', info 'aes-256-gcm'), AES-GCM with AAD = name.
const DeskCrypto = (() => {
  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function open(dp, base) {
    const ikm = await crypto.subtle.importKey("raw", enc.encode(dp), "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("fomo-desk/v1"), info: enc.encode("aes-256-gcm") },
      ikm, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const dir = (await sha("dir:" + dp)).slice(0, 32);
    const url = async (name) => `${base}/d/${dir}/${(await sha(`file:${dp}:${name}`)).slice(0, 32)}.json`;
    async function raw(name) {
      const r = await fetch((await url(name)) + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      const body = await r.json();
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(body.iv), additionalData: enc.encode(name) }, key, b64(body.ct));
    }
    return {
      dir, url,
      get: async (name) => JSON.parse(new TextDecoder().decode(await raw(name))),
      screen: async () => new Blob([await raw("screen")], { type: "image/jpeg" }),
    };
  }
  function dataPath() {
    const m = location.hash.match(/[#&]d=([A-Za-z0-9_-]{32,})/);
    if (m) { localStorage.setItem("desk.d", m[1]); history.replaceState(null, "", location.pathname); }
    return localStorage.getItem("desk.d");
  }
  return { open, dataPath };
})();
if (typeof module !== "undefined") module.exports = DeskCrypto;
