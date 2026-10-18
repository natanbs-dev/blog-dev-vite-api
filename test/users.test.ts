import { describe, expect, it } from 'vitest';
import { Browser, setupApp, signUp } from './helpers.ts';

const ctx = setupApp();

describe('perfil', () => {
  it('edita o próprio perfil e aparece no perfil público, sem e-mail', async () => {
    const { browser } = await signUp(ctx, { name: 'dani' });
    const res = await browser.patch('/me', { displayName: 'Dani B.', bio: 'Dev front', website: 'https://dani.dev' });
    expect(res.status).toBe(200);
    expect(res.json.user).toMatchObject({ displayName: 'Dani B.', bio: 'Dev front', website: 'https://dani.dev' });

    const pub = await new Browser(ctx).get('/users/DANI');
    expect(pub.status).toBe(200);
    expect(pub.json.user).toMatchObject({ username: 'dani', displayName: 'Dani B.' });
    expect(pub.json.user.email).toBeUndefined();
  });

  it('recusa link que não é http(s) e limpa o link com string vazia', async () => {
    const { browser } = await signUp(ctx);
    expect((await browser.patch('/me', { website: 'javascript:alert(1)' })).status).toBe(400);
    await browser.patch('/me', { website: 'https://a.dev' });
    expect((await browser.patch('/me', { website: '' })).json.user.website).toBeNull();
  });

  it('troca de username respeita unicidade', async () => {
    await signUp(ctx, { name: 'edu' });
    const { browser } = await signUp(ctx);
    expect((await browser.patch('/me', { username: 'edu' })).status).toBe(409);
    expect((await browser.patch('/me', { username: 'edu_2' })).json.user.username).toBe('edu_2');
  });

  it('sem login, /me é 401', async () => {
    expect((await new Browser(ctx).patch('/me', { bio: 'x' })).status).toBe(401);
  });
});

describe('senha e exclusão de conta', () => {
  it('troca a senha exigindo a atual e derruba as outras sessões', async () => {
    const { browser, email, password } = await signUp(ctx);
    const other = new Browser(ctx);
    await other.post('/auth/login', { email, password });

    expect((await browser.post('/me/password', { currentPassword: 'errada', newPassword: 'nova-senha-456' })).status).toBe(401);
    expect((await browser.post('/me/password', { currentPassword: password, newPassword: 'nova-senha-456' })).status).toBe(204);
    expect((await browser.get('/me')).status).toBe(200);
    expect((await other.get('/me')).status).toBe(401);
  });

  it('exclui a conta e os comentários ficam como "conta removida"', async () => {
    const { browser, password } = await signUp(ctx, { name: 'fabi' });
    await browser.post('/posts/guia-markdown/comments', { body: 'Ótimo artigo' });

    expect((await browser.del('/me', { password: 'errada' })).status).toBe(401);
    expect((await browser.del('/me', { password })).status).toBe(204);
    expect((await browser.get('/me')).status).toBe(401);
    expect((await new Browser(ctx).get('/users/fabi')).status).toBe(404);

    const list = await new Browser(ctx).get('/posts/guia-markdown/comments');
    expect(list.json.items[0]).toMatchObject({ body: 'Ótimo artigo', author: null });
  });
});
