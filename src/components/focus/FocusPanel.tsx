"use client";

import { useCallback, useEffect, useState } from "react";
import { Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/client";
import { clock, humanMinutes, targetOf, useFocus, type FocusTarget } from "./context";

const LENGTHS = [25, 45, 60, 90];

type Targets = {
  issues: { id: string; key: string; title: string; status: string; project: { color: string } }[];
  tasks: { id: string; title: string; list: { color: string } | null }[];
};

/** The 352px card from 8a — setup before a session, controls during one. */
export function FocusPanel() {
  const { session, prefs, state, remaining, elapsed, start, act, extend, savePrefs, setOpen, suggest } =
    useFocus();

  const running = state === "RUNNING" || state === "PAUSED";
  const [length, setLength] = useState(prefs.lastLengthMinutes);
  const [target, setTarget] = useState<FocusTarget | null>(suggest);
  const [picking, setPicking] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (running) return;
    setLength(prefs.lastLengthMinutes);
    setTarget(suggest);
  }, [running, prefs.lastLengthMinutes, suggest]);

  const planned = running && session ? session.plannedMinutes : length;
  const shown = running ? remaining : planned * 60;
  const pct = running ? Math.min(100, (elapsed / (planned * 60)) * 100) : 0;
  const live = running ? targetOf(session) : target;

  const adjust = (step: number) => {
    if (running) extend(step);
    else setLength((n) => Math.min(240, Math.max(5, n + step)));
  };

  async function begin(replace = false) {
    try {
      await start({ plannedMinutes: length, target, replace });
      setConflict(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
    }
  }

  return (
    <div className="focus-panel" role="dialog" aria-label="Focus session">
      <div className="row-flex">
        <div className="focus-panel-title grow">
          {session?.kind === "BREAK" ? "Break" : "Focus session"}
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
          ⌥T
        </span>
      </div>

      <div className="focus-dial-wrap">
        <div
          className="focus-dial"
          data-paused={state === "PAUSED"}
          style={{ ["--pct" as string]: `${pct}%` }}
        >
          <div className="focus-dial-inner">
            <div className="focus-dial-time">{clock(shown)}</div>
            <div className="focus-dial-of">of {planned} min</div>
          </div>
        </div>
      </div>

      <div className="focus-steps">
        <button className="focus-step" onClick={() => adjust(-5)} aria-label="Five minutes less">
          −
        </button>
        <span className="mono focus-step-label">5 min steps</span>
        <button className="focus-step" onClick={() => adjust(5)} aria-label="Five minutes more">
          +
        </button>
      </div>

      {!running && (
        <div className="focus-block">
          <div className="eyebrow">Length</div>
          <div className="focus-lengths">
            {LENGTHS.map((minutes) => (
              <button
                key={minutes}
                className="focus-length mono"
                data-active={!custom && length === minutes}
                onClick={() => {
                  setCustom(false);
                  setLength(minutes);
                }}
              >
                {minutes}
              </button>
            ))}
            <button
              className="focus-length focus-length-custom"
              data-active={custom || !LENGTHS.includes(length)}
              onClick={() => setCustom(true)}
            >
              Custom
            </button>
          </div>
          {(custom || !LENGTHS.includes(length)) && (
            <input
              className="input input-sm mono"
              type="number"
              min={5}
              max={240}
              step={5}
              value={length}
              onChange={(e) => setLength(Math.min(240, Math.max(5, Number(e.target.value) || 5)))}
              aria-label="Custom length in minutes"
            />
          )}
        </div>
      )}

      <div className="focus-block">
        <div className="eyebrow">Focusing on</div>
        {picking ? (
          <TargetPicker
            onPick={(next) => {
              setTarget(next);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        ) : (
          <button
            className="focus-target"
            onClick={() => !running && setPicking(true)}
            disabled={running}
          >
            <span
              className="focus-target-dot"
              style={{ background: live?.color ?? "var(--line-strong)" }}
              aria-hidden
            />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="focus-target-title truncate">{live?.label ?? "Nothing selected"}</span>
              {live?.sub && <span className="focus-target-sub mono">{live.sub}</span>}
            </span>
            {!running && <span style={{ color: "var(--muted)", fontSize: 11 }}>⌄</span>}
          </button>
        )}
        {!running && (
          <div className="focus-hint">Optional — leave empty for an untracked session</div>
        )}
        {!running && target && (
          <button className="focus-clear" onClick={() => setTarget(null)}>
            Clear
          </button>
        )}
      </div>

      <div className="focus-block" style={{ gap: 10 }}>
        <Setting
          on={prefs.pauseNotifications}
          label="Pause notifications while focusing"
          onChange={(next) => savePrefs({ pauseNotifications: next })}
        />
        <Setting
          on={prefs.suggestBreak}
          label={`Suggest a ${10} min break after`}
          onChange={(next) => savePrefs({ suggestBreak: next })}
        />
        <Setting
          on={prefs.shareBadge}
          label='Show "focusing" badge to teammates'
          onChange={(next) => savePrefs({ shareBadge: next })}
        />
      </div>

      {conflict ? (
        <div className="focus-conflict">
          <div>A session is already running. End it and start this one?</div>
          <div style={{ display: "flex", gap: 9 }}>
            <button className="btn btn-primary grow" onClick={() => begin(true)}>
              End it and start
            </button>
            <button className="btn btn-ghost" onClick={() => setConflict(false)}>
              Keep going
            </button>
          </div>
        </div>
      ) : running ? (
        <div className="focus-actions">
          <button
            className="focus-primary"
            onClick={() => act(state === "PAUSED" ? "resume" : "pause")}
          >
            {state === "PAUSED" ? "Resume" : "Pause"}
          </button>
          <button
            className="focus-secondary"
            onClick={() => {
              act("end");
              setOpen(false);
            }}
          >
            End
          </button>
        </div>
      ) : (
        <div className="focus-actions">
          <button className="focus-primary" onClick={() => begin()}>
            Start {humanMinutes(length)}
          </button>
        </div>
      )}
    </div>
  );
}

function Setting({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <Toggle on={on} onChange={onChange} label={label} />
      <span
        style={{
          font: "400 11.5px var(--sans)",
          flex: 1,
          color: on ? "var(--text)" : "var(--text-3)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function TargetPicker({
  onPick,
  onClose,
}: {
  onPick: (target: FocusTarget | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Targets>({ issues: [], tasks: [] });

  const load = useCallback((query: string) => {
    api
      .get<Targets>(`/api/focus/targets?q=${encodeURIComponent(query)}`)
      .then(setResults)
      .catch(() => setResults({ issues: [], tasks: [] }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(q), q ? 180 : 0);
    return () => clearTimeout(timer);
  }, [q, load]);

  return (
    <div className="focus-picker">
      <input
        className="input input-sm"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder="Search issues and tasks…"
        aria-label="Search for something to focus on"
      />
      <div className="focus-picker-list">
        {results.issues.map((issue) => (
          <button
            key={issue.id}
            className="menu-item"
            onClick={() =>
              onPick({
                kind: "issue",
                id: issue.id,
                label: issue.title,
                sub: issue.key,
                color: issue.project.color,
              })
            }
          >
            <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
              {issue.key}
            </span>
            <span className="truncate">{issue.title}</span>
          </button>
        ))}
        {results.tasks.map((task) => (
          <button
            key={task.id}
            className="menu-item"
            onClick={() =>
              onPick({
                kind: "task",
                id: task.id,
                label: task.title,
                sub: "Task",
                color: task.list ? `var(--list-${task.list.color})` : "var(--accent)",
              })
            }
          >
            <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
              task
            </span>
            <span className="truncate">{task.title}</span>
          </button>
        ))}
        {results.issues.length === 0 && results.tasks.length === 0 && (
          <div className="focus-hint" style={{ padding: "8px 10px" }}>
            Nothing matched.
          </div>
        )}
      </div>
    </div>
  );
}
