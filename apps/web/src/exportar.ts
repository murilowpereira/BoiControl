import { formatarCodigo, gerarCsv, type PesagemCalculada } from "@boicontrol/core";
import type { Animal, Categoria, Lote, Pesagem } from "./dados";

/** Baixa um texto como arquivo, sem servidor (funciona offline com os dados do aparelho). */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const kg = (g: number | null | undefined) => (g === null || g === undefined ? null : g / 1000);
const SITUACAO: Record<string, string> = { ATIVO: "Ativo", VENDIDO: "Vendido", MORTO: "Morto", TRANSFERIDO: "Transferido" };

function data(d: Date | null | undefined, fuso: string) {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: fuso }) : null;
}
function hora(d: Date, fuso: string) {
  return d.toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

export function nomeArquivo(base: string, nomeFazenda: string) {
  const fazenda = nomeFazenda
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const hoje = new Date().toISOString().slice(0, 10);
  return `${base}-${fazenda || "fazenda"}-${hoje}.csv`;
}

/** RF-12: um animal por linha, com o resumo de peso e GMD. */
export function csvAnimais(animais: Animal[], categorias: Categoria[], lotes: Lote[], fuso: string): string {
  const cat = new Map(categorias.map((c) => [c.id, c.nome]));
  const lot = new Map(lotes.map((l) => [l.id, l.nome]));
  const linhas = [...animais]
    .sort((a, b) => a.codigoNumero - b.codigoNumero)
    .map((a) => [
      formatarCodigo(a.codigoNumero),
      a.brinco,
      a.nome,
      cat.get(a.categoriaId) ?? a.categoriaId,
      a.loteId ? (lot.get(a.loteId) ?? a.loteId) : null,
      a.sexo === "M" ? "Macho" : "Fêmea",
      SITUACAO[a.situacao] ?? a.situacao,
      a.dataNascimento?.split("-").reverse().join("/") ?? null,
      kg(a.resumo.pesoAtualG),
      data(a.resumo.dataUltimaPesagem, fuso),
      a.resumo.gmdUltimoKgDia === null ? null : Number(a.resumo.gmdUltimoKgDia.toFixed(3)),
      a.resumo.totalPesagens,
    ]);
  return gerarCsv(
    ["Código", "Brinco", "Nome", "Categoria", "Lote", "Sexo", "Situação", "Nascimento", "Peso atual (kg)", "Última pesagem", "Último GMD (kg/dia)", "Pesagens"],
    linhas,
  );
}

/** RF-12: uma pesagem por linha, inclusive anuladas (com o estado), com variação e GMD. */
export function csvPesagens(
  pesagens: Pesagem[],
  animais: Animal[],
  calculadas: Map<string, PesagemCalculada>,
  fuso: string,
): string {
  const porId = new Map(animais.map((a) => [a.id, a]));
  const linhas = [...pesagens]
    .sort(
      (a, b) =>
        a.dataHoraPesagem.toMillis() - b.dataHoraPesagem.toMillis() ||
        (a.criadoEm?.toMillis() ?? Infinity) - (b.criadoEm?.toMillis() ?? Infinity),
    )
    .map((p) => {
      const a = porId.get(p.animalId);
      const c = calculadas.get(p.id);
      const d = p.dataHoraPesagem.toDate();
      return [
        data(d, fuso),
        hora(d, fuso),
        a?.brinco ?? null,
        a ? formatarCodigo(a.codigoNumero) : null,
        kg(p.pesoG),
        kg(c?.variacaoG),
        c?.diasPeriodo ?? null,
        c?.gmdKgDia == null ? null : Number(c.gmdKgDia.toFixed(3)),
        p.estado === "ANULADA" ? "Anulada" : p.pendente ? "Pendente" : "Válida",
        p.observacao,
        p.motivoCorrecao ?? null,
      ];
    });
  return gerarCsv(
    ["Data", "Hora", "Brinco", "Código", "Peso (kg)", "Variação (kg)", "Dias", "GMD (kg/dia)", "Estado", "Observação", "Motivo da correção"],
    linhas,
  );
}
