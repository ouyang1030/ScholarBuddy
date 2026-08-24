export function zoteroPassageUrl(passage) {
  if (!passage.attachmentKey) return "";
  const query = new URLSearchParams({
    ...(passage.pageLabel ? { page: passage.pageLabel } : {}),
    ...(passage.annotationKey ? { annotation: passage.annotationKey } : {}),
  });
  return `zotero://open-pdf/library/items/${encodeURIComponent(passage.attachmentKey)}${query.size ? `?${query}` : ""}`;
}
