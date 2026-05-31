import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { TwoFactorService } from './two-factor.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TwoFactorCodeDto,
} from './dto/auth.dto';
import { OAuthProfile } from './strategies/google.strategy';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly twoFactor: TwoFactorService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private ctx(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  private cookieSecure(): boolean {
    const publicUrl = this.config.get<string>('apiPublicUrl') ?? '';
    // Secure cookies for HTTPS public URLs (ngrok, production). Plain HTTP local dev stays non-secure.
    return publicUrl.startsWith('https://');
  }

  private setRefreshCookie(res: Response, token: string): void {
    const secure = this.cookieSecure();
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: this.tokens.refreshCookieMaxAgeMs(),
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth', secure: this.cookieSecure() });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register with email + password (CAPTCHA protected)' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.register(dto);
    const pair = await this.tokens.issuePair(user, this.ctx(req));
    this.setRefreshCookie(res, pair.refreshToken);
    return {
      accessToken: pair.accessToken,
      expiresIn: pair.accessExpiresIn,
      user: this.users.toPublic(user),
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login; returns access token (refresh set as httpOnly cookie)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    if ('requiresTwoFactor' in result) {
      return { requiresTwoFactor: true };
    }
    const pair = await this.tokens.issuePair(result.user, this.ctx(req));
    this.setRefreshCookie(res, pair.refreshToken);
    return {
      accessToken: pair.accessToken,
      expiresIn: pair.accessExpiresIn,
      user: this.users.toPublic(result.user),
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and obtain a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const pair = await this.tokens.rotate(presented, this.ctx(req));
    this.setRefreshCookie(res, pair.refreshToken);
    return { accessToken: pair.accessToken, expiresIn: pair.accessExpiresIn };
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh + access token' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) {
      await this.tokens.revokeRefreshToken(presented);
    }
    // Deny the in-flight access token for the rest of its (short) lifetime.
    await this.redis.denylistAccessToken(user.jti, this.tokens.accessTtlSeconds());
    this.clearRefreshCookie(res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated. Please sign in again.' };
  }

  // ───────────────────── Two-factor authentication ─────────────────────

  @Get('2fa/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether 2FA is enabled for the current user' })
  async twoFactorStatus(@CurrentUser('userId') userId: string) {
    return { enabled: await this.twoFactor.isEnabled(userId) };
  }

  @Post('2fa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Begin 2FA enrollment (returns QR code + recovery codes)' })
  async twoFactorSetup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.beginSetup(user.userId, user.email);
  }

  @Post('2fa/enable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm and enable 2FA with a TOTP code' })
  async twoFactorEnable(@CurrentUser('userId') userId: string, @Body() dto: TwoFactorCodeDto) {
    await this.twoFactor.confirm(userId, dto.code);
    return { enabled: true };
  }

  @Post('2fa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA for the current user' })
  async twoFactorDisable(@CurrentUser('userId') userId: string) {
    await this.twoFactor.disable(userId);
    return { enabled: false };
  }

  // ───────────────────────────── OAuth ─────────────────────────────

  @Public()
  @Get('oauth/google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth flow' })
  googleStart(): void {
    // Passport redirects to Google.
  }

  @Public()
  @Get('oauth/google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    await this.completeOAuth(req.user as OAuthProfile, req, res);
  }

  @Public()
  @Get('oauth/facebook')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Start Facebook OAuth flow' })
  facebookStart(): void {
    // Passport redirects to Facebook.
  }

  @Public()
  @Get('oauth/facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Req() req: Request, @Res() res: Response) {
    await this.completeOAuth(req.user as OAuthProfile, req, res);
  }

  /** Shared OAuth completion: provision/link user, issue tokens, redirect to web. */
  private async completeOAuth(profile: OAuthProfile, req: Request, res: Response): Promise<void> {
    const user = await this.users.findOrCreateFromOAuth(profile);
    const pair = await this.tokens.issuePair(user, this.ctx(req));
    this.setRefreshCookie(res, pair.refreshToken);
    const webUrl = this.config.get<string>('webPublicUrl');
    // Hand the short-lived access token to the SPA via URL fragment (kept out
    // of server logs / Referer headers); the SPA stores it in memory only.
    res.redirect(`${webUrl}/oauth/callback#accessToken=${pair.accessToken}`);
  }
}
