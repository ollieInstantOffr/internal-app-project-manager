import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { Notifications } from "@/components/settings/Notifications";

export const metadata = { title: "Notifications · Arc" };
export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const { user } = await requireOrg();
  const prefs = await db.notificationPref.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return (
    <Notifications
      email={user.email}
      initial={{
        emailMentions: prefs.emailMentions,
        emailAssigned: prefs.emailAssigned,
        emailBlocking: prefs.emailBlocking,
        emailCiFailures: prefs.emailCiFailures,
        emailDigest: prefs.emailDigest,
      }}
    />
  );
}
