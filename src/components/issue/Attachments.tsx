"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/client";

export type AttachmentRow = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy?: { name: string } | null;
};

const IMAGE = /^image\//;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads run against the issue, not the comment, because a screenshot is
 * pasted before the comment it belongs to exists. The comment claims them when
 * it's posted; anything never claimed still shows on the issue itself.
 */
export function useUploader(issueKey: string) {
  const { error } = useToast();
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (files: File[]): Promise<AttachmentRow[]> => {
      if (!files.length) return [];
      setBusy(true);
      const done: AttachmentRow[] = [];

      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch(`/api/issues/${issueKey}/attachments`, {
            method: "POST",
            body: form,
          });
          const text = await res.text();
          const data = text ? JSON.parse(text) : {};
          if (!res.ok) throw new ApiError(res.status, data.error ?? "Upload failed");
          done.push(data.attachment as AttachmentRow);
        } catch (err) {
          error(
            err instanceof ApiError
              ? `${file.name}: ${err.message}`
              : `Couldn't upload ${file.name}`,
          );
        }
      }

      setBusy(false);
      return done;
    },
    [issueKey, error],
  );

  return { upload, busy };
}

/** A file list with thumbnails for images. Used on the issue and under comments. */
export function AttachmentList({
  attachments,
  onRemove,
  compact,
}: {
  attachments: AttachmentRow[];
  onRemove?: (attachment: AttachmentRow) => void;
  compact?: boolean;
}) {
  if (!attachments.length) return null;

  return (
    <div className="att-grid" data-compact={compact || undefined}>
      {attachments.map((attachment) => {
        const href = `/api/attachments/${attachment.id}`;
        const isImage = IMAGE.test(attachment.mimeType);

        return (
          <div key={attachment.id} className="att">
            <a href={href} target="_blank" rel="noreferrer" className="att-link">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={href} alt={attachment.filename} className="att-thumb" loading="lazy" />
              ) : (
                <span className="att-icon" aria-hidden>
                  {extOf(attachment.filename)}
                </span>
              )}
              <span className="att-meta">
                <span className="att-name truncate">{attachment.filename}</span>
                <span className="att-size">{formatBytes(attachment.size)}</span>
              </span>
            </a>
            {onRemove && (
              <button
                className="att-remove"
                onClick={() => onRemove(attachment)}
                aria-label={`Remove ${attachment.filename}`}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function extOf(filename: string) {
  const ext = filename.split(".").pop() ?? "";
  return (ext.length <= 4 ? ext : ext.slice(0, 4)).toUpperCase() || "FILE";
}

/** A drop target that also takes clicks and pastes. */
export function DropZone({
  onFiles,
  busy,
  label = "Drop files here, paste a screenshot, or",
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className="att-drop"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <span>{busy ? "Uploading…" : label}</span>
      <button className="att-browse" onClick={() => input.current?.click()} disabled={busy}>
        browse
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
