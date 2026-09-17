# Supabase Setup

This project now stores registered attendees in a real Supabase (Postgres) database instead of a hardcoded array. Follow these steps once to get it running.

## 1. Create a free Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign up (GitHub sign-in is fastest)
2. Click **New Project**
3. Pick any name (e.g. `zuddl-access-recovery`), set a database password (save it somewhere, though you won't need it for this project), pick the region closest to you
4. Wait ~2 minutes for the project to finish provisioning

## 2. Create the attendees table

1. In your new project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open `schema.sql` from this repo, copy its entire contents, paste into the editor
4. Click **Run**
5. You should see "Success. No rows returned" — that means the table was created

You can confirm it worked by clicking **Table Editor** in the sidebar — you should see an `attendees` table with columns `id`, `email`, `name`, `event_id`, `created_at`.

## 3. Get your API credentials

1. Click **Settings** (gear icon) in the sidebar → **API**
2. You'll see two values you need:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **service_role key** (under "Project API keys") — a long string starting with `eyJ...`

**Important:** use the **service_role** key, not the **anon/public** key. The service role key is meant to stay server-side only (never sent to a browser) — that's exactly how this project uses it, in `src/supabaseClient.js`, which only ever runs on the backend.

## 4. Fill in your `.env` file

1. In this project's root folder, copy `.env.example` to a new file named `.env`
2. Fill in the three values:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your-actual-key...
ADMIN_KEY=pick-any-secret-string-yourself
```

`ADMIN_KEY` isn't from Supabase — it's a password you make up yourself, used to gate the `/admin.html` page.

## 5. Install and run

```bash
npm install
npm start
```

If the `.env` file is missing or has the wrong values, the server will print a clear error on startup telling you what's missing, instead of failing silently later.

## 6. Verify it's actually using the real database

1. Go to `http://localhost:3000/signup.html` and register with your own name + email
2. Go back to Supabase's **Table Editor** → `attendees` table → you should see your new row appear there
3. Now go to `/recover.html`, use that same email → you should get the normal "link is on its way" message
4. Try `/recover.html` with an email you never registered → same message shown, but check `/inbox.html` for that email — it'll be empty, because no token was ever issued for an email that isn't in the table
5. Go to `/admin.html`, enter the `ADMIN_KEY` you set in `.env`, click "View registered attendees" — you should see everyone who's signed up, pulled live from Supabase

That last step is the real proof this is backed by an actual database and not mock data: register a new person, refresh the admin view, and they appear immediately.
