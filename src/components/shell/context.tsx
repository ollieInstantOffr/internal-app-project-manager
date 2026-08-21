"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/types";

export type ShellProject = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type ShellList = {
  id: string;
  name: string;
  color: string;
  count: number;
};

export type ShellMember = {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  role: Role;
};

export type ShellData = {
  org: { id: string; name: string; slug: string };
  user: { id: string; name: string; email: string; avatarHue: number; emailVerified: boolean };
  role: Role;
  projects: ShellProject[];
  members: ShellMember[];
  inboxCount: number;
  taskCount: number;
  taskLists: ShellList[];
};

const Ctx = createContext<ShellData | null>(null);

export function ShellProvider({ value, children }: { value: ShellData; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}
