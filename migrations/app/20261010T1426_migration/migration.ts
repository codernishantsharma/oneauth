#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/554b180146150f19f4a979e9764dc5bbf95c9984c5988d31657e1a4f629c74ed/contract';
import startContract from '../../snapshots/554b180146150f19f4a979e9764dc5bbf95c9984c5988d31657e1a4f629c74ed/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/83ab9863a8805be1f5ba0e9c7a60ccc66a84f46bfe8d1ae49adbc19658e4da56/contract';
import endContract from '../../snapshots/83ab9863a8805be1f5ba0e9c7a60ccc66a84f46bfe8d1ae49adbc19658e4da56/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'roles',
        constraint: 'role_scope_matches_type_0cc457ef',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'security_events',
        constraint: 'security_events_event_type_check_20f82758',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'roles',
        constraint: 'role_scope_matches_type_2e1823df',
        expression:
          "(role_type = 'SYSTEM' AND organization_id IS NULL AND is_system = true) OR (role_type = 'ORGANIZATION' AND is_system = false)",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'security_events',
        constraint: 'security_events_event_type_check_3c3cef8b',
        expression:
          "\"event_type\" IN ('ACCOUNT_CREATED', 'EMAIL_ADDED', 'EMAIL_REMOVED', 'EMAIL_VERIFIED', 'PRIMARY_EMAIL_CHANGED', 'USERNAME_CHANGED', 'PROFILE_UPDATED', 'ACCOUNT_ACTIVATED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'ACCOUNT_DEACTIVATED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'PASSKEY_ADDED', 'PASSKEY_REMOVED', 'TOTP_ENABLED', 'TOTP_DISABLED', 'RECOVERY_CODE_USED', 'OAUTH_AUTHORIZED', 'OAUTH_REVOKED', 'SESSION_CREATED', 'SESSION_REVOKED', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'ACCOUNT_RECOVERY_STARTED', 'ACCOUNT_RECOVERY_COMPLETED')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
