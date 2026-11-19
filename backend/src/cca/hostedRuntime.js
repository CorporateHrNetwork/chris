"use strict";

// Composition boundary for a future separately hosted CCA service.
// Requires explicit verified operator session resolver; intentionally does
// not provide one or start a public listener.
const {createCcaHostedPostgres} = require("./hostedPostgresBootstrap");
const {createCcaHostedApp} = require("./hostedApp");

function createCcaHostedRuntime({env, Pool, resolveOperatorSession} = {}) {
  if (typeof resolveOperatorSession !== "function") {
    throw new Error("CCA_HOSTED_OPERATOR_IDENTITY_NOT_CONFIGURED");
  }
  const database = createCcaHostedPostgres({env, Pool});
  try {
    const app = createCcaHostedApp({database, resolveOperatorSession});
    return Object.freeze({
      start: opts => app.start(opts),
      stop: () => app.stop(),
      server: app.server,
    });
  } catch (error) {
    // Nothing is listening yet; best-effort clean-up without leaking secrets.
    void database.close().catch(() => {});
    throw error;
  }
}

module.exports = {createCcaHostedRuntime};
