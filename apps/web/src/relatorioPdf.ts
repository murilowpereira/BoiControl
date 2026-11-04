import { formatarCodigo, type Relatorio } from "@boicontrol/core";

export interface CabecalhoRelatorio {
  fazenda: string;
  /** Nome do lote, ou descrição do filtro ("Todos os animais"). */
  titulo: string;
  fuso: string;
  geradoEm: Date;
  geradoPor: string | null;
}

const num = (v: number, casas: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
const kg = (g: number | null) => (g === null ? "-" : num(g / 1000, 1));
const gmd = (v: number | null) => (v === null ? "-" : num(v, 3));

/**
 * Gera o PDF do relatório no próprio aparelho (sem servidor, funciona offline).
 * A biblioteca de PDF é carregada só quando o botão é usado.
 */
export async function gerarRelatorioPdf(r: Relatorio, c: CabecalhoRelatorio): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const data = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: c.fuso }) : "-");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 12;
  const verde: [number, number, number] = [31, 61, 43];

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...verde);
  doc.text(`Relatório do lote: ${c.titulo}`, margem, 16);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(60);
  doc.text(c.fazenda || "Fazenda", margem, 22);
  doc.text(
    `Gerado em ${c.geradoEm.toLocaleString("pt-BR", { timeZone: c.fuso, dateStyle: "short", timeStyle: "short" })}${c.geradoPor ? ` por ${c.geradoPor}` : ""}`,
    largura - margem,
    22,
    { align: "right" },
  );

  autoTable(doc, {
    startY: 27,
    theme: "grid",
    margin: { left: margem, right: margem },
    styles: { fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: verde, textColor: 255 },
    head: [["Animais", "Com pesagem", "Peso total (kg)", "Peso médio (kg)", "Ganho médio (kg)", "GMD médio (kg/dia)"]],
    body: [[String(r.animais), String(r.comPesagem), kg(r.comPesagem ? r.pesoTotalG : null), kg(r.pesoMedioG), kg(r.ganhoMedioG), gmd(r.gmdMedioKgDia)]],
  });

  const depois = (espaco: number) => ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 27) + espaco;

  autoTable(doc, {
    startY: depois(6),
    theme: "striped",
    margin: { left: margem, right: margem, bottom: 14 },
    styles: { fontSize: 8.5, cellPadding: 1.6, valign: "middle" },
    headStyles: { fillColor: verde, textColor: 255 },
    columnStyles: {
      3: { halign: "right" },
      5: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { cellWidth: 62 },
    },
    head: [["Brinco", "Código", "Categoria / sexo", "Entrada (kg)", "Data", "Atual (kg)", "Data", "Ganho (kg)", "Dias", "GMD (kg/dia)", "Vacinas"]],
    body: r.linhas.map((l) => [
      l.animal.brinco,
      formatarCodigo(l.animal.codigoNumero),
      `${l.animal.categoria} / ${l.animal.sexo === "M" ? "macho" : "fêmea"}`,
      kg(l.pesoInicialG),
      data(l.dataInicial),
      kg(l.pesoAtualG),
      data(l.dataAtual),
      kg(l.ganhoG),
      l.dias === null || l.pesagens < 2 ? "-" : String(l.dias),
      gmd(l.gmdPeriodoKgDia),
      l.vacinas.length ? l.vacinas.map((v) => `${v.nome} (${data(v.data)})`).join(", ") : "-",
    ]),
  });

  if (r.vacinas.length) {
    autoTable(doc, {
      startY: depois(8),
      pageBreak: "avoid",
      theme: "grid",
      margin: { left: margem, right: margem, bottom: 14 },
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: verde, textColor: 255 },
      tableWidth: 160,
      head: [["Vacina aplicada", "Animais", "Primeira aplicação", "Última aplicação"]],
      body: r.vacinas.map((v) => [v.nome, `${v.animais} de ${r.animais}`, data(v.primeira), data(v.ultima)]),
    });
  }

  const paginas = doc.getNumberOfPages();
  const altura = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
    doc.text(
      "Entrada = primeira pesagem registrada; GMD = ganho dividido pelos dias entre a primeira e a última pesagem. Pesagens anuladas não entram.",
      margem,
      altura - 7,
    );
    doc.text(`BoiControl · página ${i} de ${paginas}`, largura - margem, altura - 7, { align: "right" });
  }

  return doc.output("blob");
}

/** Nome do arquivo: relatorio-<lote>-<data>.pdf, sem acentos nem espaços. */
export function nomeArquivoPdf(titulo: string, hoje = new Date()): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `relatorio-${base || "lote"}-${hoje.toISOString().slice(0, 10)}.pdf`;
}
