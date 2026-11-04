/**
 * Reprodução: cobertura (monta natural) ou inseminação, diagnóstico de prenhez,
 * previsão de parto e parto com o bezerro ligado à mãe.
 *
 * Datas no formato "AAAA-MM-DD", como a data de nascimento do animal.
 */

/** Gestação média de bovinos de corte, em dias (zebuínos ficam entre 285 e 295). */
export const GESTACAO_DIAS = 285;

/** O toque ou ultrassom costuma ser feito a partir de 30 dias depois do serviço. */
export const DIAS_PARA_DIAGNOSTICO = 30;

/** Janela de "parto próximo" usada no painel e na tela de reprodução. */
export const DIAS_PARTO_PROXIMO = 30;

export type TipoServico = "MONTA" | "IA";
export type Diagnostico = "PRENHE" | "VAZIA";

export const TIPOS_SERVICO: readonly { id: TipoServico; nome: string }[] = [
  { id: "MONTA", nome: "Monta natural" },
  { id: "IA", nome: "Inseminação" },
];

export interface ReproducaoBase {
  femeaId: string;
  tipo: TipoServico;
  /** Data da cobertura ou da inseminação. */
  dataServico: string;
  diagnostico: Diagnostico | null;
  dataDiagnostico: string | null;
  dataParto: string | null;
  bezerroId: string | null;
}

export type SituacaoReproducao = "AGUARDANDO_DIAGNOSTICO" | "PRENHE" | "VAZIA" | "PARIU";

const DIA_MS = 86_400_000;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(iso: string): number {
  if (!FORMATO.test(iso)) throw new Error(`Data inválida: ${iso}`);
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function dataIsoValida(iso: string | null | undefined): iso is string {
  if (!iso || !FORMATO.test(iso)) return false;
  const t = paraUtc(iso);
  return new Date(t).toISOString().slice(0, 10) === iso;
}

export function somarDias(iso: string, dias: number): string {
  return new Date(paraUtc(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias de `de` até `ate` (negativo se `ate` vier antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / DIA_MS);
}

export function previsaoParto(dataServico: string): string {
  return somarDias(dataServico, GESTACAO_DIAS);
}

export function situacaoReproducao(r: ReproducaoBase): SituacaoReproducao {
  if (r.dataParto) return "PARIU";
  if (r.diagnostico === "PRENHE") return "PRENHE";
  if (r.diagnostico === "VAZIA") return "VAZIA";
  return "AGUARDANDO_DIAGNOSTICO";
}

export const NOMES_SITUACAO_REPRODUCAO: Record<SituacaoReproducao, string> = {
  AGUARDANDO_DIAGNOSTICO: "Aguardando diagnóstico",
  PRENHE: "Prenhe",
  VAZIA: "Vazia",
  PARIU: "Pariu",
};

/** "12/08/2027" a partir de "2027-08-12". */
export function formatarDataIso(iso: string | null | undefined): string {
  return iso ? iso.split("-").reverse().join("/") : "—";
}

export type ErroReproducao =
  | "DATA_INVALIDA"
  | "DATA_FUTURA"
  | "DIAGNOSTICO_ANTES_DO_SERVICO"
  | "PARTO_ANTES_DO_SERVICO"
  | "PARTO_DE_VAZIA";

/** Confere as datas do registro antes de gravar (as regras do Firestore conferem o mesmo). */
export function validarReproducao(r: ReproducaoBase, hoje: string): ErroReproducao | null {
  if (!dataIsoValida(r.dataServico)) return "DATA_INVALIDA";
  if (r.dataServico > hoje) return "DATA_FUTURA";
  if (r.diagnostico !== null) {
    if (!dataIsoValida(r.dataDiagnostico)) return "DATA_INVALIDA";
    if (r.dataDiagnostico > hoje) return "DATA_FUTURA";
    if (r.dataDiagnostico < r.dataServico) return "DIAGNOSTICO_ANTES_DO_SERVICO";
  } else if (r.dataDiagnostico !== null) return "DATA_INVALIDA";
  if (r.dataParto !== null) {
    if (!dataIsoValida(r.dataParto)) return "DATA_INVALIDA";
    if (r.dataParto > hoje) return "DATA_FUTURA";
    if (r.dataParto < r.dataServico) return "PARTO_ANTES_DO_SERVICO";
    if (r.diagnostico === "VAZIA") return "PARTO_DE_VAZIA";
  }
  return null;
}

export interface AcompanhamentoReproducao<T extends ReproducaoBase> {
  /** Prenhes, do parto mais próximo para o mais distante. */
  prenhes: { registro: T; previsao: string; diasParaParto: number }[];
  /** Sem diagnóstico; `pronto` quando já passou o prazo para o toque. */
  aguardando: { registro: T; diasDesdeServico: number; pronto: boolean }[];
  /** Prenhes com parto previsto até DIAS_PARTO_PROXIMO dias (ou atrasado). */
  partosProximos: number;
  /** Aguardando diagnóstico que já podem ser examinadas. */
  diagnosticosPendentes: number;
}

/** Monta as listas da tela de reprodução a partir dos registros em aberto. */
export function acompanharReproducao<T extends ReproducaoBase>(registros: readonly T[], hoje: string): AcompanhamentoReproducao<T> {
  const prenhes: AcompanhamentoReproducao<T>["prenhes"] = [];
  const aguardando: AcompanhamentoReproducao<T>["aguardando"] = [];
  for (const registro of registros) {
    const s = situacaoReproducao(registro);
    if (s === "PRENHE") {
      const previsao = previsaoParto(registro.dataServico);
      prenhes.push({ registro, previsao, diasParaParto: diasEntre(hoje, previsao) });
    } else if (s === "AGUARDANDO_DIAGNOSTICO") {
      const diasDesdeServico = diasEntre(registro.dataServico, hoje);
      aguardando.push({ registro, diasDesdeServico, pronto: diasDesdeServico >= DIAS_PARA_DIAGNOSTICO });
    }
  }
  prenhes.sort((a, b) => a.diasParaParto - b.diasParaParto);
  aguardando.sort((a, b) => b.diasDesdeServico - a.diasDesdeServico);
  return {
    prenhes,
    aguardando,
    partosProximos: prenhes.filter((p) => p.diasParaParto <= DIAS_PARTO_PROXIMO).length,
    diagnosticosPendentes: aguardando.filter((a) => a.pronto).length,
  };
}

export interface ResumoReprodutivo {
  servicos: number;
  diagnosticadas: number;
  prenhes: number;
  /** Prenhes ÷ diagnosticadas (inclui as que já pariram); null sem diagnóstico. */
  taxaPrenhez: number | null;
  partos: number;
}

/** Números do período (pela data do serviço) para acompanhar a estação de monta. */
export function resumirReproducao(registros: readonly ReproducaoBase[]): ResumoReprodutivo {
  const diagnosticadas = registros.filter((r) => r.diagnostico !== null || r.dataParto !== null);
  const prenhes = diagnosticadas.filter((r) => r.diagnostico === "PRENHE" || r.dataParto !== null).length;
  return {
    servicos: registros.length,
    diagnosticadas: diagnosticadas.length,
    prenhes,
    taxaPrenhez: diagnosticadas.length > 0 ? prenhes / diagnosticadas.length : null,
    partos: registros.filter((r) => r.dataParto !== null).length,
  };
}
