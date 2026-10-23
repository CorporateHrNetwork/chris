import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loginHarness(organization, matchedUser = null) {
  const handlers = new Map();
  const queries = [];
  const router = { post: (path, ...steps) => handlers.set(path, steps.at(-1)), get() {} };
  const prisma = {
    organization: { findUnique: async () => organization },
    user: { findFirst: async (query) => { queries.push(query); return matchedUser; } },
  };
  const mocks = {
    express: { Router: () => router },
    bcryptjs: { compare: async () => true },
    jsonwebtoken: { sign: (claims) => { queries.push({ claims }); return 'test-token'; } },
    crypto: {},
    '../config/prisma': prisma,
    '../middleware/authMiddleware': { requireAuth() {} },
  };
  vm.runInNewContext(fs.readFileSync('backend/src/routes/authRoutes.js', 'utf8'), {
    require: (id) => { if (!(id in mocks)) throw new Error(id); return mocks[id]; },
    module: { exports: {} }, process: { env: { JWT_SECRET: 'test-only' } }, console,
  });
  return { queries, async login(slug) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers.get('/login')({ body: { email: 'member@example.test', password: 'test', organizationSlug: slug } }, res);
    return res;
  } };
}

test('choosing an unknown workspace does not authenticate', async () => {
  const h = loginHarness(null);
  assert.equal((await h.login('unknown')).statusCode, 401);
  assert.equal(h.queries.length, 0);
});

test('credentials must match a user inside the selected organization', async () => {
  const h = loginHarness({ id: 'other-org', status: 'ACTIVE' });
  assert.equal((await h.login('other-org')).statusCode, 401);
  assert.equal(h.queries[0].where.organizationId, 'other-org');
});

test('successful login binds the token to the selected authorized organization', async () => {
  const h = loginHarness({ id: 'assigned-org', slug: 'assigned-org', status: 'ACTIVE' }, { id: 'member', userRoles: [] });
  const res = await h.login('assigned-org');
  assert.equal(res.statusCode, 200);
  assert.equal(h.queries[1].claims.organizationId, 'assigned-org');
  assert.equal(res.body.data.organization.id, 'assigned-org');
});
