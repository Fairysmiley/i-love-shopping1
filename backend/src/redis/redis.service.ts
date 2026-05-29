import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  get raw(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Adds a token jti to the access-token denylist until it would expire. */
  async denylistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(`denylist:access:${jti}`, '1', 'EX', ttlSeconds);
  }

  async isAccessTokenDenied(jti: string): Promise<boolean> {
    const v = await this.client.get(`denylist:access:${jti}`);
    return v !== null;
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
