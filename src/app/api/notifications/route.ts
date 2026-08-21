import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";
import { Urgency } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const scope = new URL(req.url).searchParams.get("scope") ?? "needs-me";

  if (scope === "done") {
    const items = await db.notification.findMany({
      where: { userId: ctx.userId, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: 60,
      include: { issue: { select: { id: true, key: true, title: true, status: true } } },
    });
    return json({ items });
  }

  const items = await db.notification.findMany({
    where: { userId: ctx.userId, archivedAt: null },
    orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
    include: {
      issue: {
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          estimate: true,
          sprint: { select: { name: true } },
          project: { select: { key: true, name: true } },
        },
      },
    },
  });

  return json({
    items,
    counts: {
      blocking: items.filter((i) => i.urgency === Urgency.BLOCKING).length,
      today: items.filter((i) => i.urgency === Urgency.TODAY).length,
      later: items.filter((i) => i.urgency === Urgency.LATER).length,
    },
  });
});
