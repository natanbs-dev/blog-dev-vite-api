// Torna um usuário admin: npm run admin:promote -- email@exemplo.com
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.ts';
import { users } from '../db/schema.ts';

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error('Uso: npm run admin:promote -- email@exemplo.com  (com DATABASE_URL definida)');
  process.exit(1);
}
const { db, sql } = createDb(url);
const [user] = await db.update(users).set({ role: 'ADMIN' }).where(eq(users.email, email)).returning();
await sql.end();
console.log(user ? `${user.username} agora é admin.` : `Nenhuma conta com o e-mail ${email}.`);
process.exit(user ? 0 : 1);
