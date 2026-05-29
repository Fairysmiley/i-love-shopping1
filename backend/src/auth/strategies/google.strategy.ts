import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface OAuthProfile {
  provider: 'GOOGLE' | 'FACEBOOK';
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('oauth.google.clientId') || 'disabled',
      clientSecret: config.get<string>('oauth.google.clientSecret') || 'disabled',
      callbackURL: config.get<string>('oauth.google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const user: OAuthProfile = {
      provider: 'GOOGLE',
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      firstName: profile.name?.givenName ?? 'Google',
      lastName: profile.name?.familyName ?? 'User',
    };
    done(null, user);
  }
}
