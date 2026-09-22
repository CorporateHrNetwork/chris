export function findNextIncompleteSection(record, currentSectionKey = "") {
  const sections = Array.isArray(record?.template?.sections)
    ? record.template.sections
    : [];

  if (
    !sections.length
  ) {
    return null;
  }

  const progress = record?.sectionProgress || {};
  const current = sections.find((section) => section.key === currentSectionKey);
  if (current && progress[current.key]?.completed !== true) {
    return current;
  }

  const currentIndex = sections.findIndex((section) => section.key === currentSectionKey);
  const ordered = currentIndex >= 0
    ? [...sections.slice(currentIndex + 1), ...sections.slice(0, currentIndex + 1)]
    : sections;

  return ordered.find((section) => progress[section.key]?.completed !== true) || null;
}
