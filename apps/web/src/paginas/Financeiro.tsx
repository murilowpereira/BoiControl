import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  CATEGORIAS_FINANCEIRAS,
  centavosParaTexto,
  dataIsoNoFuso,
  financeiroPorLote,
  formatarReais,
  gerarCsv,
  lerReais,
  margemDoAnimal,
  nomeCategoriaFinanceira,
  resumirFinanceiro,
  tipoDaCategoria,
} from "@boicontrol/core";
import { pode, useDados, type Lancamento } from "../dados";
import { db, mensagemDeErro } from "../firebase";
import { excluirLancamento, salvarLancamento } from "../operacoes";
import { baixarArquivo, nomeArquivo } from "../exportar";

type IdPeriodo = "mes" | "mesPassado" | "3meses" | "ano" | "12meses" | "tudo";

const PERIODOS: { id: IdPeriodo; nome: string }[] = [
  { id: "mes", nome: "Este mês" },
  { id: "mesPassado", nome: "Mês passado" },
  { id: "3meses", nome: "Últimos 3 meses" },
  { id: "ano", nome: "Este ano" },
  { id: "12meses", nome: "Últimos 12 meses" },
  { id: "tudo", nome: "Desde o início" },
];

/** Intervalo [inicio, fim] em datas "AAAA-MM-DD" no fuso da fazenda. */
function intervalo(id: IdPeriodo, hoje: string): [string | null, string | null] {
  const [a, m] = hoje.split("-").map(Number) as [number, number];
  const iso = (ano: number, mes: number, dia: number) => {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    return d.toISOString().slice(0, 10);
  };
  switch (id) {
    case "mes":
      return [iso(a, m, 1), hoje];
    case "mesPassado":
      return [iso(a, m - 1, 1), iso(a, m, 0)];
    case "3meses":
      return [iso(a, m - 2, 1), hoje];
    case "ano":
      return [`${a}-01-01`, hoje];
    case "12meses":
      return [iso(a, m - 11, 1), hoje];
    case "tudo":
      return [null, null];
  }
}

const dataBr = (d: string) => d.split("-").reverse().join("/");
const VAZIO = { id: undefined as string | undefined, categoria: "RACAO", descricao: "", valor: "", data: "", loteId: "" };

/** Compras e vendas de animais, despesas com insumos e o resultado do período. Só ADMIN. */
export function Financeiro() {
  const { vinculo, usuario, online, fuso, animais, lotes, valores, lancamentos, nomePropriedade } = useDados();
  const [periodo, setPeriodo] = useState<IdPeriodo>("mes");
  const hoje = dataIsoNoFuso(new Date(), fuso);
  const [form, setForm] = useState({ ...VAZIO, data: hoje });
  const [mensagem, setMensagem] = useState<{ tipo: "aviso" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(() => setMensagem(null), mensagem.tipo === "erro" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [mensagem]);

  if (!pode(vinculo, "administrar")) return <p>Apenas administradores veem o financeiro.</p>;
  const pid = vinculo!.propriedadeId;

  const [inicio, fim] = intervalo(periodo, hoje);
  const dentro = (d: string | null) => d !== null && (inicio === null || d >= inicio) && (fim === null || d <= fim);
  const resumo = resumirFinanceiro(lancamentos, [...valores.values()], inicio, fim);
  const doPeriodo = lancamentos.filter((l) => dentro(l.data));
  const porId = new Map(animais.map((a) => [a.id, a]));
  const nomeLote = new Map(lotes.map((l) => [l.id, l.nome]));
  const loteDe = (id: string | null | undefined) => (id ? (nomeLote.get(id) ?? "Lote excluído") : "Sem lote");
  // Compra e venda de cada animal contam no lote em que ele está (ou estava ao sair).
  const porLote = financeiroPorLote(
    lancamentos,
    [...valores].map(([id, v]) => ({ ...v, loteId: porId.get(id)?.loteId ?? null })),
    inicio,
    fim,
  );
  const temLotes = lotes.length > 0 || porLote.some((g) => g.loteId !== null);
  const vendidos = [...valores]
    .filter(([, v]) => v.vendaCentavos !== null && dentro(v.dataVenda))
    .map(([id, v]) => ({ id, brinco: porId.get(id)?.brinco ?? "—", v }))
    .sort((x, y) => (y.v.dataVenda ?? "").localeCompare(x.v.dataVenda ?? ""));
  const comprados = [...valores]
    .filter(([, v]) => v.compraCentavos !== null && dentro(v.dataCompra))
    .map(([id, v]) => ({ id, brinco: porId.get(id)?.brinco ?? "—", v }))
    .sort((x, y) => (y.v.dataCompra ?? "").localeCompare(x.v.dataCompra ?? ""));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const valorCentavos = lerReais(form.valor);
    if (valorCentavos === null) return setMensagem({ tipo: "erro", texto: "Valor inválido. Exemplo: 950,00" });
    setEnviando(true);
    try {
      await salvarLancamento(db, pid, usuario!.uid, {
        id: form.id,
        categoria: form.categoria,
        descricao: form.descricao,
        valorCentavos,
        data: form.data,
        loteId: form.loteId || null,
      });
      setMensagem({ tipo: "aviso", texto: form.id ? "Lançamento alterado." : `${nomeCategoriaFinanceira(form.categoria)}: ${formatarReais(valorCentavos)} lançado.` });
      setForm({ ...VAZIO, categoria: form.categoria, data: form.data, loteId: form.loteId });
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  function editar(l: Lancamento) {
    setForm({
      id: l.id,
      categoria: l.categoria,
      descricao: l.descricao ?? "",
      valor: centavosParaTexto(l.valorCentavos),
      data: l.data,
      loteId: l.loteId ?? "",
    });
    setMensagem(null);
    document.getElementById("form-lancamento")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function excluir(l: Lancamento) {
    if (!window.confirm(`Excluir ${nomeCategoriaFinanceira(l.categoria)} de ${formatarReais(l.valorCentavos)} (${dataBr(l.data)})?`)) return;
    try {
      await excluirLancamento(db, pid, l.id);
      setMensagem({ tipo: "aviso", texto: "Lançamento excluído." });
    } catch (err) {
      setMensagem({ tipo: "erro", texto: mensagemDeErro(err) });
    }
  }

  function baixar() {
    const linhas = [
      ...doPeriodo.map((l) => [
        l.data,
        tipoDaCategoria(l.categoria) === "RECEITA" ? "Receita" : "Despesa",
        nomeCategoriaFinanceira(l.categoria),
        l.descricao ?? "",
        loteDe(l.loteId),
        (tipoDaCategoria(l.categoria) === "RECEITA" ? 1 : -1) * (l.valorCentavos / 100),
      ]),
      ...comprados.map(({ id, brinco, v }) => [v.dataCompra, "Despesa", "Compra de animal", `Brinco ${brinco}`, loteDe(porId.get(id)?.loteId), -(v.compraCentavos! / 100)]),
      ...vendidos.map(({ id, brinco, v }) => [v.dataVenda, "Receita", "Venda de animal", `Brinco ${brinco}`, loteDe(porId.get(id)?.loteId), v.vendaCentavos! / 100]),
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    baixarArquivo(nomeArquivo("financeiro", nomePropriedade), gerarCsv(["Data", "Tipo", "Categoria", "Descrição", "Lote", "Valor (R$)"], linhas));
  }

  return (
    <section className="financeiro">
      <Link to="/" className="voltar">
        ← Painel
      </Link>
      <h1>Financeiro</h1>
      {mensagem && (
        <p className={`${mensagem.tipo} toast`} role="status">
          {mensagem.texto}
        </p>
      )}

      <label className="periodo">
        Período
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as IdPeriodo)}>
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="indicadores">
        <div className="indicador">
          <span>Vendas de animais</span>
          <strong>{formatarReais(resumo.vendasAnimais)}</strong>
          <small>{resumo.animaisVendidos} animal(is)</small>
        </div>
        <div className="indicador">
          <span>Compras de animais</span>
          <strong>{formatarReais(resumo.comprasAnimais)}</strong>
          <small>{resumo.animaisComprados} animal(is)</small>
        </div>
        <div className="indicador">
          <span>Despesas</span>
          <strong>{formatarReais(resumo.despesas)}</strong>
          <small>ração, vacinas e outros</small>
        </div>
        {resumo.outrasReceitas > 0 && (
          <div className="indicador">
            <span>Outras receitas</span>
            <strong>{formatarReais(resumo.outrasReceitas)}</strong>
          </div>
        )}
        <div className={`indicador ${resumo.resultado < 0 ? "alerta" : "resultado-positivo"}`}>
          <span>Resultado</span>
          <strong>{formatarReais(resumo.resultado)}</strong>
          <small>vendas e receitas − compras e despesas</small>
        </div>
      </div>

      {temLotes && porLote.length > 0 && (
        <>
          <h2>Por lote</h2>
          <ul className="lista">
            {porLote.map((g) => (
              <li key={g.loteId ?? "sem-lote"} className="linha-grupo financeiro-lote">
                <div>
                  <strong>{loteDe(g.loteId)}</strong>
                  <small>
                    Receitas <span className="valor">{formatarReais(g.receitas)}</span>
                    {g.vendasAnimais > 0 && g.outrasReceitas > 0 ? ` (vendas ${formatarReais(g.vendasAnimais)})` : ""}
                  </small>
                  <small>
                    Gastos <span className="valor">{formatarReais(g.gastos)}</span>
                    {g.comprasAnimais > 0 ? ` (compras ${formatarReais(g.comprasAnimais)} + despesas ${formatarReais(g.despesas)})` : ""}
                  </small>
                </div>
                <div className="direita">
                  <span className={`valor ${g.saldo < 0 ? "negativo" : "positivo"}`}>{formatarReais(g.saldo)}</span>
                  <small>saldo</small>
                </div>
              </li>
            ))}
          </ul>
          <p className="ajuda">
            Compra e venda de animais contam no lote em que o animal está. Despesas e receitas lançadas sem lote aparecem em “Sem lote”.
          </p>
        </>
      )}

      {resumo.despesasPorCategoria.length > 0 && (
        <>
          <h2>Despesas por tipo</h2>
          <ul className="lista">
            {resumo.despesasPorCategoria.map((c) => (
              <li key={c.categoria} className="linha-grupo">
                <div>
                  <strong>{nomeCategoriaFinanceira(c.categoria)}</strong>
                  <small>{Math.round((c.centavos / resumo.despesas) * 100)}% das despesas</small>
                </div>
                <div className="direita">
                  <span>{formatarReais(c.centavos)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 id="form-lancamento">{form.id ? "Alterar lançamento" : "Lançar despesa ou receita"}</h2>
      <form className="cartao" onSubmit={salvar}>
        <label>
          Tipo
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            <optgroup label="Despesas">
              {CATEGORIAS_FINANCEIRAS.filter((c) => c.tipo === "DESPESA").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label="Receitas">
              {CATEGORIAS_FINANCEIRAS.filter((c) => c.tipo === "RECEITA").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Valor
          <input inputMode="decimal" placeholder="R$ 0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
        </label>
        <label>
          Data
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
        </label>
        {temLotes && (
          <label>
            Lote (opcional)
            <select value={form.loteId} onChange={(e) => setForm({ ...form, loteId: e.target.value })}>
              <option value="">Sem lote (geral da fazenda)</option>
              {lotes
                .filter((l) => l.ativo || l.id === form.loteId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Descrição (opcional)
          <input
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            maxLength={120}
            placeholder="Ex.: 10 sacos de ração, vacina contra aftosa"
          />
        </label>
        <div className="botoes">
          {form.id && (
            <button type="button" className="link" onClick={() => setForm({ ...VAZIO, data: hoje })}>
              Cancelar
            </button>
          )}
          <button className="primario" disabled={enviando || !online}>
            {enviando ? "Salvando…" : form.id ? "Salvar alteração" : "Lançar"}
          </button>
        </div>
        {!online && <p className="ajuda">Sem internet. Lançamentos precisam de conexão.</p>}
      </form>

      <h2>Lançamentos do período</h2>
      {doPeriodo.length === 0 ? (
        <p className="vazio">Nenhuma despesa ou receita neste período.</p>
      ) : (
        <ul className="lista">
          {doPeriodo.map((l) => {
            const receita = tipoDaCategoria(l.categoria) === "RECEITA";
            return (
              <li key={l.id} className="linha-grupo lancamento">
                <div>
                  <strong>{nomeCategoriaFinanceira(l.categoria)}</strong>
                  <small>
                    {dataBr(l.data)}
                    {l.loteId ? ` · ${loteDe(l.loteId)}` : ""}
                    {l.descricao ? ` · ${l.descricao}` : ""}
                  </small>
                  <span className="lancamento-acoes">
                    <button className="link" onClick={() => editar(l)}>
                      Alterar
                    </button>
                    <button className="link" onClick={() => excluir(l)} disabled={!online}>
                      Excluir
                    </button>
                  </span>
                </div>
                <div className="direita">
                  <span className={receita ? "positivo" : ""}>
                    {receita ? "+" : "−"} {formatarReais(l.valorCentavos)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {vendidos.length > 0 && (
        <>
          <h2>Animais vendidos no período</h2>
          <ul className="lista">
            {vendidos.map(({ id, brinco, v }) => {
              const margem = margemDoAnimal(v);
              return (
                <li key={id}>
                  <Link to={`/animais/${id}`}>
                    <div>
                      <strong>{brinco}</strong>
                      <small>
                        {dataBr(v.dataVenda!)} · pago {formatarReais(v.compraCentavos)}
                      </small>
                    </div>
                    <div className="direita">
                      <span>{formatarReais(v.vendaCentavos)}</span>
                      {margem !== null && (
                        <small className={margem < 0 ? "negativo" : "positivo"}>
                          {margem >= 0 ? "+" : ""}
                          {formatarReais(margem)}
                        </small>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {comprados.length > 0 && (
        <>
          <h2>Animais comprados no período</h2>
          <ul className="lista">
            {comprados.map(({ id, brinco, v }) => (
              <li key={id}>
                <Link to={`/animais/${id}`}>
                  <div>
                    <strong>{brinco}</strong>
                    <small>{dataBr(v.dataCompra!)}</small>
                  </div>
                  <div className="direita">
                    <span>{formatarReais(v.compraCentavos)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="acoes-exportar">
        <button onClick={baixar}>Baixar planilha do período</button>
      </div>
      <p className="ajuda">O valor pago e o de venda de cada animal são informados no cadastro e na ficha do animal.</p>
    </section>
  );
}
