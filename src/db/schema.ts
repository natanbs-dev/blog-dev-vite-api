import { type AnyPgColumn, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true });

export const role = pgEnum('role', ['USER', 'ADMIN']);
export const tokenPurpose = pgEnum('token_purpose', ['VERIFY', 'RESET']);

/** E-mail e username são gravados sempre em minúsculas; o unique vale para os dois. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  website: text('website'),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: at('email_verified_at'),
  role: role('role').notNull().default('USER'),
  bannedAt: at('banned_at'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

/** O id é o SHA-256 do token do cookie: quem lê o banco não consegue usar a sessão. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: at('expires_at').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    lastSeenAt: at('last_seen_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: at('expires_at').notNull(),
    usedAt: at('used_at'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId)],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postSlug: text('post_slug').notNull(),
    // fica nulo quando a conta é excluída: o comentário vira "conta removida"
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    editedAt: at('edited_at'),
    deletedAt: at('deleted_at'),
  },
  (t) => [
    index('comments_post_idx').on(t.postSlug, t.createdAt),
    index('comments_parent_idx').on(t.parentId),
    index('comments_user_idx').on(t.userId, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Comment = typeof comments.$inferSelect;
