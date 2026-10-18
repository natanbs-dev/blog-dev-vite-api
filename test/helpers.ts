import { sql } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeEach, inject } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Config } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import type { Mail } from '../src/lib/mailer.ts';
import { createLimits } from '../src/lib/rate-limit.ts';

export const SITE = 'http://blog.test';
export const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

const config: Config = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 0,
  LOG_LEVEL: 'silent',
  DATABASE_URL: inject('dbUrl'),
  SITE_URL: SITE,
  PROXY_SECRET: SECRET,
  SMTP_HOST: 'unused',
  SMTP_PORT: 25,
  MAIL_FROM: 'teste@blog.test',
};

const { db, sql: client } = createDb(config.DATABASE_URL);
export { db };

/** Um app novo por teste: banco limpo, e-mails capturados e limitadores zerados. */
export function setupApp() {
  const ctx = {
    mails: [] as Mail[],
    app: undefined as unknown as ReturnType<typeof createApp>,
  };
  beforeEach(async () => {
    await db.execute(sql`truncate users, sessions, email_tokens, comments cascade`);
    ctx.mails.length = 0;
    ctx.app = createApp({
      config,
      db,
      log: pino({ level: 'silent' }),
      mailer: { send: async (m) => void ctx.mails.push(m) },
      limits: createLimits(),
    });
  });
  afterAll(() => client.end());
  return ctx;
}

type Init = { body?: unknown; headers?: Record<string, string>; cookie?: string; ip?: string };

/** Cliente com pote de cookies, como um navegador vindo pelo proxy. */
export class Browser {
  cookie = '';
  private ctx: ReturnType<typeof setupApp>;
  private ip: string;

  constructor(ctx: ReturnType<typeof setupApp>, ip = '10.0.0.1') {
    this.ctx = ctx;
    this.ip = ip;
  }

  async req(method: string, path: string, init: Init = {}) {
    const headers: Record<string, string> = {
      'x-proxy-secret': SECRET,
      origin: SITE,
      'x-real-ip': init.ip ?? this.ip,
      ...(this.cookie && { cookie: this.cookie }),
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
      ...init.headers,
    };
    const res = await this.ctx.app.request(`/api${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, value] = pair!.split('=');
      if (name === 'sid') this.cookie = value ? `sid=${value}` : '';
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
  }

  get = (p: string, i?: Init) => this.req('GET', p, i);
  post = (p: string, b?: unknown, i?: Init) => this.req('POST', p, { ...i, body: b ?? {} });
  patch = (p: string, b: unknown, i?: Init) => this.req('PATCH', p, { ...i, body: b });
  del = (p: string, b?: unknown, i?: Init) => this.req('DELETE', p, { ...i, ...(b !== undefined && { body: b }) });
}

/** Extrai o token do link de um e-mail capturado. */
export function tokenFrom(mail: Mail | undefined): string {
  const m = mail?.text.match(/token=([\w-]+)/);
  if (!m) throw new Error('e-mail sem token');
  return m[1]!;
}

let n = 0;
/** Cria uma conta (opcionalmente já confirmada) e devolve o navegador logado. */
export async function signUp(ctx: ReturnType<typeof setupApp>, opts: { verified?: boolean; name?: string } = {}) {
  const name = opts.name ?? `user${++n}`;
  const b = new Browser(ctx, `10.1.0.${++n % 250}`);
  const res = await b.post('/auth/register', {
    email: `${name}@exemplo.com`,
    username: name,
    displayName: name.toUpperCase(),
    password: 'senha-forte-123',
  });
  if (res.status !== 201) throw new Error(`cadastro falhou: ${JSON.stringify(res.json)}`);
  if (opts.verified !== false) {
    const mail = ctx.mails.findLast((m) => m.to === `${name}@exemplo.com`);
    await b.post('/auth/verify', { token: tokenFrom(mail) });
  }
  return { browser: b, user: res.json.user, email: `${name}@exemplo.com`, password: 'senha-forte-123' };
}
