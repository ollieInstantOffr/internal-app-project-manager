import { db } from "@/lib/db";
import { handler, json, fail } from "@/lib/api";
import { hashRoadmap, loadPublicRoadmap } from "@/lib/roadmap";
import { sendMail } from "@/lib/mail";
import { roadmapChangedTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";
import { randomToken, sha256 } from "@/lib/auth";

/**
 * Emails roadmap subscribers, and only when the page they subscribed to has
 * actually changed. Point a scheduler at this with `Authorization: Bearer $CRON_SECRET`.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "Set CRON_SECRET to enable the roadmap job");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "Unauthorized");

  const pages = await db.roadmapPage.findMany({
    where: { enabled: true },
    include: { project: { select: { key: true, name: true, org: { select: { slug: true, name: true } } } } },
  });

  let notified = 0;
  let changed = 0;

  for (const page of pages) {
    const roadmap = await loadPublicRoadmap(page.project.org.slug, page.project.key);
    if (!roadmap) continue;

    const hash = hashRoadmap(roadmap);
    if (hash === page.contentHash) continue;
    changed++;

    const first = !page.contentHash;
    await db.roadmapPage.update({
      where: { id: page.id },
      data: { contentHash: hash, notifiedAt: first ? page.notifiedAt : new Date() },
    });
    // The first hash is a baseline, not a change worth an email.
    if (first) continue;

    const subscribers = await db.roadmapSubscriber.findMany({
      where: { pageId: page.id, confirmedAt: { not: null }, unsubscribedAt: null },
    });

    const url = appUrl(`/r/${page.project.org.slug}/${page.project.key.toLowerCase()}`);
    const changes = roadmap.items.slice(0, 5).map((i) => `${i.name} — ${i.timing}`);

    for (const subscriber of subscribers) {
      // Rotate the token so an old unsubscribe link can't be replayed.
      const token = randomToken();
      await db.roadmapSubscriber.update({
        where: { id: subscriber.id },
        data: { tokenHash: sha256(token) },
      });

      const tpl = roadmapChangedTemplate({
        orgName: page.project.org.name,
        projectName: page.project.name,
        roadmapUrl: url,
        unsubscribeUrl: appUrl(`/r/subscribe/unsubscribe?token=${token}`),
        changes,
      });
      await sendMail({ to: subscriber.email, ...tpl });
      notified++;
    }
  }

  return json({ ok: true, pages: pages.length, changed, notified });
}

export const GET = handler(run);
export const POST = handler(run);
