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

/** O mínimo de um animal para achá-lo por uma leitura de câmera. */
export interface AnimalLeitura {
  id: string;
  brinco: string;
  codigoNumero: number;
}

/**
 * Tira do texto lido (QR ou código de barras) o identificador do animal.
 * Aceita o brinco puro, o código BC-0001 ou um link do app
 * (…/animais/<id> ou …?animal=<id>), como numa etiqueta impressa.
 */
function candidatosDaLeitura(texto: string): string[] {
  const limpo = texto.trim();
  const candidatos = [limpo];
  if (/^https?:\/\//i.test(limpo)) {
    try {
      const url = new URL(limpo);
      const doParametro = url.searchParams.get("animal") ?? url.searchParams.get("brinco");
      if (doParametro) candidatos.unshift(doParametro);
      const ultimo = url.pathname.split("/").filter(Boolean).pop();
      if (ultimo) candidatos.push(decodeURIComponent(ultimo));
    } catch {
      // Não é um link válido: fica só o texto.
    }
  }
  return candidatos;
}

/** "000123" e "123" são o mesmo número: códigos de barras costumam vir com zeros à esquerda. */
function semZerosAEsquerda(s: string): string | null {
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : null;
}

/**
 * Acha, entre os animais, o que corresponde ao texto lido pela câmera.
 * Ordem: brinco exato, código BC-xxxx, id do documento e, por fim, o mesmo
 * número ignorando zeros à esquerda (só quando o resultado é único).
 */
export function acharPorLeitura<T extends AnimalLeitura>(texto: string, animais: readonly T[]): T | null {
  for (const candidato of candidatosDaLeitura(texto)) {
    const termo = candidato.trim().toUpperCase();
    if (!termo) continue;
    const exato =
      animais.find((a) => a.brinco === termo) ??
      animais.find((a) => `BC-${String(a.codigoNumero).padStart(4, "0")}` === termo) ??
      animais.find((a) => a.id === candidato.trim());
    if (exato) return exato;
    const numero = semZerosAEsquerda(termo);
    if (numero !== null) {
      const iguais = animais.filter((a) => semZerosAEsquerda(a.brinco) === numero);
      if (iguais.length === 1) return iguais[0]!;
    }
  }
  return null;
}
