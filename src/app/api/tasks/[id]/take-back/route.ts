import { handler, json, requireApiContext } from "@/lib/api";
import { takeBack } from "@/lib/tasks/service";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  return json({ ok: true, task: await takeBack(id, ctx.userId) });
});
