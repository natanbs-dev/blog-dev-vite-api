import { serve } from '@hono/node-server';
import { lt, or, isNotNull } from 'drizzle-orm';
import pino from 'pino';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';
import { emailTokens, sessions } from './db/schema.ts';
import { createSmtpMailer } from './lib/mailer.ts';
import { createLimits } from './lib/rate-limit.ts';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL });
const { db, sql } = createDb(config.DATABASE_URL);
const app = createApp({ config, db, log, mailer: createSmtpMailer(config), limits: createLimits() });

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) =>
  log.info(`API ouvindo em http://${info.address}:${info.port}`),
);

/** Limpa sessões vencidas e tokens usados ou vencidos, de hora em hora. */
async function sweep() {
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(emailTokens).where(or(lt(emailTokens.expiresAt, now), isNotNull(emailTokens.usedAt)));
}
const timer = setInterval(() => sweep().catch((err: unknown) => log.error({ err }, 'falha na limpeza')), 60 * 60 * 1000);
timer.unref();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'encerrando');
  clearInterval(timer);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
