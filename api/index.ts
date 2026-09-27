import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel serverless entry — same app as `src/main.ts`, warmed once per
 * function instance and reused across invocations.
 *
 * All imports are lazy (inside the handler) so that even a module-load
 * failure is caught below and returned as JSON instead of a blind
 * FUNCTION_INVOCATION_FAILED.
 *
 * NOTE: serverless functions have no sticky long-lived connections, so the
 * `/chat` WebSocket gateway does not work here. REST + auth + everything
 * else works. If you need live chat in production, host the backend on
 * Render / Railway / Fly instead and point the frontend at it.
 */
let cachedHandler: ((req: any, res: any) => Promise<void>) | null = null;

/** Force Node 22 for this function (project default may be older). */
export const config = { runtime: 'nodejs22.x' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedHandler) {
      const [{ NestFactory }, { AppModule }, { configureApp }, serverlessMod] = await Promise.all([
        import('@nestjs/core'),
        import('../src/app.module.js'),
        import('../src/app.factory.js'),
        import('@vendia/serverless-express'),
      ]);
      const app = await NestFactory.create(AppModule);
      configureApp(app);
      await app.init();
      const expressApp = app.getHttpAdapter().getInstance();
      cachedHandler = serverlessMod.default({ app: expressApp });
    }
    return cachedHandler!(req, res);
  } catch (e: any) {
    // TEMPORARY boot diagnostics — remove once the deploy is healthy.
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ marker: 'diag-v3', bootError: String(e?.stack ?? e).slice(0, 2000) }));
  }
}
