# Zuddl Access Recovery

A self-service "I lost my login link" flow for magic-link event platforms — built as a concept add-on for [Zuddl](https://www.zuddl.com), a B2B event management platform.

License: MIT

---

## The exact use case

Zuddl (like a lot of modern event platforms) logs attendees in with a magic link instead of a password — you register, you get an email, you click it, you're in. No password to remember.

Here's where it breaks, in a scenario that actually happens:

> It's 9:58 AM. Priya registered for a virtual summit that starts at 10:00. She goes to find her access email and it's not there — maybe it's in spam, maybe she deleted it while cleaning her inbox. She has two minutes before the keynote and no way in.
>
> **Without this feature:** Priya messages the event organizer. The organizer — who is busy running a live event — now has to stop and either dig up her info or escalate to Zuddl support. Priya misses the keynote.
>
> **With this feature:** Priya clicks "Can't find your access link?" on the login screen, enters her email, and gets a brand new working link within seconds. She's in before the keynote starts. Nobody else was involved.

This isn't a hypothetical. It's a documented complaint from a real Zuddl customer who ran a multi-day hackathon and found that attendees who lost their login link had no way back in except organizer-to-Zuddl escalation — sometimes while the event was live.

**Who this is for:**
- **Attendees** — get back in themselves, no waiting on anyone
- **Event organizers** — stop getting pulled into individual login problems mid-event
- **Zuddl's support team** — fewer manual "please fix this one user" tickets during high-traffic live events

**The exact problem this solves:** there is no self-service recovery path when a magic link fails to arrive, expires, or gets lost. This project adds one.

---

## How to use it

The flow is the same whether you're clicking through the pages in a browser or hitting the API directly:

1. **Attendee can't log in** → lands on the login screen, clicks **"Can't find your access link?"**
2. **Enters their email** → submits the recovery form. The response is worded identically whether or not that email is actually registered — this is deliberate, explained below.
3. **Checks their inbox** → gets a fresh one-time link (in this demo, a mock inbox page shows the "email" instead of a real one being sent)
4. **Clicks the link** → signed in immediately, and that link is now dead — using it again fails on purpose
5. **Organizer/support view** → a separate audit page shows every recovery attempt (successful, failed, rate-limited) with a timestamp, so there's a real trail if something needs investigating

That five-step flow is the entire product.

---

## Running it locally

```bash
git clone https://github.com/shashwatraj30/zuddl-access-recovery.git
cd zuddl-access-recovery
npm install
npm start
```

Then open **http://localhost:3000** in your browser. That's the login screen — everything else is linked from there.

---

## How to test it (and confirm it's actually working)

This isn't just "does the page load" — the point of this project is the security behavior underneath it. Here's how to check that it's doing what it claims, step by step, with what you should see at each point.

### A. Walk the happy path
1. Go to `/recover.html`
2. Enter `priya.sharma@example.com` (a seeded mock attendee) → submit
3. **Expect:** a confirmation message, no error
4. Go to `/inbox.html`, select the same email, refresh
5. **Expect:** a message appears with a link containing a long token
6. Click that link
7. **Expect:** you land on `/verify.html` and see "You're in" / a welcome message with the attendee's name

If all of that happens — the core loop works.

### B. Confirm it doesn't leak who's registered (no-enumeration check)
1. Go back to `/recover.html`
2. Submit `priya.sharma@example.com` (registered), note the exact message
3. Submit `nobody@example.com` (not registered), note the exact message
4. **Expect:** both messages are word-for-word identical

If they differ in any way, that's a real security bug — this check is the one that matters most.

### C. Confirm single-use enforcement
1. Take a link you already clicked once from step A
2. Open it again in a new tab
3. **Expect:** it now says the link was already used, and does **not** log you in a second time

### D. Confirm expired/invalid tokens are rejected
1. Go to `/verify.html?token=thisisnotarealtoken` directly in the address bar
2. **Expect:** an "invalid link" message, not a crash and not a login

### E. Confirm rate limiting
1. On `/recover.html`, submit the same email 4 times in quick succession
2. **Expect:** the first 3 succeed with the normal message; the 4th returns a "too many requests, try again in Xs" message instead

If the 4th request still succeeds, rate limiting isn't working.

### F. Confirm the audit trail is accurate
1. After doing A–E above, go to `/audit.html`
2. **Expect:** every single attempt you made shows up — successful requests, the reused-token failure, the invalid-token failure, and the rate-limited attempts — each tagged with its outcome and a timestamp

If any of your actions from A–E are missing here, logging has a gap.

### Fastest way to test all of this without clicking through pages
If you have `curl` available, you can hit the API directly and see the raw responses:

```bash
# Request recovery for a registered email
curl -X POST http://localhost:3000/api/recover \
  -H "Content-Type: application/json" \
  -d '{"email":"priya.sharma@example.com","eventId":"evt_2026_summit"}'

# Request recovery for an UNregistered email — compare this response to the one above
curl -X POST http://localhost:3000/api/recover \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","eventId":"evt_2026_summit"}'

# Check what "email" got sent
curl http://localhost:3000/api/mock-inbox/priya.sharma@example.com

# Verify a token (copy the token value from the inbox response above)
curl "http://localhost:3000/api/verify?token=PASTE_TOKEN_HERE"

# Try the same token again — should now fail
curl "http://localhost:3000/api/verify?token=PASTE_TOKEN_HERE"

# View the audit log
curl http://localhost:3000/api/audit-log
```

If every one of checks A–F above matches what's "expected," the project is fulfilling its intended outcome: attendees can recover access on their own, without a way to abuse the mechanism to spam, enumerate, or replay their way in.

---

## Why this isn't just a form with an email field

The interesting part of this project is the backend, not the UI. A recovery flow like this is a common place for auth systems to quietly introduce security holes, so the implementation specifically handles:

- **No user enumeration.** The response to "recover my access" is worded identically whether or not the email is actually registered for the event. Without this, the endpoint becomes a free tool for scraping a private event's guest list one email at a time.
- **Single-use tokens.** A token is burned the instant it's verified. If someone forwards their link, screenshots it, or an email security scanner "pre-clicks" it, only the first real use counts.
- **Short expiry.** Links are valid for 20 minutes — long enough to check your email, short enough that a leaked link is only a threat briefly.
- **Superseding tokens.** Requesting a new link invalidates any link already in flight. You can never have two valid recovery links floating around for the same person.
- **Rate limiting on two axes.** Limited per email (stops someone spamming one attendee's inbox) *and* per IP (stops someone sweeping through a list of emails to see which ones exist).
- **Hashed storage.** The raw token is never stored — only its SHA-256 hash. If the token table leaked, none of the tokens in it would still work.
- **An audit trail.** Every recovery attempt (requested, rate-limited, verified, failed) is logged with a timestamp and IP, so an organizer or support engineer can actually investigate a specific "I couldn't get in" report after the fact.

---

## Project structure

```
zuddl-access-recovery/
├── server.js              # Express app — routes only, logic lives in src/
├── src/
│   ├── tokenService.js    # Token generation, hashing, expiry, single-use enforcement
│   ├── rateLimiter.js     # Per-email and per-IP sliding-window rate limiting
│   ├── attendeeStore.js   # Mock attendee lookup — the ONE thing a real integration replaces
│   ├── mailer.js          # Mock email "sender" — stores messages in an inspectable inbox
│   └── auditLog.js        # Append-only log of every recovery attempt
└── public/
    ├── index.html         # Simulated login screen (the blocked state)
    ├── recover.html        # The actual recovery form
    ├── inbox.html          # Mock inbox — see the "email" that would've been sent
    ├── verify.html         # Landing page when the link is clicked
    └── audit.html          # Organizer-facing view of recovery activity
```

---

## What would change for a real deployment

This is a working demo against mock data, not a production integration. To actually run inside Zuddl:

- `attendeeStore.js` → replace the mock array with a real call into Zuddl's attendee/registration table
- `mailer.js` → replace the mock inbox with a real transactional email sender (whatever Zuddl already uses to send confirmation emails)
- Token storage → move from an in-memory `Map` to Redis or a database table (the logic doesn't change, only where it's stored)
- Add the organizer audit view as an actual panel in Zuddl's dashboard, rather than a standalone page

None of these are structural changes — the security logic (hashing, single-use, rate limiting, no-enumeration) stays exactly as it is.

---

## Why this exists

This came out of research into real, recurring complaints from Zuddl users on G2 and Capterra — not a hypothetical feature. It's a small, self-contained piece of backend work that demonstrates the kind of thinking that goes into auth-adjacent systems: the interesting bugs here aren't "does the button work," they're "does this endpoint quietly let someone enumerate your attendee list," which is exactly the class of thing that's easy to miss and expensive to ship broken.
