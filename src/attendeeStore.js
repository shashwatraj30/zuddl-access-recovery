// This file stands in for the ONE real integration point this module needs:
// a way to look up an attendee by email + event. In a real Zuddl deployment,
// `findAttendee` below would be replaced with a call into their existing
// attendee/registration table - nothing else in this project needs to change.

const MOCK_ATTENDEES = [
  { id: 'att_001', email: 'priya.sharma@example.com', eventId: 'evt_2026_summit', name: 'Priya Sharma' },
  { id: 'att_002', email: 'raj.mehta@example.com', eventId: 'evt_2026_summit', name: 'Raj Mehta' },
  { id: 'att_003', email: 'lena.wu@example.com', eventId: 'evt_2026_summit', name: 'Lena Wu' },
];

function findAttendee(email, eventId) {
  const normalized = email.trim().toLowerCase();
  return (
    MOCK_ATTENDEES.find(
      (a) => a.email.toLowerCase() === normalized && a.eventId === eventId
    ) || null
  );
}

function listAttendees() {
  return MOCK_ATTENDEES;
}

module.exports = { findAttendee, listAttendees };
