#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
require("dotenv").config();

// =====================
// CONFIG
// =====================
const LOGS_DIR = process.env.ROUNDS_DIR || "/data/ckpool/logs"; // chez toi c'est /data/ckpool/logs
const TICK_MS = Number(process.env.TICK_MS || 1000);
const TRACK_LAST_ROUNDS = Number(process.env.TRACK_LAST_ROUNDS || 6); // un peu plus large
const MAX_LINES_PER_TICK = Number(process.env.MAX_LINES_PER_TICK || 10000);

const HISTORY_DEFAULT_MIN = Number(process.env.HISTORY_DEFAULT_MIN || 10);
const HISTORY_MAX_MIN = Number(process.env.HISTORY_MAX_MIN || 120); // évite scan 24h par accident
const MAX_HISTORY_FILES = Number(process.env.MAX_HISTORY_FILES || 200); // évite d'ouvrir trop de fichiers
const WS_TOKEN = process.env.WS_TOKEN || "";


// =====================
// HELPERS
// =====================
function isHexRoundName(name) {
  return /^[0-9a-f]{8}$/i.test(name);
}

function safeLower(s) {
  return (s || "").toString().trim().toLowerCase();
}

function parseCreatedateToEpochSeconds(createdate) {
  // "1768587688,877359151" -> 1768587688.877359151
  if (!createdate) return null;
  const s = String(createdate).trim();
  const parts = s.split(",");
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return Number(parts[0]) + Number("0." + parts[1]);
  }
  // fallback if already float-ish
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseShareLineJSON(line) {
  const s = line.trim();
  if (!s) return null;
  if (s[0] !== "{") return null;
  try {
    const o = JSON.parse(s);
    // We only care about share submits
    // (optional) if you want: if (o.createcode !== "parse_submit") return null;

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
      ip: o.address ?? null,   // attention: dans tes logs "address" = IP du mineur
      agent: o.agent ?? null,
      rejectReason: o["reject-reason"] ?? null,
      raw: o,
    };
  } catch {
    return null;
  }
}

function splitWorkername(workername) {
  // "bc1q...xyz.Meier_Link" -> { addrPart, userPart }
  if (!workername) return { addrPart: null, userPart: null };
  const idx = workername.indexOf(".");
  if (idx === -1) return { addrPart: workername, userPart: null };
  return {
    addrPart: workername.slice(0, idx),
    userPart: workername.slice(idx + 1),
  };
}

function shareMatches(share, sub) {
  // sub: { addressPartLower, workerLower|null }
  const wn = share.workername;
  if (!wn) return false;

  const { addrPart, userPart } = splitWorkername(wn);
  if (!addrPart) return false;

  const addrLower = safeLower(addrPart);
  if (addrLower !== sub.addressPartLower) return false;

  if (sub.workerLower) {
    const uLower = safeLower(share.username || userPart);
    if (uLower !== sub.workerLower) return false;
  }

  return true;
}

// =====================
// WATCHER (round folders + sharelogs)
// =====================
class ShareLogWatcher {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.fileState = new Map(); // filePath -> { offset, ino, carry }
    this.trackedRounds = [];
    this.lastRoundsKey = "";
  }

  listRoundsSorted() {
    let items;
    try {
      items = fs.readdirSync(this.rootDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return items
      .filter((d) => d.isDirectory() && isHexRoundName(d.name))
      .map((d) => d.name)
      .sort(); // fixed width hex => lex sort ok
  }

  computeTrackedRounds() {
    const rounds = this.listRoundsSorted();
    if (rounds.length === 0) return [];
    const startIdx = Math.max(0, rounds.length - TRACK_LAST_ROUNDS);
    return rounds.slice(startIdx);
  }

  listSharelogsForRound(roundName) {
    const dir = path.join(this.rootDir, roundName);
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return items
      .filter((d) => d.isFile() && d.name.endsWith(".sharelog"))
      .map((d) => path.join(dir, d.name))
      .sort();
  }

  readNewLines(filePath) {
    let st;
    try {
      st = fs.statSync(filePath);
    } catch {
      this.fileState.delete(filePath);
      return [];
    }

    const ino = st.ino;
    const size = st.size;

    let state = this.fileState.get(filePath);
    if (!state) {
        const nowMs = Date.now();
        const ageMs = nowMs - st.mtimeMs;

        // Si le fichier vient d’être créé/modifié à l’instant, on le lit depuis 0
        // pour ne rien rater au moment où ckpool bascule dessus.
        const startFrom = (ageMs <= 5000) ? 0 : size;

        state = { offset: startFrom, ino, carry: "" };
        this.fileState.set(filePath, state);

        // si startFrom=0, on va lire au prochain tick (ou tu peux lire tout de suite)
        return [];
        }

    if (state.ino !== ino || size < state.offset) {
      state.offset = 0;
      state.ino = ino;
      state.carry = "";
    }

    if (size === state.offset) return [];

    const fd = fs.openSync(filePath, "r");
    try {
      const toRead = size - state.offset;
      const buf = Buffer.allocUnsafe(toRead);
      fs.readSync(fd, buf, 0, toRead, state.offset);
      state.offset = size;

      const chunk = state.carry + buf.toString("utf8");
      const parts = chunk.split("\n");
      state.carry = parts.pop() ?? "";
      return parts;
    } finally {
      fs.closeSync(fd);
    }
  }

  tick(onLine) {
    const rounds = this.computeTrackedRounds();
    const key = rounds.join(",");
    if (key !== this.lastRoundsKey) {
      this.trackedRounds = rounds;
      this.lastRoundsKey = key;
    }

    let emitted = 0;
    for (const r of this.trackedRounds) {
      const files = this.listSharelogsForRound(r);
      for (const f of files) {
        const lines = this.readNewLines(f);
        for (const line of lines) {
          onLine(line, f, r);
          emitted++;
          if (emitted >= MAX_LINES_PER_TICK) return;
        }
      }
    }
  }

  // For history: find recent sharelog files by mtime, across recent rounds
  findRecentSharelogFiles(sinceEpochSec) {
    const rounds = this.listRoundsSorted();
    if (rounds.length === 0) return [];

    // scan only last K rounds for history as well
    const startIdx = Math.max(0, rounds.length - Math.max(TRACK_LAST_ROUNDS, 15));
    const scanRounds = rounds.slice(startIdx);

    const candidates = [];
    for (const r of scanRounds) {
      const files = this.listSharelogsForRound(r);
      for (const f of files) {
        try {
          const st = fs.statSync(f);
          // If file modified after "since", it's a candidate
          if ((st.mtimeMs / 1000) >= sinceEpochSec) {
            candidates.push({ f, mtimeMs: st.mtimeMs });
          }
        } catch {}
      }
    }

    candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
    return candidates.slice(-MAX_HISTORY_FILES).map(x => x.f);
  }
}

// =====================
// WS SERVER
// =====================
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const clients = new Map(); // ws -> sub
const watcher = new ShareLogWatcher(LOGS_DIR);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    logsDir: LOGS_DIR,
    tickMs: TICK_MS,
    trackLastRounds: TRACK_LAST_ROUNDS,
  });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/ws/shares") {
    socket.destroy();
    return;
  }

  // 🔐 Authorization: Bearer <token>
  const expected = WS_TOKEN;
  if (!expected) {
    // si tu veux forcer qu'il y ait toujours un token côté env, refuse si absent
    socket.write("HTTP/1.1 500 Server Misconfigured\r\n\r\n");
    socket.destroy();
    return;
  }

  const auth = (req.headers["authorization"] || "").toString();
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (token !== expected) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, url);
  });
});

function sendJSON(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function streamHistory(ws, sub) {
  const minutes = sub.minutes;
  const now = Date.now() / 1000;
  const since = now - minutes * 60;

  // Find likely recent files by mtime to avoid scanning everything
  const files = watcher.findRecentSharelogFiles(since);

  let sent = 0;
  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (const line of lines) {
      const share = parseShareLineJSON(line);
      if (!share) continue;
      if (share.ts && share.ts < since) continue;
      if (!shareMatches(share, sub)) continue;

      share.round = path.basename(path.dirname(filePath));
      share.file = filePath;

      sendJSON(ws, { type: "share", replay: true, share });
      sent++;
    }
  }

  sendJSON(ws, { type: "history_end", sent, minutes });
}

wss.on("connection", (ws, _req, url) => {
  // address param: MUST be the part before the dot (bc1...)
  const addressParam = safeLower(url.searchParams.get("address"));
  const workerParam = safeLower(url.searchParams.get("worker"));
  const minutesParam = Number(url.searchParams.get("minutes") || HISTORY_DEFAULT_MIN);

  if (!addressParam) {
    ws.close(1008, "Missing address param (use bc1... part before the dot)");
    return;
  }

  const minutes = Math.max(0, Math.min(HISTORY_MAX_MIN, Number.isFinite(minutesParam) ? minutesParam : HISTORY_DEFAULT_MIN));

  const sub = {
    addressPartLower: addressParam,
    workerLower: workerParam || null,
    minutes,
    createdAt: Date.now(),
  };

  clients.set(ws, sub);

  sendJSON(ws, { type: "hello", address: addressParam, worker: sub.workerLower, minutes });

  // Send replay first
  try {
    streamHistory(ws, sub);
  } catch (e) {
    sendJSON(ws, { type: "error", message: "history_failed", detail: String(e?.message || e) });
  }

  ws.on("close", () => {
    clients.delete(ws);
  });
});

// Broadcast live shares
function broadcastLiveShare(share) {
  const payload = { type: "share", replay: false, share };

  for (const [ws, sub] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (!shareMatches(share, sub)) continue;
    sendJSON(ws, payload);
  }
}

// Watch loop (live only)
setInterval(() => {
  watcher.tick((line, filePath, roundName) => {
    const share = parseShareLineJSON(line);
    if (!share) return;

    share.round = roundName;
    share.file = filePath;

    broadcastLiveShare(share);
  });
}, TICK_MS);

// Start
const PORT = Number(process.env.PORT || 3005);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ws] listening on :${PORT}`);
  console.log(`[ws] logs dir: ${LOGS_DIR}`);
  console.log(`[ws] example: ws://HOST:${PORT}/ws/shares?address=bc1q...&worker=Meier_Link&minutes=10`);
});
