"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

export type StorageSettings = {
  provider: "LOCAL" | "S3";
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string | null;
  accessKeyHint: string | null;
  secretSet: boolean;
  secretHint: string | null;
  verifiedAt: string | null;
};

type Probe = { ok: boolean; step?: string; message?: string } | null;

export function Storage({
  settings,
  localCount,
  s3Count,
}: {
  settings: StorageSettings;
  localCount: number;
  s3Count: number;
}) {
  const router = useRouter();
  const { toast, error } = useToast();

  const [provider, setProvider] = useState(settings.provider);
  const [bucket, setBucket] = useState(settings.bucket ?? "");
  const [region, setRegion] = useState(settings.region ?? "");
  const [endpoint, setEndpoint] = useState(settings.endpoint ?? "");
  const [prefix, setPrefix] = useState(settings.prefix ?? "");
  const [pathStyle, setPathStyle] = useState(settings.forcePathStyle);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<Probe>(null);

  const payload = () => ({
    provider,
    bucket: bucket.trim() || null,
    region: region.trim() || null,
    endpoint: endpoint.trim() || null,
    prefix: prefix.trim() || null,
    forcePathStyle: pathStyle,
    // Blank means "keep the stored one" — the page never receives a secret, so
    // it can't send one back.
    accessKeyId: keyId.trim() || null,
    secretAccessKey: secret.trim() || null,
  });

  async function test() {
    setBusy(true);
    setProbe(null);
    try {
      const result = await api.post<Probe>("/api/storage/test", payload());
      setProbe(result);
      if (result?.ok) toast("Wrote, read back and deleted a test object");
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't reach the bucket");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch("/api/storage", payload());
      setKeyId("");
      setSecret("");
      setProbe(null);
      toast(
        provider === "S3"
          ? "New uploads will go to the bucket"
          : "New uploads will go to the server's disk",
      );
      router.refresh();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't save those settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Storage</h1>
          <div className="panel-sub">Where attachments are kept</div>
        </div>
      </header>

      <div className="panel-body" style={{ gap: 16, padding: "4px 22px 22px", maxWidth: 720 }}>
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row-flex">
            <div className="grow">
              <div className="storage-title">Use an S3 bucket</div>
              <div className="storage-hint">
                Off means attachments are written to the server&rsquo;s own disk, which is the
                default and needs no setup.
              </div>
            </div>
            <Toggle
              on={provider === "S3"}
              onChange={(next) => setProvider(next ? "S3" : "LOCAL")}
              label="Use an S3 bucket"
            />
          </div>

          <div className="storage-counts">
            <span>
              <b>{localCount}</b> on disk
            </span>
            <span>
              <b>{s3Count}</b> in the bucket
            </span>
            {settings.verifiedAt && provider === "S3" && (
              <span className="storage-verified">connection verified</span>
            )}
          </div>
        </section>

        {provider === "S3" && (
          <>
            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="s3-bucket">
                  Bucket
                </label>
                <input
                  id="s3-bucket"
                  className="input"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  placeholder="arc-attachments"
                />
              </div>

              <div className="row-flex" style={{ gap: 12, alignItems: "flex-start" }}>
                <div className="field grow">
                  <label className="label" htmlFor="s3-region">
                    Region
                  </label>
                  <input
                    id="s3-region"
                    className="input"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="eu-north-1"
                  />
                </div>
                <div className="field grow">
                  <label className="label" htmlFor="s3-prefix">
                    Prefix <span className="storage-optional">optional</span>
                  </label>
                  <input
                    id="s3-prefix"
                    className="input"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="attachments/"
                  />
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="s3-endpoint">
                  Endpoint <span className="storage-optional">leave blank for AWS</span>
                </label>
                <input
                  id="s3-endpoint"
                  className="input"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://s3.eu-central-003.backblazeb2.com"
                />
                <div className="storage-hint">
                  Set this for Cloudflare R2, MinIO, Backblaze or any other S3-compatible service.
                </div>
              </div>

              <div className="row-flex">
                <div className="grow">
                  <div className="storage-title" style={{ fontSize: 12.5 }}>
                    Path-style addressing
                  </div>
                  <div className="storage-hint">
                    Needed by MinIO and some proxies, which put the bucket in the path rather than
                    the hostname.
                  </div>
                </div>
                <Toggle on={pathStyle} onChange={setPathStyle} label="Path-style addressing" />
              </div>
            </section>

            <section className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="s3-key">
                  Access key ID
                </label>
                <input
                  id="s3-key"
                  className="input mono"
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder={settings.accessKeyHint ?? "AKIA…"}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="s3-secret">
                  Secret access key
                </label>
                <input
                  id="s3-secret"
                  className="input mono"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={settings.secretSet ? `${settings.secretHint} — leave blank to keep` : ""}
                  autoComplete="off"
                />
                <div className="storage-hint">
                  Stored encrypted, and never sent back to this page. Leave either field blank to
                  keep what is already saved.
                </div>
              </div>
            </section>
          </>
        )}

        {probe && (
          <div className="storage-probe" data-ok={probe.ok}>
            {probe.ok ? (
              <>Wrote a test object, read it back and deleted it. The bucket is ready.</>
            ) : (
              <>
                Failed at the <b>{probe.step}</b> step — {probe.message}
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {provider === "S3" && (
            <button className="btn btn-outline" onClick={test} disabled={busy}>
              {busy ? <span className="spin" /> : "Test connection"}
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </div>

        <div className="storage-note">
          Switching only affects new uploads. Every attachment records where it was written, so
          files already on disk keep working after the bucket is turned on — and files in the bucket
          keep working if it is turned off, as long as the settings are still there.
        </div>
      </div>
    </main>
  );
}
