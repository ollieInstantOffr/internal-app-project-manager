/**
 * The canonical origin for links the app generates — invite and digest emails,
 * OAuth redirects, webhook registration. One definition so a misconfigured
 * APP_URL can't hand out links on a port nothing is listening on.
 */
export const DEFAULT_PORT = 3321;

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || `http://localhost:${DEFAULT_PORT}`).replace(/\/+$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
