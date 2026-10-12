#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c450edbc4a6d8de58be0e56bf0cd0cadfc4b20c130f26ccb863d7b9a96c1963d/contract';
import startContract from '../../snapshots/c450edbc4a6d8de58be0e56bf0cd0cadfc4b20c130f26ccb863d7b9a96c1963d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e538be2cd0d09ff040df4a9676d131414e56b021628f79b9e92ed5c621baacfc/contract';
import endContract from '../../snapshots/e538be2cd0d09ff040df4a9676d131414e56b021628f79b9e92ed5c621baacfc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'access_tokens',
        column: col('resource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'authorization_codes',
        column: col('resource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'refresh_tokens',
        column: col('resource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'refresh_tokens',
        column: col('scopes', 'text[]', {
          notNull: true,
          default: lit([]),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'refresh_tokens',
        constraint: 'refresh_tokens_scopes_elem_not_null_de6fcc8e',
        expression: 'array_position("scopes", NULL) IS NULL',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
