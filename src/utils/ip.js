"use strict";

function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    if (xff) return xff.split(",")[0].trim();
  }
  return (req.socket?.remoteAddress || "").toString();
}

module.exports = { getClientIp };
