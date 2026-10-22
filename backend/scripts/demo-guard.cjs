module.exports = function guard() {
  if (process.env.CHRIS_CLIENT_DEMO !== 'true') throw new Error('Client demo mode must be explicitly enabled');
  const db = new URL(process.env.DATABASE_URL || '');
  if (db.hostname !== '127.0.0.1' || db.pathname !== '/chris_client_demo') throw new Error('Demo refuses every external or non-demo database');
  for (const key of Object.keys(process.env)) {
    if (/^(PAYSTACK_|SMTP_|COMMERCIAL_EMAIL_|SUPPORT_.*WEBHOOK|OPENAI_API_KEY|R2_|AWS_)/.test(key) && process.env[key]) throw new Error('External integration configuration is forbidden in the demo: '+key);
  }
};
