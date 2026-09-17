// Sliding-window rate limiter, keyed independently by email and by IP.
// Two keys matter for two different attacks:
//   - per email: stops someone hammering one attendee's inbox with resend spam
//   - per IP: stops someone sweeping many emails to see which ones are registered
const hits = new Map(); // key -> array of timestamps (ms)

const LIMITS = {
  email: { max: 3, windowMs: 60 * 60 * 1000 }, // 3 requests / hour / email
  ip: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 requests / hour / IP
};

function prune(key, windowMs) {
  const now = Date.now();
  const existing = hits.get(key) || [];
  const kept = existing.filter((ts) => now - ts < windowMs);
  hits.set(key, kept);
  return kept;
}

function check(kind, key) {
  const { max, windowMs } = LIMITS[kind];
  const recent = prune(`${kind}:${key}`, windowMs);

  if (recent.length >= max) {
    const oldestInWindow = recent[0];
    const retryAfterMs = windowMs - (Date.now() - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true };
}

function record(kind, key) {
  const mapKey = `${kind}:${key}`;
  const existing = hits.get(mapKey) || [];
  existing.push(Date.now());
  hits.set(mapKey, existing);
}

// Combined check used by the /recover route. Both limits must pass.
function checkAndRecord(email, ip) {
  const emailCheck = check('email', email);
  if (!emailCheck.allowed) {
    return { allowed: false, reason: 'email', ...emailCheck };
  }
  const ipCheck = check('ip', ip);
  if (!ipCheck.allowed) {
    return { allowed: false, reason: 'ip', ...ipCheck };
  }

  record('email', email);
  record('ip', ip);
  return { allowed: true };
}

module.exports = { checkAndRecord, LIMITS };
