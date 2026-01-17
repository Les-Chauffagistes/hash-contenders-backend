#!/usr/bin/env node
"use strict";

const http = require("http");
const WebSocket = require("ws");

const env = require("./config/env");
const limits = require("./config/limits");

const { createApp } = require("./app");
const { createWsGuards } = require("./utils/rateLimit");

const { ShareLogWatcher } = require("./sharelog/watcher");
const { parseShareLineJSON } = require("./sharelog/parser");
const { broadcastLiveShare } = require("./ws/broadcast");

const { onWsConnectionFactory } = require("./ws/connection");
const { attachUpgradeHandler } = require("./ws/upgrade");

// HTTP app + server
const app = createApp({ env, limits });
const server = http.createServer(app);

// WS server
const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();

// Guards (upgrade limit, bans, conn caps)
const guards = createWsGuards({
  upgradeWindowMs: limits.UPGRADE_WINDOW_MS,
  maxUpgradesPerWindow: limits.MAX_UPGRADES_PER_WINDOW,
  abuseBanMs: limits.ABUSE_BAN_MS,
});

// Watcher
const watcher = new ShareLogWatcher(env.LOGS_DIR, {
  trackLastRounds: limits.TRACK_LAST_ROUNDS,
  maxLinesPerTick: limits.MAX_LINES_PER_TICK,
  maxHistoryFiles: limits.MAX_HISTORY_FILES,
});

// WS connection handler
wss.on(
  "connection",
  onWsConnectionFactory({ clients, watcher, limits, guards }),
);

// Upgrade handler (auth + limits)
attachUpgradeHandler(server, wss, { env, limits, guards });

// Live loop
setInterval(() => {
  watcher.tick((line, filePath, roundName) => {
    const share = parseShareLineJSON(line);
    if (!share) return;

    share.round = roundName;
    share.file = filePath;

    broadcastLiveShare(clients, share);
  });
}, limits.TICK_MS);

// Start
server.listen(env.PORT, env.HOST, () => {
  console.log(`[ws] listening on ${env.HOST}:${env.PORT}`);
  console.log(`[ws] logs dir: ${env.LOGS_DIR}`);
  console.log(`[ws] example: ws://${env.HOST}:${env.PORT}/ws/shares?address=bc1q...&worker=LAPB&minutes=10`);
});
