#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4a391d675a3e1187037a558d71ced325ae33f0058e4016ea74611fd3e7e059dd/contract';
import endContract from '../../snapshots/4a391d675a3e1187037a558d71ced325ae33f0058e4016ea74611fd3e7e059dd/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/83ab9863a8805be1f5ba0e9c7a60ccc66a84f46bfe8d1ae49adbc19658e4da56/contract';
import startContract from '../../snapshots/83ab9863a8805be1f5ba0e9c7a60ccc66a84f46bfe8d1ae49adbc19658e4da56/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'user_roles',
        columns: [
          col('assigned_at', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 3 } },
          }),
          col('assigned_by_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('role_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user_roles',
        constraint: 'user_roles_user_id_role_id_key',
        columns: ['user_id', 'role_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_roles',
        index: 'user_roles_assigned_by_id_idx_0eaeea51',
        columns: ['assigned_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_roles',
        index: 'user_roles_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_roles',
        index: 'user_roles_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_roles',
        foreignKey: {
          name: 'user_roles_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_roles',
        foreignKey: {
          name: 'user_roles_role_id_fkey',
          columns: ['role_id'],
          references: { schema: 'public', table: 'roles', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_roles',
        foreignKey: {
          name: 'user_roles_assigned_by_id_fkey',
          columns: ['assigned_by_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'user_roles' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
