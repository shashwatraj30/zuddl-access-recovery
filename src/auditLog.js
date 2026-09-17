// A simple append-only log of every recovery attempt. Real deployments would
// write this to a proper store, but the shape - who, when, from where, what
// happened - is what an organizer or support engineer actually needs when
// investigating "an attendee says they can't get in."

const entries = [];

function log({ email, eventId, ip, outcome }) {
  entries.push({
    email,
    eventId,
    ip,
    outcome, // 'requested' | 'rate_limited' | 'verified' | 'verify_failed'
    timestamp: new Date().toISOString(),
  });
}

function getAll() {
  return [...entries].reverse(); // most recent first
}

module.exports = { log, getAll };
