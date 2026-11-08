import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("Zermatt opens effective policies and provides a readable, dismissible policy dialog", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/leave/policies" });
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const { default: LeavePolicies } = await server.ssrLoadModule("/src/pages/LeavePolicies.jsx");
  const { window } = dom;
  const previous = new Map();
  const setGlobal = (name, value) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("localStorage", window.localStorage);
  setGlobal("sessionStorage", window.sessionStorage);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.setItem("chris_organization", JSON.stringify({ slug: "zermatt-liquor-limited" }));
  window.localStorage.setItem("chris_token", "fixture-token");

  const current = {
    id: "synthetic-internal-id", name: "Annual Leave", code: "ZLL-ANNUAL-FT",
    status: "ACTIVE", isActive: true, versionNumber: 3, effectiveFrom: "2000-01-01",
    eligibilityRules: { employmentTypes: ["Full-Time", "Expatriate"] },
    calendarRules: { countWeekends: true, countPublicHolidays: false },
  };
  setGlobal("fetch", async url => {
    const responses = {
      "/api/auth/me": { permissions: ["leave.manage"] },
      "/api/leave/types": [],
      "/api/leave/policy-workspace": {
        templates: [{ name: "Standard Template", code: "TEMPLATE" }],
        policies: [
          current,
          { ...current, id: "old", name: "Old Version", effectiveTo: "2001-01-01" },
          { ...current, id: "future", name: "Future Version", effectiveFrom: "2099-01-01" },
          { ...current, id: "inactive", name: "Inactive Version", isActive: false },
        ],
      },
    };
    const data = responses[new URL(url, "http://localhost").pathname];
    assert.ok(data, `Unexpected request ${url}`);
    return new Response(JSON.stringify({ data }));
  });

  // JSDOM does not implement the browser's dialog top layer.
  window.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  window.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const root = createRoot(window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(MemoryRouter, null, React.createElement(LeavePolicies))));
    const section = window.document.querySelector(".leave-policy-page > section");
    assert.match(section.textContent, /Zermatt Organization Policies.*Annual Leave/);
    assert.doesNotMatch(section.textContent, /Old Version|Future Version|Inactive Version|Standard Template/);
    const [versions, templates] = window.document.querySelectorAll("details");
    assert.equal(versions.open, false);
    assert.equal(templates.open, false);
    assert.match(versions.textContent, /Old Version/);
    assert.match(templates.textContent, /Standard Template/);

    await act(async () => [...section.querySelectorAll("button")].find(button => button.textContent === "View Policy").click());
    const dialog = window.document.querySelector("dialog[open]");
    assert.ok(dialog);
    assert.match(dialog.textContent, /ZLL-ANNUAL-FT/);
    assert.match(dialog.textContent, /Employment Types.*Full-Time.*Expatriate/i);
    assert.match(dialog.textContent, /Count WeekendsYes/i);
    assert.doesNotMatch(dialog.textContent, /synthetic-internal-id/);
    assert.equal(dialog.querySelector("pre"), null);
    await act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
    assert.equal(window.document.querySelector("dialog"), null);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
