import type { SituacaoAnimal } from "./indicadores.js";

/**
 * Agenda sanitária: vacinas e vermífugos com carência (dias sem poder abater
 * depois da aplicação) e intervalo de repetição (lembrete da próxima dose).
 * Tudo é calculado no aparelho a partir das aplicações registradas na pesagem
 * ou no lote (plano Spark, sem servidor para mandar avisos).
 */

export type TipoProduto = "VACINA" | "VERMIFUGO" | "OUTRO";
export const TIPOS_PRODUTO: readonly { id: TipoProduto; nome: string }[] = [
  { id: "VACINA", nome: "Vacina" },
  { id: "VERMIFUGO", nome: "Vermífugo" },
  { id: "OUTRO", nome: "Outro medicamento" },
];

export const CARENCIA_MAX_DIAS = 365;
export const INTERVALO_MAX_DIAS = 730;
/** Quantos animais uma aplicação no lote pode ter (o rebanho é de até 50). */
export const MAX_ANIMAIS_APLICACAO = 200;
/** A agenda avisa as doses que vencem nos próximos N dias. */
export const DIAS_AVISO_AGENDA = 7;

const DIA_MS = 86_400_000;

export interface ProdutoSanitario {
  id: string;
  nome: string;
  ativo: boolean;
  tipo?: TipoProduto | null;
  /** Dias depois da aplicação em que o animal não pode ir para o abate. */
  carenciaDias?: number | null;
  /** De quantos em quantos dias o produto deve ser repetido. */
  intervaloDias?: number | null;
}

export interface AplicacaoAnimal {
  animalId: string;
  produtoId: string;
  data: Date;
}

export interface AnimalSanidade {
  id: string;
  situacao: SituacaoAnimal;
  loteId?: string | null;
}

export interface Carencia {
  /** Fim da carência: a partir deste momento o animal pode ir para o abate. */
  ate: Date;
  produtoId: string;
  aplicadoEm: Date;
}

/** Inteiro entre 1 e o máximo, ou null (sem carência/sem repetição). */
export function diasValidos(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
}

/** Última aplicação de cada produto em cada animal: chave `${animalId}|${produtoId}`. */
export function ultimasAplicacoes(aplicacoes: readonly AplicacaoAnimal[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const a of aplicacoes) {
    const k = `${a.animalId}|${a.produtoId}`;
    const atual = m.get(k);
    if (!atual || a.data > atual) m.set(k, a.data);
  }
  return m;
}

/**
 * Animais ainda em carência em `agora`, com a carência que termina mais tarde
 * (é ela que decide quando o animal pode ser abatido).
 */
export function carenciasAtivas(
  aplicacoes: readonly AplicacaoAnimal[],
  produtos: readonly ProdutoSanitario[],
  agora: Date,
): Map<string, Carencia> {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const r = new Map<string, Carencia>();
  for (const a of aplicacoes) {
    const dias = porId.get(a.produtoId)?.carenciaDias;
    if (!diasValidos(dias, CARENCIA_MAX_DIAS)) continue;
    const ate = new Date(a.data.getTime() + dias * DIA_MS);
    if (ate <= agora) continue;
    const atual = r.get(a.animalId);
    if (!atual || ate > atual.ate) r.set(a.animalId, { ate, produtoId: a.produtoId, aplicadoEm: a.data });
  }
  return r;
}

export interface VencimentoAnimal {
  animalId: string;
  vence: Date;
}

export interface ItemAgenda {
  loteId: string | null;
  produtoId: string;
  /** Dose vencida, da mais atrasada à menos. */
  atrasados: VencimentoAnimal[];
  /** Dose vence nos próximos `diasAviso` dias. */
  proximos: VencimentoAnimal[];
  /** Animais do lote que nunca receberam o produto (o resto do lote já recebeu). */
  semRegistro: string[];
  /** Próximo vencimento entre os animais em dia (para mostrar "próxima dose em"). */
  proximaData: Date | null;
}

/**
 * Por lote e produto com intervalo de repetição: quem está com a dose atrasada,
 * quem vence logo e quem nunca recebeu. Só entra o produto que o lote já usa
 * (pelo menos um animal ativo do lote recebeu), para não encher a tela com
 * vacinas que a fazenda não aplica naquele lote.
 */
export function agendaSanitaria(
  animais: readonly AnimalSanidade[],
  produtos: readonly ProdutoSanitario[],
  aplicacoes: readonly AplicacaoAnimal[],
  agora: Date,
  diasAviso = DIAS_AVISO_AGENDA,
): ItemAgenda[] {
  const ultimas = ultimasAplicacoes(aplicacoes);
  const limiteAviso = agora.getTime() + diasAviso * DIA_MS;
  const lotes = new Map<string | null, AnimalSanidade[]>();
  for (const a of animais) {
    if (a.situacao !== "ATIVO") continue;
    const id = a.loteId ?? null;
    const g = lotes.get(id);
    if (g) g.push(a);
    else lotes.set(id, [a]);
  }
  const itens: ItemAgenda[] = [];
  for (const produto of produtos) {
    if (!produto.ativo || !diasValidos(produto.intervaloDias, INTERVALO_MAX_DIAS)) continue;
    const intervalo = produto.intervaloDias * DIA_MS;
    for (const [loteId, lista] of lotes) {
      const item: ItemAgenda = { loteId, produtoId: produto.id, atrasados: [], proximos: [], semRegistro: [], proximaData: null };
      let algumRecebeu = false;
      for (const a of lista) {
        const ultima = ultimas.get(`${a.id}|${produto.id}`);
        if (!ultima) {
          item.semRegistro.push(a.id);
          continue;
        }
        algumRecebeu = true;
        const vence = new Date(ultima.getTime() + intervalo);
        if (vence <= agora) item.atrasados.push({ animalId: a.id, vence });
        else if (vence.getTime() <= limiteAviso) item.proximos.push({ animalId: a.id, vence });
        else if (!item.proximaData || vence < item.proximaData) item.proximaData = vence;
      }
      if (!algumRecebeu) continue;
      item.atrasados.sort((x, y) => x.vence.getTime() - y.vence.getTime());
      item.proximos.sort((x, y) => x.vence.getTime() - y.vence.getTime());
      itens.push(item);
    }
  }
  // Primeiro o que precisa de ação.
  const peso = (i: ItemAgenda) => (i.atrasados.length ? 0 : i.proximos.length || i.semRegistro.length ? 1 : 2);
  return itens.sort((a, b) => peso(a) - peso(b));
}

/** Quantos animais precisam de dose agora (atrasados + sem registro em lote que usa o produto). */
export function pendenciasAgenda(itens: readonly ItemAgenda[]): number {
  return itens.reduce((t, i) => t + i.atrasados.length + i.semRegistro.length, 0);
}
