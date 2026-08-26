import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** RFC 7009. Always 200, so a caller can't probe which tokens exist. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const token = String(form.get("token") ?? "");
    if (token) await revokeToken(token);
  } catch {
    // Deliberately silent.
  }
  return new NextResponse(null, { status: 200, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
