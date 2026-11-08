import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("Zermatt groups expand independently and card dialogs use a viewport-bounded layout", async () => {
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
          { ...current, id: "retired", name: "Retired Version", status: "RETIRED", isActive: false },
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
    const [organization, templates] = window.document.querySelectorAll(".leave-policy-page > details");
    assert.equal(organization.open, false);
    assert.equal(templates.open, false);
    assert.match(organization.querySelector("summary").textContent, /Zermatt Organization Policies/);
    organization.querySelector("summary").click();
    assert.equal(organization.open, true);
    assert.equal(templates.open, false);
    const section = organization.querySelector(".leave-policy-grid");
    assert.match(section.textContent, /Annual Leave/);
    assert.doesNotMatch(section.textContent, /Old Version|Future Version|Inactive Version|Standard Template/);
    const versions = organization.querySelector("details");
    assert.equal(versions.open, false);
    assert.match(versions.textContent, /Future Version/);
    assert.doesNotMatch(organization.textContent, /Old Version|Retired Version/);
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

    const clickAction = async (group, label) => {
      await act(async () => [...group.querySelectorAll("button")].find(button => button.textContent === label).click());
      return window.document.querySelector("dialog[open]");
    };
    const versionDialog = await clickAction(section, "New Version");
    assert.equal(versionDialog.querySelector("h2").textContent, "Create Policy Version");
    await clickAction(versionDialog, "Close");
    templates.querySelector("summary").click();
    const cloneDialog = await clickAction(templates, "Clone & Customize");
    assert.equal(cloneDialog.querySelector("h2").textContent, "Clone & Customize");
    assert.equal(cloneDialog.querySelector(".leave-policy-modal-header button").textContent, "Close");

    const css = readFileSync(new URL("../src/pages/LeavePolicies.css", import.meta.url), "utf8");
    assert.match(css, /\.leave-policy-modal \{[^}]*position: fixed;[^}]*inset: 0;[^}]*margin: auto;[^}]*max-block-size: calc\(100dvh - 2rem\)/s);
    assert.match(css, /\.leave-policy-modal-body \{[^}]*min-block-size: 0;[^}]*overflow-y: auto;/s);
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
