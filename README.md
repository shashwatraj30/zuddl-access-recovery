# Zuddl Access Recovery

A self-service "I lost my login link" flow for magic-link event platforms — built as a concept add-on for [Zuddl](https://www.zuddl.com), a B2B event management platform.

**Live demo:** _add your deployed link here once hosted (see Deployment section below)_

License: MIT

## The problem

Zuddl (like a lot of modern event platforms) logs attendees in with a magic link instead of a password — you get an email, you click it, you're in. It's simple, until the email doesn't show up. Maybe it's stuck in spam, maybe it expired, maybe the attendee just closed the tab and can't find it again.

When that happens today, the attendee is stuck. They can't fix it themselves — they have to message the event organizer, who then has to escalate to Zuddl's own support team to sort it out. That's not a hypothetical: it's a documented complaint from a real Zuddl customer, who ran a multi-day hackathon and found that attendees who lost their login link had no way back in except organizer-to-Zuddl escalation, sometimes while the event was live.

That's the gap this project fixes: **a way for attendees to recover their own access, with no one else involved.**

## What it does

One new flow, three screens:

1. **Attendee can't log in** → clicks "Can't find your access link?"
2. **Enters their email** → gets back a message that looks identical whether or not that email is registered (more on why below)
3. **Gets a fresh one-time link** → clicking it logs them in, and the old link (if one existed) stops working immediately

Nothing about Zuddl's actual event, registration, or backstage systems needs to change. This slots in beside the existing login flow and needs exactly one thing from the host platform: a way to look up "does this email belong to an attendee of this event." Everything else — token generation, expiry, rate limiting, logging — is self-contained.

## Why this isn't just a form with an email field

The interesting part of this project is the backend, not the UI. A recovery flow like this is a common place for auth systems to quietly introduce security holes, so the implementation specifically handles:

- **No user enumeration.** The response to "recover my access" is worded identically whether or not the email is actually registered for the event. Without this, the endpoint becomes a free tool for scraping a private event's guest list one email at a time.
- **Single-use tokens.** A token is burned the instant it's verified. If someone forwards their link, screenshots it, or an email security scanner "pre-clicks" it, only the first real use counts.
- **Short expiry.** Links are valid for 20 minutes — long enough to check your email, short enough that a leaked link is only a threat briefly.
- **Superseding tokens.** Requesting a new link invalidates any link already in flight. You can never have two valid recovery links floating around for the same person.
- **Rate limiting on two axes.** Limited per email (stops someone spamming one attendee's inbox) *and* per IP (stops someone sweeping through a list of emails to see which ones exist).
- **Hashed storage.** The raw token is never stored — only its SHA-256 hash. If the token table leaked, none of the tokens in it would still work.
- **An audit trail.** Every recovery attempt (requested, rate-limited, verified, failed) is logged with a timestamp and IP, so an organizer or support engineer can actually investigate a specific "I couldn't get in" report after the fact.

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

## Running it locally

```bash
git clone <this-repo>
cd zuddl-access-recovery
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

### Try the full flow

1. Go to `/recover.html`
2. Use one of the seeded mock attendees — try `priya.sharma@example.com` (registered) or `nobody@example.com` (not registered), and notice the response is worded exactly the same either way
3. Go to `/inbox.html` and refresh — you'll see the "email" that got sent, with a real working link
4. Click the link (or copy it into a new tab) — you'll land on `/verify.html` and get signed in
5. Try opening the *same* link again — it'll tell you it's already been used
6. Go to `/recover.html` and submit the same email 4 times quickly — the 4th request gets rate-limited
7. Check `/audit.html` to see every attempt logged, including the rate-limited ones

## What would change for a real deployment

This is a working demo against mock data, not a production integration. To actually run inside Zuddl:

- `attendeeStore.js` → replace the mock array with a real call into Zuddl's attendee/registration table
- `mailer.js` → replace the mock inbox with a real transactional email sender (whatever Zuddl already uses to send confirmation emails)
- Token storage → move from an in-memory `Map` to Redis or a database table (the logic doesn't change, only where it's stored)
- Add the organizer audit view as an actual panel in Zuddl's dashboard, rather than a standalone page

None of these are structural changes — the security logic (hashing, single-use, rate limiting, no-enumeration) stays exactly as it is.

## Deployment

This runs as a plain Node/Express app, so any free-tier host that deploys from a GitHub repo works — no special config needed:

- **Render** — connect the repo, set the start command to `npm start`, leave everything else default
- **Railway** — same idea, auto-detects Node from `package.json`

Once deployed, drop the live URL at the top of this README so it's the first thing a viewer sees.

## Why this exists

This came out of research into real, recurring complaints from Zuddl users on G2 and Capterra — not a hypothetical feature. It's a small, self-contained piece of backend work that demonstrates the kind of thinking that goes into auth-adjacent systems: the interesting bugs here aren't "does the button work," they're "does this endpoint quietly let someone enumerate your attendee list," which is exactly the class of thing that's easy to miss and expensive to ship broken.
