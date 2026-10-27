const express = require('express');
const crypto = require('crypto');
const { verifyGithubCelebrationToken } = require('../services/celebrationGithubOidc');
const { createZermattCelebrationScheduler } = require('../services/zermattCelebrationScheduler');

function authorized(req, env = process.env) {
  const expected = String(env.CHRIS_CELEBRATION_CRON_TOKEN || '');
  const supplied = String(req.get('authorization') || '').replace(/^Bearer /, '');
  if (expected.length < 32 || !supplied) return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(expected), digest(supplied));
}
function createRouter({ prisma, scheduler = createZermattCelebrationScheduler({ prisma }) } = {}) {
const router = express.Router();
router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!authorized(req) && !(await verifyGithubCelebrationToken(String(req.get('authorization') || '').replace(/^Bearer /, '')))) return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED' });
  return next();
});
router.get('/status', (_req, res) => res.json({ status: 'success', data: scheduler.readiness() }));
router.post('/dispatch', async (req, res) => {
  // The caller cannot pick a tenant, recipient or date. Only today's Zermatt events.
  if (Object.keys(req.body || {}).length) return res.status(400).json({ status: 'error', code: 'BODY_NOT_ALLOWED' });
  try {
    const data = await scheduler.run();
    const ready = scheduler.readiness();
    const pending = Object.keys(data.channels || {}).some(key => /:(FAILED|PROCESSING|PENDING_CONFIGURATION)$/.test(key));
    const healthy = ready.enabled && ready.emailConfigured && ready.smsConfigured && !pending && !['ZERMATT_NOT_ACTIVE', 'AUTOMATION_DISABLED'].includes(data.skipped);
    return res.status(healthy ? 200 : 503).json({ status: healthy ? 'success' : 'incomplete', data, readiness: ready });
  } catch {
    return res.status(503).json({ status: 'error', code: 'CELEBRATION_RUN_FAILED' });
  }
});
return router;
}
module.exports = { createRouter, authorized };
