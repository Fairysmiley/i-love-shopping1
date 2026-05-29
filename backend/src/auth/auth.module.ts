import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { TokensService } from './tokens.service';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        // `expiresIn` is a vercel/ms duration string; cast since ConfigService
        // returns a plain `string`, not the library's template-literal type.
        signOptions: { expiresIn: (config.get<string>('jwt.accessTtl') ?? '900s') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    CaptchaService,
    TwoFactorService,
    JwtStrategy,
    GoogleStrategy,
    FacebookStrategy,
  ],
  exports: [TokensService],
})
export class AuthModule {}
