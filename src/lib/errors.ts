import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Erro com status HTTP. Vira { error, message, fields? } no onError do app. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    extra: { fields?: Record<string, string>; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.headers = extra.headers;
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Entre na sua conta para continuar.');
export const forbidden = (message = 'Você não tem permissão para isso.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} não encontrado.`);
export const conflict = (field: string, message: string) =>
  new HttpError(409, 'conflict', message, { fields: { [field]: message } });

type PgError = { code?: string; constraint_name?: string; cause?: unknown };

/** Violação de unique no Postgres. O Drizzle embrulha o erro do driver em `cause`. */
export function uniqueViolation(err: unknown): PgError | null {
  for (let e = err as PgError | undefined, depth = 0; e && depth < 3; e = e.cause as PgError, depth++) {
    if (typeof e === 'object' && e.code === '23505') return e;
  }
  return null;
}
