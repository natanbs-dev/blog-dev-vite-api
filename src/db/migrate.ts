import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.ts';

/** Aplica as migrações SQL da pasta drizzle/. Funciona tanto em src/ quanto em dist/. */
export async function runMigrations(url: string): Promise<void> {
  const { db, sql } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migrações aplicadas.');
}
