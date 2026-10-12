import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function OAuthTestCallbackPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : "";
  const state = typeof params.state === "string" ? params.state : "";
  const issuer = typeof params.iss === "string" ? params.iss : "";
  const error = typeof params.error === "string" ? params.error : "";
  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#171717" }}>
      <p style={{ color: "#666", fontSize: 12, letterSpacing: 2 }}>ONEAUTH · DEVELOPMENT TEST</p>
      <h1>{error ? "Authorization was not approved" : code ? "Authorization callback reached" : "No authorization response received"}</h1>
      {error ? <p>OAuth error: <code>{error}</code></p> : null}
      {code ? <><p>The browser successfully reached the registered callback. The authorization code is short-lived and can only be exchanged with the original PKCE verifier.</p><p><strong>Authorization code</strong></p><textarea readOnly value={code} rows={3} style={{ width: "100%", boxSizing: "border-box", padding: 12 }} /><p><strong>Returned state</strong></p><code style={{ overflowWrap: "anywhere" }}>{state || "(missing)"}</code><p><strong>Issuer</strong></p><code style={{ overflowWrap: "anywhere" }}>{issuer || "(missing)"}</code><p style={{ color: "#8a4b00" }}>Development only: do not share the authorization code. Compare the returned state with the STATE value from the terminal before exchanging the code.</p></> : <p>Start a fresh authorization request and approve it once. If this page shows an OAuth error, inspect the error above.</p>}
      <p style={{ marginTop: 32 }}><Link href="/developer/applications">Back to Developer Portal</Link></p>
    </main>
  );
}
