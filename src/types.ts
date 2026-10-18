import type { Logger } from 'pino';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import type { User } from './db/schema.ts';
import type { Mailer } from './lib/mailer.ts';
import type { Limits } from './lib/rate-limit.ts';

export interface Deps {
  config: Config;
  db: Db;
  mailer: Mailer;
  log: Logger;
  limits: Limits;
}

export interface AppEnv {
  Variables: {
    user: User | null;
    sessionId: string | null;
  };
}
