import { and, asc, count, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { comments, sessions, users, type Comment, type User } from '../../db/schema.ts';
import { HttpError, forbidden, notFound } from '../../lib/errors.ts';
import type { Deps } from '../../types.ts';

const PAGE = 20;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

type Row = { comment: Comment; author: { username: string; displayName: string } | null };

const select = { comment: comments, author: { username: users.username, displayName: users.displayName } };

/** Formato público de um comentário. canEdit/canDelete dizem ao front quais botões mostrar. */
function toDto(row: Row, viewer: User | null) {
  const { comment: c } = row;
  const author = row.author?.username ? row.author : null;
  const deleted = c.deletedAt !== null;
  const mine = viewer !== null && c.userId === viewer.id;
  return {
    id: c.id,
    parentId: c.parentId,
    body: deleted ? '' : c.body,
    deleted,
    author: deleted ? null : author,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
    canEdit: !deleted && mine && Date.now() - c.createdAt.getTime() < EDIT_WINDOW_MS,
    canDelete: !deleted && (mine || viewer?.role === 'ADMIN'),
  };
}

export type CommentDto = ReturnType<typeof toDto> & { replies?: CommentDto[] };

const encodeCursor = (c: Comment) => Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString('base64url');

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(at.getTime())) {
    throw new HttpError(400, 'validation', 'Cursor inválido.');
  }
  return { at, id };
}

/**
 * Comentários de um artigo, do mais antigo para o mais novo, 20 por página.
 * Respostas vêm aninhadas. Um comentário apagado só aparece (como "removido") se tiver respostas.
 */
export async function list(deps: Deps, slug: string, cursor: string | undefined, viewer: User | null) {
  const after = cursor ? decodeCursor(cursor) : null;
  const top = await deps.db
    .select(select)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.postSlug, slug),
        isNull(comments.parentId),
        after
          ? or(gt(comments.createdAt, after.at), and(eq(comments.createdAt, after.at), gt(comments.id, after.id)))
          : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(PAGE + 1);

  const page = top.slice(0, PAGE);
  const ids = page.map((r) => r.comment.id);
  const replies = ids.length
    ? await deps.db
        .select(select)
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(and(inArray(comments.parentId, ids), isNull(comments.deletedAt)))
        .orderBy(asc(comments.createdAt), asc(comments.id))
    : [];

  const items: CommentDto[] = [];
  for (const row of page) {
    const children = replies.filter((r) => r.comment.parentId === row.comment.id).map((r) => toDto(r, viewer));
    if (row.comment.deletedAt && children.length === 0) continue;
    items.push({ ...toDto(row, viewer), replies: children });
  }

  const [total] = await deps.db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.postSlug, slug), isNull(comments.deletedAt)));

  const last = page.at(-1);
  return {
    items,
    total: total?.n ?? 0,
    nextCursor: top.length > PAGE && last ? encodeCursor(last.comment) : null,
  };
}

async function find(deps: Deps, id: string): Promise<Row> {
  const [row] = await deps.db
    .select(select)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) throw notFound('Comentário');
  return row;
}

export async function create(deps: Deps, user: User, slug: string, body: string, parentId?: string) {
  if (parentId) {
    const { comment: parent } = await find(deps, parentId);
    if (parent.postSlug !== slug || parent.deletedAt) throw notFound('Comentário');
    if (parent.parentId) throw new HttpError(400, 'validation', 'Só é possível responder comentários principais.');
  }
  const [comment] = await deps.db
    .insert(comments)
    .values({ postSlug: slug, userId: user.id, body, parentId: parentId ?? null })
    .returning();
  return toDto({ comment: comment!, author: { username: user.username, displayName: user.displayName } }, user);
}

export async function edit(deps: Deps, user: User, id: string, body: string) {
  const row = await find(deps, id);
  const c = row.comment;
  if (c.deletedAt) throw notFound('Comentário');
  if (c.userId !== user.id) throw forbidden('Só o autor pode editar o comentário.');
  if (Date.now() - c.createdAt.getTime() >= EDIT_WINDOW_MS) {
    throw forbidden('O prazo de 15 minutos para editar já passou.');
  }
  const [updated] = await deps.db
    .update(comments)
    .set({ body, editedAt: new Date() })
    .where(eq(comments.id, id))
    .returning();
  return toDto({ comment: updated!, author: row.author }, user);
}

/** Apaga de forma lógica e limpa o texto (o conteúdo não fica guardado). */
export async function remove(deps: Deps, user: User, id: string) {
  const { comment: c } = await find(deps, id);
  if (c.deletedAt) return;
  if (c.userId !== user.id && user.role !== 'ADMIN') throw forbidden('Só o autor ou um admin pode apagar.');
  await deps.db.update(comments).set({ deletedAt: new Date(), body: '' }).where(eq(comments.id, id));
}

export async function setBan(deps: Deps, username: string, banned: boolean, deleteComments = false) {
  const [target] = await deps.db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) throw notFound('Usuário');
  if (target.role === 'ADMIN') throw forbidden('Não é possível banir um admin.');
  await deps.db
    .update(users)
    .set({ bannedAt: banned ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, target.id));
  if (banned) {
    await deps.db.delete(sessions).where(eq(sessions.userId, target.id));
    if (deleteComments) {
      await deps.db
        .update(comments)
        .set({ deletedAt: sql`now()`, body: '' })
        .where(and(eq(comments.userId, target.id), isNull(comments.deletedAt)));
    }
  }
}
