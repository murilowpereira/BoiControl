import type { EstadoPesagem, MotivoRejeicao } from "@boicontrol/core";

/** Estado exibido ao usuário (design, seção 3; spec 8.2). */
export type EstadoExibido = "PENDENTE" | "PROCESSANDO" | "SINCRONIZADO" | "ERRO" | "ANULADA";

export function estadoExibido(estado: EstadoPesagem | undefined, pendenteNoAparelho: boolean): EstadoExibido {
  if (pendenteNoAparelho) return "PENDENTE";
  switch (estado) {
    case "VALIDA":
      return "SINCRONIZADO";
    case "REJEITADA":
      return "ERRO";
    case "ANULADA":
      return "ANULADA";
    default:
      return "PROCESSANDO";
  }
}

export const ROTULO_ESTADO: Record<EstadoExibido, string> = {
  PENDENTE: "Pendente no aparelho",
  PROCESSANDO: "Processando",
  SINCRONIZADO: "Sincronizado",
  ERRO: "Erro",
  ANULADA: "Anulada",
};

export const ROTULO_MOTIVO: Record<MotivoRejeicao, string> = {
  ANIMAL_INEXISTENTE: "Animal não encontrado",
  ANIMAL_INATIVO: "Animal estava inativo quando a pesagem chegou",
  PESO_INVALIDO: "Peso fora da faixa aceita",
  DATA_INVALIDA: "Data inválida",
  DATA_NO_FUTURO: "Data no futuro; confira o relógio do celular",
};

/** "há 5 min", para a idade da última sincronização (spec 8.1). */
export function tempoDesde(data: Date | null, agora = new Date()): string {
  if (!data) return "nunca";
  const min = Math.floor((agora.getTime() - data.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
