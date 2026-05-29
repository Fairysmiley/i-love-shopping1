import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('oauth.facebook.clientId') || 'disabled',
      clientSecret: config.get<string>('oauth.facebook.clientSecret') || 'disabled',
      callbackURL: config.get<string>('oauth.facebook.callbackUrl') ?? '',
      scope: ['email'],
      profileFields: ['id', 'emails', 'name'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, user?: OAuthProfile) => void,
  ): void {
    const user: OAuthProfile = {
      provider: 'FACEBOOK',
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value ?? `${profile.id}@facebook.local`,
      firstName: profile.name?.givenName ?? 'Facebook',
      lastName: profile.name?.familyName ?? 'User',
    };
    done(null, user);
  }
}
