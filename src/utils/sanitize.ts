/**
 * Filename / storage-key sanitisation.
 *
 * Per Phase 0 security model: prevent path traversal and malicious filenames.
 * A storage key must never resolve outside its intended prefix.
 */

/**
 * Sanitise a single filename component so it is safe to use inside a storage
 * key. Strips path separators, null bytes, control chars, and leading dots.
 * Keeps unicode (anime filenames often use CJK), spaces, and common media
 * punctuation.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'untitled';
  // Normalise separators and null/control chars.
  let out = name
    .replace(/[\\/]/g, '_') // path separators -> underscore
    .replace(/[\x00-\x1f\x7f]/g, '') // control chars
    .replace(/^\.+/, '') // strip leading dots (hidden files / traversal)
    .trim();
  if (!out) return 'untitled';
  // Cap length to avoid absurd keys.
  if (out.length > 200) out = out.slice(0, 200).trim();
  return out;
}

/**
 * Build a safe storage key from a list of path segments. Each segment is
 * sanitised; the result is joined with '/'. Guarantees no '..' segment and no
 * absolute path. `prefix` (e.g. "anime/") is prepended if provided.
 */
export function buildSafeKey(segments: string[], prefix = ''): string {
  // Reject traversal at the raw-input level (defence in depth before sanitisation).
  if (segments.some((s) => s === '..' || s === '.' || s.includes('/') || s.includes('\\'))) {
    throw new Error('Invalid path segment (traversal) rejected');
  }
  const safe = segments.map(sanitizeFilename).filter(Boolean);
  const joined = safe.join('/');
  const base = prefix ? prefix.replace(/\/+$/, '') + '/' + joined : joined;
  // Final guard: never allow an absolute or traversal-looking key.
  if (base.startsWith('/') || base.includes('../') || base.includes('..\\')) {
    throw new Error('Unsafe storage key rejected');
  }
  return base;
}

/**
 * Return a safe download "token path" — i.e. a key that is exposed in URLs.
 * We never expose the raw storage key directly to the user; instead a signed
 * token wraps an opaque id. This helper just validates that a given key does
 * not contain characters that would let a user manipulate it into arbitrary
 * paths via the delivery layer.
 */
export function isSafeUrlToken(token: string): boolean {
  return !/[\\/]/.test(token) && !token.includes('..') && token.length <= 256;
}
