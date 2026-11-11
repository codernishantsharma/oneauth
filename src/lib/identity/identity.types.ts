export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type SecurityEventType =
  | 'ACCOUNT_CREATED'
  | 'EMAIL_ADDED'
  | 'EMAIL_REMOVED'
  | 'EMAIL_VERIFIED'
  | 'PRIMARY_EMAIL_CHANGED'
  | 'USERNAME_CHANGED'
  | 'PROFILE_UPDATED'
  | 'ACCOUNT_ACTIVATED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'ACCOUNT_DEACTIVATED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'PASSKEY_ADDED'
  | 'PASSKEY_REMOVED'
  | 'TOTP_ENABLED'
  | 'TOTP_DISABLED'
  | 'RECOVERY_CODE_USED'
  | 'OAUTH_AUTHORIZED'
  | 'OAUTH_REVOKED'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'ACCOUNT_RECOVERY_STARTED'
  | 'ACCOUNT_RECOVERY_COMPLETED';

export type SecurityMetadataValue = string | number | boolean | null | Record<string, unknown>;

export interface IdentityUser {
  id: string;
  status: UserStatus;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  lastLoginAt: string | null;
}

export interface IdentityProfile {
  id: string;
  userId: string;
  displayName: string | null;
  username: string | null;
  normalizedUsername: string | null;
  avatarUrl: string | null;
  locale: string | null;
  timeZone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface IdentityEmailAddress {
  id: string;
  userId: string;
  normalizedEmail: string;
  verifiedAt: string | null;
  isPrimary: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SecurityEventRecord {
  id: string;
  userId: string | null;
  oauthClientId: string | null;
  sessionId: string | null;
  eventType: SecurityEventType;
  occurredAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, SecurityMetadataValue> | null;
}

export type QueryCollection<T> = {
  where: (criteria: Record<string, unknown>) => QueryCollection<T>;
  first: (criteria?: Record<string, unknown>) => Promise<T | null>;
  create: (attrs: Record<string, unknown>) => Promise<T>;
  update: (attrs: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => Promise<T>;
  delete: (criteria: Record<string, unknown>) => Promise<T>;
  all: () => Promise<T[]>;
  updateMany: (criteria: Record<string, unknown>, data: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (criteria: Record<string, unknown>) => Promise<{ count: number }>;
};

export type IdentityDatabase = {
  transaction: <T>(callback: (transaction: IdentityDatabase) => Promise<T>) => Promise<T>;
  orm: {
    public: {
      User: QueryCollection<IdentityUser>;
      Profile: QueryCollection<IdentityProfile>;
      EmailAddress: QueryCollection<IdentityEmailAddress>;
      SecurityEvent: QueryCollection<SecurityEventRecord>;
    };
  };
};

export interface UserCreateInput {
  email: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timeZone?: string | null;
}

export interface UserProfileUpdateInput {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timeZone?: string | null;
}
