import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export function createDb(url: string) {
  // poucas conexões: o servidor é um notebook de 4 GB e o tráfego é de blog
  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export type Db = ReturnType<typeof createDb>['db'];
