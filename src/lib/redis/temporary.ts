import { getRedisClient } from './client.ts';

export async function setTemporaryValue(key: string, value: string, ttlSeconds = 300): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(key, value, { ex: ttlSeconds });
}

export async function getTemporaryValue(key: string): Promise<string | null> {
  const redis = await getRedisClient();
  // Normalize values returned by Redis: JSON may be automatically deserialized
  // by the client, while callers expect a string to parse.
  const value = await redis.get<unknown>(key);
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function deleteTemporaryValue(key: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(key);
}
