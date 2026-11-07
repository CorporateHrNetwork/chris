# CRNetwork Central Agency — Local Fictional Dashboard

An **interactive local-only demonstration** using free Node.js built-ins and
the isolated CCA synthetic service workflow. It is not a production app.

## Run

From the repository root on a machine with Node.js 22+:

```bash
node tools/cca-local-demo/server.js
```

Then open **http://127.0.0.1:4179** in the same computer's web browser.
Stop the server with Ctrl+C.

It binds to **127.0.0.1** (not public interfaces), uses no database, API
credentials, paid services, Supabase connection, CHRiS routes or live tenants.
Refreshing preserves session memory while the server runs; restarting resets
all fictional changes to the two seed cases.

## Demonstrate

1. Select a fictional company and submit a complaint.
2. Select the ticket, click Triage, then Assign (simulated specialist).
3. Write a recommendation and click Recommend.
4. Click **Simulate independent approval** (this uses a hardcoded synthetic
   separate approver; NOT a real administrator identity).
5. Write the resolution, click Send resolution, then Simulate client confirmation.
6. Review case timeline and dashboard KPIs.

The interface visibly identifies that **all data, identities and actions are
fictional**. Recommendations are text only; there is no AI model call.

## Security limitations — critical

- Demo persona/approver switching is not authentication. There is no MFA.
- Server is loopback-only and validates the Host/Origin for local usage;
  it is **not suitable for public internet hosting** or for real customer data.
- No durable database, replay protection, real-world action approvals,
  encryption at rest, enterprise logging, or integration with CHRiS.
- Never expose it via reverse proxy, tunnel or public hosting.
- Never copy real client records or CHRiS environment secrets into the demo.
- This directory is not referenced by the CHRiS frontend or Express app.
- Do not merge PR #237 until all security and production regression review
  gates are complete.

## Automated checks

```bash
node --test backend/tests/cca*.test.js
```

This includes loopback HTTP behavior and synthetic workflow verification.
