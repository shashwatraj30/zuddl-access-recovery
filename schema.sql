-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste this -> Run)

create extension if not exists pgcrypto;

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  event_id text not null,
  created_at timestamptz not null default now(),

  -- The same email can register for different events, but not
  -- twice for the same event. This is also what makes the
  -- "already_registered" check in attendeeStore.js work.
  unique (email, event_id)
);

-- Row Level Security is intentionally left OFF here. Every query this
-- project makes against this table goes through the backend using the
-- Supabase SERVICE ROLE key (see src/supabaseClient.js), which bypasses
-- RLS by design - access control happens in server.js instead (rate
-- limiting, the admin key check, the recover/verify logic).
--
-- If you ever query this table directly from client-side code using
-- Supabase's anon key, enable RLS and write explicit policies first:
--   alter table attendees enable row level security;
-- Do not skip that step if you make that change - without it, the anon
-- key would be able to read every attendee's email directly from the
-- browser.
alter table attendees disable row level security;
