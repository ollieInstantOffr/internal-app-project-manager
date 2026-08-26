import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getOrgContext } from "@/lib/auth";
import { LEVEL_COPY, OFF_LIMITS } from "@/lib/mcp/levels";
import { redirectAllowed } from "@/lib/mcp/oauth";
import { Consent } from "./Consent";

export const metadata = { title: "Connect an assistant · Arc" };
export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | undefined>>;

/**
 * The one part of the OAuth flow a person sees.
 *
 * It deliberately states what approving actually grants — read-only, and
 * nothing else until they raise it — because "Allow this app to access your
 * account" is exactly the screen people have been trained to click through.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const ctx = await getOrgContext();

  // Sign in first, then come straight back to the same authorization.
  if (!ctx?.org) {
    const back = new URLSearchParams(q as Record<string, string>).toString();
    redirect(`/login?redirectTo=${encodeURIComponent(`/oauth/authorize?${back}`)}`);
  }

  const problem = (reason: string) => (
    <main className="pub-shell">
      <div className="pub-narrow">
        <h1 className="pub-h1" style={{ fontSize: 30 }}>
          That link doesn&rsquo;t work
        </h1>
        <p className="pub-lede">{reason}</p>
      </div>
    </main>
  );

  if (q.response_type !== "code") return problem("Arc only supports the authorization code flow.");
  if (!q.code_challenge || q.code_challenge_method !== "S256") {
    return problem("This client didn't use PKCE, which Arc requires.");
  }

  const client = q.client_id
    ? await db.oAuthClient.findUnique({ where: { clientId: q.client_id } })
    : null;
  if (!client) return problem("Arc doesn't recognise the application that sent you here.");

  const redirectUri = q.redirect_uri ?? "";
  if (!redirectAllowed(client.redirectUris, redirectUri)) {
    // Never bounce to an unregistered URI — that is how codes get stolen.
    return problem("The address that application asked us to return to isn't one it registered.");
  }

  return (
    <Consent
      clientName={client.name}
      clientUri={client.clientUri}
      orgName={ctx.org.name}
      userName={ctx.user.name}
      startsAt={LEVEL_COPY.READ_ONLY.name}
      startsBlurb={LEVEL_COPY.READ_ONLY.blurb}
      offLimits={OFF_LIMITS}
      params={{
        client_id: q.client_id!,
        redirect_uri: redirectUri,
        code_challenge: q.code_challenge,
        state: q.state ?? "",
        scope: q.scope ?? "mcp",
      }}
    />
  );
}
