import { Hono } from 'hono';
import { privateUser, publicUser } from '../../lib/dto.ts';
import { valid } from '../../lib/validate.ts';
import { clearSessionCookie, needUser } from '../../middleware/session.ts';
import type { AppEnv, Deps } from '../../types.ts';
import { changePasswordBody, deleteAccountBody, profileBody, usernameParam } from './schemas.ts';
import * as users from './service.ts';

export function userRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .get('/me', (c) => c.json({ user: privateUser(needUser(c)) }))
    .patch('/me', valid('json', profileBody), async (c) => {
      const user = await users.updateProfile(deps, needUser(c), c.req.valid('json'));
      return c.json({ user: privateUser(user) });
    })
    .post('/me/password', valid('json', changePasswordBody), async (c) => {
      const user = needUser(c);
      await deps.limits.sensitive(user.id);
      const { currentPassword, newPassword } = c.req.valid('json');
      await users.changePassword(deps, user, c.get('sessionId')!, currentPassword, newPassword);
      return c.body(null, 204);
    })
    .delete('/me', valid('json', deleteAccountBody), async (c) => {
      const user = needUser(c);
      await deps.limits.sensitive(user.id);
      await users.deleteAccount(deps, user, c.req.valid('json').password);
      clearSessionCookie(c);
      return c.body(null, 204);
    })
    .get('/users/:username', valid('param', usernameParam), async (c) => {
      const { user, recent } = await users.publicProfile(deps, c.req.valid('param').username);
      return c.json({ user: publicUser(user), recentComments: recent });
    });
}
