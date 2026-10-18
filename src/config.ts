import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  SITE_URL: z.url().transform((s) => s.replace(/\/+$/, '')),
  PROXY_SECRET: z.string().min(32, 'use pelo menos 32 caracteres (openssl rand -hex 32)'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(3),
});

export type Config = z.infer<typeof Env>;

/** Lê e valida as variáveis de ambiente. Se faltar algo, encerra antes de subir. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    console.error('Configuração inválida:\n' + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}
