"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { migrateAgentTunnelsToSharedGateway } from "./actions";

export function SharedTunnelMigration({ activeCount }: { activeCount: number }) {
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const router = useRouter();

  function migrate() {
    if (busy) return;
    const confirmed = window.confirm(
      "Move all active Agent hostname assignments to the shared Cloudflare Tunnel? This changes the OneAuth registry and does not delete Cloudflare tunnels or DNS records.",
    );
    if (!confirmed) return;
    setNotice("");
    startTransition(() => {
      void migrateAgentTunnelsToSharedGateway()
        .then((result) => {
          setNotice(`Migration complete. Updated ${result.migratedCount} assignment(s).`);
          router.refresh();
        })
        .catch((error: unknown) => {
          setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Migration failed.");
        });
    });
  }

  return <div className="admin-tunnel-migration">
    <div>
      <strong>Shared gateway migration</strong>
      <p>Move all active hostname assignments to tunnel 05da5c33-2dfa-4473-b576-d3b2fb28754f and remove the old unique-tunnel constraint. {activeCount} active assignment(s) currently shown.</p>
      {notice ? <p role="status" className="admin-table-footnote">{notice}</p> : null}
    </div>
    <button className="admin-row-action" disabled={busy} onClick={migrate} type="button">
      {busy ? "Migrating…" : "Migrate active assignments"}
    </button>
  </div>;
}
