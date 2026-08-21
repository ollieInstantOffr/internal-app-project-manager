import { requireOrg } from "@/lib/auth";
import { computeInsights } from "@/lib/insights";
import { Insights } from "@/components/insights/Insights";

export const metadata = { title: "Insights · Arc" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { org } = await requireOrg();
  const data = await computeInsights(org.id, null);
  return <Insights data={data} projectKey={null} scopeLabel="All projects" />;
}
