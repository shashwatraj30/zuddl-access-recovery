require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    '\nMissing SUPABASE_URL or SUPABASE_SERVICE_KEY.\n' +
    'Copy .env.example to .env and fill in your Supabase project credentials ' +
    '(see SUPABASE_SETUP.md).\n'
  );
  process.exit(1);
}

// The SERVICE key is used deliberately, and only ever from this backend
// process - never sent to the browser. It bypasses Row Level Security,
// which is fine here because every query it makes is already gated by
// this server's own logic (rate limiting, the recover/verify flow, the
// admin key check). If this table were ever queried directly from
// client-side code, that would need the anon key + real RLS policies
// instead - see the note in schema.sql.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

module.exports = supabase;
