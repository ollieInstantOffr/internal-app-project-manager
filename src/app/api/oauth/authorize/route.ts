import { z } from "zod";
import { handler, json, parseBody } from "@/lib/api";
import { getOrgContext, HttpError } from "@/lib/auth";
import { grantCode } from "@/lib/mcp/oauth";
import { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(1),
  state: z.string().optional(),
  scope: z.string().optional(),
  assistantName: z.string().trim().min(1).max(60),
  approve: z.boolean(),
});

/**
 * The decision half of the consent screen. Deliberately a POST from the page
 * rather than something a GET could trigger: a link should never be able to
 * approve a connection on someone's behalf.
 */
export const POST = handler(async (req: Request) => {
  const ctx = await getOrgContext();
  if (!ctx?.org) throw new HttpError(401, "Not signed in");
  // Connecting an assistant is the same decision as minting a key by hand.
  if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
    throw new HttpError(403, "Only an owner or admin can connect an assistant");
  }

  const body = await parseBody(req, schema);
  const target = new URL(body.redirect_uri);

  if (!body.approve) {
    target.searchParams.set("error", "access_denied");
    if (body.state) target.searchParams.set("state", body.state);
    return json({ redirectTo: target.toString() });
  }

  const { code } = await grantCode({
    clientId: body.client_id,
    userId: ctx.user.id,
    orgId: ctx.org.id,
    redirectUri: body.redirect_uri,
    codeChallenge: body.code_challenge,
    scope: body.scope,
    assistantName: body.assistantName,
  });

  target.searchParams.set("code", code);
  if (body.state) target.searchParams.set("state", body.state);
  return json({ redirectTo: target.toString() });
});
