# Integration Guide — For the Zuddl Engineering Team

This document describes how the **Self-Serve Access Recovery** module would attach to Zuddl's production platform. It assumes the reader is on Zuddl's team and has access to Zuddl's actual attendee database, auth service, and email infrastructure — none of which this repository has visibility into. Everything below describes the integration *shape*, not a drop-in patch.

---

## 1. What this module is, in one line

A self-service recovery flow for attendees who lose, never receive, or let expire their magic-link login email — so they can get back in without contacting an organizer or Zuddl support.

## 2. Where it fits in Zuddl's architecture

This does **not** replace or modify Zuddl's existing magic-link issuance (the flow that sends the *original* login email at registration time). It sits alongside it, activated only when that original link has already failed the attendee.

Two integration shapes are realistic, in order of preference:

### Option A — Merged into the existing auth service (recommended)
The recovery endpoints become two new routes inside whatever service already issues and verifies Zuddl's magic links:

```
POST /auth/recover      (new)
GET  /auth/verify        (likely already exists — reuse it)
```

This is preferable because token verification logic should live in exactly one place. If Zuddl's existing `verify` endpoint already does hashing/expiry/single-use checks for the original link, the recovery flow's tokens can be verified through that same code path — recovery just becomes a second way to *obtain* a valid token, not a second way to *check* one.

### Option B — Standalone sidecar service
If the existing auth service is not easily extended (legacy code, ownership across teams, etc.), this can run as an independent internal service that the main app calls into for recovery only. Easier to review and deploy in isolation; slightly more integration surface (one more internal API contract to maintain).

## 3. The three integration points

Everything else in this codebase is infrastructure-agnostic. Only these three pieces touch Zuddl-specific systems:

| Module in this repo | What it does today | What Zuddl replaces it with |
|---|---|---|
| `src/attendeeStore.js` | Real queries against a Supabase Postgres table (`attendees`) that this project owns and seeds via its own `/signup.html` page | The same query shapes (`findAttendee(email, eventId)`, `listAttendees(eventId)`), pointed at Zuddl's *existing* attendee/registration table instead. This is almost certainly already an existing internal function on Zuddl's side — reuse it, don't rebuild it. Zuddl would not need this project's `signup.html` at all, since attendees already exist from Zuddl's normal registration flow. |
| `src/mailer.js` | Writes to an in-memory mock inbox | Zuddl's existing transactional email sender (whatever currently sends registration confirmations and the original magic link). New template needed; sending mechanism should already exist. |
| Token storage (currently a `Map` in `tokenService.js`) | In-memory, lost on restart, single-instance only | Redis is the natural fit — TTL support maps directly onto token expiry, and it survives service restarts and works across multiple app instances. A relational table works too if Redis isn't already in the stack. |
| `public/admin.html`'s shared `ADMIN_KEY` | A single secret string checked against a request header — fine for a demo, not for production | Zuddl's real organizer/admin authentication and role system; this view becomes a panel inside their existing dashboard rather than a standalone page with its own auth |

No other file needs to change. The hashing, single-use enforcement, rate limiting, and no-enumeration response logic are storage- and platform-agnostic by design.

## 4. Required data access

The only thing this module needs from Zuddl's existing systems is a single lookup:

```
findAttendee(email: string, eventId: string) → { id, email, name } | null
```

It does not need write access to the attendee table, does not need access to any other attendee fields (no PII beyond email/name/id), and does not need to know anything about the event itself beyond its ID.

## 5. What must happen before this touches real attendee accounts

This repository is a working proof of concept against mock data — it demonstrates the *logic* is correct, not that it's production-hardened. Before integration:

- [ ] **Security review** of token entropy, hashing implementation, and rate-limit thresholds by whoever owns Zuddl's auth security posture
- [ ] **Session handoff design** — `verify` here returns "this token is valid, here's the attendee," but it needs to plug into however Zuddl's existing magic-link flow actually establishes a logged-in session (cookie, JWT, server-side session record, etc.) — that mechanism should be reused, not duplicated
- [ ] **Rate-limit tuning against real traffic** — the demo's limits (3 requests/hour/email, 10/hour/IP) are reasonable defaults but should be checked against real event-day login spikes (e.g., thousands of attendees logging in within a 10-minute pre-keynote window) to make sure legitimate users at a large conference don't get caught by IP-based limits if many attendees are on the same corporate NAT/VPN egress IP
- [ ] **Load test** the token store choice (Redis/DB) under concurrent write load
- [ ] **Feature-flagged rollout** — enable for one event or one customer first, not globally, per Zuddl's usual release process

## 6. What does NOT need to change

To be explicit about scope: this integration touches **zero** of Zuddl's event creation, registration, ticketing, backstage, speaker/exhibitor portal, or analytics systems. It is purely an addition to the login/auth surface, activated only when an attendee explicitly asks for a new link.

## 7. Suggested first conversation

Before any code integration, the fastest way to validate this is worth doing:
1. Confirm the current volume of "attendee couldn't log in" support tickets/escalations — this project was motivated by public reviews describing exactly this pattern, but Zuddl's own support data would confirm the real scale
2. Confirm whether `findAttendee`-equivalent already exists internally (it almost certainly does, in some form)
3. Decide Option A vs. Option B above based on who owns the current auth service

---

*This document, and the rest of this repository, is an independently built proof of concept motivated by publicly available user reviews (G2, Capterra) describing this exact gap. It is not affiliated with or endorsed by Zuddl.*
