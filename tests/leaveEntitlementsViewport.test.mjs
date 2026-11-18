import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  new URL("../src/pages/LeaveEntitlements.jsx", import.meta.url), "utf8"
);

assert.match(source, /import \{ createPortal \} from "react-dom"/);
assert.match(source, /provisioningOpen && createPortal\([\s\S]*?document\.body\s*\)\}/);
assert.match(source, /selected && createPortal\([\s\S]*?document\.body\s*\)\}/);

assert.match(source, /const overlay = \{[\s\S]*?position: "fixed",[\s\S]*?inset: 0,[\s\S]*?zIndex: 10000/);
assert.match(source, /const modal = \{[\s\S]*?maxHeight: "calc\(100dvh - 32px\)",[\s\S]*?overflowY: "auto"/);
assert.match(source, /const provisioningModal = \{[\s\S]*?width: "min\(960px,100%\)"/);
assert.match(source, /const modalHeader = \{[\s\S]*?position: "sticky",[\s\S]*?top: 0/);
assert.match(source, /const modalActions = \{[\s\S]*?position: "sticky",[\s\S]*?bottom: 0/);
assert.match(source, /minmax\(min\(260px,100%\),1fr\)/);

console.log("PASS: Leave entitlement and adjustment dialogs escape the sidebar stacking context, fit viewport height and scroll internally.");
