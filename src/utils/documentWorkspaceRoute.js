export const DOCUMENT_PATH_BY_TAB = {
  employee: "/documents/employee",
  hr: "/documents/hr",
  policies: "/documents/policies",
  templates: "/documents/templates",
  categories: "/documents/categories",
  expiry: "/documents/expiry-tracking",
  requests: "/documents/requests",
  resources: "/documents?workspace=resources",
};

export function documentTabFromLocation(pathname, search = "") {
  if (new URLSearchParams(search).get("workspace") === "resources") return "resources";
  return Object.entries(DOCUMENT_PATH_BY_TAB)
    .find(([, path]) => path.split("?")[0] === pathname)?.[0] || "employee";
}

