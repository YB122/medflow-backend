import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel serverless entry — same app as `src/main.ts`, warmed once per
 * function instance and reused across invocations.
 *
 * All imports are lazy (inside the handler) so that even a module-load
 * failure is caught below and returned as JSON instead of a blind
 * FUNCTION_INVOCATION_FAILED.
 *
 * No adapter library: an Express app IS a (req, res) listener, so Vercel's
 * Node runtime invokes it directly after `app.init()`.
 *
 * NOTE: serverless functions have no sticky long-lived connections, so the
 * `/chat` WebSocket gateway does not work here. REST + auth + everything
 * else works. If you need live chat in production, host the backend on
 * Render / Railway / Fly instead and point the frontend at it.
 */
let expressApp: ((req: any, res: any) => void) | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!expressApp) {
      const { NestFactory } = await import('@nestjs/core');
      const { AppModule } = await import('../src/app.module.js');
      const { configureApp } = await import('../src/app.factory.js');
      const app = await NestFactory.create(AppModule);
      configureApp(app);
      await app.init();
      expressApp = app.getHttpAdapter().getInstance();
    }
    return (expressApp as any)(req, res);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('serverless boot failed:', e?.message ?? e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    // TEMPORARY: short message only (no stack) until the deploy is healthy.
    res.end(JSON.stringify({ error: 'backend failed to start', message: String(e?.message ?? e).slice(0, 500) }));
  }
}
