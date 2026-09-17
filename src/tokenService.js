const crypto = require('crypto');

// In-memory token store: hash -> { attendeeId, eventId, expiresAt, usedAt, createdAt }
// In production this would be a table (Redis or SQL), but the logic below is
// storage-agnostic - swap the Map for a real client and nothing else changes.
const tokens = new Map();

const TOKEN_BYTES = 32; // 256 bits of entropy - not brute-forceable
const TOKEN_TTL_MS = 20 * 60 * 1000; // 20 minute expiry window

function hashToken(rawToken) {
  // We only ever store the hash. If the token table leaked, the raw
  // tokens (the only thing that grants access) would not be recoverable.
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function invalidateExisting(attendeeId, eventId) {
  // A new recovery request supersedes any link already in flight.
  // Without this, an attendee could accumulate multiple valid links,
  // and an old, possibly-leaked link would stay usable indefinitely.
  for (const [hash, record] of tokens.entries()) {
    if (
      record.attendeeId === attendeeId &&
      record.eventId === eventId &&
      !record.usedAt
    ) {
      tokens.delete(hash);
    }
  }
}

function issueToken(attendeeId, eventId) {
  invalidateExisting(attendeeId, eventId);

  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const hash = hashToken(rawToken);
  const now = Date.now();

  tokens.set(hash, {
    attendeeId,
    eventId,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    usedAt: null,
  });

  return rawToken; // only returned once, to be embedded in the email link
}

const VERIFY_RESULT = {
  OK: 'ok',
  INVALID: 'invalid',
  EXPIRED: 'expired',
  ALREADY_USED: 'already_used',
};

function verifyToken(rawToken) {
  const hash = hashToken(rawToken);
  const record = tokens.get(hash);

  if (!record) {
    return { result: VERIFY_RESULT.INVALID };
  }
  if (record.usedAt) {
    return { result: VERIFY_RESULT.ALREADY_USED };
  }
  if (Date.now() > record.expiresAt) {
    return { result: VERIFY_RESULT.EXPIRED };
  }

  // Single-use: mark it burned the instant it's verified, so a replayed
  // request (e.g. an email scanner pre-fetching the link) can't reuse it.
  record.usedAt = Date.now();

  return {
    result: VERIFY_RESULT.OK,
    attendeeId: record.attendeeId,
    eventId: record.eventId,
  };
}

function _debugAllTokens() {
  // Exposed only for the demo's audit view - not something a real
  // deployment would expose over the network.
  return Array.from(tokens.entries()).map(([hash, r]) => ({
    hash: hash.slice(0, 12) + '...',
    ...r,
  }));
}

module.exports = {
  issueToken,
  verifyToken,
  VERIFY_RESULT,
  TOKEN_TTL_MS,
  _debugAllTokens,
};
