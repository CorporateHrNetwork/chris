const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const jsx = fs.readFileSync(
  path.join(root, "src/pages/FullOnboardingWizard.jsx"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(root, "src/pages/FullOnboardingWizard.css"),
  "utf8"
);

test("desktop onboarding navigation is rendered beside the form using CHRiS global visual components", () => {
  for (const expected of [
    'className="fo-onboarding-layout"',
    'className="fo-section-sidebar chris-analytics-panel"',
    'className="chris-dashboard-card__shine"',
    'className="fo-section-nav"',
    'chris-panel-action fo-section-nav-button',
    'className="fo-onboarding-main"',
    'className="qa-page fo-page chris-module-dashboard"',
    'aria-current={step === index ? "step" : undefined}',
  ]) {
    assert.ok(jsx.includes(expected), `Missing sidebar onboarding structure: ${expected}`);
  }
});

test("sidebar occupies its own grid column and cannot overlay the form", () => {
  assert.ok(css.includes(".fo-onboarding-layout{display:grid;grid-template-columns:250px minmax(0,1fr)"));
  assert.ok(css.includes(".fo-section-sidebar.chris-analytics-panel{position:sticky"));
  assert.ok(css.includes("var(--chris-gold"));
  assert.ok(css.includes("var(--chris-text"));
  assert.ok(css.includes(".fo-onboarding-main{min-width:0}"));
  assert.equal(css.includes(".fo-sticky-nav{position:sticky"), false);
  assert.ok(css.includes(".fo-global-error{position:static"));
});

test("mobile onboarding navigation collapses into a horizontal non-sticky strip", () => {
  assert.ok(css.includes("@media(max-width:980px)"));
  assert.ok(css.includes(".fo-section-sidebar{position:static"));
  assert.ok(css.includes(".fo-section-nav{display:flex"));
  assert.ok(css.includes("overflow-x:auto"));
});

test("active onboarding section follows page scrolling", () => {
  assert.ok(jsx.includes("new IntersectionObserver"));
  assert.ok(jsx.includes("setStep(index)"));
  assert.ok(jsx.includes('rootMargin: "-12% 0px -68% 0px"'));
});
