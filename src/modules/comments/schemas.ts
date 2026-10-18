import { z } from 'zod';

/** Slug dos artigos do blog: nome do arquivo .md, em kebab-case. */
export const slugParam = z.object({
  slug: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido'),
});

export const idParam = z.object({ id: z.uuid('Id inválido') });

const body = z
  .string({ error: 'Escreva o comentário' })
  .transform((s) => s.replace(/\r\n?/g, '\n').trim())
  .pipe(
    z.string().min(1, 'Escreva o comentário').max(2000, 'O comentário pode ter no máximo 2000 caracteres'),
  );

export const createBody = z.object({ body, parentId: z.uuid('Id inválido').optional() });
export const editBody = z.object({ body });
export const listQuery = z.object({ cursor: z.string().max(200).optional() });

export const banBody = z.object({ deleteComments: z.boolean().default(false) });
