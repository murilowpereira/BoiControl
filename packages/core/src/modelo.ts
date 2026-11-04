import type { SituacaoAnimal } from "./indicadores.js";

/** Tipos dos documentos do Firestore, compartilhados entre app, regras e scripts. */
export type Perfil = "ADMIN" | "OPERADOR" | "CONSULTA";
export type EstadoPesagem = "VALIDA" | "ANULADA";

export const SITUACOES: readonly SituacaoAnimal[] = ["ATIVO", "VENDIDO", "MORTO", "TRANSFERIDO"];
export const PERFIS: readonly Perfil[] = ["ADMIN", "OPERADOR", "CONSULTA"];

/** Código interno exibido (RN-01): BC-0001. */
export function formatarCodigo(codigoNumero: number): string {
  return `BC-${String(codigoNumero).padStart(4, "0")}`;
}

/** Quantas vacinas diferentes podem ser marcadas numa mesma pesagem. */
export const MAX_VACINAS_PESAGEM = 10;

/** Tolerância para relógio do celular adiantado. */
export const TOLERANCIA_FUTURO_MS = 10 * 60 * 1000;

export const caminhos = {
  propriedade: (pid: string) => `propriedades/${pid}`,
  membro: (pid: string, uid: string) => `propriedades/${pid}/membros/${uid}`,
  membros: (pid: string) => `propriedades/${pid}/membros`,
  convites: (pid: string) => `propriedades/${pid}/convites`,
  convite: (pid: string, email: string) => `propriedades/${pid}/convites/${email}`,
  animais: (pid: string) => `propriedades/${pid}/animais`,
  animal: (pid: string, id: string) => `propriedades/${pid}/animais/${id}`,
  brinco: (pid: string, brinco: string) => `propriedades/${pid}/brincos/${brinco}`,
  pesagens: (pid: string) => `propriedades/${pid}/pesagens`,
  pesagem: (pid: string, id: string) => `propriedades/${pid}/pesagens/${id}`,
  categorias: (pid: string) => `propriedades/${pid}/categorias`,
  lotes: (pid: string) => `propriedades/${pid}/lotes`,
  /** Vacinas cadastradas; a pesagem guarda os IDs das aplicadas. */
  vacinas: (pid: string) => `propriedades/${pid}/vacinas`,
  /** Valores de compra e venda do animal; só o ADMIN lê. ID = id do animal. */
  valoresAnimais: (pid: string) => `propriedades/${pid}/valoresAnimais`,
  valoresAnimal: (pid: string, animalId: string) => `propriedades/${pid}/valoresAnimais/${animalId}`,
  /** Despesas e receitas (ração, vacinas...); só o ADMIN lê. */
  lancamentos: (pid: string) => `propriedades/${pid}/lancamentos`,
  /** Leituras do pluviômetro; ID = data "AAAA-MM-DD" (uma por dia). */
  chuvas: (pid: string) => `propriedades/${pid}/chuvas`,
  chuva: (pid: string, data: string) => `propriedades/${pid}/chuvas/${data}`,
  /** Coberturas/inseminações da fêmea, com diagnóstico e parto. ID = UUID do aparelho. */
  reproducoes: (pid: string) => `propriedades/${pid}/reproducoes`,
  reproducao: (pid: string, id: string) => `propriedades/${pid}/reproducoes/${id}`,
  auditoria: (pid: string) => `propriedades/${pid}/auditoria`,
  contadorAnimais: (pid: string) => `propriedades/${pid}/contadores/animais`,
};
