import { z } from 'zod';

const RESERVED = new Set(['admin', 'root', 'api', 'conta', 'barbosa', 'moderador', 'suporte', 'sistema']);

export const email = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .max(254, 'E-mail longo demais')
  .pipe(z.email('E-mail inválido'));

// Mínimo razoável sem exagero: 8+ caracteres com letra, número e caractere especial.
// O front (blog-dev-vite, src/lib/password.ts) mostra as mesmas regras ao vivo.
export const password = z
  .string({ error: 'Informe a senha' })
  .refine((p) => [...p].length >= 8, 'A senha precisa de pelo menos 8 caracteres')
  .refine((p) => p.length <= 128, 'A senha pode ter no máximo 128 caracteres')
  .refine((p) => /\p{L}/u.test(p), 'Inclua pelo menos uma letra')
  .refine((p) => /\p{N}/u.test(p), 'Inclua pelo menos um número')
  .refine((p) => /[^\p{L}\p{N}\s]/u.test(p), 'Inclua pelo menos um caractere especial (! @ # - _ …)');

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
