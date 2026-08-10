import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { MailModule } from './mail/mail.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveryOptionsModule } from './delivery-options/delivery-options.module';
import { ContactModule } from './contact/contact.module';
import { AddressesModule } from './addresses/addresses.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TwoFactorScopeGuard } from './common/guards/two-factor-scope.guard';
import { TokenBucketThrottlerStorage } from './common/throttler/token-bucket-throttler.storage';
import { RedisService } from './redis/redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redis: RedisService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
        // Real token-bucket algorithm (continuous refill), backed by Redis
        // so limits are enforced consistently across API instances.
        storage: new TokenBucketThrottlerStorage(redis),
      }),
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    MailModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    DeliveryOptionsModule,
    ContactModule,
    AddressesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global authentication: routes are protected unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Restricts 'twofa_setup'-scoped tokens (mandatory 2FA enrollment) to
    // just the routes needed to finish enrolling. Must run after JwtAuthGuard.
    { provide: APP_GUARD, useClass: TwoFactorScopeGuard },
    // Global per-IP rate limiting.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
