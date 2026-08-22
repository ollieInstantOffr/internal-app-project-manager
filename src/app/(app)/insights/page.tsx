import { requireOrg } from "@/lib/auth";
import { computeInsights } from "@/lib/insights";
import { Insights } from "@/components/insights/Insights";
import { estimateAccuracy } from "@/lib/focus";

export const metadata = { title: "Insights · Arc" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { org, user } = await requireOrg();
  const [data, accuracy] = await Promise.all([
    computeInsights(org.id, null),
    // Yours alone — focus time never becomes a report on anyone else.
    estimateAccuracy(user.id, org.id),
  ]);
  return (
    <Insights data={data} projectKey={null} scopeLabel="All projects" accuracy={accuracy} />
  );
}
