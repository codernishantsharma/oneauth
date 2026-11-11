#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4a391d675a3e1187037a558d71ced325ae33f0058e4016ea74611fd3e7e059dd/contract';
import startContract from '../../snapshots/4a391d675a3e1187037a558d71ced325ae33f0058e4016ea74611fd3e7e059dd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c450edbc4a6d8de58be0e56bf0cd0cadfc4b20c130f26ccb863d7b9a96c1963d/contract';
import endContract from '../../snapshots/c450edbc4a6d8de58be0e56bf0cd0cadfc4b20c130f26ccb863d7b9a96c1963d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'api_keys',
        column: col('environment', 'text', {
          notNull: true,
          default: lit('DEVELOPMENT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'oauth_clients',
        column: col('environment', 'text', {
          notNull: true,
          default: lit('DEVELOPMENT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'api_keys',
        constraint: 'api_keys_environment_check_d1a2f0ff',
        expression: "\"environment\" IN ('DEVELOPMENT', 'PRODUCTION')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'oauth_clients',
        constraint: 'oauth_clients_environment_check_d1a2f0ff',
        expression: "\"environment\" IN ('DEVELOPMENT', 'PRODUCTION')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
