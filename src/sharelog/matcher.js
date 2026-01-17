"use strict";

function shareMatches(share, sub) {
  if (!share || !share.address) return false;
  if (share.address !== sub.addressLower) return false;

  if (sub.workerLower) {
    if (!share.worker) return false;
    if (share.worker !== sub.workerLower) return false;
  }
  return true;
}

module.exports = { shareMatches };
