import { Hono } from 'hono';
import { valid } from '../../lib/validate.ts';
import { needUser } from '../../middleware/session.ts';
import type { AppEnv, Deps } from '../../types.ts';
import { usernameParam } from '../users/schemas.ts';
import { banBody, createBody, editBody, idParam, listQuery, slugParam } from './schemas.ts';
import * as comments from './service.ts';

export function commentRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .get('/posts/:slug/comments', valid('param', slugParam), valid('query', listQuery), async (c) => {
      const { slug } = c.req.valid('param');
      return c.json(await comments.list(deps, slug, c.req.valid('query').cursor, c.get('user')));
    })
    .post('/posts/:slug/comments', valid('param', slugParam), valid('json', createBody), async (c) => {
      const user = needUser(c, { verified: true });
      await deps.limits.comment(user.id);
      const { body, parentId } = c.req.valid('json');
      const comment = await comments.create(deps, user, c.req.valid('param').slug, body, parentId);
      return c.json({ comment }, 201);
    })
    .patch('/comments/:id', valid('param', idParam), valid('json', editBody), async (c) => {
      const user = needUser(c, { verified: true });
      const comment = await comments.edit(deps, user, c.req.valid('param').id, c.req.valid('json').body);
      return c.json({ comment });
    })
    .delete('/comments/:id', valid('param', idParam), async (c) => {
      await comments.remove(deps, needUser(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .post('/admin/users/:username/ban', valid('param', usernameParam), valid('json', banBody), async (c) => {
      needUser(c, { admin: true });
      await comments.setBan(deps, c.req.valid('param').username, true, c.req.valid('json').deleteComments);
      return c.body(null, 204);
    })
    .delete('/admin/users/:username/ban', valid('param', usernameParam), async (c) => {
      needUser(c, { admin: true });
      await comments.setBan(deps, c.req.valid('param').username, false);
      return c.body(null, 204);
    });
}
