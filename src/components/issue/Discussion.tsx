"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import {
  AttachmentList,
  DropZone,
  useUploader,
  type AttachmentRow,
} from "./Attachments";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { TimeAgo } from "@/components/TimeAgo";

export type Comment = {
  id: string;
  body: string;
  automated: boolean;
  createdAt: string;
  author: { id: string; name: string; avatarHue: number } | null;
  attachments?: AttachmentRow[];
};

export type ActivityRow = {
  id: string;
  type: string;
  message: string;
  automatic: boolean;
  createdAt: string;
  actor: { id: string; name: string; avatarHue: number } | null;
};

type Tab = "activity" | "comments" | "history";

export function Discussion({
  issueKey,
  comments,
  activities,
}: {
  issueKey: string;
  comments: Comment[];
  activities: ActivityRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("activity");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AttachmentRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const { upload, busy: uploading } = useUploader(issueKey);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the reader is over it.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  async function attach(files: File[]) {
    const added = await upload(files);
    if (added.length) setPending((prev) => [...prev, ...added]);
  }

  async function send() {
    // An upload with no words is still worth posting.
    if (!draft.trim() && !pending.length) return;
    setBusy(true);
    try {
      await api.post(`/api/issues/${issueKey}/comments`, {
        body: draft.trim() || `Attached ${pending.length} file${pending.length === 1 ? "" : "s"}`,
        attachmentIds: pending.map((a) => a.id),
      });
      setDraft("");
      setPending([]);
      router.refresh();
    } catch {
      toast("Couldn't post that comment");
    } finally {
      setBusy(false);
    }
  }

  // "Activity" interleaves both; the other two tabs narrow it down.
  const merged = [
    ...comments.map((c) => ({ at: c.createdAt, kind: "comment" as const, comment: c })),
    ...activities.map((a) => ({ at: a.createdAt, kind: "event" as const, event: a })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const rows =
    tab === "comments"
      ? merged.filter((r) => r.kind === "comment")
      : tab === "history"
        ? merged.filter((r) => r.kind === "event")
        : merged;

  return (
    <section className="discussion" data-expanded={expanded || undefined}>
      <div className="tabs">
        <button data-active={tab === "activity"} onClick={() => setTab("activity")}>
          Activity
        </button>
        <button data-active={tab === "comments"} onClick={() => setTab("comments")}>
          Comments {comments.length}
        </button>
        <button data-active={tab === "history"} onClick={() => setTab("history")}>
          History
        </button>

        <span className="grow" />

        <button
          className="discussion-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
          title={expanded ? "Back to the issue" : "Read the whole thread"}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="discussion-list">
        {rows.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Nothing here yet.</div>
        )}

        {rows.map((row) =>
          row.kind === "comment" ? (
            <div key={row.comment.id} style={{ display: "flex", gap: 11 }}>
              {row.comment.automated ? (
                <span
                  className="avatar"
                  style={{ width: 26, height: 26, background: "var(--hover-strong)", color: "var(--muted)" }}
                >
                  ⚙
                </span>
              ) : (
                <Avatar
                  name={row.comment.author?.name}
                  hue={row.comment.author?.avatarHue}
                  size={26}
                />
              )}
              <div
                className="grow"
                style={{ borderRadius: 13, background: "var(--card-alt)", padding: "12px 14px" }}
              >
                <div style={{ font: "400 12px/1.6 var(--sans)", color: "var(--text-2)" }}>
                  {!row.comment.automated && (
                    <b>{row.comment.author?.name.split(" ")[0] ?? "Someone"} — </b>
                  )}
                  <Mentions body={row.comment.body} />
                </div>
                {row.comment.attachments && row.comment.attachments.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <AttachmentList attachments={row.comment.attachments} compact />
                  </div>
                )}
                <div style={{ font: "400 10px var(--sans)", color: "var(--faint)", marginTop: 5 }}>
                  <TimeAgo at={row.comment.createdAt} />
                  {row.comment.automated ? " · automatic" : ""}
                </div>
              </div>
            </div>
          ) : (
            <div key={row.event.id} style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <span style={{ width: 26, flex: "none", display: "flex", justifyContent: "center" }}>
                <span
                  className="dot"
                  style={{
                    background: row.event.automatic ? "var(--success)" : "var(--hover-strong)",
                  }}
                />
              </span>
              <div style={{ font: "400 11.5px var(--sans)", color: "var(--muted)" }}>
                {row.event.actor && (
                  <span style={{ color: "var(--text-2)" }}>
                    {row.event.actor.name.split(" ")[0]}{" "}
                  </span>
                )}
                {row.event.message}
                {row.event.automatic ? " · automatic" : ""} · <TimeAgo at={row.event.createdAt} />
              </div>
            </div>
          ),
        )}
      </div>

      <div
        style={{
          borderRadius: 13,
          background: "var(--card)",
          border: "1px solid var(--hover)",
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach([...e.dataTransfer.files]);
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <textarea
          rows={1}
          placeholder="Write a comment… use @name to pull someone in"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            // How people actually attach a screenshot.
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              attach(files);
            }
          }}
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            resize: "none",
            font: "400 12px/1.6 var(--sans)",
            color: "var(--text)",
            minHeight: 22,
            maxHeight: 140,
          }}
        />
        {draft.trim() || pending.length ? (
          <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || uploading}>
            {busy ? <span className="spin" /> : "Send"}
          </button>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
            ⌘⏎
          </span>
        )}
        </div>

        {(pending.length > 0 || uploading) && (
          <AttachmentList
            attachments={pending}
            compact
            onRemove={(a) => setPending((prev) => prev.filter((x) => x.id !== a.id))}
          />
        )}

        <DropZone onFiles={attach} busy={uploading} label="Drop or paste a file, or" />
      </div>
    </section>
  );
}

/** Renders @handles in accent so a mention reads as one. */
function Mentions({ body }: { body: string }) {
  const parts = body.split(/(@[a-zA-Z0-9._-]{2,40})/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} style={{ color: "var(--accent)" }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
