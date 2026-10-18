import { and, eq, gt, isNull } from 'drizzle-orm';
import { emailTokens, sessions, users, type User } from '../../db/schema.ts';
import { HttpError, conflict, uniqueViolation } from '../../lib/errors.ts';
import { resetPasswordMail, verifyEmailMail } from '../../lib/mail-templates.ts';
import type { Mail } from '../../lib/mailer.ts';
import { checkPassword, hashPassword } from '../../lib/password.ts';
import { hashToken, newToken } from '../../lib/tokens.ts';
import type { Deps } from '../../types.ts';

const HOUR = 60 * 60 * 1000;
const TTL = { VERIFY: 24 * HOUR, RESET: HOUR / 2 } as const;

/** E-mail sai em segundo plano: a resposta não espera o SMTP e falhas vão para o log. */
function sendLater(deps: Deps, mail: Mail) {
  deps.mailer.send(mail).catch((err: unknown) => deps.log.error({ err, to: mail.to }, 'falha ao enviar e-mail'));
}

async function issueToken(deps: Deps, userId: string, purpose: 'VERIFY' | 'RESET'): Promise<string> {
  // um link válido por vez: os anteriores do mesmo tipo deixam de valer
  await deps.db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));
  const token = newToken();
  await deps.db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TTL[purpose]),
  });
  return token;
}

/** Consome um token de e-mail. Devolve o id do usuário, ou lança 400. */
async function consumeToken(deps: Deps, token: string, purpose: 'VERIFY' | 'RESET'): Promise<string> {
  const [row] = await deps.db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });
  if (!row) throw new HttpError(400, 'invalid_token', 'Link inválido ou expirado. Peça um novo.');
  return row.userId;
}

const link = (deps: Deps, page: string, token: string) => `${deps.config.SITE_URL}/#/conta/${page}?token=${token}`;

export async function sendVerification(deps: Deps, user: User) {
  const token = await issueToken(deps, user.id, 'VERIFY');
  sendLater(deps, verifyEmailMail(user.email, user.displayName, link(deps, 'confirmar', token)));
}

export async function register(
  deps: Deps,
  input: { email: string; username: string; displayName: string; password: string },
): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  let user: User | undefined;
  try {
    [user] = await deps.db
      .insert(users)
      .values({ email: input.email, username: input.username, displayName: input.displayName, passwordHash })
      .returning();
  } catch (err) {
    const dup = uniqueViolation(err);
    if (dup) {
      if (dup.constraint_name?.includes('username')) throw conflict('username', 'Esse nome de usuário já está em uso');
      throw conflict('email', 'Já existe uma conta com esse e-mail');
    }
    throw err;
  }
  await sendVerification(deps, user!);
  return user!;
}

export async function verifyEmail(deps: Deps, token: string): Promise<void> {
  const userId = await consumeToken(deps, token, 'VERIFY');
  await deps.db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function authenticate(deps: Deps, email: string, password: string): Promise<User> {
  const [user] = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await checkPassword(user?.passwordHash, password);
  if (!user || !ok) throw new HttpError(401, 'bad_credentials', 'E-mail ou senha incorretos.');
  if (user.bannedAt) throw new HttpError(403, 'banned', 'Esta conta foi suspensa.');
  return user;
}

export async function requestReset(deps: Deps, email: string): Promise<void> {
  const [user] = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.bannedAt) return; // mesma resposta exista ou não a conta
  const token = await issueToken(deps, user.id, 'RESET');
  sendLater(deps, resetPasswordMail(user.email, user.displayName, link(deps, 'redefinir', token)));
}

export async function resetPassword(deps: Deps, token: string, password: string): Promise<void> {
  const userId = await consumeToken(deps, token, 'RESET');
  const passwordHash = await hashPassword(password);
  // quem abriu o link provou que é dono do e-mail: confirma de quebra
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  await deps.db
    .update(users)
    .set({ passwordHash, updatedAt: new Date(), emailVerifiedAt: user?.emailVerifiedAt ?? new Date() })
    .where(eq(users.id, userId));
  await deps.db.delete(sessions).where(eq(sessions.userId, userId));
}
