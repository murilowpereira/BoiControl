/**
 * Formato provisório: letras, números e hífen, até 30 caracteres.
 * O formato final é a decisão pendente nº 1 da especificação.
 */
const FORMATO_BRINCO = /^[A-Z0-9-]{1,30}$/;

export type ResultadoBrinco = { ok: true; brinco: string } | { ok: false; erro: "VAZIO" | "FORMATO_INVALIDO" };

export function normalizarBrinco(entrada: string): ResultadoBrinco {
  const brinco = entrada.trim().toUpperCase();
  if (brinco === "") return { ok: false, erro: "VAZIO" };
  if (!FORMATO_BRINCO.test(brinco)) return { ok: false, erro: "FORMATO_INVALIDO" };
  return { ok: true, brinco };
}
