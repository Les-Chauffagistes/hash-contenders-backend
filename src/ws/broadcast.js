"use strict";

const { shareMatches } = require("../sharelog/matcher");
const { sendJSON } = require("./history");

function broadcastLiveShare(clients, share) {
  const payload = { type: "share", replay: false, share };

  for (const [ws, sub] of clients.entries()) {
    if (ws.readyState !== ws.OPEN) continue;
    if (!shareMatches(share, sub)) continue;
    sendJSON(ws, payload);
  }
}

module.exports = { broadcastLiveShare };
