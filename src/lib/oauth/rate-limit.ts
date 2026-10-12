import { getRedisClient } from "@/src/lib/redis/client";

function requestAddress(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : "unknown";
}

export async function allowOAuthRequest(request: Request, bucket: string, limit: number, windowSeconds: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") throw new Error("OAuth rate limiting requires Upstash Redis in production.");
    return true;
  }
  const key = `oneauth:ratelimit:${bucket}:${requestAddress(request)}`;
  const redis = await getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}

export function rateLimitedResponse() {
  return Response.json({error:"temporarily_unavailable",error_description:"Too many requests. Retry later."},{status:429,headers:{"Cache-Control":"no-store","Retry-After":"60"}});
}
