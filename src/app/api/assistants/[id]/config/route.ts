import { db } from "@/lib/db";
import { handler, requireApiContext, fail } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The config file for a client. The key is only available at creation, so this
 * carries a placeholder unless the caller passes the key it was just shown —
 * the server never stores anything it could put here.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const url = new URL(req.url);
  const client = url.searchParams.get("client") ?? "claude";
  const key = url.searchParams.get("key") ?? "PASTE_YOUR_ARC_KEY_HERE";

  const assistant = await db.assistant.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { org: { select: { slug: true } } },
  });
  if (!assistant) return fail(404, "Assistant not found");

  const endpoint = appUrl("/api/mcp");
  const slug = assistant.org.slug;

  const remote = {
    type: "http",
    url: endpoint,
    headers: { Authorization: `Bearer ${key}` },
  };

  const body =
    client === "cursor"
      ? { mcpServers: { [`arc-${slug}`]: remote } }
      : { mcpServers: { [`arc-${slug}`]: remote } };

  const filename = client === "cursor" ? "mcp.json" : `arc-${slug}.mcp.json`;

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});
