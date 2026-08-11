import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { resolveCorsOrigin } from './cors';

async function bootstrap(): Promise<void> {
  const httpsOptions = {
    key: fs.readFileSync(path.join(process.cwd(), '..', 'certs/key.pem')),
    cert: fs.readFileSync(path.join(process.cwd(), '..', 'certs/cert.pem')),
  };

  // rawBody: true keeps the original request buffer around (req.rawBody) so
  // the Stripe webhook route can verify the signature against the exact
  // bytes Stripe signed, even though the global pipe also parses it as JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    httpsOptions,
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Serves admin-uploaded product images from ImageService's uploadDir
  // (backend/uploads/products/<id>-{thumbnail,medium,full}.webp) at the plain
  // /uploads/... URLs ImageService.processProductImage() already returns —
  // unversioned, since this is static middleware, not a controller route.
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // API-first: a stable, versioned, documented surface.
  app.setGlobalPrefix('api', { exclude: [] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: resolveCorsOrigin(config),
    credentials: true,
  });

  // Validate + strip unknown fields globally; transform payloads to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Villi API')
    .setDescription(
      'Foundation API for Villi — a curated marketplace for verified, authenticated pre-loved Nordic outdoor apparel. Covers auth, users, and the product catalog.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('apiPort') ?? 3001;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
