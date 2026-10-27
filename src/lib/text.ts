/** Normaliza nomes para comparação: sem acentos, minúsculo, espaços simples, sem "@" inicial. */
export function normalizeName(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^@+/, "").trim().replace(/\s+/g, " ").toLowerCase();
}
