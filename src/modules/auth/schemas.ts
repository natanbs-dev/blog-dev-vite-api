import { z } from 'zod';

const RESERVED = new Set(['admin', 'root', 'api', 'conta', 'barbosa', 'moderador', 'suporte', 'sistema']);

export const email = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail longo demais')
  .pipe(z.email('E-mail inválido'));

export const password = z
  .string({ error: 'Informe a senha' })
  .min(10, 'A senha precisa de pelo menos 10 caracteres')
  .max(128, 'A senha pode ter no máximo 128 caracteres');

export const username = z
  .string({ error: 'Informe o nome de usuário' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'Use de 3 a 20 letras minúsculas, números ou _')
  .refine((u) => !RESERVED.has(u), 'Esse nome de usuário é reservado');

export const displayName = z
  .string({ error: 'Informe seu nome' })
  .trim()
  .min(1, 'Informe seu nome')
  .max(50, 'Máximo de 50 caracteres');

export const token = z.string().min(20).max(64);

export const registerBody = z.object({ email, username, displayName, password });
export const loginBody = z.object({ email, password: z.string().min(1, 'Informe a senha').max(128) });
export const tokenBody = z.object({ token });
export const forgotBody = z.object({ email });
export const resetBody = z.object({ token, password });
