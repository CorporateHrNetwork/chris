"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const audit = fs.readFileSync(path.resolve(__dirname, "../../tools/cca-local-demo/Audit-CCA-PersistentStagingHealth.ps1"), "utf8");

test("CCA audit checks actual daily password-logon backup scheduler", () => {
  assert.match(audit, /Get-ScheduledTask -TaskName 'CRNETWORK-CCA-ManagedPostgres-Backup'/);
  assert.match(audit, /LogonType -eq 'Password'/);
  assert.match(audit, /MSFT_TaskDailyTrigger/);
  assert.match(audit, /Backup-CCA-PersistentPostgres-Staging\.ps1/);
  assert.match(audit, /-UploadOffsite/);
  assert.match(audit, /CCA_AUTOMATED_BACKUP_TASK_NOT_VERIFIED/);
  assert.match(audit, /automatedBackupScheduled=\$backupScheduled/);
  assert.doesNotMatch(audit, /automatedBackupScheduled=\$false/);
});

test("CCA audit never conflates runtime health with real login or public hosting readiness", () => {
  assert.match(audit, /authenticatedOperatorLoginVerified=\$false/);
  assert.match(audit, /publicHostingVerified=\$false/);
  assert.match(audit, /unauthenticatedDatabaseReadDenied=\$unauthDenied/);
  assert.match(audit, /encryptedBackupManifestAndLocalHashValid=\$manifestVerified/);
});

test("CCA audit is isolated to private loopback staging", () => {
  assert.match(audit, /127\.0\.0\.2:4184/);
  assert.match(audit, /127\.0\.0\.1/);
  assert.match(audit, /cca_fictional_services/);
  assert.match(audit, /FICTIONAL_STAGING_ONLY/);
  assert.doesNotMatch(audit, /chris-zermatt-web\.onrender\.com/);
});
