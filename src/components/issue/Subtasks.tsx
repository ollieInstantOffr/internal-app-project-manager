"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Avatar, Check, Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { useToast } from "@/components/Toast";

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
  assignee: { id: string; name: string; avatarHue: number } | null;
};

export function Subtasks({ issueKey, subtasks }: { issueKey: string; subtasks: Subtask[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { members } = useShell();
  const [items, setItems] = useState(subtasks);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const done = items.filter((s) => s.done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  async function toggle(subtask: Subtask) {
    setItems((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, done: !s.done } : s)));
    try {
      await api.patch(`/api/subtasks/${subtask.id}`, { done: !subtask.done });
      router.refresh();
    } catch {
      setItems((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, done: subtask.done } : s)));
      toast("Couldn't update that subtask");
    }
  }

  async function assign(subtask: Subtask, userId: string | null) {
    const person = userId ? (members.find((m) => m.id === userId) ?? null) : null;
    setItems((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, assignee: person } : s)));
    await api.patch(`/api/subtasks/${subtask.id}`, { assigneeId: userId }).catch(() => {});
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const title = draft.trim();
    setDraft("");
    try {
      const res = await api.post<{ subtask: Subtask }>(`/api/issues/${issueKey}/subtasks`, { title });
      setItems((prev) => [...prev, res.subtask]);
      router.refresh();
    } catch {
      toast("Couldn't add that subtask");
    }
  }

  async function remove(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.del(`/api/subtasks/${id}`);
      router.refresh();
    } catch {
      setItems(previous);
    }
  }

  return (
    <section
      className="card"
      style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="row-flex">
        <h2 style={{ font: "600 12px var(--display)" }}>Subtasks</h2>
        {items.length > 0 && (
          <>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted)" }}>
              {done}/{items.length}
            </span>
            <div className="bar bar-sm" style={{ width: 110 }}>
              <i style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
      </div>

      {items.map((subtask) => (
        <div
          key={subtask.id}
          className="row-flex"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: subtask.done ? "oklch(0.255 0.012 285)" : "var(--raised)",
          }}
        >
          <Check on={subtask.done} onChange={() => toggle(subtask)} label={subtask.title} />
          <span
            className="grow"
            style={{
              font: "400 12px var(--sans)",
              color: subtask.done ? "var(--muted-2)" : "var(--text)",
              textDecoration: subtask.done ? "line-through" : undefined,
            }}
          >
            {subtask.title}
          </span>

          <Popover
            align="right"
            width={200}
            trigger={({ toggle: t }) => (
              <button onClick={t} aria-label="Assign subtask">
                <Avatar name={subtask.assignee?.name} hue={subtask.assignee?.avatarHue} size={20} />
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    assign(subtask, null);
                    close();
                  }}
                >
                  Unassigned
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    className="menu-item"
                    onClick={() => {
                      assign(subtask, m.id);
                      close();
                    }}
                  >
                    <Avatar name={m.name} hue={m.avatarHue} size={18} />
                    {m.name}
                  </button>
                ))}
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  style={{ color: "var(--danger)" }}
                  onClick={() => {
                    remove(subtask.id);
                    close();
                  }}
                >
                  Delete subtask
                </button>
              </>
            )}
          </Popover>
        </div>
      ))}

      {adding ? (
        <form onSubmit={add}>
          <input
            className="input input-sm"
            autoFocus
            placeholder="What's the next step?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !draft && setAdding(false)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
        </form>
      ) : (
        <button
          className="inline-compose"
          style={{ padding: "8px 10px" }}
          onClick={() => setAdding(true)}
        >
          + Add subtask
        </button>
      )}
    </section>
  );
}
