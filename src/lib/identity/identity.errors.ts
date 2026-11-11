export type IdentityErrorCode =
  | 'USER_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'USERNAME_ALREADY_EXISTS'
  | 'INVALID_USERNAME'
  | 'INVALID_ACCOUNT_STATE'
  | 'PRIMARY_EMAIL_REQUIRED'
  | 'CANNOT_REMOVE_PRIMARY_EMAIL'
  | 'EMAIL_NOT_FOUND'
  | 'USERNAME_NOT_AVAILABLE'
  | 'INVALID_EMAIL';

export class IdentityError extends Error {
  public readonly code: IdentityErrorCode;

  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
  }
}

export class UserNotFoundError extends IdentityError {
  constructor(userId?: string) {
    const detail = userId ? `User ${userId} was not found.` : 'User was not found.';
    super('USER_NOT_FOUND', detail);
  }
}

export class EmailAlreadyExistsError extends IdentityError {
  constructor(email: string) {
    super('EMAIL_ALREADY_EXISTS', `The email address ${email} already exists.`);
  }
}

export class UsernameAlreadyExistsError extends IdentityError {
  constructor(username: string) {
    super('USERNAME_ALREADY_EXISTS', `The username ${username} is already in use.`);
  }
}

export class InvalidUsernameError extends IdentityError {
  constructor(username: string) {
    super('INVALID_USERNAME', `The username ${username} is invalid.`);
  }
}

export class InvalidAccountStateError extends IdentityError {
  constructor(message: string) {
    super('INVALID_ACCOUNT_STATE', message);
  }
}

export class PrimaryEmailRequiredError extends IdentityError {
  constructor() {
    super('PRIMARY_EMAIL_REQUIRED', 'A primary email address is required.');
  }
}

export class CannotRemovePrimaryEmailError extends IdentityError {
  constructor() {
    super('CANNOT_REMOVE_PRIMARY_EMAIL', 'The primary email address cannot be removed.');
  }
}

export class EmailNotFoundError extends IdentityError {
  constructor(email: string) {
    super('EMAIL_NOT_FOUND', `No account is associated with ${email}.`);
  }
}

export class UsernameNotAvailableError extends IdentityError {
  constructor(username: string) {
    super('USERNAME_NOT_AVAILABLE', `The username ${username} is not available.`);
  }
}

export class InvalidEmailError extends IdentityError {
  constructor(value: string) {
    super('INVALID_EMAIL', `The email address ${value} is invalid.`);
  }
}
