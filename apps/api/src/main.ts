import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config } from 'dotenv';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import { PayloadTooLargeFilter } from './common/filters/payload-too-large.filter';
import { DEFAULT_ROOT_DOMAIN } from '@lawfirm/shared';

config({ path: resolve(__dirname, '../.env') });

function isAllowedOrigin(origin: string | undefined, allowed: string[], rootDomain: string): boolean {
  if (!origin) return true;
  if (allowed.includes(origin) || allowed.includes('*')) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const root = rootDomain.toLowerCase();
    if (host === root || host === `www.${root}` || host.endsWith(`.${root}`)) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
  } catch {
    return false;
  }
  return false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    setHeaders: (res, filePath) => {
      if (/\/line-assets\/home[^/]*\/\d+$/.test(filePath)) {
        res.setHeader('Content-Type', 'image/jpeg');
      }
    },
  });

  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3005')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const rootDomain = process.env.ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (isAllowedOrigin(origin, corsOrigins, rootDomain)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`), false);
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Firm-Slug'],
  });
  app.useGlobalFilters(new PayloadTooLargeFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`API running on http://${host}:${port}`);
}

bootstrap();
