import { z } from 'zod';
import { displayName, password, username } from '../auth/schemas.ts';

const website = z
  .union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Use um link começando com https://' })])
  .refine((s) => s.length <= 200, 'Link longo demais')
  .transform((s) => s || null);

export const profileBody = z
  .object({
    username: username.optional(),
    displayName: displayName.optional(),
    bio: z.string().trim().max(280, 'Máximo de 280 caracteres').optional(),
    website: website.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nada para alterar');

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
  newPassword: password,
});

export const deleteAccountBody = z.object({ password: z.string().min(1, 'Informe sua senha').max(128) });

export const usernameParam = z.object({ username: z.string().toLowerCase().max(20) });
