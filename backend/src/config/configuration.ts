export interface AppConfig {
  env: string;
  apiPort: number;
  apiPublicUrl: string;
  webPublicUrl: string;
  databaseUrl: string;
  redis: { host: string; port: number; url: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  recaptcha: { secret: string; minScore: number };
  oauth: {
    google: { clientId: string; clientSecret: string; callbackUrl: string };
    facebook: { clientId: string; clientSecret: string; callbackUrl: string };
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  twoFactorAppName: string;
  throttle: { ttl: number; limit: number };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  apiPort: parseInt(process.env.API_PORT ?? '3001', 10),
  apiPublicUrl: process.env.API_PUBLIC_URL ?? 'http://localhost:3001',
  webPublicUrl: process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  recaptcha: {
    secret: process.env.RECAPTCHA_SECRET ?? '',
    minScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE ?? '0.5'),
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl:
        process.env.GOOGLE_CALLBACK_URL ??
        'http://localhost:3001/api/v1/auth/oauth/google/callback',
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID ?? '',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? '',
      callbackUrl:
        process.env.FACEBOOK_CALLBACK_URL ??
        'http://localhost:3001/api/v1/auth/oauth/facebook/callback',
    },
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'Villi <no-reply@villi.test>',
  },
  twoFactorAppName: process.env.TWO_FACTOR_APP_NAME ?? 'Villi',
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
});
