// Real email sending is deliberately out of scope for this demo - swapping
// this file for a real transactional email client (SES, Postmark, Zuddl's
// existing sender, etc.) is the only change needed to go live. Everything
// above this file doesn't know or care how the email actually gets sent.

// inbox: email -> array of { subject, link, sentAt }
const inbox = new Map();

function sendRecoveryEmail(email, link) {
  const message = {
    subject: 'Your Zuddl access link',
    link,
    sentAt: new Date().toISOString(),
  };
  const existing = inbox.get(email) || [];
  existing.push(message);
  inbox.set(email, existing);

  // eslint-disable-next-line no-console
  console.log(`[mock email] -> ${email}: ${link}`);
  return message;
}

function getInbox(email) {
  return inbox.get(email) || [];
}

module.exports = { sendRecoveryEmail, getInbox };
