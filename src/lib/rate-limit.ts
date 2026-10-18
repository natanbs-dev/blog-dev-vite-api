import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { HttpError } from './errors.ts';

export type Limit = (key: string) => Promise<void>;

/** Limitador em memória (uma instância só da API, sem Redis). Lança 429 quando estoura. */
export function limiter(points: number, durationSec: number): Limit {
  const rl = new RateLimiterMemory({ points, duration: durationSec });
  return async (key) => {
    try {
      await rl.consume(key);
    } catch (err) {
      if (!(err instanceof RateLimiterRes)) throw err;
      const wait = Math.max(1, Math.ceil(err.msBeforeNext / 1000));
      const human = wait < 120 ? `${wait} s` : `${Math.ceil(wait / 60)} min`;
      throw new HttpError(429, 'rate_limited', `Muitas tentativas. Tente de novo em ${human}.`, {
        headers: { 'Retry-After': String(wait) },
      });
    }
  };
}

export function createLimits() {
  return {
    loginIp: limiter(5, 60),
    loginEmail: limiter(10, 60 * 60),
    register: limiter(3, 60 * 60),
    forgotIp: limiter(3, 60 * 60),
    forgotEmail: limiter(3, 60 * 60),
    resendVerify: limiter(3, 60 * 60),
    comment: limiter(10, 10 * 60),
    sensitive: limiter(10, 60 * 60), // troca de senha e exclusão de conta
  };
}

export type Limits = ReturnType<typeof createLimits>;
