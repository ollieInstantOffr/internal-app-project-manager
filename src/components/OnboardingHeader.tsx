import Link from "next/link";

type Step = "account" | "organization" | "invite";

const ORDER: Step[] = ["account", "organization", "invite"];
const LABEL: Record<Step, string> = {
  account: "Account",
  organization: "Organization",
  invite: "Invite team",
};

export function StepHeader({ current, skipHref }: { current: Step; skipHref?: string }) {
  const index = ORDER.indexOf(current);
  return (
    <header
      style={{
        height: 58,
        flex: "none",
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        gap: 14,
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ width: 24, height: 24, borderRadius: 8, background: "var(--accent)", flex: "none" }} />
      <div className="steps">
        {ORDER.map((step, i) => (
          <div key={step} style={{ display: "contents" }}>
            {i > 0 && <div className="step-line" />}
            <div
              className="step"
              data-state={i < index ? "done" : i === index ? "current" : "todo"}
            >
              {i < index && <span style={{ color: "var(--accent)" }}>✓</span>}
              {LABEL[step]}
            </div>
          </div>
        ))}
      </div>
      <div className="grow" />
      {skipHref && (
        <Link href={skipHref} style={{ font: "400 11.5px var(--sans)", color: "var(--muted)" }}>
          Skip →
        </Link>
      )}
    </header>
  );
}

/** The plainer header used on the final step, which counts rather than lists. */
export function CountHeader({ orgName, step, of }: { orgName: string; step: number; of: number }) {
  return (
    <header
      style={{
        height: 56,
        flex: "none",
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        gap: 12,
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ width: 24, height: 24, borderRadius: 8, background: "var(--accent)", flex: "none" }} />
      <div style={{ font: "600 12.5px var(--display)" }}>{orgName}</div>
      <div className="grow" />
      <div style={{ font: "400 11px var(--mono)", color: "var(--muted-2)" }}>
        STEP {step} / {of}
      </div>
    </header>
  );
}
