import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import "./styles/global.css";
import "./styles/chris-visual-standard-v2.css";

import "./styles/chris-dashboard.css";
import "./styles/chris-route-theme.js";
import "./styles/chris-organization-visual.css";
import "./styles/chris-organization-module-v4.css";

const restoreTenantAwareLoginUrl = () => {
  if (window.location.pathname !== "/login") return;

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get("organization")) return;

  const organizationSlug = localStorage.getItem("chris_last_organization_slug");
  if (!organizationSlug) return;

  currentUrl.searchParams.set("organization", organizationSlug);
  window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
};

restoreTenantAwareLoginUrl();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)