import { Redis } from '@upstash/redis';

type RedisGlobal = typeof globalThis & {
  oneAuthRedisClient?: Redis;
};

const redisGlobal = globalThis as RedisGlobal;

function createRedisClient(): Redis {
  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];

  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set to connect to Upstash Redis.',
    );
  }

  if (!url.startsWith('https://')) {
    throw new Error('UPSTASH_REDIS_REST_URL must use HTTPS.');
  }

  return new Redis({ url, token });
}

export async function getRedisClient(): Promise<Redis> {
  return (redisGlobal.oneAuthRedisClient ??= createRedisClient());
}
