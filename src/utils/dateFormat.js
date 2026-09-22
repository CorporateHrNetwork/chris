export function formatDate(value, fallback = "Not recorded") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
