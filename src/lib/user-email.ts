/**
 * E-mail é opcional no Champz, mas o Better Auth exige `user.email` único e não nulo.
 * Para contas sem e-mail gravamos um identificador técnico interno no domínio reservado `.invalid`
 * (RFC 2606: nunca resolve nem entrega). Ele não é exibido, não serve para login por e-mail,
 * recuperação de senha ou correspondência com contas Google.
 */
export const INTERNAL_EMAIL_DOMAIN = "sem-email.champz.invalid";

export function internalEmailFor(userId: string) {
  return `${userId}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined) {
  return !!email && email.trim().toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}

/** E-mail real informado pelo usuário/admin, ou null. */
export function publicEmail(email: string | null | undefined) {
  return email && !isInternalEmail(email) ? email : null;
}
