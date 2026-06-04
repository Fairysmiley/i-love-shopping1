import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { OAuthProfile } from './oauth-profile';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('oauth.github.clientId') || 'disabled',
      clientSecret: config.get<string>('oauth.github.clientSecret') || 'disabled',
      callbackURL: config.get<string>('oauth.github.callbackUrl') ?? '',
      scope: ['user:email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, user?: OAuthProfile) => void,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(
        new UnauthorizedException(
          'GitHub did not share an email. Allow email access or add a public email in GitHub settings.',
        ),
      );
      return;
    }

    const display = profile.displayName?.trim() || profile.username || 'GitHub';
    const [firstName, ...rest] = display.split(/\s+/);
    const user: OAuthProfile = {
      provider: 'GITHUB',
      providerAccountId: profile.id,
      email,
      firstName: firstName || 'GitHub',
      lastName: rest.join(' ') || 'User',
    };
    done(null, user);
  }
}
