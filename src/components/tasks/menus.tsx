"use client";

import { useState } from "react";
import { formatEstimate } from "@/lib/tasks/parse";

/** Same handful of dates everywhere a due date can be set. */
export function dueChoices(now: Date) {
  const at = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(23, 59, 59, 999);
    return date;
  };
  const toFriday = (5 - now.getDay() + 7) % 7 || 7;

  return [
    { label: "Today", date: at(0) },
    { label: "Tomorrow", date: at(1) },
    { label: "This Friday", date: at(toFriday) },
    { label: "Next week", date: at(7) },
  ];
}

export function DueMenu({
  now,
  onPick,
  close,
}: {
  now: Date;
  onPick: (date: Date | null) => void;
  close: () => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <>
      {dueChoices(now).map((choice) => (
        <button
          key={choice.label}
          className="menu-item"
          onClick={() => {
            onPick(choice.date);
            close();
          }}
        >
          {choice.label}
        </button>
      ))}
      <div className="menu-sep" />
      <div style={{ padding: "6px 10px" }}>
        <input
          type="date"
          className="input input-sm"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !custom) return;
            const [y, m, d] = custom.split("-").map(Number);
            onPick(new Date(y, m - 1, d, 23, 59, 59, 999));
            close();
          }}
          aria-label="Pick a date"
        />
      </div>
      <button
        className="menu-item"
        onClick={() => {
          onPick(null);
          close();
        }}
      >
        No date
      </button>
    </>
  );
}

const ESTIMATES = [15, 30, 45, 60, 120, 240];

export function EstimateMenu({
  onPick,
  close,
}: {
  onPick: (minutes: number | null) => void;
  close: () => void;
}) {
  return (
    <>
      {ESTIMATES.map((minutes) => (
        <button
          key={minutes}
          className="menu-item"
          onClick={() => {
            onPick(minutes);
            close();
          }}
        >
          {formatEstimate(minutes)}
        </button>
      ))}
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          onPick(null);
          close();
        }}
      >
        No estimate
      </button>
    </>
  );
}

export function SnoozeMenu({
  onPick,
  close,
}: {
  onPick: (until: Date) => void;
  close: () => void;
}) {
  const pick = (hours: number) => {
    const until = new Date();
    until.setHours(until.getHours() + hours);
    onPick(until);
    close();
  };

  return (
    <>
      <button className="menu-item" onClick={() => pick(1)}>
        For an hour
      </button>
      <button className="menu-item" onClick={() => pick(4)}>
        Until this afternoon
      </button>
      <button className="menu-item" onClick={() => pick(24)}>
        Until tomorrow
      </button>
      <button className="menu-item" onClick={() => pick(24 * 7)}>
        Until next week
      </button>
    </>
  );
}
