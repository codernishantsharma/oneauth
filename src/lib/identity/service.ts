import {
  CannotRemovePrimaryEmailError,
  EmailAlreadyExistsError,
  EmailNotFoundError,
  InvalidAccountStateError,
  UserNotFoundError,
  UsernameAlreadyExistsError,
} from './identity.errors.ts';
import type {
  IdentityDatabase,
  IdentityEmailAddress,
  IdentityProfile,
  IdentityUser,
  QueryCollection,
  SecurityEventType,
  UserCreateInput,
  UserProfileUpdateInput,
} from './identity.types.ts';
import {
  RESERVED_USERNAMES,
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validateUsername,
} from './identity.validation.ts';

export type IdentityService = {
  createUser: (input: UserCreateInput) => Promise<{ user: IdentityUser; profile: IdentityProfile; email: IdentityEmailAddress }>;
  getUserById: (userId: string) => Promise<IdentityUser | null>;
  getUserByEmail: (email: string) => Promise<IdentityUser | null>;
  getUserByUsername: (username: string) => Promise<IdentityUser | null>;
  getUserWithProfile: (userId: string) => Promise<{ user: IdentityUser; profile: IdentityProfile | null } | null>;
  getProfile: (userId: string) => Promise<IdentityProfile | null>;
  updateProfile: (userId: string, input: UserProfileUpdateInput) => Promise<IdentityProfile>;
  addEmail: (userId: string, email: string) => Promise<IdentityEmailAddress>;
  removeEmail: (userId: string, emailId: string) => Promise<void>;
  setPrimaryEmail: (userId: string, emailId: string) => Promise<IdentityEmailAddress>;
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  setUsername: (userId: string, username: string) => Promise<IdentityProfile>;
  changeUsername: (userId: string, username: string) => Promise<IdentityProfile>;
  activateUser: (userId: string) => Promise<IdentityUser>;
  suspendUser: (userId: string) => Promise<IdentityUser>;
  reactivateUser: (userId: string) => Promise<IdentityUser>;
  deactivateUser: (userId: string) => Promise<IdentityUser>;
  recordSecurityEvent: (input: {
    userId?: string | null;
    eventType: SecurityEventType;
    metadata?: Record<string, string | number | boolean | null | Record<string, unknown>>;
    ipAddress?: string | null;
    userAgent?: string | null;
    oauthClientId?: string | null;
    sessionId?: string | null;
  }) => Promise<unknown>;
};

function isUserStatus(value: string): value is IdentityUser['status'] {
  return value === 'ACTIVE' || value === 'SUSPENDED' || value === 'DELETED';
}

function matchesCriteria<T extends Record<string, unknown>>(record: T, criteria: Record<string, unknown>): boolean {
  return Object.entries(criteria).every(([key, value]) => record[key] === value);
}

function createModelCollection<T extends { id: string }>(items: T[]): QueryCollection<T> {
  const createCollection = (criteria: Record<string, unknown> = {}): QueryCollection<T> => {
    const where = (nextCriteria: Record<string, unknown>): QueryCollection<T> => createCollection({ ...criteria, ...nextCriteria });

    const first = async (nextCriteria?: Record<string, unknown>): Promise<T | null> => {
      const finalCriteria = nextCriteria ? { ...criteria, ...nextCriteria } : criteria;
      return items.find((item) => matchesCriteria(item as Record<string, unknown>, finalCriteria)) ?? null;
    };

    const create = async (data: Record<string, unknown>): Promise<T> => {
      const next = { id: crypto.randomUUID(), ...(data as Partial<T>) } as T;
      items.push(next);
      return next;
    };

    const update = async ({ where: updateWhere, data }: { where?: Record<string, unknown>; data?: Record<string, unknown> }): Promise<T> => {
      const target = items.find((item) => matchesCriteria(item as Record<string, unknown>, { ...criteria, ...(updateWhere ?? {}) }));
      if (!target) {
        const missingId = typeof (updateWhere ?? criteria).id === 'string' ? String((updateWhere ?? criteria).id) : 'unknown';
        throw new UserNotFoundError(missingId);
      }
      const next = { ...target, ...(data ?? {}) } as T;
      const index = items.indexOf(target);
      items[index] = next;
      return next;
    };

    const del = async (deleteCriteria: Record<string, unknown>): Promise<T> => {
      const finalCriteria = { ...criteria, ...deleteCriteria };
      const index = items.findIndex((item) => matchesCriteria(item as Record<string, unknown>, finalCriteria));
      if (index < 0) {
        const missingId = typeof finalCriteria.id === 'string' ? finalCriteria.id : 'unknown';
        throw new UserNotFoundError(missingId);
      }
      const [removed] = items.splice(index, 1);
      return removed;
    };

    const all = async (): Promise<T[]> => items.filter((item) => matchesCriteria(item as Record<string, unknown>, criteria));

    const updateMany = async (updateCriteria: Record<string, unknown>, data: Record<string, unknown>): Promise<{ count: number }> => {
      let count = 0;
      for (const item of items) {
        if (matchesCriteria(item as Record<string, unknown>, { ...criteria, ...updateCriteria })) {
          Object.assign(item, data);
          count += 1;
        }
      }
      return { count };
    };

    const deleteMany = async (deleteCriteria: Record<string, unknown>): Promise<{ count: number }> => {
      const finalCriteria = { ...criteria, ...deleteCriteria };
      const remaining: T[] = [];
      let count = 0;
      for (const item of items) {
        if (matchesCriteria(item as Record<string, unknown>, finalCriteria)) {
          count += 1;
        } else {
          remaining.push(item);
        }
      }
      items.length = 0;
      items.push(...remaining);
      return { count };
    };

    return {
      where,
      first,
      create,
      update,
      delete: del,
      all,
      updateMany,
      deleteMany,
    } satisfies QueryCollection<T>;
  };

  return createCollection();
}

export function createMemoryIdentityDatabase(): IdentityDatabase {
  const users: IdentityUser[] = [];
  const profiles: IdentityProfile[] = [];
  const emails: IdentityEmailAddress[] = [];
  const securityEvents: Array<{ id: string; userId: string | null; eventType: SecurityEventType; metadata: Record<string, unknown> | null }> = [];

  const securityEventCollection: QueryCollection<SecurityEventType & { id: string }> = {
    where: () => securityEventCollection,
    first: async () => null,
    create: async (data: Record<string, unknown>) => {
      const next = { id: crypto.randomUUID(), ...(data as Record<string, unknown>) } as SecurityEventType & { id: string };
      securityEvents.push(next as never);
      return next;
    },
    update: async () => {
      throw new Error('Not implemented');
    },
    delete: async () => {
      throw new Error('Not implemented');
    },
    all: async () => securityEvents as never[],
    updateMany: async () => ({ count: 0 }),
    deleteMany: async () => ({ count: 0 }),
  };

  const db: IdentityDatabase = {
    transaction: async <T>(callback: (transaction: IdentityDatabase) => Promise<T>) => callback(db),
    orm: {
      public: {
        User: createModelCollection(users),
        Profile: createModelCollection(profiles),
        EmailAddress: createModelCollection(emails),
        SecurityEvent: securityEventCollection as never,
      },
    },
  };

  return db;
}

export function createIdentityService(database: IdentityDatabase = createMemoryIdentityDatabase()): IdentityService {
  async function recordSecurityEvent(input: {
    userId?: string | null;
    eventType: SecurityEventType;
    metadata?: Record<string, string | number | boolean | null | Record<string, unknown>>;
    ipAddress?: string | null;
    userAgent?: string | null;
    oauthClientId?: string | null;
    sessionId?: string | null;
  }): Promise<unknown> {
    return database.orm.public.SecurityEvent.create({
      id: crypto.randomUUID(),
      userId: input.userId ?? null,
      oauthClientId: input.oauthClientId ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async function getUserById(userId: string): Promise<IdentityUser | null> {
    return database.orm.public.User.first({ id: userId });
  }

  async function getUserByEmail(email: string): Promise<IdentityUser | null> {
    const normalized = validateEmail(email);
    const emailRecord = await database.orm.public.EmailAddress.where({ normalizedEmail: normalized }).first();
    if (!emailRecord) {
      return null;
    }
    return getUserById(emailRecord.userId);
  }

  async function getUserByUsername(username: string): Promise<IdentityUser | null> {
    const normalized = validateUsername(username);
    const profile = await database.orm.public.Profile.where({ normalizedUsername: normalized }).first();
    if (!profile) {
      return null;
    }
    return getUserById(profile.userId);
  }

  async function getUserWithProfile(userId: string): Promise<{ user: IdentityUser; profile: IdentityProfile | null } | null> {
    const user = await getUserById(userId);
    if (!user) {
      return null;
    }
    const profile = await database.orm.public.Profile.where({ userId }).first();
    return { user, profile: profile ?? null };
  }

  async function getProfile(userId: string): Promise<IdentityProfile | null> {
    return database.orm.public.Profile.where({ userId }).first();
  }

  async function checkUsernameAvailability(username: string): Promise<boolean> {
    const normalized = normalizeUsername(username);
    if (RESERVED_USERNAMES.has(normalized)) {
      return false;
    }
    const existing = await database.orm.public.Profile.where({ normalizedUsername: normalized }).first();
    return !existing;
  }

  async function createUser(input: UserCreateInput): Promise<{ user: IdentityUser; profile: IdentityProfile; email: IdentityEmailAddress }> {
    const normalizedEmail = validateEmail(input.email);
    if (await getUserByEmail(normalizedEmail)) {
      throw new EmailAlreadyExistsError(normalizedEmail);
    }

    const username = input.username ? validateUsername(input.username) : null;
    if (username && !(await checkUsernameAvailability(username))) {
      throw new UsernameAlreadyExistsError(username);
    }

    return database.transaction(async (tx) => {
      const user = await tx.orm.public.User.create({
        id: crypto.randomUUID(),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        lastLoginAt: null,
      });

      const profile = await tx.orm.public.Profile.create({
        id: crypto.randomUUID(),
        userId: user.id,
        displayName: input.displayName ?? null,
        username,
        normalizedUsername: username,
        avatarUrl: input.avatarUrl ?? null,
        locale: input.locale ?? null,
        timeZone: input.timeZone ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const emailRecord = await tx.orm.public.EmailAddress.create({
        id: crypto.randomUUID(),
        userId: user.id,
        normalizedEmail,
        verifiedAt: null,
        isPrimary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await tx.orm.public.SecurityEvent.create({
        id: crypto.randomUUID(),
        userId: user.id,
        eventType: 'ACCOUNT_CREATED',
        metadata: { email: normalizedEmail, username: username ?? null },
      });

      return { user, profile, email: emailRecord };
    });
  }

  async function updateProfile(userId: string, input: UserProfileUpdateInput): Promise<IdentityProfile> {
    const currentProfile = await getProfile(userId);
    if (!currentProfile) {
      throw new UserNotFoundError(userId);
    }

    const nextUsername = input.username === undefined ? currentProfile.username : input.username === null ? null : validateUsername(input.username);
    if (typeof nextUsername === 'string') {
      const usernameChanged = nextUsername !== currentProfile.normalizedUsername;
      if (usernameChanged && !(await checkUsernameAvailability(nextUsername))) {
        throw new UsernameAlreadyExistsError(nextUsername);
      }
    }

    const updated = await database.orm.public.Profile.update({ where: { userId }, data: {
      displayName: input.displayName ?? currentProfile.displayName,
      username: nextUsername,
      normalizedUsername: nextUsername,
      avatarUrl: input.avatarUrl ?? currentProfile.avatarUrl,
      locale: input.locale ?? currentProfile.locale,
      timeZone: input.timeZone ?? currentProfile.timeZone,
    } });

    await recordSecurityEvent({ userId, eventType: 'PROFILE_UPDATED', metadata: { updatedFields: Object.keys(input).join(',') } });
    return updated;
  }

  async function addEmail(userId: string, email: string): Promise<IdentityEmailAddress> {
    const normalized = validateEmail(email);
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const existing = await database.orm.public.EmailAddress.where({ normalizedEmail: normalized }).first();
    if (existing && existing.userId !== userId) {
      throw new EmailAlreadyExistsError(normalized);
    }

    const primaryEmail = await database.orm.public.EmailAddress.where({ userId, isPrimary: true }).first();
    const created = await database.orm.public.EmailAddress.create({
      id: crypto.randomUUID(),
      userId,
      normalizedEmail: normalized,
      verifiedAt: null,
      isPrimary: !primaryEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await recordSecurityEvent({ userId, eventType: 'EMAIL_ADDED', metadata: { email: normalized } });
    return created;
  }

  async function removeEmail(userId: string, emailId: string): Promise<void> {
    const email = await database.orm.public.EmailAddress.where({ id: emailId, userId }).first();
    if (!email) {
      throw new UserNotFoundError(userId);
    }
    const remaining = await database.orm.public.EmailAddress.where({ userId }).all();
    if (email.isPrimary && remaining.length === 1) {
      throw new CannotRemovePrimaryEmailError();
    }
    await database.orm.public.EmailAddress.delete({ id: emailId, userId });
    await recordSecurityEvent({ userId, eventType: 'EMAIL_REMOVED', metadata: { email: email.normalizedEmail } });
  }

  async function setPrimaryEmail(userId: string, emailId: string): Promise<IdentityEmailAddress> {
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    const target = await database.orm.public.EmailAddress.where({ id: emailId, userId }).first();
    if (!target) {
      throw new EmailNotFoundError(emailId);
    }
    await database.orm.public.EmailAddress.updateMany({ userId }, { isPrimary: false });
    const updated = await database.orm.public.EmailAddress.update({ where: { id: emailId }, data: { isPrimary: true } });
    await recordSecurityEvent({ userId, eventType: 'PRIMARY_EMAIL_CHANGED', metadata: { email: target.normalizedEmail } });
    return updated;
  }

  async function setUsername(userId: string, username: string): Promise<IdentityProfile> {
    const normalized = validateUsername(username);
    if (!(await checkUsernameAvailability(normalized))) {
      throw new UsernameAlreadyExistsError(normalized);
    }
    const profile = await getProfile(userId);
    if (!profile) {
      throw new UserNotFoundError(userId);
    }
    const updated = await database.orm.public.Profile.update({ where: { userId }, data: { username: normalized, normalizedUsername: normalized } });
    await recordSecurityEvent({ userId, eventType: 'USERNAME_CHANGED', metadata: { username: normalized } });
    return updated;
  }

  async function changeUsername(userId: string, username: string): Promise<IdentityProfile> {
    return setUsername(userId, username);
  }

  async function activateUser(userId: string): Promise<IdentityUser> {
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (user.status === 'ACTIVE') {
      throw new InvalidAccountStateError('User already has an ACTIVE status.');
    }
    if (user.status === 'DELETED') {
      throw new InvalidAccountStateError('A deleted user cannot be activated.');
    }
    const updated = await database.orm.public.User.update({ where: { id: userId }, data: { status: 'ACTIVE', deletedAt: null } });
    await recordSecurityEvent({ userId, eventType: 'ACCOUNT_ACTIVATED', metadata: { status: 'ACTIVE' } });
    return updated;
  }

  async function suspendUser(userId: string): Promise<IdentityUser> {
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (user.status === 'SUSPENDED') {
      throw new InvalidAccountStateError('User is already suspended.');
    }
    if (user.status === 'DELETED') {
      throw new InvalidAccountStateError('A deleted user cannot be suspended.');
    }
    const updated = await database.orm.public.User.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    await recordSecurityEvent({ userId, eventType: 'ACCOUNT_SUSPENDED', metadata: { status: 'SUSPENDED' } });
    return updated;
  }

  async function reactivateUser(userId: string): Promise<IdentityUser> {
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (user.status !== 'SUSPENDED') {
      throw new InvalidAccountStateError('Only suspended users can be reactivated.');
    }
    const updated = await database.orm.public.User.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await recordSecurityEvent({ userId, eventType: 'ACCOUNT_REACTIVATED', metadata: { status: 'ACTIVE' } });
    return updated;
  }

  async function deactivateUser(userId: string): Promise<IdentityUser> {
    const user = await getUserById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }
    if (user.status === 'DELETED') {
      throw new InvalidAccountStateError('User is already deleted.');
    }
    const updated = await database.orm.public.User.update({ where: { id: userId }, data: { status: 'DELETED', deletedAt: new Date().toISOString() } });
    await recordSecurityEvent({ userId, eventType: 'ACCOUNT_DEACTIVATED', metadata: { status: 'DELETED' } });
    return updated;
  }

  return {
    createUser,
    getUserById,
    getUserByEmail,
    getUserByUsername,
    getUserWithProfile,
    getProfile,
    updateProfile,
    addEmail,
    removeEmail,
    setPrimaryEmail,
    checkUsernameAvailability,
    setUsername,
    changeUsername,
    activateUser,
    suspendUser,
    reactivateUser,
    deactivateUser,
    recordSecurityEvent,
  };
}

export const identityService = createIdentityService();
export { isUserStatus, normalizeEmail, validateEmail, normalizeUsername, validateUsername, RESERVED_USERNAMES };
