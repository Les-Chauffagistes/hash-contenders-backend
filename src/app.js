"use strict";

const express = require("express");
const { healthFactory } = require("./http/health");

function createApp({ env, limits }) {
  const app = express();
  app.get("/health", healthFactory({ env, limits }));
  return app;
}

module.exports = { createApp };
