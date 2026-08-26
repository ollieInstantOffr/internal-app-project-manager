"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the browser offer to
 * install Arc. Renders nothing.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registering during load competes with the app's own first requests.
    const id = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[pwa] service worker did not register", err);
      });
    }, 1500);
    return () => clearTimeout(id);
  }, []);

  return null;
}
