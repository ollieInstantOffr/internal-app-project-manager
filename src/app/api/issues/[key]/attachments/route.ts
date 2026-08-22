import { db } from "@/lib/db";
import { handler, json, issueInOrg, requireApiContext } from "@/lib/api";
import { isAllowed, MAX_BYTES, safeFilename, store } from "@/lib/attachments";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);

  const attachments = await db.attachment.findMany({
    where: { issueId: issue.id },
    orderBy: { createdAt: "asc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return json({ attachments });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file under the 'file' field");

  // The declared size can lie, so store() checks the bytes it actually gets too.
  if (file.size > MAX_BYTES) throw new HttpError(413, "That file is over 10 MB");

  const mimeType = file.type || "application/octet-stream";
  if (!isAllowed(mimeType)) throw new HttpError(415, `${mimeType} isn't an allowed file type`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await store(bytes, mimeType);

  const attachment = await db.attachment.create({
    data: {
      filename: safeFilename(file.name),
      mimeType,
      size: stored.size,
      storageKey: stored.storageKey,
      issueId: issue.id,
      uploadedById: ctx.userId,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  return json({ ok: true, attachment }, { status: 201 });
});
