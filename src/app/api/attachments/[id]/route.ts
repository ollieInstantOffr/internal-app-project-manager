import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";
import { canRenderInline, load, remove } from "@/lib/attachments";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function reachable(id: string, orgId: string) {
  const attachment = await db.attachment.findFirst({
    where: { id, issue: { project: { orgId } } },
  });
  if (!attachment) throw new HttpError(404, "Attachment not found");
  return attachment;
}

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const attachment = await reachable(id, ctx.orgId);

  const bytes = await load(attachment.storageKey);
  const inline = canRenderInline(attachment.mimeType);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": attachment.mimeType,
      "content-length": String(attachment.size),
      // Anything we won't render is handed straight to the download manager, and
      // nosniff stops the browser second-guessing the type either way.
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.filename}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const attachment = await reachable(id, ctx.orgId);

  await db.attachment.delete({ where: { id } });
  await remove(attachment.storageKey);
  return json({ ok: true });
});
