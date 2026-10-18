import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes aleatórios, seguros para URL e cookie. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** O banco guarda só o hash: um vazamento do banco não entrega tokens válidos. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
