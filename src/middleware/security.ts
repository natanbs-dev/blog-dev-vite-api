import type { Context, MiddlewareHandler } from 'hono';
import type { Logger } from 'pino';
import { safeEqual } from '../lib/tokens.ts';

/** Só o proxy (Cloudflare em produção, Vite em dev) conhece o segredo. Chamada direta = 403. */
export function proxySecret(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (!safeEqual(c.req.header('x-proxy-secret') ?? '', secret)) {
      return c.json({ error: 'forbidden', message: 'Acesso direto à API não é permitido.' }, 403);
    }
    await next();
  };
}

/**
 * Proteção CSRF: toda escrita precisa vir do próprio site.
 * O csrf() do Hono só olha formulários; aqui vale para JSON também.
 */
export function sameOrigin(site: string): MiddlewareHandler {
  return async (c, next) => {
    const safe = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS';
    if (!safe && c.req.header('origin') !== site) {
      return c.json({ error: 'bad_origin', message: 'Origem da requisição não permitida.' }, 403);
    }
    await next();
  };
}

/** IP do leitor. O proxy coloca em X-Real-IP; como o proxy é autenticado, dá para confiar. */
export const clientIp = (c: Context): string => c.req.header('x-real-ip') ?? 'local';

export function requestLog(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();
    log.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
      'req',
    );
  };
}
