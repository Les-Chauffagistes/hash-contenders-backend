"use strict";

require("dotenv").config();

module.exports = {
  LOGS_DIR: process.env.ROUNDS_DIR || "/data/ckpool/logs",

  PORT: Number(process.env.PORT || 3005),
  HOST: process.env.HOST || "127.0.0.1",

  WS_TOKEN: process.env.WS_TOKEN || "",

  // proxy
  TRUST_PROXY: (process.env.TRUST_PROXY || "1") === "1",
};
