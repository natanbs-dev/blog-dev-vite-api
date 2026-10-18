import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { HttpError } from './errors.ts';

/** zValidator com erro no formato da API: 400 { error: 'validation', fields: { campo: mensagem } }. */
export function valid<Target extends keyof ValidationTargets, T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }
      throw new HttpError(400, 'validation', 'Confira os campos destacados.', { fields });
    }
  });
}
