import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@vendia/serverless-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.factory.js';

/**
 * Vercel serverless entry — same app as `src/main.ts`, warmed once per
 * function instance and reused across invocations.
 *
 * NOTE: serverless functions have no sticky long-lived connections, so the
 * `/chat` WebSocket gateway does not work here. REST + auth + everything
 * else works. If you need live chat in production, host the backend on
 * Render / Railway / Fly instead and point the frontend at it.
 */
let cachedHandler: ((req: any, res: any) => Promise<void>) | null = null;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  cachedHandler = serverlessExpress({ app: expressApp });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedHandler) await bootstrap();
  return cachedHandler!(req, res);
}
