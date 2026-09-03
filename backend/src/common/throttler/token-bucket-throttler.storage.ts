import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * A genuine token-bucket rate limiter, backed by Redis so it works correctly
 * across multiple API instances. Each (route, client) pair gets a bucket of
 * `limit` tokens that continuously refills at `limit / ttl` tokens/ms —
 * unlike a fixed-window counter, there's no "wall" where the whole quota
 * resets at once; capacity trickles back in smoothly, and a client that
 * hasn't made a request in a while has a full bucket again.
 *
 * The increment (check-and-consume-one-token) happens in a single Lua script
 * so concurrent requests for the same key can't race past each other.
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRatePerMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttlSeconds = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  lastRefill = now
end

local elapsed = math.max(0, now - lastRefill)
tokens = math.min(capacity, tokens + elapsed * refillRatePerMs)

local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, ttlSeconds)

return { allowed, tostring(tokens) }
`;

@Injectable()
export class TokenBucketThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const refillRatePerMs = limit / ttl; // bucket fully refills over one `ttl` window
    const bucketKey = `ratelimit:bucket:${throttlerName}:${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000) + 1); // Redis key outlives the window so idle clients don't lose their refill progress

    const result = (await this.redis.raw.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      bucketKey,
      limit,
      refillRatePerMs,
      now,
      ttlSeconds,
    )) as [number, string];

    const allowed = result[0] === 1;
    const tokensRemaining = Number(result[1]);
    const isBlocked = !allowed;
    // How long until the bucket has refilled enough for one more request.
    const msUntilNextToken = isBlocked
      ? Math.max(0, Math.ceil((1 - tokensRemaining) / refillRatePerMs))
      : 0;

    return {
      totalHits: Math.max(0, Math.round(limit - tokensRemaining)),
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked,
      timeToBlockExpire: Math.ceil(msUntilNextToken / 1000),
    };
  }
}
