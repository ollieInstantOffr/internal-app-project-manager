import type { MetadataRoute } from "next";

/**
 * What macOS reads when you install Arc — Safari's "Add to Dock" and Chrome's
 * "Install" both start here.
 *
 * start_url is /home rather than /, because / redirects and an installed app
 * that begins on a redirect feels slower than it is.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arc — issues that move themselves",
    short_name: "Arc",
    description:
      "Git-native project management. An issue needs only a title; branches and PRs move it the rest of the way.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#1a1917",
    theme_color: "#1a1917",
    orientation: "any",
    categories: ["productivity", "developer"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/192-maskable", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My work", url: "/my-work" },
      { name: "Tasks", url: "/tasks" },
      { name: "Roadmap", url: "/roadmap" },
    ],
  };
}
