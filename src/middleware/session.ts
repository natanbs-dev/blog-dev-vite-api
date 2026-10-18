import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sessions, users } from '../db/schema.ts';
import { forbidden, unauthorized } from '../lib/errors.ts';
import { hashToken, newToken } from '../lib/tokens.ts';
import type { AppEnv, Deps } from '../types.ts';

export const SESSION_COOKIE = 'sid';
const DAY = 24 * 60 * 60 * 1000;
const TTL = 30 * DAY;

function writeCookie(c: Context, token: string, expires: Date) {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/api', expires });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/api', secure: true });
}

/** Abre uma sessão nova (token novo a cada login) e grava o cookie. */
export async function startSession(c: Context<AppEnv>, deps: Deps, userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL);
  const old = c.get('sessionId');
  if (old) await deps.db.delete(sessions).where(eq(sessions.id, old));
  await deps.db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: c.req.header('user-agent')?.slice(0, 200) ?? null,
  });
  writeCookie(c, token, expiresAt);
  c.set('sessionId', hashToken(token));
}

/** Carrega o usuário da sessão em c.var.user. Renova a validade no máximo uma vez por dia. */
export function sessionMiddleware(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null);
    c.set('sessionId', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token && token.length <= 64) {
      const id = hashToken(token);
      const [hit] = await deps.db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
        .limit(1);
      if (hit && !hit.user.bannedAt) {
        c.set('user', hit.user);
        c.set('sessionId', id);
        if (Date.now() - hit.session.lastSeenAt.getTime() > DAY) {
          const expiresAt = new Date(Date.now() + TTL);
          await deps.db.update(sessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(sessions.id, id));
          writeCookie(c, token, expiresAt);
        }
      } else {
        clearSessionCookie(c);
      }
    }
    await next();
  };
}

/** Usuário logado, ou 401. Com verified, exige e-mail confirmado; com admin, exige papel ADMIN. */
export function needUser(c: Context<AppEnv>, opts: { verified?: boolean; admin?: boolean } = {}) {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (opts.verified && !user.emailVerifiedAt) throw forbidden('Confirme seu e-mail para continuar.');
  if (opts.admin && user.role !== 'ADMIN') throw forbidden();
  return user;
}
