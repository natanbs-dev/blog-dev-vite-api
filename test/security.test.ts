import { describe, expect, it } from 'vitest';
import { Browser, SECRET, setupApp } from './helpers.ts';

const ctx = setupApp();

describe('proteções gerais', () => {
  it('health responde com o banco no ar', async () => {
    const res = await new Browser(ctx).get('/health');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('bloqueia chamada direta sem o segredo do proxy', async () => {
    const b = new Browser(ctx);
    expect((await b.get('/health', { headers: { 'x-proxy-secret': '' } })).status).toBe(403);
    expect((await b.get('/health', { headers: { 'x-proxy-secret': SECRET + 'x' } })).status).toBe(403);
  });

  it('bloqueia escrita vinda de outro site (CSRF)', async () => {
    const b = new Browser(ctx);
    const res = await b.post('/auth/login', { email: 'a@b.com', password: 'x' }, { headers: { origin: 'https://mal.example' } });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe('bad_origin');
    const semOrigem = await b.req('POST', '/auth/logout', { headers: { origin: '' } });
    expect(semOrigem.status).toBe(403);
  });

  it('recusa corpo grande demais', async () => {
    const res = await new Browser(ctx).post('/auth/forgot', { email: 'a'.repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it('JSON malformado vira 400 e rota desconhecida vira 404 em JSON', async () => {
    const b = new Browser(ctx);
    const bad = await b.req('POST', '/auth/login', { body: undefined, headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    const nf = await b.get('/nada');
    expect(nf.status).toBe(404);
    expect(nf.json.error).toBe('not_found');
  });
});
