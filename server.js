const express = require('express');
const path = require('path');

const tokenService = require('./src/tokenService');
const rateLimiter = require('./src/rateLimiter');
const attendeeStore = require('./src/attendeeStore');
const auditLog = require('./src/auditLog');
const mailer = require('./src/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getClientIp(req) {
  // Trusts x-forwarded-for in this demo; a real deployment behind a load
  // balancer would validate this against a trusted proxy list.
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

// ---------------------------------------------------------------------
// Signup - registers an attendee in the real Supabase "attendees" table.
// This is the ONLY way an email becomes eligible to receive a recovery
// link. Nothing else in this app can create an attendee record.
// ---------------------------------------------------------------------
app.post('/api/signup', async (req, res) => {
  const { email, name, eventId } = req.body || {};

  if (!email || !name || !eventId) {
    return res.status(400).json({ error: 'name, email, and eventId are required' });
  }

  const result = await attendeeStore.registerAttendee(email, name, eventId);

  if (result.error === 'already_registered') {
    return res.status(409).json({
      error: 'This email is already registered for this event. Try signing in instead.',
    });
  }
  if (result.error) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  return res.json({
    message: 'You\'re registered! Use this email on the login or recovery page to get in.',
    attendee: result.attendee,
  });
});

// ---------------------------------------------------------------------
// Recovery - the endpoint an attendee hits when they've lost their link.
// ---------------------------------------------------------------------
app.post('/api/recover', async (req, res) => {
  const { email, eventId } = req.body || {};
  const ip = getClientIp(req);

  if (!email || !eventId) {
    return res.status(400).json({ error: 'email and eventId are required' });
  }

  const rate = rateLimiter.checkAndRecord(email, ip);
  if (!rate.allowed) {
    auditLog.log({ email, eventId, ip, outcome: 'rate_limited' });
    return res.status(429).json({
      // Deliberately vague-but-honest: rate limiting is fine to disclose,
      // unlike whether the email itself is registered.
      message: 'Too many requests. Please wait before trying again.',
      retryAfterMs: rate.retryAfterMs,
    });
  }

  const attendee = await attendeeStore.findAttendee(email, eventId);

  // CRITICAL: identical response whether or not the attendee exists.
  // If we said "email not found" here, this endpoint would let anyone
  // check the full attendee list of a private event one email at a time.
  const genericResponse = {
    message:
      "If that email is registered for this event, a new access link is on its way.",
  };

  if (!attendee) {
    // Real behavior, not just a worded response: no token is generated,
    // no email is sent, and the mock inbox for this address stays empty.
    auditLog.log({ email, eventId, ip, outcome: 'requested_unknown_email' });
    return res.json(genericResponse);
  }

  const rawToken = tokenService.issueToken(attendee.id, eventId);
  const link = `${req.protocol}://${req.get('host')}/verify.html?token=${rawToken}`;
  mailer.sendRecoveryEmail(email, link);
  auditLog.log({ email, eventId, ip, outcome: 'requested' });

  return res.json(genericResponse);
});

// Hit when the attendee clicks the link in their (mock) email.
app.get('/api/verify', async (req, res) => {
  const { token } = req.query;
  const ip = getClientIp(req);

  if (!token) {
    return res.status(400).json({ result: 'invalid' });
  }

  const outcome = tokenService.verifyToken(token);

  if (outcome.result === tokenService.VERIFY_RESULT.OK) {
    const attendee = await attendeeStore.findAttendeeById(outcome.attendeeId);
    auditLog.log({
      email: attendee?.email || 'unknown',
      eventId: outcome.eventId,
      ip,
      outcome: 'verified',
    });
    return res.json({
      result: 'ok',
      attendee: { id: attendee.id, name: attendee.name, email: attendee.email },
      eventId: outcome.eventId,
    });
  }

  auditLog.log({ email: 'unknown', eventId: null, ip, outcome: `verify_failed:${outcome.result}` });
  return res.status(400).json({ result: outcome.result });
});

// Demo-only: lets the frontend show a "mock inbox" instead of sending real email.
app.get('/api/mock-inbox/:email', (req, res) => {
  res.json({ messages: mailer.getInbox(req.params.email) });
});

// Demo-only: organizer/support-facing audit trail.
app.get('/api/audit-log', (req, res) => {
  res.json({ entries: auditLog.getAll() });
});

// ---------------------------------------------------------------------
// Admin - lists every registered attendee. Gated by a shared secret key
// (ADMIN_KEY in .env) rather than real user accounts, since building a
// full admin auth system is out of scope for this demo. In production
// this would sit behind Zuddl's existing organizer/admin authentication,
// not a bare shared key.
// ---------------------------------------------------------------------
app.get('/api/admin/attendees', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }

  const attendees = await attendeeStore.listAttendees(req.query.eventId);
  return res.json({ attendees });
});

app.listen(PORT, () => {
  console.log(`Zuddl Access Recovery demo running at http://localhost:${PORT}`);
});
