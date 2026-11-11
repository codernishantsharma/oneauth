import assert from 'node:assert/strict';
import test from 'node:test';

import { EmailAlreadyExistsError, InvalidAccountStateError, InvalidUsernameError, UsernameAlreadyExistsError } from './identity.errors.ts';
import { createIdentityService, createMemoryIdentityDatabase } from './service.ts';

test('createUser stores normalized identity data and emits account creation event', async () => {
  const db = createMemoryIdentityDatabase();
  const service = createIdentityService(db);

  const result = await service.createUser({
    email: 'Nishant@Example.COM',
    username: 'Nishant',
    displayName: 'Nishant',
  });

  assert.equal(result.email.normalizedEmail, 'nishant@example.com');
  assert.equal(result.profile.username, 'nishant');
  assert.equal(result.profile.normalizedUsername, 'nishant');
  assert.equal(result.user.status, 'ACTIVE');

  const events = await db.orm.public.SecurityEvent.all();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'ACCOUNT_CREATED');
  assert.equal(events[0].metadata?.email, 'nishant@example.com');
});

test('duplicate email and username collisions are rejected', async () => {
  const db = createMemoryIdentityDatabase();
  const service = createIdentityService(db);

  await service.createUser({ email: 'a@example.com', username: 'alice' });

  await assert.rejects(() => service.createUser({ email: 'A@example.com', username: 'bob' }), EmailAlreadyExistsError);
  await assert.rejects(() => service.createUser({ email: 'b@example.com', username: 'ALICE' }), UsernameAlreadyExistsError);
});

test('reserved signup usernames are rejected', async () => {
  const db = createMemoryIdentityDatabase();
  const service = createIdentityService(db);

  await assert.rejects(() => service.createUser({ email: 'acc@example.com', username: 'acc' }), InvalidUsernameError);
});

test('profile update and lifecycle transitions operate on user state', async () => {
  const db = createMemoryIdentityDatabase();
  const service = createIdentityService(db);

  const { user } = await service.createUser({ email: 'hello@example.com', username: 'hello' });
  const updatedProfile = await service.updateProfile(user.id, { username: 'hello-world', displayName: 'Hello World' });

  assert.equal(updatedProfile.username, 'hello-world');
  assert.equal(updatedProfile.normalizedUsername, 'hello-world');

  await assert.rejects(() => service.activateUser(user.id), InvalidAccountStateError);

  const suspended = await service.suspendUser(user.id);
  assert.equal(suspended.status, 'SUSPENDED');

  const reactivated = await service.reactivateUser(user.id);
  assert.equal(reactivated.status, 'ACTIVE');
});
