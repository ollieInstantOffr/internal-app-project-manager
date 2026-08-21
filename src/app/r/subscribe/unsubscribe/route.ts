import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(appUrl("/r/subscribe/done?state=invalid"));

  const subscriber = await db.roadmapSubscriber.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (subscriber) {
    await db.roadmapSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return NextResponse.redirect(appUrl("/r/subscribe/done?state=unsubscribed"));
}
