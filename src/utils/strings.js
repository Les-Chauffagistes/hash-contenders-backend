"use strict";

function safeLower(s) {
  return (s || "").toString().trim().toLowerCase();
}

module.exports = { safeLower };
