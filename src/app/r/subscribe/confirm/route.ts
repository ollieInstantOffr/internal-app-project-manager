import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";

/**
 * A route handler rather than a page: it writes, then redirects, so a refresh
 * doesn't try to confirm twice.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(appUrl("/r/subscribe/done?state=invalid"));

  const subscriber = await db.roadmapSubscriber.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      page: { include: { project: { select: { key: true, org: { select: { slug: true } } } } } },
    },
  });
  if (!subscriber) return NextResponse.redirect(appUrl("/r/subscribe/done?state=invalid"));

  await db.roadmapSubscriber.update({
    where: { id: subscriber.id },
    data: { confirmedAt: subscriber.confirmedAt ?? new Date(), unsubscribedAt: null },
  });

  const { org, key } = subscriber.page.project;
  return NextResponse.redirect(
    appUrl(`/r/${org.slug}/${key.toLowerCase()}?state=subscribed`),
  );
}
