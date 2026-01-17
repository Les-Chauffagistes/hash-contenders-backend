"use strict";

const { safeLower } = require("../utils/strings");

function parseCreatedateToEpochSeconds(createdate) {
  // "1768587688,877359151" -> 1768587688.877359151
  if (!createdate) return null;
  const s = String(createdate).trim();
  const parts = s.split(",");
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return Number(parts[0]) + Number("0." + parts[1]);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// workername:
// - "bc1q..."
// - "bc1q...Rig1"
// - parfois "Rig1"
function splitWorkername(workername) {
  if (!workername) return { addrPart: null, workerPart: null };
  const s = String(workername).trim();
  const idx = s.indexOf(".");
  if (idx === -1) return { addrPart: s, workerPart: null };
  return { addrPart: s.slice(0, idx), workerPart: s.slice(idx + 1) };
}

function parseShareLineJSON(line) {
  const s = (line || "").trim();
  if (!s || s[0] !== "{") return null;

  try {
    const o = JSON.parse(s);
    const { addrPart: wnAddrPart, workerPart } = splitWorkername(o.workername);

    const address = o.username ?? null; // adresse "réelle"
    const worker = workerPart ?? null;  // suffixe du workername

    return {
      workinfoid: o.workinfoid,
      clientid: o.clientid,
      diff: o.diff ?? null,
      sdiff: o.sdiff ?? null,
      hash: o.hash ?? null,
      result: o.result ?? null,
      errn: o.errn ?? null,
      createdate: o.createdate ?? null,
      ts: parseCreatedateToEpochSeconds(o.createdate) ?? (Date.now() / 1000),

      workername: o.workername ?? null,
      username: o.username ?? null,

      // normalisés
      address: safeLower(address), // on lower tout de suite pour matcher vite
      worker: safeLower(worker),

      workernameAddr: wnAddrPart ?? null,
      ip: o.address ?? null, // dans tes logs "address" = IP mineur
      agent: o.agent ?? null,
      rejectReason: o["reject-reason"] ?? null,

      raw: o,
    };
  } catch {
    return null;
  }
}

module.exports = {
  parseShareLineJSON,
  parseCreatedateToEpochSeconds,
  splitWorkername,
};
