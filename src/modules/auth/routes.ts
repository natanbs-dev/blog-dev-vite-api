import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { sessions } from '../../db/schema.ts';
import { privateUser } from '../../lib/dto.ts';
import { valid } from '../../lib/validate.ts';
import { clientIp } from '../../middleware/security.ts';
import { clearSessionCookie, needUser, startSession } from '../../middleware/session.ts';
import type { AppEnv, Deps } from '../../types.ts';
import { forgotBody, loginBody, registerBody, resetBody, tokenBody } from './schemas.ts';
import * as auth from './service.ts';

export function authRoutes(deps: Deps) {
  const { limits } = deps;
  return new Hono<AppEnv>()
    .post('/register', valid('json', registerBody), async (c) => {
      await limits.register(clientIp(c));
      const user = await auth.register(deps, c.req.valid('json'));
      await startSession(c, deps, user.id);
      return c.json({ user: privateUser(user) }, 201);
    })
    .post('/verify', valid('json', tokenBody), async (c) => {
      await auth.verifyEmail(deps, c.req.valid('json').token);
      return c.body(null, 204);
    })
    .post('/verify/resend', async (c) => {
      const user = needUser(c);
      await limits.resendVerify(user.id);
      if (!user.emailVerifiedAt) await auth.sendVerification(deps, user);
      return c.body(null, 204);
    })
    .post('/login', valid('json', loginBody), async (c) => {
      const { email, password } = c.req.valid('json');
      await limits.loginIp(clientIp(c));
      await limits.loginEmail(email);
      const user = await auth.authenticate(deps, email, password);
      await startSession(c, deps, user.id);
      return c.json({ user: privateUser(user) });
    })
    .post('/logout', async (c) => {
      const id = c.get('sessionId');
      if (id) await deps.db.delete(sessions).where(eq(sessions.id, id));
      clearSessionCookie(c);
      return c.body(null, 204);
    })
    .post('/forgot', valid('json', forgotBody), async (c) => {
      const { email } = c.req.valid('json');
      await limits.forgotIp(clientIp(c));
      await limits.forgotEmail(email);
      await auth.requestReset(deps, email);
      return c.body(null, 204);
    })
    .post('/reset', valid('json', resetBody), async (c) => {
      const { token, password } = c.req.valid('json');
      await auth.resetPassword(deps, token, password);
      clearSessionCookie(c);
      return c.body(null, 204);
    });
}
