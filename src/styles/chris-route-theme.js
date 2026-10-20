function applyChrisRouteScope() {
  const path =
    window.location.pathname || "/";

  const isOrganization =
    path === "/organization" ||
    path.startsWith(
      "/organization/"
    );

  if (isOrganization) {
    document.body.setAttribute(
      "data-chris-route-scope",
      "organization"
    );
  } else {
    document.body.removeAttribute(
      "data-chris-route-scope"
    );
  }
}

if (
  !window.__chrisRouteScopeInstalled
) {
  window.__chrisRouteScopeInstalled =
    true;

  const originalPushState =
    window.history.pushState;

  const originalReplaceState =
    window.history.replaceState;

  window.history.pushState =
    function (...args) {
      const result =
        originalPushState.apply(
          this,
          args
        );

      queueMicrotask(
        applyChrisRouteScope
      );

      return result;
    };

  window.history.replaceState =
    function (...args) {
      const result =
        originalReplaceState.apply(
          this,
          args
        );

      queueMicrotask(
        applyChrisRouteScope
      );

      return result;
    };

  window.addEventListener(
    "popstate",
    applyChrisRouteScope
  );

  window.addEventListener(
    "hashchange",
    applyChrisRouteScope
  );
}

applyChrisRouteScope();

// Shared viewport zoom: observes new route content and replays on re-entry.
const crnZoomSelector = 'img:not([aria-hidden="true"]):not([role="presentation"]), .card, .logo-card, .metric, .panel, .summary-card, .stat-card, .feature-list > div, .testimonials blockquote, [class$="-card"], [class$="-panel"]';
if ('IntersectionObserver' in window) {
  const seen = new WeakSet();
  const viewport = new IntersectionObserver(entries => {
    entries.forEach(({target, isIntersecting}) => target.classList.toggle('crn-zoom-visible', isIntersecting));
  }, {threshold: .08});
  function observeTree(root) {
    if (!(root instanceof Element)) return;
    const candidates = [...root.querySelectorAll(crnZoomSelector)];
    if (root.matches(crnZoomSelector)) candidates.push(root);
    candidates.forEach(el => {
      if (seen.has(el)) return;
      seen.add(el); viewport.observe(el);
    });
  }
  function startZoom() {
    const root = document.querySelector('#root') || document.querySelector('main');
    if (!root) return;
    observeTree(root);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(observeTree))).observe(root, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startZoom, {once:true});
  else startZoom();
}
