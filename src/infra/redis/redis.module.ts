import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        // Connect lazily; failures must not crash boot in dev without redis.
        client.on('error', (err) => console.error('[redis] error', err?.message));
        return client;
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
