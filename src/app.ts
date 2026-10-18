import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { HttpError } from './lib/errors.ts';
import { proxySecret, requestLog, sameOrigin } from './middleware/security.ts';
import { sessionMiddleware } from './middleware/session.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { commentRoutes } from './modules/comments/routes.ts';
import { userRoutes } from './modules/users/routes.ts';
import type { AppEnv, Deps } from './types.ts';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>().basePath('/api');

  // a ordem importa: log → segredo do proxy → tamanho → origem → sessão
  app.use(requestLog(deps.log));
  app.use(secureHeaders());
  app.use(proxySecret(deps.config.PROXY_SECRET));
  app.use(
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: 'too_large', message: 'Requisição grande demais.' }, 413),
    }),
  );
  app.use(sameOrigin(deps.config.SITE_URL));
  app.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store'); // respostas dependem de quem está logado
  });
  app.use(sessionMiddleware(deps));

  const routes = app
    .get('/health', async (c) => {
      await deps.db.execute(sql`select 1`);
      return c.json({ ok: true });
    })
    .route('/auth', authRoutes(deps))
    .route('/', userRoutes(deps))
    .route('/', commentRoutes(deps));

  app.notFound((c) => c.json({ error: 'not_found', message: 'Rota não encontrada.' }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
      return c.json({ error: err.code, message: err.message, ...(err.fields && { fields: err.fields }) }, err.status);
    }
    if (err instanceof HTTPException) {
      // ex.: JSON malformado ou Content-Type errado
      return c.json({ error: 'bad_request', message: 'Requisição inválida.' }, err.status === 400 ? 400 : 500);
    }
    deps.log.error({ err, path: c.req.path }, 'erro não tratado');
    return c.json({ error: 'internal', message: 'Erro interno. Tente de novo em instantes.' }, 500);
  });

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
