"use strict";

/**
 * In-memory limiter:
 * - limit upgrades / window / ip
 * - ban abusive IPs for ABUSE_BAN_MS
 * - track current connections / ip
 */
function createWsGuards({
  upgradeWindowMs,
  maxUpgradesPerWindow,
  abuseBanMs,
}) {
  const upgradeLimiter = new Map(); // ip -> { count, resetAtMs }
  const ipBans = new Map(); // ip -> banUntilMs
  const ipConnCount = new Map(); // ip -> current open conns

  function isBanned(ip) {
    const until = ipBans.get(ip);
    if (!until) return false;
    if (Date.now() >= until) {
      ipBans.delete(ip);
      return false;
    }
    return true;
  }

  function checkAndCountUpgrade(ip) {
    const now = Date.now();
    let st = upgradeLimiter.get(ip);
    if (!st || now >= st.resetAtMs) {
      st = { count: 0, resetAtMs: now + upgradeWindowMs };
      upgradeLimiter.set(ip, st);
    }
    st.count++;
    if (st.count > maxUpgradesPerWindow) {
      ipBans.set(ip, now + abuseBanMs);
      return false;
    }
    return true;
  }

  function getConnCount(ip) {
    return ipConnCount.get(ip) || 0;
  }

  function incConn(ip) {
    ipConnCount.set(ip, getConnCount(ip) + 1);
  }

  function decConn(ip) {
    const n = getConnCount(ip) - 1;
    if (n <= 0) ipConnCount.delete(ip);
    else ipConnCount.set(ip, n);
  }

  return {
    isBanned,
    checkAndCountUpgrade,
    getConnCount,
    incConn,
    decConn,
  };
}

module.exports = { createWsGuards };
