import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * `unsafe-inline` on scripts is not where I'd like it, but Next injects inline
 * bootstrap scripts and removing it needs a nonce threaded through middleware
 * on every request. `unsafe-eval` is dev-only, for React Refresh. Everything
 * else is locked down: no framing, no plugins, no cross-origin form posts, and
 * no base-tag rewriting.
 *
 * Fonts are self-hosted by next/font at build time, so no font CDN is needed.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // GitHub avatars are the one remote image source; blob: covers object URLs.
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  // Same-origin, plus GitHub: the sign-in link is prefetched before it is
  // followed, and that prefetch follows the redirect out to the OAuth
  // authorize endpoint. Without this, signing in with GitHub is blocked.
  `connect-src 'self' https://github.com https://api.github.com${isProd ? "" : " ws: wss:"}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // The OAuth handoff leaves the origin, so it has to be allowed here too.
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Redundant next to frame-ancestors, but still honoured by older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js — that is what the
  // runtime Docker stage copies, so the final image carries no build tooling.
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        // Everything except two routes that set their own: the MCP endpoint,
        // which tools rather than browsers call and which needs its CORS
        // headers intact, and attachment delivery, which sends a far stricter
        // sandbox policy than a page needs.
        source: "/((?!api/mcp|api/attachments).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
