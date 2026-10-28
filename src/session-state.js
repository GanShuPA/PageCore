/** Session view values are data from disk; clamp them before applying to an editor. */
export function normalizeView(value = {}, length = 0) {
  const finite = (n, max) => (Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0);
  return {
    mode: ['write', 'source', 'split', 'read'].includes(value?.mode) ? value.mode : 'write',
    anchor: Math.floor(finite(value?.anchor, length)),
    head: Math.floor(finite(value?.head, length)),
    sourceTop: finite(value?.sourceTop, 1e8),
    writeTop: finite(value?.writeTop, 1e8),
    previewTop: finite(value?.previewTop, 1e8),
  };
}
