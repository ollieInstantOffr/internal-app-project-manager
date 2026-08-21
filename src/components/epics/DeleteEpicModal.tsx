"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";

/**
 * Deleting an epic unlinks every issue in it, and no toast can put those links
 * back — so this is the one destructive action in the app that asks first.
 */
export function DeleteEpicModal({
  epic,
  onClose,
  onDeleted,
}: {
  epic: { id: string; name: string; issueCount: number };
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/epics/${epic.id}`);
      toast(`Deleted "${epic.name}"`);
      onClose();
      onDeleted?.();
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that epic");
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete epic" onClose={onClose}>
      <div style={{ font: "400 13px/1.65 var(--sans)", color: "var(--text-2)" }}>
        <b style={{ color: "var(--text)" }}>{epic.name}</b> will be removed from the roadmap.
      </div>

      <div
        style={{
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          padding: "12px 13px",
          font: "400 12px/1.6 var(--sans)",
          color: "var(--muted)",
        }}
      >
        {epic.issueCount === 0 ? (
          <>No issues are grouped under it, so nothing else changes.</>
        ) : (
          <>
            Its {epic.issueCount} issue{epic.issueCount === 1 ? "" : "s"} will stay exactly where
            they are — they just lose this grouping. That can&rsquo;t be undone from here.
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 9 }}>
        <button type="button" className="btn btn-outline grow" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger grow" onClick={remove} disabled={busy}>
          {busy ? <span className="spin" /> : "Delete epic"}
        </button>
      </div>
    </Modal>
  );
}
