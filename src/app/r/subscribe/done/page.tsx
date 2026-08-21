export const metadata = { title: "Roadmap updates" };

const COPY: Record<string, { heading: string; body: string }> = {
  unsubscribed: {
    heading: "You're unsubscribed",
    body: "You won't hear from this roadmap again. You can subscribe from the page any time.",
  },
  invalid: {
    heading: "That link has expired",
    body: "Subscribe again from the roadmap page and we'll send a fresh confirmation.",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const copy = COPY[state ?? "invalid"] ?? COPY.invalid;

  return (
    <main className="pub-shell">
      <div className="pub-narrow">
        <h1 className="pub-h1" style={{ fontSize: 32 }}>
          {copy.heading}
        </h1>
        <p className="pub-lede">{copy.body}</p>
      </div>
    </main>
  );
}
