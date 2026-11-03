/**
 * Accept only same-origin absolute paths. Reject protocol-relative URLs,
 * backslashes, control characters, and malformed URL input.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://oneauth.invalid");
    if (parsed.origin !== "https://oneauth.invalid") return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}
