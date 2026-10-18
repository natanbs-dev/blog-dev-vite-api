import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { comments, users } from '../src/db/schema.ts';
import { Browser, db, setupApp, signUp } from './helpers.ts';

const ctx = setupApp();
const POST = '/posts/domine-o-terminal/comments';

async function makeAdmin(username: string) {
  await db.update(users).set({ role: 'ADMIN' }).where(eq(users.username, username));
}

describe('comentários', () => {
  it('lista vazia é pública', async () => {
    const res = await new Browser(ctx).get(POST);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ items: [], total: 0, nextCursor: null });
  });

  it('exige login e e-mail confirmado', async () => {
    expect((await new Browser(ctx).post(POST, { body: 'oi' })).status).toBe(401);
    const { browser } = await signUp(ctx, { verified: false });
    const res = await browser.post(POST, { body: 'oi' });
    expect(res.status).toBe(403);
    expect(res.json.message).toMatch(/Confirme seu e-mail/);
  });

  it('comenta, responde e guarda HTML como texto puro', async () => {
    const { browser } = await signUp(ctx, { name: 'gabi' });
    const evil = '<script>alert(1)</script>\r\nlinha 2';
    const c1 = await browser.post(POST, { body: `  ${evil}  ` });
    expect(c1.status).toBe(201);
    expect(c1.json.comment).toMatchObject({
      body: '<script>alert(1)</script>\nlinha 2',
      author: { username: 'gabi', displayName: 'GABI' },
      canEdit: true,
      canDelete: true,
    });

    const { browser: other } = await signUp(ctx);
    const reply = await other.post(POST, { body: 'resposta', parentId: c1.json.comment.id });
    expect(reply.status).toBe(201);
    // resposta de resposta não
    expect((await other.post(POST, { body: 'x', parentId: reply.json.comment.id })).status).toBe(400);
    // pai de outro artigo não
    expect((await other.post('/posts/outro/comments', { body: 'x', parentId: c1.json.comment.id })).status).toBe(404);

    const list = await new Browser(ctx).get(POST);
    expect(list.json.total).toBe(2);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0].replies).toHaveLength(1);
    expect(list.json.items[0].canEdit).toBe(false); // visitante
  });

  it('valida slug, id e tamanho', async () => {
    const { browser } = await signUp(ctx);
    expect((await browser.post('/posts/Slug Ruim/comments', { body: 'x' })).status).toBe(400);
    expect((await browser.post(POST, { body: '   ' })).status).toBe(400);
    expect((await browser.post(POST, { body: 'a'.repeat(2001) })).status).toBe(400);
    expect((await browser.patch('/comments/nao-e-uuid', { body: 'x' })).status).toBe(400);
  });

  it('autor edita em até 15 min; outros não', async () => {
    const { browser } = await signUp(ctx);
    const { browser: other } = await signUp(ctx);
    const { id } = (await browser.post(POST, { body: 'v1' })).json.comment;

    expect((await other.patch(`/comments/${id}`, { body: 'hack' })).status).toBe(403);
    const ok = await browser.patch(`/comments/${id}`, { body: 'v2' });
    expect(ok.json.comment.body).toBe('v2');
    expect(ok.json.comment.editedAt).not.toBeNull();

    await db.update(comments).set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) }).where(eq(comments.id, id));
    expect((await browser.patch(`/comments/${id}`, { body: 'v3' })).status).toBe(403);
  });

  it('apagar some da lista e limpa o texto; com respostas, vira "removido"', async () => {
    const { browser } = await signUp(ctx);
    const { browser: other } = await signUp(ctx);
    const solo = (await browser.post(POST, { body: 'sozinho' })).json.comment.id;
    const pai = (await browser.post(POST, { body: 'pai' })).json.comment.id;
    await other.post(POST, { body: 'filho', parentId: pai });

    expect((await other.del(`/comments/${solo}`)).status).toBe(403);
    expect((await browser.del(`/comments/${solo}`)).status).toBe(204);
    expect((await browser.del(`/comments/${pai}`)).status).toBe(204);

    const [row] = await db.select().from(comments).where(eq(comments.id, solo));
    expect(row!.body).toBe('');

    const list = await new Browser(ctx).get(POST);
    expect(list.json.total).toBe(1);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0]).toMatchObject({ id: pai, deleted: true, body: '', author: null });
    expect(list.json.items[0].replies[0].body).toBe('filho');
  });

  it('pagina de 20 em 20 sem repetir', async () => {
    const { browser } = await signUp(ctx);
    const base = Date.now() - 60_000;
    const { user } = await signUp(ctx);
    await db.insert(comments).values(
      Array.from({ length: 25 }, (_, i) => ({
        postSlug: 'domine-o-terminal',
        userId: user.id,
        body: `c${i}`,
        createdAt: new Date(base + i * 1000),
      })),
    );
    const p1 = await browser.get(POST);
    expect(p1.json.items).toHaveLength(20);
    expect(p1.json.total).toBe(25);
    const p2 = await browser.get(`${POST}?cursor=${p1.json.nextCursor}`);
    expect(p2.json.items.map((c: { body: string }) => c.body)).toEqual(['c20', 'c21', 'c22', 'c23', 'c24']);
    expect(p2.json.nextCursor).toBeNull();
    expect((await browser.get(`${POST}?cursor=lixo`)).status).toBe(400);
  });

  it('limita 10 comentários a cada 10 min por usuário', async () => {
    const { browser } = await signUp(ctx);
    for (let i = 0; i < 10; i++) expect((await browser.post(POST, { body: `c${i}` })).status).toBe(201);
    expect((await browser.post(POST, { body: 'demais' })).status).toBe(429);
  });
});

describe('moderação', () => {
  it('admin apaga comentário alheio e bane usuário', async () => {
    const { browser: admin } = await signUp(ctx, { name: 'mod' });
    await makeAdmin('mod');
    const { browser: troll } = await signUp(ctx, { name: 'troll' });
    const id = (await troll.post(POST, { body: 'spam' })).json.comment.id;
    await troll.post(POST, { body: 'mais spam' });

    expect((await troll.post('/admin/users/mod/ban', {})).status).toBe(403);
    expect((await admin.del(`/comments/${id}`)).status).toBe(204);
    expect((await admin.post('/admin/users/troll/ban', { deleteComments: true })).status).toBe(204);

    expect((await troll.get('/me')).status).toBe(401);
    expect((await new Browser(ctx).get(POST)).json.total).toBe(0);
    const login = await new Browser(ctx).post('/auth/login', { email: 'troll@exemplo.com', password: 'senha-forte-123' });
    expect(login.status).toBe(403);

    expect((await admin.del('/admin/users/troll/ban')).status).toBe(204);
    expect((await new Browser(ctx).post('/auth/login', { email: 'troll@exemplo.com', password: 'senha-forte-123' })).status).toBe(200);
  });
});
