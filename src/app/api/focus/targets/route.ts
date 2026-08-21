import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";

/** What a session can attach to: your assigned issues, and your open tasks. */
export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const [issues, tasks] = await Promise.all([
    db.issue.findMany({
      where: {
        project: { orgId: ctx.orgId },
        archivedAt: null,
        status: { not: "DONE" },
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { key: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : { assigneeId: ctx.userId }),
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        project: { select: { color: true } },
      },
    }),
    db.task.findMany({
      where: {
        ownerId: ctx.userId,
        orgId: ctx.orgId,
        status: "OPEN",
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
      take: 8,
      select: { id: true, title: true, list: { select: { color: true } } },
    }),
  ]);

  return json({ issues, tasks });
});
