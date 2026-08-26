import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** RFC 9728. What the WWW-Authenticate header on a 401 points at. */
export function GET() {
  return NextResponse.json(protectedResourceMetadata(), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
