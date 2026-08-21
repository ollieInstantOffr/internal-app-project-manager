"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar, Bar, Modal, Popover, Empty } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { Role } from "@/lib/types";
import { ROLE_LABEL, accent } from "@/lib/constants";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  githubLogin: string | null;
  verified: boolean;
  role: Role;
  teams: { id: string; name: string }[];
  openIssues: number;
  /** Only ever true for people who turned the badge on themselves. */
  focusing: boolean;
};

export type InviteRow = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  invitedBy: string | null;
};

export type TeamRow = {
  id: string;
  name: string;
  members: { id: string; name: string; avatarHue: number }[];
};

const PAGE = 8;

export function Members({
  members,
  invites,
  teams,
  inviteLinkBase,
  openInvite,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  teams: TeamRow[];
  inviteLinkBase: string;
  openInvite?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, role: myRole } = useShell();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [inviting, setInviting] = useState(!!openInvite);
  const [newTeam, setNewTeam] = useState(false);

  useEffect(() => {
    if (openInvite) setInviting(true);
  }, [openInvite]);

  const isAdmin = myRole === Role.OWNER || myRole === Role.ADMIN;

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (teamFilter && !m.teams.some((t) => t.id === teamFilter)) return false;
      if (query && !`${m.name} ${m.email} ${m.githubLogin ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [members, roleFilter, teamFilter, query]);

  const shown = showAll ? filtered : filtered.slice(0, PAGE);
  const maxOpen = Math.max(1, ...members.map((m) => m.openIssues));

  async function changeRole(member: MemberRow, role: Role) {
    try {
      await api.patch(`/api/members/${member.id}`, { role });
      toast(`${member.name.split(" ")[0]} is now ${ROLE_LABEL[role].toLowerCase()}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that role");
    }
  }

  async function remove(member: MemberRow) {
    try {
      await api.del(`/api/members/${member.id}`);
      toast(`${member.name.split(" ")[0]} removed — their issues are now unassigned`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove them");
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Members</h1>
          <div className="panel-sub">
            {members.length} member{members.length === 1 ? "" : "s"} · unlimited on free
          </div>
        </div>
        <div className="grow" />
        <button
          className="btn btn-ghost"
          onClick={() => {
            navigator.clipboard?.writeText(inviteLinkBase);
            toast("Invite page copied");
          }}
        >
          Copy invite link
        </button>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            Invite
          </button>
        )}
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 14 }}>
        <div style={{ display: "flex", gap: 9 }}>
          <input
            className="input input-sm"
            style={{ maxWidth: 280, height: 36 }}
            placeholder="Search members"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <Popover
            width={180}
            trigger={({ toggle }) => (
              <button className="btn btn-ghost" style={{ height: 36 }} onClick={toggle}>
                Role: {roleFilter ? ROLE_LABEL[roleFilter] : "all"} ⌄
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    setRoleFilter(null);
                    close();
                  }}
                >
                  All roles
                </button>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <button
                    key={r}
                    className="menu-item"
                    data-active={roleFilter === r}
                    onClick={() => {
                      setRoleFilter(r);
                      close();
                    }}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </>
            )}
          </Popover>

          <Popover
            width={180}
            trigger={({ toggle }) => (
              <button className="btn btn-ghost" style={{ height: 36 }} onClick={toggle}>
                Team: {teamFilter ? (teams.find((t) => t.id === teamFilter)?.name ?? "all") : "all"} ⌄
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    setTeamFilter(null);
                    close();
                  }}
                >
                  All teams
                </button>
                {teams.map((t) => (
                  <button
                    key={t.id}
                    className="menu-item"
                    data-active={teamFilter === t.id}
                    onClick={() => {
                      setTeamFilter(t.id);
                      close();
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </>
            )}
          </Popover>
        </div>

        <div className="table">
          <div className="table-head">
            <div style={{ flex: 2.2 }}>Name</div>
            <div style={{ flex: 1.2 }}>GitHub</div>
            <div style={{ flex: 1.1 }}>Teams</div>
            <div style={{ width: 100 }}>Role</div>
            <div style={{ width: 110 }}>Open work</div>
            <div style={{ width: 16 }} />
          </div>

          {shown.map((member) => (
            <div key={member.id} className="table-row">
              <div style={{ flex: 2.2, display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <Avatar name={member.name} hue={member.avatarHue} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ font: "600 12.5px var(--sans)" }}>
                    {member.name}
                    {member.id === user.id && (
                      <span style={{ fontWeight: 400, color: "var(--muted-2)" }}> (you)</span>
                    )}
                    {member.focusing && (
                      <span
                        className="pill"
                        title="Heads-down right now"
                        style={{
                          marginLeft: 7,
                          fontSize: 9.5,
                          padding: "1px 7px",
                          background: "var(--accent-wash-2)",
                          color: "var(--accent-text)",
                          fontWeight: 600,
                        }}
                      >
                        Focusing
                      </span>
                    )}
                  </div>
                  <div className="truncate" style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
                    {member.email}
                  </div>
                </div>
              </div>

              <div className="mono truncate" style={{ flex: 1.2, fontSize: 11, color: "var(--text-3)" }}>
                {member.githubLogin ? (
                  <>
                    @{member.githubLogin}{" "}
                    {member.verified && <span style={{ color: "var(--success)" }}>✓</span>}
                  </>
                ) : (
                  <span style={{ color: "var(--faintest)" }}>—</span>
                )}
              </div>

              <div style={{ flex: 1.1, display: "flex", gap: 5, flexWrap: "wrap" }}>
                {member.teams.length ? (
                  member.teams.map((t) => (
                    <span key={t.id} className="pill" style={{ fontSize: 10, padding: "1px 8px" }}>
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--faintest)", fontSize: 11 }}>—</span>
                )}
              </div>

              <div style={{ width: 100 }}>
                <span
                  className="pill"
                  style={
                    member.role === Role.OWNER
                      ? { background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600, fontSize: 10 }
                      : { background: "var(--hover-strong)", color: "var(--text-2)", fontWeight: 600, fontSize: 10 }
                  }
                >
                  {ROLE_LABEL[member.role]}
                </span>
              </div>

              <div style={{ width: 110 }}>
                <Bar
                  value={(member.openIssues / maxOpen) * 100}
                  size="sm"
                  color={accent(["lime", "blue", "amber", "violet"][member.avatarHue % 4]).base}
                />
                <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)", marginTop: 3 }}>
                  {member.openIssues} issue{member.openIssues === 1 ? "" : "s"}
                </div>
              </div>

              <div style={{ width: 16 }}>
                {isAdmin && (
                  <Popover
                    align="right"
                    width={200}
                    trigger={({ toggle }) => (
                      <button aria-label={`Manage ${member.name}`} style={{ color: "var(--muted-2)" }} onClick={toggle}>
                        ⋯
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <div className="eyebrow menu-label">Role</div>
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <button
                            key={r}
                            className="menu-item"
                            data-active={member.role === r}
                            onClick={() => {
                              changeRole(member, r);
                              close();
                            }}
                          >
                            {ROLE_LABEL[r]}
                          </button>
                        ))}
                        <div className="menu-sep" />
                        <div className="eyebrow menu-label">Teams</div>
                        {teams.map((t) => {
                          const inTeam = member.teams.some((x) => x.id === t.id);
                          return (
                            <button
                              key={t.id}
                              className="menu-item"
                              data-active={inTeam}
                              onClick={async () => {
                                await api
                                  .patch(`/api/teams/${t.id}`,
                                    inTeam ? { removeUserId: member.id } : { addUserId: member.id },
                                  )
                                  .catch(() => {});
                                router.refresh();
                                close();
                              }}
                            >
                              {inTeam ? "✓ " : ""}
                              {t.name}
                            </button>
                          );
                        })}
                        <div className="menu-sep" />
                        <button
                          className="menu-item"
                          style={{ color: "var(--danger)" }}
                          onClick={() => {
                            remove(member);
                            close();
                          }}
                        >
                          Remove from organization
                        </button>
                      </>
                    )}
                  </Popover>
                )}
              </div>
            </div>
          ))}

          {invites.map((invite) => (
            <div key={invite.id} className="table-row" style={{ background: "oklch(0.255 0.012 285)" }}>
              <div style={{ flex: 2.2, display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar size={30} />
                <div>
                  <div style={{ font: "500 12.5px var(--sans)", color: "var(--text-3)" }}>
                    {invite.email}
                  </div>
                  <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
                    invited {relativeTime(invite.createdAt)}
                    {invite.invitedBy ? ` by ${invite.invitedBy.split(" ")[0]}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1.2, color: "var(--faintest)", fontSize: 11 }}>—</div>
              <div style={{ flex: 1.1, color: "var(--faintest)", fontSize: 11 }}>—</div>
              <div style={{ width: 100 }}>
                <span className="pill pill-outline" style={{ fontSize: 10, fontWeight: 600 }}>
                  Pending
                </span>
              </div>
              <div style={{ width: 110 }}>
                {isAdmin && (
                  <button
                    style={{ font: "500 11px var(--sans)", color: "var(--accent)" }}
                    onClick={async () => {
                      await api.post(`/api/invites/${invite.id}/resend`).catch(() => {});
                      toast(`Invite resent to ${invite.email}`);
                    }}
                  >
                    Resend
                  </button>
                )}
              </div>
              <div style={{ width: 16 }}>
                {isAdmin && (
                  <button
                    aria-label="Revoke invite"
                    style={{ color: "var(--muted-2)" }}
                    onClick={async () => {
                      await api.del(`/api/invites/${invite.id}`).catch(() => {});
                      toast("Invite revoked");
                      router.refresh();
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          {filtered.length > PAGE && (
            <button
              style={{ padding: "11px 16px", font: "400 11.5px var(--sans)", color: "var(--muted-2)" }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show fewer" : `Show ${filtered.length - PAGE} more`}
            </button>
          )}

          {filtered.length === 0 && <Empty title="Nobody matches that" />}
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <section className="card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
            <h2 style={{ font: "600 13px var(--display)" }}>Teams</h2>
            <p style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted)", margin: 0 }}>
              Groups used for filters and default assignees — not a permission layer.
            </p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {teams.map((t) => (
                <span key={t.id} className="pill" style={{ padding: "3px 11px", fontWeight: 500, fontSize: 11 }}>
                  {t.name} · {t.members.length}
                </span>
              ))}
              {isAdmin && (
                <button
                  className="pill pill-outline"
                  style={{ padding: "3px 11px", fontWeight: 500, fontSize: 11 }}
                  onClick={() => setNewTeam(true)}
                >
                  + New team
                </button>
              )}
            </div>
          </section>

          <section className="card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
            <h2 style={{ font: "600 13px var(--display)" }}>Roles</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <RoleLine name="Owner" detail="billing, delete org" />
              <RoleLine name="Admin" detail="settings, integrations, members" />
              <RoleLine name="Member" detail="everything else" />
            </div>
            <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted-2)", marginTop: "auto" }}>
              Deliberately not configurable.
            </div>
          </section>
        </div>
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {newTeam && <NewTeamModal onClose={() => setNewTeam(false)} />}
    </main>
  );
}

function RoleLine({ name, detail }: { name: string; detail: string }) {
  return (
    <div style={{ font: "400 11px var(--sans)", color: "var(--text-3)" }}>
      <b>{name}</b> — {detail}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  return (
    <Modal title="Invite teammates" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const res = await api.post<{ sent: string[]; skipped: string[] }>("/api/invites", {
              emails,
              role,
            });
            onClose();
            router.refresh();
            toast(
              `${res.sent.length} invite${res.sent.length === 1 ? "" : "s"} sent${
                res.skipped.length ? `, ${res.skipped.length} already a member` : ""
              }`,
            );
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't send those invites");
            setBusy(false);
          }
        }}
      >
        {error && <div className="form-error">{error}</div>}

        <div className="field">
          <label className="label" htmlFor="inv-emails">
            Emails
          </label>
          <textarea
            id="inv-emails"
            className="textarea"
            autoFocus
            placeholder="first@company.com, second@company.com"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
            {emails.length
              ? `${emails.length} address${emails.length === 1 ? "" : "es"}`
              : "Separate with commas, spaces or newlines"}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="inv-role">
            Role
          </label>
          <select id="inv-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[])
              .filter((r) => r !== Role.OWNER)
              .map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || emails.length === 0}>
            {busy ? <span className="spin" /> : `Send ${emails.length || ""} invite${emails.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewTeamModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New team" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/teams", { name: name.trim() });
            onClose();
            router.refresh();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that team");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="team-name">
            Name
          </label>
          <input
            id="team-name"
            className="input"
            autoFocus
            required
            placeholder="Platform"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !name.trim()}>
            {busy ? <span className="spin" /> : "Create team"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
