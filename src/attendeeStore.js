// This file used to hold a hardcoded array of mock attendees. It now talks
// to a real Supabase Postgres table - this is the ONE integration point
// a real Zuddl deployment would swap for their own attendee/registration
// table (see ZUDDL_INTEGRATION.md). Every other file in this project is
// unaffected by this change.

const supabase = require('./supabaseClient');

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

// Used by the recovery flow: returns null if no such attendee exists.
// This is the function that makes "unregistered emails get no real link"
// actually true, instead of just a hardcoded demo behavior.
async function findAttendee(email, eventId) {
  const { data, error } = await supabase
    .from('attendees')
    .select('id, email, name, event_id')
    .eq('email', normalizeEmail(email))
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    console.error('[attendeeStore] findAttendee error:', error.message);
    return null;
  }
  if (!data) return null;
  return { id: data.id, email: data.email, name: data.name, eventId: data.event_id };
}

// Used by the verify route to resolve a token's attendeeId back to a person.
async function findAttendeeById(id) {
  const { data, error } = await supabase
    .from('attendees')
    .select('id, email, name, event_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, email: data.email, name: data.name, eventId: data.event_id };
}

// Used by the signup page. Returns { attendee } on success or
// { error: 'already_registered' | 'unknown' } on failure.
async function registerAttendee(email, name, eventId) {
  const { data, error } = await supabase
    .from('attendees')
    .insert([{ email: normalizeEmail(email), name: name.trim(), event_id: eventId }])
    .select()
    .single();

  if (error) {
    // Postgres unique_violation - this email is already registered for this event.
    if (error.code === '23505') {
      return { error: 'already_registered' };
    }
    console.error('[attendeeStore] registerAttendee error:', error.message);
    return { error: 'unknown' };
  }

  return {
    attendee: { id: data.id, email: data.email, name: data.name, eventId: data.event_id },
  };
}

// Used by the admin view. Optionally filtered to one event.
async function listAttendees(eventId) {
  let query = supabase
    .from('attendees')
    .select('id, email, name, event_id, created_at')
    .order('created_at', { ascending: false });

  if (eventId) {
    query = query.eq('event_id', eventId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[attendeeStore] listAttendees error:', error.message);
    return [];
  }
  return data;
}

module.exports = { findAttendee, findAttendeeById, registerAttendee, listAttendees };
