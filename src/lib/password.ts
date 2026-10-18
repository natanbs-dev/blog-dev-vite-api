import { hash, verify } from '@node-rs/argon2';

// argon2id (padrão da lib) com os parâmetros mínimos recomendados pela OWASP
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

let dummy: Promise<string> | undefined;

/**
 * Confere a senha. Sem hash (usuário inexistente), calcula um hash falso mesmo assim,
 * para o tempo de resposta não revelar se o e-mail tem conta.
 */
export async function checkPassword(stored: string | undefined, password: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hash('senha-falsa-para-igualar-o-tempo', OPTIONS);
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
