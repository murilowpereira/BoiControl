import type { EstadoPesagem } from "@boicontrol/core";
import { TOLERANCIA_FUTURO_MS } from "@boicontrol/core";

/** Estado exibido ao usuário (spec 8.2, adaptada ao plano Spark). */
export type EstadoExibido = "PENDENTE" | "SINCRONIZADO" | "ANULADA";

export function estadoExibido(estado: EstadoPesagem, pendenteNoAparelho: boolean): EstadoExibido {
  if (pendenteNoAparelho) return "PENDENTE";
  return estado === "ANULADA" ? "ANULADA" : "SINCRONIZADO";
}

export const ROTULO_ESTADO: Record<EstadoExibido, string> = {
  PENDENTE: "Pendente no aparelho",
  SINCRONIZADO: "Sincronizado",
  ANULADA: "Anulada",
};

export type AlertaPesagem = "ANIMAL_INATIVO" | "DATA_NO_FUTURO";

export const ROTULO_ALERTA: Record<AlertaPesagem, string> = {
  ANIMAL_INATIVO: "Registrada depois que o animal foi inativado; revise",
  DATA_NO_FUTURO: "Data no futuro; confira o relógio do celular",
};

/**
 * Situações que não bloqueiam a pesagem (ela pode ter vindo do offline), mas
 * que o ADMIN deve revisar: a spec pede sinalizar, não descartar (seção 14).
 */
export function alertasDaPesagem(
  p: { estado: EstadoPesagem; dataHoraPesagem: Date; criadoEm: Date | null },
  animal: { situacao: string; situacaoDesde: Date | null } | undefined,
): AlertaPesagem[] {
  if (p.estado !== "VALIDA") return [];
  const alertas: AlertaPesagem[] = [];
  if (animal && animal.situacao !== "ATIVO" && animal.situacaoDesde && p.dataHoraPesagem > animal.situacaoDesde) {
    alertas.push("ANIMAL_INATIVO");
  }
  const referencia = p.criadoEm ?? new Date();
  if (p.dataHoraPesagem.getTime() > referencia.getTime() + TOLERANCIA_FUTURO_MS) alertas.push("DATA_NO_FUTURO");
  return alertas;
}

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
