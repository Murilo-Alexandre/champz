/** Lê variável de ambiente sem espaços/TABs acidentais (comuns ao colar valores no painel da Vercel). */
export function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}
