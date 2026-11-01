/** Maior peso aceito, em gramas. Bovinos adultos raramente passam de 1.500 kg. */
export const PESO_MAXIMO_G = 2_000_000;

export type ErroPeso = "VAZIO" | "FORMATO_INVALIDO" | "NAO_POSITIVO" | "ACIMA_DO_MAXIMO";
export type ResultadoPeso = { ok: true; pesoG: number } | { ok: false; erro: ErroPeso };

const SO_DECIMAL = /^(\d+)(?:[.,](\d{1,2}))?$/;
const COM_MILHAR = /^(\d{1,3}(?:\.\d{3})+),(\d{1,2})?$/;

/**
 * Converte o peso digitado (em kg, até 2 casas) para gramas inteiros, sem passar
 * por ponto flutuante. Aceita "356", "356,5", "356.50" e "1.234,56".
 */
export function lerPesoKg(entrada: string | number): ResultadoPeso {
  let texto: string;
  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) return { ok: false, erro: "FORMATO_INVALIDO" };
    texto = String(entrada);
    if (texto.startsWith("-")) return { ok: false, erro: "NAO_POSITIVO" };
  } else {
    texto = entrada.trim();
  }
  if (texto === "") return { ok: false, erro: "VAZIO" };
  if (texto.startsWith("-")) return { ok: false, erro: "NAO_POSITIVO" };

  let inteiro: string;
  let fracao: string;
  const milhar = COM_MILHAR.exec(texto);
  const simples = SO_DECIMAL.exec(texto);
  if (milhar) {
    inteiro = milhar[1]!.replaceAll(".", "");
    fracao = milhar[2] ?? "";
  } else if (simples) {
    inteiro = simples[1]!;
    fracao = simples[2] ?? "";
  } else {
    return { ok: false, erro: "FORMATO_INVALIDO" };
  }

  const pesoG = Number(inteiro) * 1000 + Number(fracao.padEnd(2, "0")) * 10;
  if (!Number.isSafeInteger(pesoG)) return { ok: false, erro: "FORMATO_INVALIDO" };
  if (pesoG <= 0) return { ok: false, erro: "NAO_POSITIVO" };
  if (pesoG > PESO_MAXIMO_G) return { ok: false, erro: "ACIMA_DO_MAXIMO" };
  return { ok: true, pesoG };
}

const FORMATO_KG = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatarPesoKg(pesoG: number | null): string {
  if (pesoG === null) return "—";
  return `${FORMATO_KG.format(pesoG / 1000)} kg`;
}

/** Peso em gramas é válido para gravação (inteiro, positivo, múltiplo de 10 g, dentro do máximo). */
export function pesoGValido(pesoG: unknown): pesoG is number {
  return (
    typeof pesoG === "number" &&
    Number.isSafeInteger(pesoG) &&
    pesoG > 0 &&
    pesoG <= PESO_MAXIMO_G &&
    pesoG % 10 === 0
  );
}
