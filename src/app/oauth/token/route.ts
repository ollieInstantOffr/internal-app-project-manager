import { NextResponse } from "next/server";
import { exchangeCode, refresh } from "@/lib/mcp/oauth";
import { HttpError } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Form-encoded, as the spec requires — not JSON. */
async function fields(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return (await req.json()) as Record<string, string>;
  }
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await fields(req);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: CORS });
  }

  // A client may authenticate with Basic instead of posting its secret.
  let clientId = body.client_id;
  let clientSecret = body.client_secret ?? null;
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    clientId = clientId || id;
    clientSecret = clientSecret ?? secret ?? null;
  }

  try {
    if (body.grant_type === "refresh_token") {
      const tokens = await refresh({
        refreshToken: body.refresh_token,
        clientId,
        clientSecret,
      });
      return NextResponse.json(tokens, { headers: { ...CORS, "cache-control": "no-store" } });
    }

    if (body.grant_type === "authorization_code") {
      const tokens = await exchangeCode({
        code: body.code,
        clientId,
        clientSecret,
        redirectUri: body.redirect_uri,
        codeVerifier: body.code_verifier,
      });
      return NextResponse.json(tokens, { headers: { ...CORS, "cache-control": "no-store" } });
    }

    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400, headers: CORS });
  } catch (err) {
    // The message is already an OAuth error code where it matters.
    const code = err instanceof HttpError ? err.message : "invalid_request";
    const status = err instanceof HttpError ? err.status : 400;
    return NextResponse.json({ error: code }, { status, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
