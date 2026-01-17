"use strict";

const { getClientIp } = require("../utils/ip");
const { checkBearer } = require("./auth");

function sendHttpAndClose(socket, statusLine) {
  try {
    socket.write(`HTTP/1.1 ${statusLine}\r\n\r\n`);
  } catch {}
  try {
    socket.destroy();
  } catch {}
}

function attachUpgradeHandler(server, wss, { env, limits, guards }) {
  server.on("upgrade", (req, socket, head) => {
    const ip = getClientIp(req, env.TRUST_PROXY);

    // basic bans + upgrade rate limit
    if (!ip || guards.isBanned(ip) || !guards.checkAndCountUpgrade(ip)) {
      sendHttpAndClose(socket, "429 Too Many Requests");
      return;
    }

    // global conn cap
    if (wss.clients && wss.clients.size >= limits.MAX_CONNS_GLOBAL) {
      sendHttpAndClose(socket, "503 Service Unavailable");
      return;
    }

    // per-ip cap
    if (guards.getConnCount(ip) >= limits.MAX_CONNS_PER_IP) {
      sendHttpAndClose(socket, "429 Too Many Requests");
      return;
    }

    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws/shares") {
      socket.destroy();
      return;
    }

    const authRes = checkBearer(req, env.WS_TOKEN);
    if (!authRes.ok) {
      sendHttpAndClose(socket, authRes.status);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.__ip = ip;
      guards.incConn(ip);
      wss.emit("connection", ws, req, url);
    });
  });
}

module.exports = { attachUpgradeHandler };
