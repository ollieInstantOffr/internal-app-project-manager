"use client";

import { useMemo, useRef, useState } from "react";
import { Avatar, Popover, ProjectDot, Toggle } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";
import { describeDue, formatEstimate, parseTaskInput } from "@/lib/tasks/parse";
import { DueMenu, EstimateMenu } from "./menus";
import type { TaskListRef } from "./types";

type Draft = {
  title: string;
  personId: string | null;
  due: Date | null;
  estimateMinutes: number | null;
  issueKey: string | null;
  note: string;
  listId: string | null;
  canRenegotiate: boolean;
};

const EMPTY: Draft = {
  title: "",
  personId: null,
  due: null,
  estimateMinutes: null,
  issueKey: null,
  note: "",
  listId: null,
  canRenegotiate: true,
};

/**
 * One composer for both shapes in the design: a single quiet line until the text
 * names someone, at which point it becomes the delegation card from 7b.
 */
export function Composer({
  now,
  listId,
  lists,
  onCreated,
}: {
  now: Date;
  listId: string | null;
  lists: TaskListRef[];
  onCreated: () => void;
}) {
  const { members, user } = useShell();
  const { toast, error } = useToast();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const others = useMemo(() => members.filter((m) => m.id !== user.id), [members, user.id]);

  /** `@dev` only means delegation if someone here answers to it. */
  const matchHandle = (handle: string) => {
    const needle = handle.toLowerCase();
    return (
      others.find((m) =>
        [
          m.email.split("@")[0].toLowerCase(),
          m.name.toLowerCase().replace(/\s+/g, ""),
          m.name.split(" ")[0].toLowerCase(),
        ].includes(needle),
      ) ?? null
    );
  };

  const parsed = useMemo(() => parseTaskInput(text, now), [text, now]);

  function expand(personId: string | null) {
    setDraft({
      ...EMPTY,
      title: parsed.title,
      listId,
      personId,
      due: parsed.dueDate,
      estimateMinutes: parsed.estimateMinutes,
      issueKey: parsed.issueKey,
    });
    setText("");
  }

  async function quickAdd() {
    if (!parsed.title) return;

    // A recognised @handle turns the line into a delegation, not a private task.
    if (parsed.handle) {
      const person = matchHandle(parsed.handle);
      if (!person) {
        error(`No one here goes by @${parsed.handle}`);
        return;
      }
      expand(person.id);
      return;
    }

    setSaving(true);
    try {
      await api.post("/api/tasks", { input: text, listId });
      setText("");
      onCreated();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not add that task");
    } finally {
      setSaving(false);
      input.current?.focus();
    }
  }

  async function send() {
    if (!draft?.title.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/tasks", {
        input: draft.title,
        listId: draft.personId ? null : draft.listId,
        note: draft.note.trim() || null,
        delegateToId: draft.personId,
        dueDate: draft.due ? draft.due.toISOString() : null,
        estimateMinutes: draft.estimateMinutes,
        issueKey: draft.issueKey,
        canRenegotiate: draft.canRenegotiate,
      });
      const person = others.find((m) => m.id === draft.personId);
      toast(person ? `Sent to ${person.name.split(" ")[0]}` : "Task added");
      setDraft(null);
      setNoteOpen(false);
      onCreated();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not send that task");
    } finally {
      setSaving(false);
    }
  }

  if (draft) {
    const person = others.find((m) => m.id === draft.personId) ?? null;
    const due = describeDue(draft.due, now);
    const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));

    return (
      <div className="delegate-card">
        <div className="delegate-title-row">
          <span className="square" aria-hidden />
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (e.key === "Escape") setDraft(null);
            }}
            placeholder="What needs doing?"
            aria-label="Task"
          />
        </div>

        <div className="delegate-chips">
          <Popover
            width={230}
            trigger={({ toggle }) =>
              person ? (
                <button className="dchip" data-person="true" onClick={toggle}>
                  <Avatar name={person.name} hue={person.avatarHue} size={18} />
                  {person.name}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Keep this task"
                    onClick={(e) => {
                      e.stopPropagation();
                      patch({ personId: null });
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.stopPropagation();
                      patch({ personId: null });
                    }}
                  >
                    ✕
                  </span>
                </button>
              ) : (
                <button className="dchip" data-dashed="true" onClick={toggle}>
                  + delegate
                </button>
              )
            }
          >
            {(close) => (
              <>
                <div className="eyebrow menu-label">Send to</div>
                {others.map((m) => (
                  <button
                    key={m.id}
                    className="menu-item"
                    data-active={m.id === draft.personId}
                    onClick={() => {
                      patch({ personId: m.id });
                      close();
                    }}
                  >
                    <Avatar name={m.name} hue={m.avatarHue} size={18} />
                    {m.name}
                  </button>
                ))}
              </>
            )}
          </Popover>

          <Popover
            width={190}
            trigger={({ toggle }) => (
              <button className="dchip" onClick={toggle}>
                {due ? `Due ${due.label}` : "Add a date"} ⌄
              </button>
            )}
          >
            {(close) => <DueMenu now={now} close={close} onPick={(date) => patch({ due: date })} />}
          </Popover>

          <Popover
            width={160}
            trigger={({ toggle }) => (
              <button className="dchip" onClick={toggle}>
                {formatEstimate(draft.estimateMinutes) ?? "Estimate"} ⌄
              </button>
            )}
          >
            {(close) => (
              <EstimateMenu close={close} onPick={(minutes) => patch({ estimateMinutes: minutes })} />
            )}
          </Popover>

          <Popover
            width={220}
            trigger={({ toggle }) => (
              <button className="dchip" onClick={toggle}>
                {draft.issueKey ? `refs ${draft.issueKey}` : "+ refs"} ⌄
              </button>
            )}
          >
            {(close) => (
              <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="eyebrow">Reference an issue</div>
                <input
                  className="input input-sm mono"
                  autoFocus
                  defaultValue={draft.issueKey ?? ""}
                  placeholder="WEB-408"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
                    patch({ issueKey: value || null });
                    close();
                  }}
                  aria-label="Issue key"
                />
                <div className="tasks-aside-note" style={{ padding: 0 }}>
                  Context only — the issue never changes.
                </div>
              </div>
            )}
          </Popover>

          {!noteOpen && (
            <button className="dchip" data-dashed="true" onClick={() => setNoteOpen(true)}>
              + note
            </button>
          )}
          {!draft.personId && lists.length > 0 && (
            <Popover
              width={200}
              trigger={({ toggle }) => (
                <button className="dchip" onClick={toggle}>
                  {lists.find((l) => l.id === draft.listId)?.name ?? "No list"} ⌄
                </button>
              )}
            >
              {(close) => (
                <>
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      className="menu-item"
                      data-active={l.id === draft.listId}
                      onClick={() => {
                        patch({ listId: l.id });
                        close();
                      }}
                    >
                      <ProjectDot color={`var(--list-${l.color})`} size={8} />
                      {l.name}
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button
                    className="menu-item"
                    onClick={() => {
                      patch({ listId: null });
                      close();
                    }}
                  >
                    No list
                  </button>
                </>
              )}
            </Popover>
          )}
        </div>

        {noteOpen && (
          <textarea
            className="delegate-textarea"
            autoFocus
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="Anything they should know"
            aria-label="Note"
          />
        )}

        <div style={{ height: 1, background: "var(--line-strong)" }} />

        <div className="delegate-foot">
          {draft.personId && (
            <div className="grow" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle
                on={draft.canRenegotiate}
                onChange={(next) => patch({ canRenegotiate: next })}
                label="They can decline or renegotiate the date"
              />
              <span style={{ font: "400 11.5px var(--sans)", color: "var(--text-2)" }}>
                They can decline or renegotiate the date
              </span>
            </div>
          )}
          {!draft.personId && <span className="grow" />}
          <button className="btn-onaccent" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ borderRadius: 20, padding: "0 15px" }}
            onClick={send}
            disabled={saving || !draft.title.trim()}
          >
            {draft.personId ? "Delegate" : "Add task"}
          </button>
        </div>

        {draft.personId && person && (
          <div className="delegate-note">
            {person.name.split(" ")[0]} sees this in their Tasks page and nowhere else — no board
            card, no sprint, no notification to the team.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="task-composer" onClick={() => input.current?.focus()}>
      <span className="ring" aria-hidden />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") quickAdd();
          if (e.key === "Escape") setText("");
        }}
        placeholder="Add a task…"
        aria-label="Add a task"
        disabled={saving}
      />
      {!text && (
        <span className="composer-hint">
          <span className="composer-sep"> · </span>
          <code>@name</code> delegates
          <span className="composer-sep"> · </span>
          <code>tue</code> sets a date
        </span>
      )}
      {text && parsed.title !== text.trim() && (
        <span className="mono" style={{ fontSize: 10.5, color: "var(--accent)" }}>
          {[
            parsed.handle ? `@${parsed.handle}` : null,
            describeDue(parsed.dueDate, now)?.label,
            formatEstimate(parsed.estimateMinutes),
            parsed.issueKey,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
        ⏎
      </span>
    </div>
  );
}
