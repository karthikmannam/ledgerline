/**
 * CSRF cookie extractor for LedgerLine.
 *
 * Backend sets:
 * - `ledgerline_session`: HttpOnly cookie (inaccessible to JS by design)
 * - `ledgerline_csrf`: readable double-submit cookie
 *
 * Mutating requests (POST, PATCH, PUT, DELETE) must send this token in header `x-csrf-token`.
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('ledgerline_csrf='));

  if (!match) return '';
  try {
    return decodeURIComponent(match.split('=')[1] ?? '');
  } catch {
    return match.split('=')[1] ?? '';
  }
}
