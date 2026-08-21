import Link from "next/link";

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div
        className="rail-mark"
        style={{ width: size, height: size, borderRadius: 9, fontSize: size * 0.46 }}
      >
        A
      </div>
      <div style={{ font: "600 14px var(--display)" }}>Arc</div>
    </div>
  );
}

/** The right-hand column on login and signup — the product promise, made concrete. */
export function AuthAside() {
  return (
    <aside className="auth-aside">
      <div style={{ font: "600 15px/1.4 var(--display)", color: "var(--text)" }}>
        Issues that move themselves.
      </div>

      <div
        className="card"
        style={{ borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 11 }}
      >
        <div style={{ font: "400 12.5px/1.45 var(--sans)" }}>Refactor auth middleware</div>
        <div className="branch-chip">
          <span className="dot" style={{ background: "var(--success)" }} />
          feat/408-auth pushed
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
          <span className="pill pill-success" style={{ fontSize: 10, padding: "1px 8px" }}>
            → In progress
          </span>
          automatically
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {[
          "Unlimited projects, members, history",
          "GitHub branches & PRs drive status",
          "An issue needs only a title",
        ].map((line) => (
          <div
            key={line}
            style={{ display: "flex", gap: 9, font: "400 12px var(--sans)", color: "var(--text-3)" }}
          >
            <span style={{ color: "var(--accent)" }}>✓</span>
            {line}
          </div>
        ))}
      </div>
    </aside>
  );
}

export function GithubButton({ intent = "signin" }: { intent?: "signin" | "signup" }) {
  return (
    <Link className="oauth" href={`/api/auth/github?intent=${intent}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      Continue with GitHub
    </Link>
  );
}
