/** Service configuration values represent origins, without routes or trailing slashes. */
export function serviceOrigin(
  value: string | undefined,
  fallback: string,
): string {
  const url = new URL(value?.trim() || fallback);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Service URLs must be HTTP or HTTPS origins without credentials",
    );
  }
  return url.origin;
}
