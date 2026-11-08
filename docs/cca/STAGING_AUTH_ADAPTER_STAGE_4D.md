# CCA Stage 4D — Isolated Persistent-Identity Staging Adapter

The isolated staging adapter maps verified vault sessions and assignments to
server-side CCA permissions. Automated tests use fictional identities and
temporary state. The Windows launcher below provides a separate persistent
local staging login on port 4184. Existing demo ports use their own accounts
and sessions.

The local-only server has no public TLS deployment and must never be exposed
over the Internet. The initial platform approver's enrollment and account
recovery are still operator-only lab functions, not a verified enterprise
workflow.

Do not turn on real administrator onboarding, connect CHRiS tenant records,
or claim enterprise production-readiness based on these tests.

## Regression check

```bash
node --test backend/tests/cca*.test.js
```

Draft PR #237 is unmerged and undeployed.

## Windows local staging activation

The Windows launcher is `tools/cca-local-demo/Start-CCA-Staging.ps1`.
Run it from an interactive PowerShell console using the Windows profile that
owns the staging checkout. On first run, choose and confirm a distinct
password and enroll the setup key under **CCA Local Staging** in Google
Authenticator. The account is `cca-staging-operator`. The staging login listens
on `http://127.0.0.1:4184/`. Keep the console open. Run the same launcher to
restart with the saved account and a fresh session. For first-run activation,
`-GeneratePassword` generates a random staging password and displays it once
in the local console with the authenticator setup key. Run enrollment only
in a private, interactive console. Do not capture or share its output.

The Windows profile generates a random master key, wraps it with Windows DPAPI
(CurrentUser), and supplies it over standard input. The launcher keeps the
state under an access-restricted LocalAppData directory. Separate derived keys
protect the identity vault, audit ledger and checkpoint. The loopback socket
has independent persistent budgets for password and MFA attempts. The server
allows only one writer and checkpoints the vault, backup, recovery marker,
audit log and throttle file before returning an authentication response.
A mismatch pauses access, including access via an existing session.

On an abnormal stop or recovery mismatch, preserve the complete staging
directory, keep the browser service stopped, and verify that no writer remains.
A stale `host-security/writer.lock` can be removed after an operator verifies
the process stopped. Startup will still require the saved checkpoint to match.
If it does not match, preserve the evidence and keep access disabled pending
review. Do not remove the recovery marker or rebuild the checkpoint to resume
access. There is no automatic recovery of interrupted cross-file writes. The
checkpoint is local and cannot detect a coordinated rollback of the protected
checkpoint and all state by an attacker controlling the Windows profile. This
is single-host fictional staging, with no externally anchored audit log.
