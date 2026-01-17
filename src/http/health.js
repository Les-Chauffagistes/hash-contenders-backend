"use strict";

function healthFactory({ env, limits }) {
  return function health(_req, res) {
    res.json({
      ok: true,
      logsDir: env.LOGS_DIR,
      tickMs: limits.TICK_MS,
      trackLastRounds: limits.TRACK_LAST_ROUNDS,
      maxConnsGlobal: limits.MAX_CONNS_GLOBAL,
      maxConnsPerIp: limits.MAX_CONNS_PER_IP,
      maxUpgradesPerWindow: limits.MAX_UPGRADES_PER_WINDOW,
      upgradeWindowMs: limits.UPGRADE_WINDOW_MS,
    });
  };
}

module.exports = { healthFactory };
