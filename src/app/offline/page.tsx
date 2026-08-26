export const metadata = { title: "Offline · Arc" };

/** Shown by the service worker only when a page load fails outright. */
export default function OfflinePage() {
  return (
    <main className="pub-shell">
      <div className="pub-narrow">
        <h1 className="pub-h1" style={{ fontSize: 32 }}>
          You&rsquo;re offline
        </h1>
        <p className="pub-lede">
          Arc needs a connection — nothing is cached, on purpose, so you never see a board that
          isn&rsquo;t true. It&rsquo;ll come back on its own.
        </p>
      </div>
    </main>
  );
}
