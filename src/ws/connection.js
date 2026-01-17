"use strict";

const { safeLower } = require("../utils/strings");
const { streamHistory, sendJSON } = require("./history");

function buildSubscription(url, limits) {
  const addressParam = safeLower(url.searchParams.get("address"));
  const workerParam = safeLower(url.searchParams.get("worker"));
  const minutesParam = Number(url.searchParams.get("minutes") || limits.HISTORY_DEFAULT_MIN);

  if (!addressParam) {
    return { ok: false, code: 1008, reason: "Missing address param (matches share.username)" };
  }

  const minutes = Math.max(
    0,
    Math.min(
      limits.HISTORY_MAX_MIN,
      Number.isFinite(minutesParam) ? minutesParam : limits.HISTORY_DEFAULT_MIN,
    ),
  );

  return {
    ok: true,
    sub: {
      addressLower: addressParam,
      workerLower: workerParam || null,
      minutes,
      createdAt: Date.now(),
    },
  };
}

function onWsConnectionFactory({ clients, watcher, limits, guards }) {
  return function onWsConnection(ws, _req, url) {
    const subRes = buildSubscription(url, limits);
    if (!subRes.ok) {
      ws.close(subRes.code, subRes.reason);
      return;
    }

    const sub = subRes.sub;
    clients.set(ws, sub);

    sendJSON(ws, { type: "hello", address: sub.addressLower, worker: sub.workerLower, minutes: sub.minutes });

    try {
      streamHistory(ws, sub, watcher);
    } catch (e) {
      sendJSON(ws, { type: "error", message: "history_failed", detail: String(e?.message || e) });
    }

    ws.on("close", () => {
      clients.delete(ws);
      if (ws.__ip) guards.decConn(ws.__ip);
    });
  };
}

module.exports = { onWsConnectionFactory };
