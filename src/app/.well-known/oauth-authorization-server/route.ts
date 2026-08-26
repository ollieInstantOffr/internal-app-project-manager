import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** RFC 8414. Public on purpose — a client reads this before it has any credentials. */
export function GET() {
  return NextResponse.json(authorizationServerMetadata(), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
