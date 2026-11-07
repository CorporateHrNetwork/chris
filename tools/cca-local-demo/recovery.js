"use strict";
// Operator-only local recovery utility. Never called from HTTP handlers.
const { createLocalSnapshotStore } = require("./localSnapshotStore");
const store = createLocalSnapshotStore();
const mode = process.argv[2];
try {
  if (mode === "--verify") {
    const primary = store.load();
    const backup = store.inspectBackup();
    console.log(JSON.stringify({ primaryValid: Boolean(primary), currentCases: primary?.workflow?.cases?.length ?? 0,
      backupValid: backup.available, backupCases: backup.cases ?? 0 }, null, 2));
  } else if (mode === "--inspect-backup") {
    console.log(JSON.stringify(store.inspectBackup(), null, 2));
  } else if (mode === "--restore" && process.argv[3] === "--confirm-restore") {
    // This tool must be run ONLY with the CCA demo server stopped.
    const snapshot = store.restoreBackup();
    console.log("Explicit recovery completed; fictional cases: " + snapshot.workflow.cases.length);
    console.log("Restart the CCA local server and re-check all cases.");
  } else {
    console.error("Usage: node tools/cca-local-demo/recovery.js --verify");
    console.error("       node tools/cca-local-demo/recovery.js --inspect-backup");
    console.error("       [server STOPPED] node tools/cca-local-demo/recovery.js --restore --confirm-restore");
    process.exitCode = 2;
  }
} catch (error) {
  console.error("CCA recovery check failed; original files were not reset automatically:", error.message);
  process.exitCode = 1;
}
