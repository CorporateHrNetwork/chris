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
