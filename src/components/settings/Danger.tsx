"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Role } from "@/lib/types";

export function Danger({ slug, doneCount }: { slug: string; doneCount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useShell();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);

  const isOwner = role === Role.OWNER;

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Danger zone</h1>
          <div className="panel-sub">Two actions live here. Both are owner-only.</div>
        </div>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 14 }}>
        <section
          className="card"
          style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 11 }}
        >
          <h2 style={{ font: "600 13px var(--display)" }}>Archive completed issues</h2>
          <p style={{ font: "400 11.5px/1.65 var(--sans)", color: "var(--muted)", margin: 0 }}>
            Moves the {doneCount} issue{doneCount === 1 ? "" : "s"} in Done out of every board and
            list. Nothing is deleted — history, comments and git links stay intact.
          </p>
          <button
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start" }}
            disabled={!isOwner || busy === "archive" || doneCount === 0}
            onClick={async () => {
              setBusy("archive");
              try {
                const res = await api.post<{ archived: number }>("/api/org/danger", {
                  action: "archive-done",
                });
                toast(`${res.archived} issue${res.archived === 1 ? "" : "s"} archived`);
                router.refresh();
              } catch (err) {
                toast(err instanceof ApiError ? err.message : "Couldn't archive those");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "archive" ? <span className="spin" /> : `Archive ${doneCount} done issues`}
          </button>
        </section>

        <section
          className="card"
          style={{
            maxWidth: 620,
            display: "flex",
            flexDirection: "column",
            gap: 11,
            boxShadow: "0 0 0 1.5px var(--danger-bg)",
          }}
        >
          <h2 style={{ font: "600 13px var(--display)", color: "var(--danger)" }}>
            Delete this organization
          </h2>
          <p style={{ font: "400 11.5px/1.65 var(--sans)", color: "var(--muted)", margin: 0 }}>
            Permanently removes every project, issue, comment and member of{" "}
            <span className="mono">{slug}</span>. This cannot be undone.
          </p>

          <div className="field" style={{ maxWidth: 280 }}>
            <label className="label" htmlFor="confirm-slug">
              Type {slug} to confirm
            </label>
            <input
              id="confirm-slug"
              className="input input-sm"
              value={confirm}
              disabled={!isOwner}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button
            className="btn btn-danger"
            style={{ alignSelf: "flex-start" }}
            disabled={!isOwner || confirm !== slug || busy === "delete"}
            onClick={async () => {
              setBusy("delete");
              try {
                await api.post("/api/org/danger", { action: "delete-org", confirm });
                router.push("/onboarding/organization");
                router.refresh();
              } catch (err) {
                toast(err instanceof ApiError ? err.message : "Couldn't delete that");
                setBusy(null);
              }
            }}
          >
            {busy === "delete" ? <span className="spin" /> : "Delete organization"}
          </button>

          {!isOwner && (
            <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
              Only an owner can do either of these.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
