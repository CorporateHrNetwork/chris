import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const component = read("src/pages/LeaveRequests.jsx");
const styles = read("src/pages/LeaveRequests.css");

assert.match(component, /import \{ createPortal \} from "react-dom"/);
assert.match(component, /open && createPortal\([\s\S]*document\.body/);
assert.match(component, /document\.body\.style\.overflow = "hidden"/);
assert.match(
  component,
  /return \(\) => \{\s*document\.body\.style\.overflow = previousOverflow;/
);

assert.match(styles, /\.leave-request-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
assert.match(styles, /\.leave-request-overlay\s*\{[^}]*align-items:\s*center;/s);
assert.match(styles, /\.leave-request-modal\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\);[^}]*min-height:\s*0;/s);
assert.match(styles, /\.leave-request-form\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
assert.match(styles, /overscroll-behavior:\s*contain;/);

console.log("PASS: Leave request dialog stays within the viewport and scrolls internally.");
