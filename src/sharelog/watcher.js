"use strict";

const fs = require("fs");
const path = require("path");

function isHexRoundName(name) {
  return /^[0-9a-f]{8}$/i.test(name);
}

class ShareLogWatcher {
  constructor(rootDir, { trackLastRounds, maxLinesPerTick, maxHistoryFiles }) {
    this.rootDir = rootDir;
    this.trackLastRounds = trackLastRounds;
    this.maxLinesPerTick = maxLinesPerTick;
    this.maxHistoryFiles = maxHistoryFiles;

    this.fileState = new Map(); // filePath -> { offset, ino, carry }
    this.trackedRounds = [];
    this.lastRoundsKey = "";
  }

  listRoundsSorted() {
    let items;
    try {
      items = fs.readdirSync(this.rootDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return items
      .filter((d) => d.isDirectory() && isHexRoundName(d.name))
      .map((d) => d.name)
      .sort();
  }

  computeTrackedRounds() {
    const rounds = this.listRoundsSorted();
    if (rounds.length === 0) return [];
    const startIdx = Math.max(0, rounds.length - this.trackLastRounds);
    return rounds.slice(startIdx);
  }

  listSharelogsForRound(roundName) {
    const dir = path.join(this.rootDir, roundName);
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return items
      .filter((d) => d.isFile() && d.name.endsWith(".sharelog"))
      .map((d) => path.join(dir, d.name))
      .sort();
  }

  readNewLines(filePath) {
    let st;
    try {
      st = fs.statSync(filePath);
    } catch {
      this.fileState.delete(filePath);
      return [];
    }

    const ino = st.ino;
    const size = st.size;

    let state = this.fileState.get(filePath);
    if (!state) {
      const nowMs = Date.now();
      const ageMs = nowMs - st.mtimeMs;

      // si fichier très récent -> lire depuis 0
      const startFrom = ageMs <= 5000 ? 0 : size;

      state = { offset: startFrom, ino, carry: "" };
      this.fileState.set(filePath, state);

      // startFrom=0 => lecture prochain tick
      return [];
    }

    if (state.ino !== ino || size < state.offset) {
      state.offset = 0;
      state.ino = ino;
      state.carry = "";
    }

    if (size === state.offset) return [];

    const fd = fs.openSync(filePath, "r");
    try {
      const toRead = size - state.offset;
      const buf = Buffer.allocUnsafe(toRead);
      fs.readSync(fd, buf, 0, toRead, state.offset);
      state.offset = size;

      const chunk = state.carry + buf.toString("utf8");
      const parts = chunk.split("\n");
      state.carry = parts.pop() ?? "";
      return parts;
    } finally {
      fs.closeSync(fd);
    }
  }

  tick(onLine) {
    const rounds = this.computeTrackedRounds();
    const key = rounds.join(",");
    if (key !== this.lastRoundsKey) {
      this.trackedRounds = rounds;
      this.lastRoundsKey = key;
    }

    let emitted = 0;
    for (const r of this.trackedRounds) {
      const files = this.listSharelogsForRound(r);
      for (const f of files) {
        const lines = this.readNewLines(f);
        for (const line of lines) {
          onLine(line, f, r);
          emitted++;
          if (emitted >= this.maxLinesPerTick) return;
        }
      }
    }
  }

  // For history: find recent sharelog files by mtime
  findRecentSharelogFiles(sinceEpochSec) {
    const rounds = this.listRoundsSorted();
    if (rounds.length === 0) return [];

    const startIdx = Math.max(
      0,
      rounds.length - Math.max(this.trackLastRounds, 15),
    );
    const scanRounds = rounds.slice(startIdx);

    const candidates = [];
    for (const r of scanRounds) {
      const files = this.listSharelogsForRound(r);
      for (const f of files) {
        try {
          const st = fs.statSync(f);
          if (st.mtimeMs / 1000 >= sinceEpochSec) {
            candidates.push({ f, mtimeMs: st.mtimeMs });
          }
        } catch {}
      }
    }

    candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
    return candidates.slice(-this.maxHistoryFiles).map((x) => x.f);
  }
}

module.exports = { ShareLogWatcher };
