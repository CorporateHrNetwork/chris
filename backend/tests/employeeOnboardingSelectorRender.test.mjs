import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const React = (await import(path.join(root, "node_modules/react/index.js"))).default;
const { renderToStaticMarkup } = await import(path.join(root, "node_modules/react-dom/server.node.js"));
globalThis.localStorage = { getItem: (key) => key === "chris_organization" ? JSON.stringify({ country: "Nigeria" }) : null };
globalThis.sessionStorage = { getItem: () => null };
globalThis.window = { setTimeout };

const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
try {
  const { default: OnboardingSectionDataForm } = await vite.ssrLoadModule("/src/components/employees/OnboardingSectionDataForm.jsx");
  const html = renderToStaticMarkup(React.createElement(OnboardingSectionDataForm, {
    sectionKey: "statutory-details",
    countryContext: "Nigerian",
    value: { payeState: "", pensionPfa: "" },
    onChange() {},
    inputStyle: {},
    textareaStyle: {},
  }));
  assert.match(html, /type="search"/);
  assert.match(html, /Federal Capital Territory \(FCT\)/);
  assert.match(html, /Access ARM Pensions Limited/);
  assert.match(html, /Veritas Glanvills Pensions Limited/);
  assert.doesNotMatch(html, /Pension Custodian|Closed Pension/);
} finally {
  await vite.close();
}

console.log("PASS: rendered Nigerian PAYE and PFA selectors expose approved options.");
