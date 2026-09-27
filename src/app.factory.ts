import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';

/**
 * Shared Nest app wiring (security, CORS, validation, authN/Z, prefix).
 * Used by both `main.ts` (long-running server) and `api/index.ts`
 * (Vercel serverless) so behavior is identical everywhere.
 */
export function configureApp(app: INestApplication): void {
  // Security headers (OWASP) + CORS
  // NOTE: `as any` — helmet's .d.cts types expose no callable default under
  // NodeNext; at runtime the ESM entry's default export is the middleware.
  app.use((helmet as any)());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
    credentials: true,
  });

  // Global validation: whitelist + forbid unknown + transform
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global authN/Z: every route is JWT-protected by default,
  // opt out with @Public(). Roles/Permissions enforced via decorators.
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new RolesGuard(reflector),
    new PermissionsGuard(reflector),
  );

  app.setGlobalPrefix('api/v1');
}
