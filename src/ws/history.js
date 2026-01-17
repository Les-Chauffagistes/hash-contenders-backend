"use strict";

const fs = require("fs");
const path = require("path");
const { parseShareLineJSON } = require("../sharelog/parser");
const { shareMatches } = require("../sharelog/matcher");

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function streamHistory(ws, sub, watcher) {
  const minutes = sub.minutes;
  const now = Date.now() / 1000;
  const since = now - minutes * 60;

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

module.exports = { streamHistory, sendJSON };
