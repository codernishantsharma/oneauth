import { timingSafeEqual } from "node:crypto";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const expected = process.env.ONEAUTH_CRON_SECRET ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  // Expire only the database hostname assignment. DNS records and gateway
  // infrastructure are managed independently and are never changed here.
  const expired = await db.runtime().query(db.raw.sql`
    UPDATE public.agent_domains
    SET status='DELETED', deleted_at=now(), updated_at=now()
    WHERE id IN (
      SELECT id FROM public.agent_domains
      WHERE status='ACTIVE' AND last_used_at < now() - interval '60 days'
      ORDER BY last_used_at ASC LIMIT 100
    )
    RETURNING id
  `.returnsRow({id:"pg/uuid@1"}).build());

  return Response.json({ scanned: expired.length, expired: expired.length, failed: 0 }, { headers: { "Cache-Control": "no-store" } });
}
