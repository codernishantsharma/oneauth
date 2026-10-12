#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/25994838738242a11c27abee578b215672d86b5523ba7e76efbbff47b5c40273/contract';
import endContract from '../../snapshots/25994838738242a11c27abee578b215672d86b5523ba7e76efbbff47b5c40273/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e538be2cd0d09ff040df4a9676d131414e56b021628f79b9e92ed5c621baacfc/contract';
import startContract from '../../snapshots/e538be2cd0d09ff040df4a9676d131414e56b021628f79b9e92ed5c621baacfc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'profiles',
        column: col('custom_data', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
