import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { emailTokens } from '../src/db/schema.ts';
import { Browser, db, setupApp, signUp, tokenFrom } from './helpers.ts';

const ctx = setupApp();

describe('cadastro e confirmação de e-mail', () => {
  it('cria a conta, abre sessão segura e envia o e-mail de confirmação', async () => {
    const b = new Browser(ctx);
    const res = await b.post('/auth/register', {
      email: '  Ana@Exemplo.com ',
      username: 'Ana_Dev',
      displayName: 'Ana',
      password: 'senha-forte-123',
    });
    expect(res.status).toBe(201);
    expect(res.json.user).toMatchObject({ email: 'ana@exemplo.com', username: 'ana_dev', emailVerified: false });
    expect(res.json.user.passwordHash).toBeUndefined();

    const cookie = res.setCookie.find((c) => c.startsWith('sid='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api/);

    expect(ctx.mails).toHaveLength(1);
    expect(ctx.mails[0]!.text).toContain('http://blog.test/#/conta/confirmar?token=');

    expect((await b.post('/auth/verify', { token: tokenFrom(ctx.mails[0]) })).status).toBe(204);
    expect((await b.get('/me')).json.user.emailVerified).toBe(true);
    // o link só vale uma vez
    expect((await b.post('/auth/verify', { token: tokenFrom(ctx.mails[0]) })).status).toBe(400);
  });

  it('valida os campos e devolve mensagem por campo', async () => {
    const res = await new Browser(ctx).post('/auth/register', {
      email: 'nao-e-email',
      username: 'a',
      displayName: '',
      password: 'curta',
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.json.fields).sort()).toEqual(['displayName', 'email', 'password', 'username']);
  });

  it('recusa e-mail ou username repetido', async () => {
    await signUp(ctx, { name: 'bia' });
    const b = new Browser(ctx, '10.9.9.9');
    const base = { displayName: 'B', password: 'senha-forte-123' };
    const email = await b.post('/auth/register', { ...base, email: 'BIA@exemplo.com', username: 'outra' });
    expect(email.status).toBe(409);
    expect(email.json.fields.email).toBeDefined();
    const user = await b.post('/auth/register', { ...base, email: 'nova@exemplo.com', username: 'bia' });
    expect(user.status).toBe(409);
    expect(user.json.fields.username).toBeDefined();
  });

  it('recusa username reservado', async () => {
    const res = await new Browser(ctx).post('/auth/register', {
      email: 'x@exemplo.com',
      username: 'admin',
      displayName: 'X',
      password: 'senha-forte-123',
    });
    expect(res.json.fields.username).toMatch(/reservado/);
  });

  it('reenvia a confirmação e invalida o link anterior', async () => {
    const { browser } = await signUp(ctx, { verified: false, name: 'caio' });
    const first = tokenFrom(ctx.mails.at(-1));
    expect((await browser.post('/auth/verify/resend')).status).toBe(204);
    const second = tokenFrom(ctx.mails.at(-1));
    expect(second).not.toBe(first);
    expect((await browser.post('/auth/verify', { token: first })).status).toBe(400);
    expect((await browser.post('/auth/verify', { token: second })).status).toBe(204);
  });
});

describe('login e logout', () => {
  it('entra, troca o token da sessão e sai', async () => {
    const { email, password, browser: old } = await signUp(ctx);
    const b = new Browser(ctx);
    expect((await b.get('/me')).status).toBe(401);
    const res = await b.post('/auth/login', { email: email.toUpperCase(), password });
    expect(res.status).toBe(200);
    expect(b.cookie).not.toBe(old.cookie);
    expect((await b.get('/me')).status).toBe(200);
    const out = await b.post('/auth/logout');
    expect(out.status).toBe(204);
    expect(b.cookie).toBe('');
    // a sessão antiga (de outro aparelho) continua valendo
    expect((await old.get('/me')).status).toBe(200);
  });

  it('mesma mensagem para e-mail inexistente e senha errada', async () => {
    const { email } = await signUp(ctx);
    const b = new Browser(ctx);
    const wrong = await b.post('/auth/login', { email, password: 'errada-errada' });
    const ghost = await b.post('/auth/login', { email: 'ninguem@exemplo.com', password: 'errada-errada' });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrong.json.message).toBe(ghost.json.message);
  });

  it('limita tentativas de login por IP (429 com Retry-After)', async () => {
    const b = new Browser(ctx, '10.7.7.7');
    for (let i = 0; i < 5; i++) {
      expect((await b.post('/auth/login', { email: `x${i}@exemplo.com`, password: 'errada' })).status).toBe(401);
    }
    const blocked = await b.post('/auth/login', { email: 'x@exemplo.com', password: 'errada' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('ignora cookie forjado', async () => {
    const b = new Browser(ctx);
    b.cookie = 'sid=forjado';
    expect((await b.get('/me')).status).toBe(401);
  });
});

describe('recuperação de senha', () => {
  it('não revela se o e-mail existe', async () => {
    const res = await new Browser(ctx).post('/auth/forgot', { email: 'ninguem@exemplo.com' });
    expect(res.status).toBe(204);
    expect(ctx.mails).toHaveLength(0);
  });

  it('redefine a senha, derruba todas as sessões e o link não vale de novo', async () => {
    const { email, browser } = await signUp(ctx);
    const anon = new Browser(ctx);
    expect((await anon.post('/auth/forgot', { email })).status).toBe(204);
    const mail = ctx.mails.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.text).toContain('http://blog.test/#/conta/redefinir?token=');
    const token = tokenFrom(mail);

    expect((await anon.post('/auth/reset', { token, password: 'nova-senha-456' })).status).toBe(204);
    expect((await browser.get('/me')).status).toBe(401);
    expect((await anon.post('/auth/login', { email, password: 'senha-forte-123' })).status).toBe(401);
    expect((await anon.post('/auth/login', { email, password: 'nova-senha-456' })).status).toBe(200);
    expect((await anon.post('/auth/reset', { token, password: 'outra-senha-789' })).status).toBe(400);
  });

  it('link vencido não funciona', async () => {
    const { email } = await signUp(ctx);
    const anon = new Browser(ctx);
    await anon.post('/auth/forgot', { email });
    const token = tokenFrom(ctx.mails.at(-1));
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailTokens.purpose, 'RESET'));
    expect((await anon.post('/auth/reset', { token, password: 'nova-senha-456' })).status).toBe(400);
  });
});
