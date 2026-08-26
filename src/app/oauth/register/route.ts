import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp/oauth";
import { HttpError } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * RFC 7591 dynamic client registration.
 *
 * Open by design: a client has to be able to register before it has any
 * credentials, which is the whole point. Registering grants nothing on its own
 * — a person still has to approve the authorization, and what they approve
 * starts at read-only.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400, headers: CORS });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
  const authMethod = typeof body.token_endpoint_auth_method === "string"
    ? body.token_endpoint_auth_method
    : "none";

  try {
    const { client, clientId, secret } = await registerClient({
      name: typeof body.client_name === "string" ? body.client_name : "Unnamed client",
      redirectUris,
      logoUri: typeof body.logo_uri === "string" ? body.logo_uri : null,
      clientUri: typeof body.client_uri === "string" ? body.client_uri : null,
      wantsSecret: authMethod !== "none",
    });

    return NextResponse.json(
      {
        client_id: clientId,
        ...(secret ? { client_secret: secret } : {}),
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: authMethod,
      },
      { status: 201, headers: CORS },
    );
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "Registration failed";
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: message },
      { status: 400, headers: CORS },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
