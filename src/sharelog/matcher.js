"use strict";

function shareMatches(share, sub) {
  if (!share) return false;

  // Filtre address uniquement si défini
  if (sub.addressLower) {
    if (!share.address) return false;
    if (share.address !== sub.addressLower) return false;
  }

  // Filtre worker uniquement si défini
  if (sub.workerLower) {
    if (!share.worker) return false;
    if (share.worker !== sub.workerLower) return false;
  }

  return true;
}

module.exports = { shareMatches };