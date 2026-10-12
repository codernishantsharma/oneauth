import { z } from 'zod';

import { IdentityError, InvalidEmailError, InvalidUsernameError } from './identity.errors.ts';

export const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'signin',
  'support',
  'help',
  'settings',
  'account',
  'acc',
  'security',
  'oneauth',
  'oauth',
  'oidc',
  'well-known',
  'developer',
  'developers',
  'system',
  'root',
]);

export function normalizeEmail(value: string): string {
  if (typeof value !== 'string') {
    throw new IdentityError('INVALID_EMAIL', 'Email address must be a string.');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new InvalidEmailError(value);
  }

  return normalized;
}

export function normalizeUsername(value: string): string {
  if (typeof value !== 'string') {
    throw new InvalidUsernameError(String(value));
  }

  const normalized = value.trim().replace(/\s+/g, '-').toLowerCase();
  if (normalized.length < 3 || normalized.length > 30) {
    throw new InvalidUsernameError(value);
  }

  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalized)) {
    throw new InvalidUsernameError(value);
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    throw new InvalidUsernameError(value);
  }

  return normalized;
}

export const emailSchema = z.string().trim().min(1).email();
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i, 'Invalid username');

export function validateUsername(value: string): string {
  const normalized = normalizeUsername(value);
  usernameSchema.parse(normalized);
  return normalized;
}

export function validateEmail(value: string): string {
  try {
    return normalizeEmail(emailSchema.parse(value));
  } catch {
    throw new InvalidEmailError(value);
  }
}
