const crypto = require('crypto');
const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'chris-zermatt-celebrations';
const WORKFLOW = 'CorporateHrNetwork/chris/.github/workflows/zermatt-celebrations.yml@refs/heads/main';
let cachedKeys = null;
let cachedAt = 0;
async function githubKeys(fetchImpl = fetch) {
  if (cachedKeys && Date.now() - cachedAt < 60 * 60 * 1000) return cachedKeys;
  const response = await fetchImpl(`${ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error('OIDC_KEYS_UNAVAILABLE');
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw new Error('OIDC_KEYS_INVALID');
  cachedKeys = body.keys; cachedAt = Date.now(); return cachedKeys;
}
async function verifyGithubCelebrationToken(token, { env = process.env, now = () => Date.now(), loadKeys = githubKeys } = {}) {
  if (env.CHRIS_CELEBRATION_GITHUB_OIDC_ENABLED !== 'true' || typeof token !== 'string' || token.length > 16384) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const seconds = Math.floor(now() / 1000);
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') return false;
    const subjects = [
      'repo:CorporateHrNetwork/chris:ref:refs/heads/main',
      'repo:CorporateHrNetwork@298755163/chris@1318488623:ref:refs/heads/main',
    ];
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || !subjects.includes(claims.sub)
      || claims.repository_id !== '1318488623' || claims.repository_owner_id !== '298755163'
      || claims.repository !== 'CorporateHrNetwork/chris' || claims.ref !== 'refs/heads/main'
      || claims.workflow_ref !== WORKFLOW || claims.runner_environment !== 'github-hosted'
      || !['schedule', 'workflow_dispatch'].includes(claims.event_name)
      || !Number.isFinite(claims.exp) || claims.exp <= seconds
      || !Number.isFinite(claims.nbf) || claims.nbf > seconds + 30
      || !Number.isFinite(claims.iat) || claims.iat > seconds + 30 || claims.iat < seconds - 900
      || claims.exp - claims.iat > 900) return false;
    const keys = await loadKeys();
    const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) return false;
    return crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch { return false; }
}
module.exports = { verifyGithubCelebrationToken };
