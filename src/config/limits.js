"use strict";

module.exports = {
  // watcher
  TICK_MS: Number(process.env.TICK_MS || 1000),
  TRACK_LAST_ROUNDS: Number(process.env.TRACK_LAST_ROUNDS || 6),
  MAX_LINES_PER_TICK: Number(process.env.MAX_LINES_PER_TICK || 10000),

  // history scan
  HISTORY_DEFAULT_MIN: Number(process.env.HISTORY_DEFAULT_MIN || 10),
  HISTORY_MAX_MIN: Number(process.env.HISTORY_MAX_MIN || 120),
  MAX_HISTORY_FILES: Number(process.env.MAX_HISTORY_FILES || 200),

  // connection limits
  MAX_CONNS_GLOBAL: Number(process.env.MAX_CONNS_GLOBAL || 200),
  MAX_CONNS_PER_IP: Number(process.env.MAX_CONNS_PER_IP || 30),

  // upgrade abuse
  UPGRADE_WINDOW_MS: Number(process.env.UPGRADE_WINDOW_MS || 10_000),
  MAX_UPGRADES_PER_WINDOW: Number(process.env.MAX_UPGRADES_PER_WINDOW || 60),
  ABUSE_BAN_MS: Number(process.env.ABUSE_BAN_MS || 60_000),
};
