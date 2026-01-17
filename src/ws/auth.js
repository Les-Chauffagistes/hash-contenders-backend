"use strict";

function checkBearer(req, expectedToken) {
  if (!expectedToken) return { ok: false, status: "500 Server Misconfigured" };

  const auth = (req.headers["authorization"] || "").toString();
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token || token !== expectedToken) {
    return { ok: false, status: "401 Unauthorized" };
  }
  return { ok: true };
}

module.exports = { checkBearer };
