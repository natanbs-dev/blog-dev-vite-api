import type { User } from '../db/schema.ts';

/** O que o próprio usuário vê de si. */
export const privateUser = (u: User) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  displayName: u.displayName,
  bio: u.bio,
  website: u.website,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
  createdAt: u.createdAt,
});

/** O que qualquer visitante vê. Sem e-mail. */
export const publicUser = (u: Pick<User, 'username' | 'displayName' | 'bio' | 'website' | 'createdAt'>) => ({
  username: u.username,
  displayName: u.displayName,
  bio: u.bio,
  website: u.website,
  createdAt: u.createdAt,
});
