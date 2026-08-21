import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskListSchema } from "@/lib/validators";
import { nextRank } from "@/lib/rank";
import { HttpError } from "@/lib/auth";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const lists = await db.taskList.findMany({
    where: { ownerId: ctx.userId },
    orderBy: { position: "asc" },
    include: { _count: { select: { tasks: { where: { status: "OPEN" } } } } },
  });
  return json({ lists });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, taskListSchema);

  const existing = await db.taskList.findMany({
    where: { ownerId: ctx.userId },
    select: { position: true, name: true },
  });
  if (existing.some((l) => l.name.toLowerCase() === body.name.toLowerCase())) {
    throw new HttpError(409, "You already have a list with that name");
  }

  const list = await db.taskList.create({
    data: {
      ownerId: ctx.userId,
      name: body.name,
      color: body.color,
      position: nextRank(existing.map((l) => l.position)),
    },
  });

  return json({ ok: true, list }, { status: 201 });
});
