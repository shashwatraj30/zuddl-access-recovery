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

// The one endpoint an attendee hits when they've lost their access link.
app.post('/api/recover', (req, res) => {
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

  const attendee = attendeeStore.findAttendee(email, eventId);

  // CRITICAL: identical response whether or not the attendee exists.
  // If we said "email not found" here, this endpoint would let anyone
  // check the full attendee list of a private event one email at a time.
  const genericResponse = {
    message:
      "If that email is registered for this event, a new access link is on its way.",
  };

  if (!attendee) {
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
app.get('/api/verify', (req, res) => {
  const { token } = req.query;
  const ip = getClientIp(req);

  if (!token) {
    return res.status(400).json({ result: 'invalid' });
  }

  const outcome = tokenService.verifyToken(token);

  if (outcome.result === tokenService.VERIFY_RESULT.OK) {
    const attendee = attendeeStore
      .listAttendees()
      .find((a) => a.id === outcome.attendeeId);
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

// Demo-only: lists the seeded mock attendees so the UI can suggest one.
app.get('/api/mock-attendees', (req, res) => {
  res.json({ attendees: attendeeStore.listAttendees() });
});

app.listen(PORT, () => {
  console.log(`Zuddl Access Recovery demo running at http://localhost:${PORT}`);
});
