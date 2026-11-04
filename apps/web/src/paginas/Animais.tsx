import { useMemo, useState } from "react";
import { Link } from "react-router";
import { formatarCodigo, formatarPesoKg, montarRelatorio, SITUACOES, type SituacaoAnimal } from "@boicontrol/core";
import { pode, useDados } from "../dados";
import { baixarArquivo, baixarBlob, csvAnimais, csvPesagens, nomeArquivo } from "../exportar";

/** RF-06: busca por brinco/código e filtro por situação e categoria, com peso e data mais recentes. */
export function Animais() {
  const { animais, categorias, lotes, vacinas, pesagens, calculadas, fuso, nomePropriedade, vinculo, usuario } = useDados();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoAnimal | "">("ATIVO");
  const [categoria, setCategoria] = useState("");
  const [lote, setLote] = useState("");
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const nomeLote = new Map(lotes.map((l) => [l.id, l.nome]));

  const lista = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return animais
      .filter((a) => !situacao || a.situacao === situacao)
      .filter((a) => !categoria || a.categoriaId === categoria)
      .filter((a) => !lote || (lote === "-" ? !a.loteId : a.loteId === lote))
      .filter((a) => !termo || a.brinco.includes(termo) || formatarCodigo(a.codigoNumero).includes(termo))
      .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }));
  }, [animais, busca, situacao, categoria, lote]);

  const [gerando, setGerando] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const tituloRelatorio = lote === "-" ? "Sem lote" : lote ? (nomeLote.get(lote) ?? "Lote") : "Todos os animais";

  /** Relatório em PDF dos animais da lista (respeita os filtros), para o comprador ou o frigorífico. */
  async function gerarPdf(compartilhar: boolean) {
    setGerando(true);
    setErroPdf(null);
    try {
      const { gerarRelatorioPdf, nomeArquivoPdf } = await import("../relatorioPdf");
      const relatorio = montarRelatorio(
        lista.map((a) => ({ id: a.id, brinco: a.brinco, codigoNumero: a.codigoNumero, sexo: a.sexo, categoria: nomeCategoria.get(a.categoriaId) ?? "-" })),
        pesagens.map((p) => ({ ...p, dataHoraPesagem: p.dataHoraPesagem.toDate(), criadoEm: p.criadoEm?.toDate() ?? p.dataHoraPesagem.toDate() })),
        (id) => vacinas.find((v) => v.id === id)?.nome ?? id,
        fuso,
      );
      const pdf = await gerarRelatorioPdf(relatorio, {
        fazenda: nomePropriedade,
        titulo: tituloRelatorio,
        fuso,
        geradoEm: new Date(),
        geradoPor: usuario?.displayName ?? usuario?.email ?? null,
      });
      const nome = nomeArquivoPdf(tituloRelatorio);
      const arquivo = new File([pdf], nome, { type: "application/pdf" });
      if (compartilhar && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: `Relatório: ${tituloRelatorio}` }).catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") throw e;
        });
      } else {
        baixarBlob(nome, pdf);
      }
    } catch (e) {
      console.error(e);
      setErroPdf("Não foi possível gerar o relatório. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }
  const podeCompartilhar = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  return (
    <section>
      <div className="filtros">
        <input
          type="search"
          inputMode="search"
          placeholder="Buscar brinco ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar brinco ou código"
        />
        <select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoAnimal | "")} aria-label="Situação">
          <option value="">Todas as situações</option>
          {SITUACOES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        {lotes.length > 0 && (
          <select value={lote} onChange={(e) => setLote(e.target.value)} aria-label="Lote">
            <option value="">Todos os lotes</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
                {l.ativo ? "" : " (inativo)"}
              </option>
            ))}
            <option value="-">Sem lote</option>
          </select>
        )}
      </div>

      {pode(vinculo, "administrar") && (
        <Link to="/animais/novo" className="botao">
          + Novo animal
        </Link>
      )}

      <p className="contagem">{lista.length} animal(is)</p>
      <ul className="lista">
        {lista.map((a) => (
          <li key={a.id}>
            <Link to={`/animais/${a.id}`}>
              <div>
                <strong>{a.brinco}</strong>
                <small>
                  {formatarCodigo(a.codigoNumero)} · {nomeCategoria.get(a.categoriaId) ?? "—"}
                  {a.loteId ? ` · ${nomeLote.get(a.loteId) ?? ""}` : ""}
                  {a.situacao !== "ATIVO" ? ` · ${a.situacao.toLowerCase()}` : ""}
                </small>
              </div>
              <div className="direita">
                <span>{formatarPesoKg(a.resumo.pesoAtualG)}</span>
                <small>
                  {a.resumo.dataUltimaPesagem ? a.resumo.dataUltimaPesagem.toLocaleDateString("pt-BR") : "sem pesagem"}
                </small>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Relatório em PDF</h2>
      <p className="ajuda">
        {tituloRelatorio}: {lista.length} animal(is) da lista acima, com peso de entrada e atual, ganho, GMD e vacinas. Use os filtros para
        escolher o lote. Não mostra valores.
      </p>
      <div className="acoes-exportar">
        <button onClick={() => gerarPdf(false)} disabled={gerando || lista.length === 0}>
          {gerando ? "Gerando..." : "Baixar PDF"}
        </button>
        {podeCompartilhar && (
          <button onClick={() => gerarPdf(true)} disabled={gerando || lista.length === 0}>
            Enviar (WhatsApp, e-mail...)
          </button>
        )}
      </div>
      {erroPdf && <p className="erro">{erroPdf}</p>}

      <h2>Exportar planilha</h2>
      <p className="ajuda">Arquivos para abrir no Excel ou no Google Planilhas. Funciona sem internet, com os dados deste aparelho.</p>
      <div className="acoes-exportar">
        <button onClick={() => baixarArquivo(nomeArquivo("animais", nomePropriedade), csvAnimais(animais, categorias, lotes, fuso))}>
          Baixar animais
        </button>
        <button
          onClick={() => baixarArquivo(nomeArquivo("pesagens", nomePropriedade), csvPesagens(pesagens, animais, calculadas, fuso, vacinas))}
        >
          Baixar pesagens
        </button>
      </div>
    </section>
  );
}
