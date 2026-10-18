import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { comments, sessions, users, type User } from '../../db/schema.ts';
import { HttpError, conflict, notFound, uniqueViolation } from '../../lib/errors.ts';
import { checkPassword, hashPassword } from '../../lib/password.ts';
import type { Deps } from '../../types.ts';

export async function updateProfile(
  deps: Deps,
  user: User,
  patch: { username?: string; displayName?: string; bio?: string; website?: string | null },
): Promise<User> {
  try {
    const [updated] = await deps.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    return updated!;
  } catch (err) {
    if (uniqueViolation(err)) throw conflict('username', 'Esse nome de usuário já está em uso');
    throw err;
  }
}

async function confirmPassword(user: User, password: string, field: string) {
  if (!(await checkPassword(user.passwordHash, password))) {
    throw new HttpError(401, 'bad_credentials', 'Senha incorreta.', { fields: { [field]: 'Senha incorreta' } });
  }
}

/** Troca a senha e derruba as outras sessões (a atual continua). */
export async function changePassword(deps: Deps, user: User, sessionId: string, current: string, next: string) {
  await confirmPassword(user, current, 'currentPassword');
  await deps.db
    .update(users)
    .set({ passwordHash: await hashPassword(next), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await deps.db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)));
}

/**
 * LGPD: apaga os dados pessoais. Sessões e tokens saem em cascata;
 * os comentários ficam sem autor e aparecem como "conta removida".
 */
export async function deleteAccount(deps: Deps, user: User, password: string) {
  await confirmPassword(user, password, 'password');
  await deps.db.delete(users).where(eq(users.id, user.id));
}

export async function publicProfile(deps: Deps, username: string) {
  const [user] = await deps.db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || user.bannedAt) throw notFound('Usuário');
  const recent = await deps.db
    .select({ id: comments.id, postSlug: comments.postSlug, body: comments.body, createdAt: comments.createdAt })
    .from(comments)
    .where(and(eq(comments.userId, user.id), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt))
    .limit(10);
  return { user, recent };
}
