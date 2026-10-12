import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../src/lib/redis/client.ts';

const key = `oneauth:connection-test:${randomUUID()}`;
let client;

try {
  client = await getRedisClient();
  await client.set(key, 'ok', { ex: 15 });

  const result = await client.get(key);
  if (result !== 'ok') {
    throw new Error('Redis returned an unexpected connection-test value.');
  }

  console.info('Redis connection check passed.');
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Redis connection check failed:', detail);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.del(key);
  }
}
