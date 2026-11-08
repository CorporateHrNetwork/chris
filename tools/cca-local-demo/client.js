"use strict";
const $ = id => document.getElementById(id);
let currentId = null;
let snapshot = { cases: [], tenants: [] };

async function request(endpoint, options = {}) {
  const result = await fetch(endpoint, { cache: "no-store", ...options });
  const body = await result.json();
  if (!body.ok) throw new Error(body.code || "Request failed");
  return body;
}
function option(value, label) {
  const el = document.createElement("option");
  el.value = value; el.textContent = label; return el;
}
function feedback(message, error = false) {
  $("feedback").textContent = message;
  $("feedback").style.color = error ? "#a32727" : "#0f6e47";
}
async function reload() {
  snapshot = await request("/api/state");
  $("tenant").replaceChildren(...snapshot.tenants.map(t => option(t.id, t.name)));
  $("total").textContent = snapshot.cases.length;
  $("open").textContent = snapshot.cases.filter(c => c.status !== "CLOSED").length;
  $("approval").textContent = snapshot.cases.filter(c => c.status === "AWAITING_APPROVAL").length;
  $("closed").textContent = snapshot.cases.filter(c => c.status === "CLOSED").length;
  const queue = $("queue");
  queue.replaceChildren();
  for (const c of snapshot.cases) {
    const tile = document.createElement("div");
    tile.className = "case" + (c.id === currentId ? " selected" : "");
    tile.tabIndex = 0; tile.setAttribute("role", "button");
    tile.setAttribute("aria-label", "Open " + c.id);
    const name = snapshot.tenants.find(t => t.id === c.tenantId)?.name || "Fictional tenant";
    const title = document.createElement("strong"); title.textContent = c.id + " · " + name;
    const desc = document.createElement("small"); desc.textContent = c.description;
    const badge = document.createElement("span"); badge.className = "status"; badge.textContent = c.status.replaceAll("_", " ");
    tile.append(title, desc, badge);
    tile.addEventListener("click", () => selectCase(c.id));
    tile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCase(c.id); } });
    queue.append(tile);
  }
  if (currentId) await selectCase(currentId, false);
}
async function selectCase(id, rerender = true) {
  currentId = id;
  const c = snapshot.cases.find(row => row.id === id);
  $("caseActions").hidden = !c;
  if (!c) { $("caseDetails").textContent = "Select a case."; $("events").replaceChildren(); return; }
  const tenant = snapshot.tenants.find(t => t.id === c.tenantId);
  $("caseDetails").textContent = c.id + " | " + (tenant?.name || c.tenantId) + " | " + c.description;
  $("caseStatus").textContent = "Status: " + c.status.replaceAll("_", " ") + (c.assignee ? " · Assigned to " + c.assignee : "");
  $("caseAnalysis").textContent = [c.analysis?.reason, c.analysis?.question].filter(Boolean).join(" ");
  $("recommendation").value = c.recommendation || "";
  $("resolution").value = c.resolution || "";
  const valid = { ASSIGNED: ["RECOMMEND"],
    AWAITING_APPROVAL: ["APPROVE"], APPROVED: ["RESOLVE"], AWAITING_CLIENT_VALIDATION: ["CONFIRM"] };
  for (const button of document.querySelectorAll("[data-action]")) button.disabled = !(valid[c.status] || []).includes(button.dataset.action);
  try {
    const audit = await request("/api/audit?caseId=" + encodeURIComponent(id));
    $("events").replaceChildren(...audit.events.map(e => {
      const li = document.createElement("li");
      li.textContent = e.event.replaceAll("_", " ") + " · " + e.actor;
      return li;
    }));
  } catch (e) { feedback(e.message, true); }
  if (rerender) await reloadQueueOnly();
}
async function reloadQueueOnly() {
  for (const tile of $("queue").children) {
    tile.classList.toggle("selected", tile.getAttribute("aria-label") === "Open " + currentId);
  }
}
async function mutate(endpoint, body) {
  try {
    const result = await request(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (result.case) currentId = result.case.id;
    await reload();
    feedback("Fictional workflow updated. No real-world action occurred.");
  } catch (e) { feedback("Not permitted: " + e.message, true); }
}
$("newCase").addEventListener("submit", async e => {
  e.preventDefault();
  await mutate("/api/submit", { tenantId: $("tenant").value, description: $("description").value });
  $("description").value = "";
});
$("actionButtons").addEventListener("click", e => {
  const action = e.target.closest("button")?.dataset.action;
  if (!action || !currentId) return;
  mutate("/api/act", { caseId: currentId, operation: action,
    recommendation: $("recommendation").value,
    resolution: $("resolution").value });
});
$("refresh").addEventListener("click", () => reload().catch(e => feedback(e.message, true)));
reload().catch(e => feedback(e.message, true));
