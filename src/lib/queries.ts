import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { ISSUE_INCLUDE } from "./issues";
import { serializeIssue } from "./serialize";
import { SprintStatus } from "./types";

/** Loads everything a project screen needs, in one place so board/backlog/epics agree. */
export async function loadProjectWorkspace(orgId: string, projectKey: string) {
  const project = await db.project.findFirst({
    where: { orgId, key: projectKey.toUpperCase() },
  });
  if (!project) notFound();

  const [issues, epics, sprints, labels] = await Promise.all([
    db.issue.findMany({
      where: { projectId: project.id, archivedAt: null },
      include: ISSUE_INCLUDE,
      orderBy: [{ rank: "asc" }],
    }),
    db.epic.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    db.sprint.findMany({ where: { projectId: project.id }, orderBy: { number: "desc" } }),
    db.label.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);

  const active = sprints.find((s) => s.status === SprintStatus.ACTIVE) ?? null;

  return {
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      color: project.color,
      repoFullName: project.repoFullName,
    },
    issues: issues.map(serializeIssue),
    epics: epics.map((e) => ({
      id: e.id,
      key: e.key,
      name: e.name,
      color: e.color,
      status: e.status,
    })),
    sprints: sprints.map((s) => ({
      id: s.id,
      name: s.name,
      number: s.number,
      status: s.status,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      capacity: s.capacity,
    })),
    labels,
    activeSprint: active
      ? {
          id: active.id,
          name: active.name,
          number: active.number,
          status: active.status,
          startDate: active.startDate.toISOString(),
          endDate: active.endDate.toISOString(),
          capacity: active.capacity,
        }
      : null,
  };
}
