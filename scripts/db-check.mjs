import 'dotenv/config';
import { db } from '../src/prisma/db.ts';

try {
  const query = db.raw.sql`SELECT count(*)::int4 AS user_count,
    COALESCE((
      SELECT rolsuper OR rolbypassrls
      FROM pg_catalog.pg_roles
      WHERE rolname = current_user
    ), false) AS can_bypass_rls
    FROM public.users`
    .returnsRow({
      user_count: 'pg/int4@1',
      can_bypass_rls: 'pg/bool@1',
    })
    .build();
  const [row] = await db.runtime().query(query);

  if (typeof row?.user_count !== 'number' || row.user_count < 0) {
    throw new Error('PostgreSQL returned an unexpected user-table check result.');
  }

  if (row.can_bypass_rls !== true) {
    throw new Error(
      'The PostgreSQL connection role cannot bypass RLS, and the application tables intentionally have no client-facing policies yet.',
    );
  }

  console.info('PostgreSQL connection, table access, and RLS role check passed.');
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('PostgreSQL connection check failed:', detail);
  process.exitCode = 1;
} finally {
  await db.close();
}
